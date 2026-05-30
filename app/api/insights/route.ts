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
    const result = streamText({
      model: google('gemini-2.5-flash'),
      messages: messages, // Passes down the entire conversational context
    });

    // Convert the stream into a standardized Response object
    return result.toDataStreamResponse();
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
