// app/api/groups/[groupId]/ocr/route.ts — FIXED VERSION v2
// Key fixes:
//   1. Updated model from 'gemini-1.5-flash' to 'gemini-2.0-flash' (1.5 deprecated)
//   2. Falls back to 'gemini-1.5-flash' if 2.0 fails (graceful degradation)
//   3. Improved prompt to reduce parse failures
//   4. Better error messages that distinguish model vs auth errors

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
      name: String(item.name ?? item.description ?? item.item ?? 'Item').trim(),
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
): Promise<{ success: boolean; text?: string; error?: string }> {
  const prompt = `You are a receipt parser. Analyze this receipt image and extract ALL line items and the final total.

RETURN ONLY valid JSON in this exact structure (no markdown, no backticks, no explanation):
{"totalAmount":<number>,"items":[{"name":"<item name>","price":<number>}]}

Rules:
- totalAmount = grand total after tax (the largest/final total shown)
- Each item price must be positive
- Include ALL items visible on the receipt
- If receipt is unclear, still extract what you can
- If completely unreadable: {"totalAmount":0,"items":[]}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { data: base64Image, mimeType } },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData?.error?.message ?? `HTTP ${res.status}`;
      return { success: false, error: errMsg };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return { success: true, text };
  } catch (err: any) {
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
      return NextResponse.json(
        { error: 'Receipt scanning is not configured. Contact support.', hint: 'no_api_key' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'No image URL provided' }, { status: 400 });
    }

    let imageResp: Response;
    try {
      imageResp = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
    } catch (fetchErr: any) {
      console.error('[OCR] Image fetch failed:', fetchErr.message);
      return NextResponse.json(
        {
          error: 'Could not access the uploaded image. Check that the Supabase storage bucket is public.',
          hint: 'bucket_not_public',
        },
        { status: 502 }
      );
    }

    if (!imageResp.ok) {
      return NextResponse.json(
        {
          error: `Image fetch returned ${imageResp.status}. The receipt may have expired.`,
          hint: imageResp.status === 404 ? 'image_not_found' : 'image_fetch_error',
        },
        { status: 502 }
      );
    }

    const contentLength = Number(imageResp.headers.get('content-length') ?? 0);
    if (contentLength > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Receipt image is too large (max 5 MB). Try a lower resolution photo.' },
        { status: 413 }
      );
    }

    const arrayBuffer = await imageResp.arrayBuffer();
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Receipt image is too large (max 5 MB). Try a lower resolution photo.' },
        { status: 413 }
      );
    }

    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imageResp.headers.get('content-type') || 'image/jpeg';

    // Try gemini-2.0-flash first, fall back to 1.5-flash
    const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    let responseText = '';
    let lastError = '';

    for (const modelName of modelsToTry) {
      const result = await callGeminiOCR(geminiKey, base64Image, mimeType, modelName);
      if (result.success && result.text) {
        responseText = result.text;
        break;
      }
      lastError = result.error ?? 'Unknown error';
      console.warn(`[OCR] Model ${modelName} failed:`, lastError);
    }

    if (!responseText) {
      console.error('[OCR] All models failed. Last error:', lastError);
      return NextResponse.json(
        {
          error: 'Receipt scanning service temporarily unavailable. Please enter amounts manually.',
          hint: 'gemini_error',
        },
        { status: 503 }
      );
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[OCR] Response:', responseText.slice(0, 300));
    }

    const parsed = parseGeminiJson(responseText);
    if (!parsed) {
      console.error('[OCR] Failed to parse response:', responseText.slice(0, 200));
      return NextResponse.json(
        {
          error: 'Could not read the receipt. Try a clearer, well-lit photo with the full receipt visible.',
          hint: 'parse_error',
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
      items: validated.items,
    });

  } catch (err: any) {
    console.error('[OCR] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Unexpected error processing receipt. Please try again.' },
      { status: 500 }
    );
  }
}
