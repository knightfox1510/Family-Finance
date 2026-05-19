import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize a privileged server-side Supabase client using secret keys
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';

// ⚡ FALLBACK IMPLEMENTATION: Passes compilation checks even when hidden keys aren't exposed to the compiler yet
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-build-phase'; 

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    if (!payload.message || !payload.message.text) {
      return NextResponse.json({ ok: true }); // Gracefully handle non-text notifications
    }

    const chatId = payload.message.chat.id;
    const tgUser = payload.message.from.username || '';
    const rawText = payload.message.text;

    // 1. Strict Identity Defense Check
    const allowedUsers = (process.env.TELEGRAM_ALLOWED_USER_NAMES || '').toLowerCase().split(',');
    if (!allowedUsers.includes(tgUser.toLowerCase())) {
      await sendTelegramMessage(chatId, "🚫 Access Denied: Your identity is not authorized to log data here.");
      return NextResponse.json({ ok: true });
    }

    // Handle standard greeting commands
    if (rawText.startsWith('/start') || rawText.startsWith('/help')) {
      await sendTelegramMessage(chatId, "👋 Welcome to FamilyFinance Ledger Bot!\n\nSimply forward a bank debit SMS, or type a plain phrase like:\n`150 Dining Out dinner at beachside` or `40 Groceries milk eggs`.\n\nGemini will automatically parse, categorize, and log your transaction instantly!");
      return NextResponse.json({ ok: true });
    }

    // Inform user processing has initiated
    await sendTelegramMessage(chatId, "⚡ Processing transaction line...");

    // 2. Compile Financial Context Matrix for Gemini Parsing Core
    const householdId = process.env.TELEGRAM_DEFAULT_HOUSEHOLD_ID;
    const geminiKey = process.env.GEMINI_API_KEY;

    const systemPrompt = `You are a strict personal finance data-entry clerk processing input for a couple in India. 
    Analyze the user's message text (which could be a plain natural sentence or a raw bank debit SMS string) and convert it into a precise JSON structure.
    
    You must classify the information into these exact fields:
    - amount: a clean positive integer number representing the transaction value.
    - category: look closely at the intent and match it strictly to one of these standard system choices: "Groceries", "Dining Out", "Coffee & Snacks", "Rent / Mortgage", "Electricity", "Water & Gas", "Internet", "Mobile Plans", "Streaming Services", "Insurance", "Medical / Health", "Gym & Fitness", "Clothing & Apparel", "Personal Care", "Home Maintenance", "Furniture & Decor", "Transport / Fuel", "Parking & Tolls", "Public Transport", "Flights & Hotels", "Education", "Entertainment", "Subscriptions", "Miscellaneous", "Other". If it is income, use "Salary" or "Other Income".
    - note: a short descriptive text of what this expense was for.
    - type: must be exactly "expense" or "income".
    - account: must be exactly "Joint".
    
    Return ONLY a raw valid JSON object. Do not include markdown wraps like \`\`\`json. Output format example:
    {"amount": 180, "category": "Groceries", "note": "UPI spend at Zepto", "type": "expense", "account": "Joint"}`;

    // 3. Connect to Gemini 2.5 Flash Engine
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Input to Parse: "${rawText}"` }] }
          ],
        }),
      }
    );

    const geminiData = await geminiRes.json();
    const rawJsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse extracted tokens clean
    const parsedTx = JSON.parse(rawJsonText.trim());

    // 4. Map Identity Routing Tags
    // Checks the incoming Telegram handle to see who initialized the entry
    const isUserB = tgUser.toLowerCase().includes('karishma');
    const addedByValue = isUserB ? 'Partner B' : 'Partner A';

    // 5. Construct database payload row
    const newDbTx = {
      household_id: householdId,
      date: new Date().toISOString().slice(0, 10), // Logs dynamic current date stamp
      amount: Number(parsedTx.amount || 0),
      category: parsedTx.category || 'Other',
      type: parsedTx.type || 'expense',
      account_used: parsedTx.account || 'Joint',
      added_by: addedByValue,
      note: parsedTx.note || 'Telegram Entry',
      to_settle: false,
      settled: false,
      settled_with: null
    };

    if (newDbTx.amount <= 0) {
      throw new Error("Parsed amount resolved to 0. Please verify input text values.");
    }

    // 6. Transmit to Supabase
    const { error: dbError } = await supabase.from('transactions').insert([newDbTx]);
    if (dbError) throw dbError;

    // 7. Fire confirmation feedback back to Telegram interface
    const responseMsg = `✅ Logged Successfully!\n\n💰 Amount: ₹${newDbTx.amount}\n📦 Category: ${newDbTx.category}\n📝 Note: ${newDbTx.note}\n👤 Logged By: ${addedByValue === 'Partner A' ? 'Gaurav' : 'Karishma'}`;
    await sendTelegramMessage(chatId, responseMsg);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram Webhook Route Error:', err);
    return NextResponse.json({ ok: true }); // Return ok true to prevent Telegram from looping retries on code failure
  }
}

// Low-level helper engine to fire raw API text blocks back to Telegram chat containers
async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' }),
    });
  } catch (e) {
    console.error('Failed to post message feedback token back to Telegram API rails:', e);
  }
}
