// app/api/groups/[groupId]/ocr/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { resolveGhostUserIdSimple } from '@/lib/ghostToken';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function resolveUserId(request: Request, fallback?: string | null): Promise<string | null> {
  const ghostToken = request.headers.get('x-ghost-token');
  if (ghostToken) return resolveGhostUserIdSimple(ghostToken, supabase);

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    if (user?.id) return user.id;
  }
  return fallback ?? null;
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

    const { imageUrl } = await request.json();
    if (!imageUrl) {
      return NextResponse.json({ error: 'No image URL provided' }, { status: 400 });
    }

    // 1. Fetch the image from the Supabase public URL
    const imageResp = await fetch(imageUrl);
    if (!imageResp.ok) throw new Error('Failed to fetch image from storage');
    
    const arrayBuffer = await imageResp.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imageResp.headers.get('content-type') || 'image/jpeg';

    // 2. Prepare Gemini Model (using gemini-1.5-flash as it's fast and highly capable for multimodal tasks)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Analyze this receipt and extract the line items and the final total amount.
      Respond ONLY with a valid JSON object using this exact structure. Do not use markdown formatting (like \`\`\`json).
      {
        "totalAmount": 150.50,
        "items": [
          { "name": "Item Name 1", "price": 50.00 },
          { "name": "Item Name 2", "price": 100.50 }
        ]
      }
      Ignore tax and tip as individual items if they are included in the grand total, OR include them as line items if they need to be split. 
      Ensure the sum of the items exactly matches the totalAmount.
    `;

    // 3. Call Gemini Vision
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType
        }
      }
    ]);

    const responseText = result.response.text();
    
    // 4. Clean and parse the response (strip potential markdown blocks just in case)
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanedText);

    return NextResponse.json(parsedData);

  } catch (err: any) {
    console.error('OCR Error:', err);
    return NextResponse.json({ error: 'Failed to process receipt via OCR.' }, { status: 500 });
  }
}
