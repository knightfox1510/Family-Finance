import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

// Optional: Use edge runtime for faster streaming delivery
export const runtime = 'edge';

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

    // Call Gemini using Vercel AI SDK streamText
    const result = await streamText({
      model: google('gemini-2.5-flash'),
      messages: messages,
    });

    // FIX: Directly return the standard stream text response payload 
    // This entirely avoids the internal 'instanceof' bugs in version 3.1.x
    return new Response(result.textStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
