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

    // Fix: Added 'await' here so 'result' is the actual StreamTextResult object
    const result = await streamText({
      model: google('gemini-2.5-flash'),
      messages: messages, // Passes down the entire conversational context
    });

    // Now .toDataStreamResponse() will be successfully recognized!
    return result.toDataStreamResponse();
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
