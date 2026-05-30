// app/api/insights/route.ts
// Fixed: StreamingTextResponse removed in ai SDK v4+. Use Gemini REST API directly.
// Model cascade: gemini-1.5-flash (stable GA) → gemini-1.5-pro fallback.
// gemini-2.0-flash requires an allowlisted project; it 404s for most API keys.

export const runtime = 'edge';

const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro'];

async function tryGeminiStream(
  apiKey: string,
  model: string,
  body: object
): Promise<Response | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (res.ok) return res;
  // 404/403 = model not on this project — try next model
  if (res.status === 404 || res.status === 403) {
    console.warn(`[insights] Model ${model} unavailable (${res.status})`);
    return null;
  }
  // Real error (quota, auth, etc.) — throw so the outer handler surfaces it
  const text = await res.text().catch(() => '');
  throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`);
}

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration missing API key' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const geminiBody = {
      contents: messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    };

    // Try each model in order until one responds
    let geminiRes: Response | null = null;
    for (const model of GEMINI_MODELS) {
      geminiRes = await tryGeminiStream(apiKey, model, geminiBody);
      if (geminiRes) break;
    }

    if (!geminiRes) {
      return new Response(
        JSON.stringify({ error: 'No Gemini model available for this API key.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Pipe the SSE stream back in Vercel AI data-stream protocol format
    // useChat expects: "0:{json-encoded-text}\n"
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = geminiRes!.body!.getReader();
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                if (text) {
                  controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));
                }
              } catch { /* ignore malformed chunks */ }
            }
          }
        } catch (err) {
          console.error('[insights] stream error:', err);
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    console.error('[insights] error:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
