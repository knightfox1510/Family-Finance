// app/api/groups/[groupId]/ocr/route.ts  — FIXED VERSION
// Changes from original:
//   1. Validates GEMINI_API_KEY env var at request time, not module load
//   2. Handles empty / malformed Gemini responses gracefully
//   3. Validates that items array exists and has sensible numbers before returning
//   4. Returns structured errors the client can display meaningfully
//   5. Limits image size check (rejects files > 5 MB before hitting Gemini)
//   6. Logs the Gemini raw response for debugging without breaking the client
//   7. Falls back gracefully when the bucket URL is inaccessible

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

// ── Clean and parse Gemini JSON output safely ──────────────────────────────
function parseGeminiJson(rawText: string): any | null {
  if (!rawText || rawText.trim() === '') return null;

  // Strip markdown code fences (Gemini sometimes wraps even with JSON mime type)
  let cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Sometimes Gemini prefixes with a sentence before the JSON
  const jsonStart = cleaned.indexOf('{');
  if (jsonStart > 0) cleaned = cleaned.slice(jsonStart);

  try {
    return JSON.parse(cleaned);
  } catch {
    // Last resort: try to find a JSON-like structure anywhere in the string
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}

// ── Validate the parsed OCR result ─────────────────────────────────────────
function validateOcrResult(data: any): {
  valid: boolean;
  totalAmount: number;
  items: { name: string; price: number }[];
  error?: string;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, totalAmount: 0, items: [], error: 'No structured data found in receipt' };
  }

  const totalAmount = Number(data.totalAmount ?? data.total ?? data.grand_total ?? 0);
  if (isNaN(totalAmount) || totalAmount <= 0) {
    return { valid: false, totalAmount: 0, items: [], error: 'Could not read a total amount from the receipt' };
  }

  const rawItems: any[] = Array.isArray(data.items) ? data.items : [];
  const items = rawItems
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      name: String(item.name ?? item.description ?? item.item ?? 'Item').trim(),
      price: Number(item.price ?? item.amount ?? item.cost ?? 0),
    }))
    .filter((item) => item.name && item.price > 0);

  if (items.length === 0) {
    // Return total-only result — client can still use the total even without line items
    return {
      valid: true,
      totalAmount,
      items: [{ name: 'Total', price: totalAmount }],
    };
  }

  return { valid: true, totalAmount, items };
}

export async function POST(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const callerId = await resolveUserId(request);
    if (!callerId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // ── Membership check ────────────────────────────────────────────────────
    const { data: member } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', params.groupId)
      .eq('user_id', callerId)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    // ── Validate env ────────────────────────────────────────────────────────
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json(
        { error: 'Receipt scanning is not configured. Contact support.' },
        { status: 503 }
      );
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await request.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'No image URL provided' }, { status: 400 });
    }

    // ── Fetch the image ─────────────────────────────────────────────────────
    let imageResp: Response;
    try {
      imageResp = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    } catch (fetchErr: any) {
      console.error('[OCR] Image fetch failed:', fetchErr.message);
      return NextResponse.json(
        {
          error: 'Could not access the uploaded image. This often means the storage bucket is not configured as public. Please check Supabase storage settings.',
          hint: 'bucket_not_public',
        },
        { status: 502 }
      );
    }

    if (!imageResp.ok) {
      return NextResponse.json(
        {
          error: `Image fetch returned ${imageResp.status}. The receipt may have expired or the bucket may not be public.`,
          hint: imageResp.status === 404 ? 'image_not_found' : 'image_fetch_error',
        },
        { status: 502 }
      );
    }

    // ── Size guard (5 MB) ───────────────────────────────────────────────────
    const contentLength = Number(imageResp.headers.get('content-length') ?? 0);
    if (contentLength > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Receipt image is too large (max 5 MB). Try a lower resolution photo.' },
        { status: 413 }
      );
    }

    const arrayBuffer = await imageResp.arrayBuffer();

    // ── Additional size check on actual bytes ───────────────────────────────
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Receipt image is too large (max 5 MB). Try a lower resolution photo.' },
        { status: 413 }
      );
    }

    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imageResp.headers.get('content-type') || 'image/jpeg';

    // ── Call Gemini ─────────────────────────────────────────────────────────
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Analyze this receipt image and extract all line items and the final total amount.

IMPORTANT INSTRUCTIONS:
- Return ONLY valid JSON. No markdown, no explanations, no code blocks.
- The JSON must match this exact structure:
{
  "totalAmount": <number>,
  "items": [
    { "name": "<item name>", "price": <number> }
  ]
}
- totalAmount must be the grand total shown on the receipt (after tax)
- Each item price must be a positive number
- If you cannot read the receipt clearly, still attempt to extract what you can
- If the receipt is empty or unreadable, return: {"totalAmount": 0, "items": []}
- DO NOT wrap the JSON in backticks or any other formatting`;

    let geminiResult: any;
    try {
      geminiResult = await model.generateContent([
        prompt,
        { inlineData: { data: base64Image, mimeType } },
      ]);
    } catch (geminiErr: any) {
      console.error('[OCR] Gemini API error:', geminiErr.message);
      return NextResponse.json(
        {
          error: 'Receipt scanning service unavailable. Please try again or enter amounts manually.',
          hint: 'gemini_error',
        },
        { status: 503 }
      );
    }

    const responseText = geminiResult.response.text();

    // ── Debug logging (server-side only) ────────────────────────────────────
    if (process.env.NODE_ENV === 'development') {
      console.log('[OCR] Gemini raw response:', responseText.slice(0, 500));
    }

    // ── Parse and validate ──────────────────────────────────────────────────
    const parsed = parseGeminiJson(responseText);
    if (!parsed) {
      console.error('[OCR] Failed to parse Gemini response:', responseText.slice(0, 200));
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
