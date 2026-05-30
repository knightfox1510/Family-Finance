import { google } from '@ai-sdk/google';
import { streamText, StreamingTextResponse } from 'ai';

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

    // FIX: Using standard Node-friendly StreamingTextResponse utility
    return new StreamingTextResponse(result.textStream);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
