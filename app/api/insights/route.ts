import { google } from '@ai-sdk/google';
import { streamText, StreamingTextResponse } from 'ai';

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();
    
    // Grabs your existing key name from your project variables
    const apiKey = process.env.GEMINI_API_KEY; 
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration missing API key' }), 
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // FIX: Map your key directly to the exact name the SDK expects in the environment loop.
    // This perfectly bypasses strict TypeScript parameters while solving the runtime gap!
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;

    // Call Gemini with standard configuration settings to keep types happy
    const result = await streamText({
      model: google('gemini-2.5-flash'),
      messages: messages,
    });

    // Return the stable streaming response stream channel
    return new StreamingTextResponse(result.textStream);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
