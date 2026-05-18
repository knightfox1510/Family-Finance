import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();
    
    // Grabs the key securely on the server side (No NEXT_PUBLIC_ exposure!)
    const apiKey = process.env.GEMINI_API_KEY; 
    if (!apiKey) {
      return NextResponse.json({ error: 'Server configuration missing API key' }, { status: 500 });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await res.json();
    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 429 });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return NextResponse.json({ text });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
