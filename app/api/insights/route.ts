// app/api/insights/route.ts
// Uses the same Gemini model as the working Telegram bot: gemini-2.5-flash
// Strategy: try streaming first, fall back to non-streaming generateContent.
// Both return the same Vercel AI SDK data-stream format that useChat expects.

export const runtime = 'edge';

// Same model the Telegram/WhatsApp bots use — confirmed working on this project
const PRIMARY_MODEL   = 'gemini-2.5-flash';
const FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];
const BASE_URL        = 'https://generativelanguage.googleapis.com/v1beta/models';

function buildGeminiBody(messages: any[]) {
  return {
    contents: messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };
}

// Encode a text chunk in Vercel AI SDK data-stream protocol v1
// useChat expects lines of the form:  0:"text chunk"\n
function encodeChunk(encoder: TextEncoder, text: string): Uint8Array {
  return encoder.encode(`0:${JSON.stringify(text)}\n`);
}

// ── Non-streaming fallback: call generateContent, stream the full response at once
async function generateContentResponse(apiKey: string, model: string, body: object): Promise<Response | null> {
  const res = await fetch(
    `${BASE_URL}/${model}:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }
  );
  if (!res.ok) return null;

  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) return null;

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    start(controller) {
      // Send in ~200-char chunks to give useChat a streaming feel
      const chunkSize = 200;
      for (let i = 0; i < text.length; i += chunkSize) {
        controller.enqueue(encodeChunk(encoder, text.slice(i, i + chunkSize)));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':          'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
      'Cache-Control':         'no-cache',
    },
  });
}

// ── Streaming path: SSE → pipe to AI SDK format
async function streamGenerateContent(apiKey: string, model: string, body: object): Promise<Response | null> {
  const res = await fetch(
    `${BASE_URL}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }
  );
  if (!res.ok || !res.body) return null;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      let buffer   = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
              const parsed = JSON.parse(raw);
              const chunk: string = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
              if (chunk) controller.enqueue(encodeChunk(encoder, chunk));
            } catch { /* ignore malformed SSE lines */ }
          }
        }
      } catch (err) {
        console.error('[insights] stream read error:', err);
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':          'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
      'Cache-Control':         'no-cache',
    },
  });
}

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body   = buildGeminiBody(messages);
    const models = [PRIMARY_MODEL, ...FALLBACK_MODELS];

    // Try each model: streaming first, then non-streaming fallback
    for (const model of models) {
      // 1. Try streaming
      try {
        const streamRes = await streamGenerateContent(apiKey, model, body);
        if (streamRes) {
          console.log(`[insights] streaming with ${model}`);
          return streamRes;
        }
      } catch (e) {
        console.warn(`[insights] streaming ${model} threw:`, e);
      }

      // 2. Fall back to non-streaming for this model
      try {
        const nonStreamRes = await generateContentResponse(apiKey, model, body);
        if (nonStreamRes) {
          console.log(`[insights] non-streaming with ${model}`);
          return nonStreamRes;
        }
      } catch (e) {
        console.warn(`[insights] non-streaming ${model} threw:`, e);
      }

      console.warn(`[insights] model ${model} completely unavailable, trying next`);
    }

    // All models failed
    return new Response(
      JSON.stringify({
        error: `No Gemini model responded. Tried: ${models.join(', ')}. Check GEMINI_API_KEY validity and project quotas.`,
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[insights] unexpected error:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
