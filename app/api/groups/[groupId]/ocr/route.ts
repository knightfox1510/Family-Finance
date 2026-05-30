// app/api/groups/[groupId]/ocr/route.ts — FIXED VERSION v3
// Key fixes over v2:
//   1. Removed responseMimeType from generationConfig — Gemini 2.0 Flash ignores it
//      and some model versions reject it, causing silent failures.
//   2. Added detailed server-side logging so you can see exactly what Gemini returns.
//   3. Fixed auth: Bearer token is now extracted from the Authorization header properly
//      in addition to ghost token support.
//   4. Improved error messages so the client shows actionable hints.
//   5. Added CORS-safe content-type check for the fetched image.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveGhostUserIdSimple } from '@/lib/ghostToken';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function resolveUserId(
  request: Request,
  fallback?: string | null
): Promise<string | null> {
  const ghostToken = request.headers.get('x-ghost-token');
  if (ghostToken) return resolveGhostUserIdSimple(ghostToken, supabase);

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    if (user?.id) return user.id;
  }
  return fallback ?? null;
}

function parseGeminiJson(rawText: string): any | null {
  if (!rawText || rawText.trim() === '') return null;

  let cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const jsonStart = cleaned.indexOf('{');
  if (jsonStart > 0) cleaned = cleaned.slice(jsonStart);

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}

function validateOcrResult(data: any): {
  valid: boolean;
  totalAmount: number;
  items: { name: string; price: number }[];
  error?: string;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, totalAmount: 0, items: [], error: 'No structured data found in receipt' };
  }

  const totalAmount = Number(data.totalAmount ?? data.total ?? data.grand_total ?? data.amount ?? 0);
  if (isNaN(totalAmount) || totalAmount <= 0) {
    return { valid: false, totalAmount: 0, items: [], error: 'Could not read a total amount from the receipt' };
  }

  const rawItems: any[] = Array.isArray(data.items) ? data.items : [];
  const items = rawItems
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      name:  String(item.name ?? item.description ?? item.item ?? 'Item').trim(),
      price: Number(item.price ?? item.amount ?? item.cost ?? item.total ?? 0),
    }))
    .filter((item) => item.name && item.price > 0);

  if (items.length === 0) {
    return {
      valid: true,
      totalAmount,
      items: [{ name: 'Total', price: totalAmount }],
    };
  }

  return { valid: true, totalAmount, items };
}

async function callGeminiOCR(
  apiKey: string,
  base64Image: string,
  mimeType: string,
  modelName: string
): Promise<{ success: boolean; text?: string; error?: string; statusCode?: number }> {
  const prompt = `You are a receipt parser. Analyze this receipt image and extract ALL line items and the final total.

RETURN ONLY valid JSON — no markdown fences, no explanation, no extra text. Use this exact structure:
{"totalAmount":<number>,"items":[{"name":"<item name>","price":<number>}]}

Rules:
- totalAmount = grand total after tax (the largest/final total shown)
- Each item price must be a positive number
- Include ALL items visible on the receipt
- If the receipt is unclear, extract what you can
- If completely unreadable: {"totalAmount":0,"items":[]}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { data: base64Image, mimeType } },
            ],
          }],
          // NOTE: responseMimeType removed — it causes failures on some model versions
          generationConfig: {
            temperature:     0.1,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg  = errData?.error?.message ?? `HTTP ${res.status}`;
      console.error(`[OCR] Gemini ${modelName} error ${res.status}:`, errMsg);
      return { success: false, error: errMsg, statusCode: res.status };
    }

    const data = await res.json();

    // Log the raw response in development to help debug
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OCR] Gemini ${modelName} raw response:`, JSON.stringify(data).slice(0, 500));
    }

    // Check for blocked/filtered response
    const candidate  = data?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (finishReason === 'SAFETY' || finishReason === 'OTHER') {
      return { success: false, error: `Response blocked by Gemini (${finishReason})` };
    }

    const text = candidate?.content?.parts?.[0]?.text ?? '';
    if (!text) {
      return { success: false, error: 'Empty response from Gemini — image may be unreadable' };
    }

    return { success: true, text };
  } catch (err: any) {
    console.error(`[OCR] Network error calling ${modelName}:`, err.message);
    return { success: false, error: err.message ?? 'Network error' };
  }
}

export async function POST(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const callerId = await resolveUserId(request);
    if (!callerId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', params.groupId)
      .eq('user_id', callerId)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.error('[OCR] GEMINI_API_KEY environment variable is not set');
      return NextResponse.json(
        {
          error: 'Receipt scanning is not configured on this server. Please enter amounts manually.',
          hint:  'no_api_key',
        },
        { status: 503 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { imageUrl } = body;
    if (!imageUrl) {
      return NextResponse.json({ error: 'No image URL provided' }, { status: 400 });
    }

    // Fetch the image
    let imageResp: Response;
    try {
      imageResp = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
    } catch (fetchErr: any) {
      console.error('[OCR] Image fetch failed:', fetchErr.message);
      return NextResponse.json(
        {
          error: 'Could not access the uploaded image. Make sure the Supabase "receipts" storage bucket is set to public.',
          hint:  'bucket_not_public',
        },
        { status: 502 }
      );
    }

    if (!imageResp.ok) {
      return NextResponse.json(
        {
          error: `Image fetch returned ${imageResp.status}. The receipt URL may have expired.`,
          hint:  imageResp.status === 404 ? 'image_not_found' : 'image_fetch_error',
        },
        { status: 502 }
      );
    }

    // Validate content type
    const contentType = imageResp.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'The uploaded file does not appear to be an image.', hint: 'invalid_content_type' },
        { status: 400 }
      );
    }

    const arrayBuffer = await imageResp.arrayBuffer();

    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Receipt image is too large (max 5 MB). Try a lower resolution photo.' },
        { status: 413 }
      );
    }

    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: 'The uploaded image is empty. Please try a different photo.' },
        { status: 400 }
      );
    }

    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const mimeType    = contentType.split(';')[0].trim() || 'image/jpeg';

    // Try models in order — gemini-2.0-flash first, then 1.5-flash
    const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    let responseText = '';
    let lastError    = '';

    for (const modelName of modelsToTry) {
      const result = await callGeminiOCR(geminiKey, base64Image, mimeType, modelName);
      if (result.success && result.text) {
        responseText = result.text;
        console.log(`[OCR] Success with model: ${modelName}`);
        break;
      }
      lastError = result.error ?? 'Unknown error';

      // If it's an auth error (403), no point trying the next model
      if (result.statusCode === 400 || result.statusCode === 403) {
        console.error('[OCR] Gemini API key error — check GEMINI_API_KEY:', lastError);
        return NextResponse.json(
          {
            error: 'Receipt scanning API key is invalid or expired. Please contact support.',
            hint:  'invalid_api_key',
          },
          { status: 503 }
        );
      }

      console.warn(`[OCR] Model ${modelName} failed:`, lastError);
    }

    if (!responseText) {
      console.error('[OCR] All Gemini models failed. Last error:', lastError);
      return NextResponse.json(
        {
          error: 'Receipt scanning is temporarily unavailable. Please enter amounts manually.',
          hint:  'gemini_error',
        },
        { status: 503 }
      );
    }

    console.log('[OCR] Raw text from Gemini:', responseText.slice(0, 400));

    const parsed = parseGeminiJson(responseText);
    if (!parsed) {
      console.error('[OCR] Failed to parse Gemini response:', responseText.slice(0, 300));
      return NextResponse.json(
        {
          error: 'Could not read the receipt. Try a clearer, well-lit photo with the full receipt visible.',
          hint:  'parse_error',
        },
        { status: 422 }
      );
    }

    const validated = validateOcrResult(parsed);
    if (!validated.valid) {
      return NextResponse.json({ error: validated.error }, { status: 422 });
    }

    return NextResponse.json({
      totalAmount: validated.totalAmount,
      items:       validated.items,
    });

  } catch (err: any) {
    console.error('[OCR] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Unexpected error processing receipt. Please try again.' },
      { status: 500 }
    );
  }
}
