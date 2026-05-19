import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-build-phase'; 
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const QUICK_CATEGORIES = [
  "Dining Out", "Online Food Orders", "Online Groceries", "Groceries",
  "Cab Services", "Personal Transportation", "Online Shopping", "Miscellaneous"
];

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // ────────────────────────────────────────────────────────────────────────
    // BRANCH A: INTERACTIVE BUTTON PRESSURE SYSTEM (CALLBACK QUERIES)
    // ────────────────────────────────────────────────────────────────────────
    if (payload.callback_query) {
      const callbackQuery = payload.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const dataStr = callbackQuery.data || '';
      const tgUser = callbackQuery.from.username || '';

      const allowedUsers = (process.env.TELEGRAM_ALLOWED_USER_NAMES || '').toLowerCase().split(',');
      if (!allowedUsers.includes(tgUser.toLowerCase())) {
        await answerCallbackQuery(callbackQuery.id, "🚫 Unauthorized identity interaction.");
        return NextResponse.json({ ok: true });
      }

      // Action A1: Reveal Quick Category Modification Grid
      if (dataStr.startsWith('s_')) {
        const txId = dataStr.split('s_')[1];
        
        const inlineKeyboard: any[] = [];
        for (let i = 0; i < QUICK_CATEGORIES.length; i += 2) {
          inlineKeyboard.push([
            { text: QUICK_CATEGORIES[i], callback_data: `c_${txId}_${i}` },
            { text: QUICK_CATEGORIES[i+1], callback_data: `c_${txId}_${i+1}` }
          ]);
        }
        inlineKeyboard.push([{ text: "◀ Cancel & Keep Original", callback_data: `k_${txId}` }]);

        await editTelegramMessageInline(chatId, messageId, "✏️ <b>Select the correct category below:</b>", inlineKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // Action A2: Execute Database Update Sequence
      if (dataStr.startsWith('c_')) {
        const [_, txId, indexStr] = dataStr.split('_');
        const targetCategory = QUICK_CATEGORIES[parseInt(indexStr, 10)];

        const { data: updatedRows, error: updateError } = await supabase
          .from('transactions')
          .update({ category: targetCategory })
          .eq('id', txId)
          .select();

        if (updateError) {
          await answerCallbackQuery(callbackQuery.id, "❌ Database rejection update aborted.");
          return NextResponse.json({ ok: true });
        }

        const tx = updatedRows?.[0] || {};
        const freshBanner = `🔄 <b>Category Corrected Successfully!</b>\n\n💰 <b>Amount:</b> ₹${tx.amount || 'Recorded'}\n📦 <b>Category:</b> ${tx.category || targetCategory} ✨\n🏧 <b>User handle:</b> @${tgUser}`;
        
        await editTelegramMessageInline(chatId, messageId, freshBanner, []);
        await answerCallbackQuery(callbackQuery.id, `✅ Adjusted to ${targetCategory}`);
        return NextResponse.json({ ok: true });
      }

      // Action A3: Purge Row From Cloud Database Disk
      if (dataStr.startsWith('d_')) {
        const txId = dataStr.split('d_')[1];

        const { error: deleteError } = await supabase
          .from('transactions')
          .delete()
          .eq('id', txId);

        if (deleteError) {
          await answerCallbackQuery(callbackQuery.id, "❌ Failed to clear row from cloud database.");
          return NextResponse.json({ ok: true });
        }

        await editTelegramMessageInline(chatId, messageId, "🗑️ <b>Transaction permanently cleared from database ledger.</b>", []);
        await answerCallbackQuery(callbackQuery.id, "💥 Purged successfully.");
        return NextResponse.json({ ok: true });
      }

      // Action A4: Discard Edits & Return to Primary Controls
      if (dataStr.startsWith('k_')) {
        const txId = dataStr.split('k_')[1];
        const defaultKeyboard = [[
          { text: "✏️ Change Category", callback_data: `s_${txId}` },
          { text: "🗑️ Delete Entry", callback_data: `d_${txId}` }
        ]];
        await editTelegramMessageInline(chatId, messageId, "✅ <b>Transaction configuration preserved in ledger.</b>", defaultKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      return NextResponse.json({ ok: true });
    }

    // ────────────────────────────────────────────────────────────────────────
    // BRANCH B: STANDARD NATURAL TEXT DISPATCH HOOKS
    // ────────────────────────────────────────────────────────────────────────
    if (payload.message && payload.message.text) {
      const chatId = payload.message.chat.id;
      const tgUser = payload.message.from.username || '';
      const rawText = payload.message.text;

      const allowedUsers = (process.env.TELEGRAM_ALLOWED_USER_NAMES || '').toLowerCase().split(',');
      if (!allowedUsers.includes(tgUser.toLowerCase())) {
        await sendTelegramMessage(chatId, "🚫 Access Denied: Unauthorized profile.");
        return NextResponse.json({ ok: true });
      }

      if (rawText.startsWith('/start')) {
        await sendTelegramMessage(chatId, "👋 Welcome! Send transactions naturally. Use the control panel buttons to alter metrics on the fly.");
        return NextResponse.json({ ok: true });
      }

      const householdId = process.env.TELEGRAM_DEFAULT_HOUSEHOLD_ID;
      const geminiKey = process.env.GEMINI_API_KEY;
      const isPartnerA = tgUser.toLowerCase().includes('goku');
      const senderIdentity = isPartnerA ? 'Partner A' : 'Partner B';
    
    // ─── FULL MATRIX SYSTEM PROMPT (HIGH GRANULARITY) ───────────────────────
    const systemPrompt = `You are an expert personal finance data-entry clerk processing raw text and banking SMS strings for a household ledger in India.
    Analyze the user text input and map it cleanly into a structured JSON payload that matches the exact database schema rules.

    ---------------------------------------------------------------------------------------------------------
    🌟 GOLDEN RULE #1: EXPLICIT CATEGORY OVERRIDE
    If the text explicitly mentions ANY of the valid system categories listed below by name (case-insensitive), 
    you MUST prioritize and select that category over any generic semantic or merchant mapping rules.
    Example: "500 Zepto but log as Miscellaneous" -> MUST return "Miscellaneous" (overriding the Zepto -> Online Groceries rule).
    ---------------------------------------------------------------------------------------------------------

    VALID SYSTEM CATEGORIES & EXPLICIT PROCESSING RULES:
    - "Alcohol"             (Wine shops, Living Liquidz, pub/bar drinks, beer, specific alcohol logs)
    - "Dining Out"          (Restaurants, cafes, dine-in, fine dining, coffee shops, physically eating out at a venue)
    - "Education"           (Course fees, certifications, books, training programs, upskilling materials)
    - "Entertainment"       (Movie tickets, BookMyShow, gaming arcades, bowling alleys, concerts, events, fun outings)
    - "Groceries"           (Offline local kirana stores, physical vegetable/fruit markets, cash grocery purchases)
    - "Healthcare"          (Pharmacies, medical stores like Apollo, doctor checkups, lab tests, dental treatments, medicines)
    - "Gifting"             (Buying gifts for friends, family members, relatives; shagun/cash envelopes for weddings or birthdays)
    - "Housing"             (Monthly house rent, society maintenance bills)
    - "Insurance"           (Health insurance premiums, car/bike motor insurance renewals, term life insurance policies)
    - "Investments"         (Mutual fund allocations, monthly SIPs, direct stocks buying, gold purchases, PPF deposits, Index funds)
    - "Miscellaneous"       (Unexpected or unclassifiable payments, ATM cash withdrawals, random one-off pocket cash items)
    - "Offline Shopping"    (Physical retail checkout counters, apparel or footwear bought at a mall/store, lifestyle physical shopping)
    - "Online Shopping"     (Amazon, Flipkart, Myntra, Ajio, Tata CLiQ, non-grocery online courier packages, retail websites)
    - "Personal Care"       (Salon visits, haircuts, beauty parlour sessions, grooming products, spa, cosmetics, skincare items)
    - "Personal Transportation" (Petrol/diesel pumps, car or motorcycle service/repairs, toll payments, fastag recharges, parking fees)
    - "Savings"             (Manual transfers to long-term cash reserves, emergency savings funds, specific sinking fund transfers)
    - "Subscriptions"       (Netflix, Spotify, iCloud storage, YouTube Premium, gym memberships, recurring software apps/services)
    - "Health & Fitness"    (Protein powder, gym supplements, workout fitness gear, tracking straps, organic health food products)
    - "Taxes"               (Income tax filings, property tax payments, municipal or government duty filings)
    - "Technology"          (Software license keys, digital tools, cloud hosting packages, gadgets, computer/mobile electronic accessories)
    - "Travel"              (Flight tickets, hotel bookings, Airbnb stays, IRCTC train tickets, vacation bookings, luggage travel luggage bags)
    - "Utilities"           (Mobile recharges like Jio/Airtel/VI, home broadband Wi-Fi bills, electricity bills like MSEB/Adani, piped gas/piped water, Laundry, Maid salary, Cook Salary)
    - "Online Food Orders"  (Zomato, Swiggy food delivery, EatClub, Domino's, pizza/burger drops, cloud kitchen orders)
    - "Household Items"     (Cleaning liquids, laundry/washing detergents, garbage bags, trash cans, mop replacements, house decor, bedsheets, Amazon orders)
    - "Cab Services"        (Uber rides, Ola bookings, Rapido bike taxis, InDrive, local auto rickshaw meter cash/UPI payments)
    - "Hosting Day"         (Ordering bulk food/alcohol/snacks specifically when friends, family, or guests are visiting the house for a social gathering)
    - "Online Groceries"    (Zepto orders, Blinkit orders, Swiggy Instamart delivery, BigBasket, daily milk/produce apps)
    - "Interest Earned"     (Bank savings account quarterly interest payouts, fixed deposit (FD) interest pay-ins)
    - "Spouse Gifting"      (Special anniversary gestures, flowers, birthday surprises, or customized items explicitly bought as a gift for your partner)
    - "Family payments"     (Sending money home to parents, financial support transfers to family members or siblings, names can include "mom", "dad", "mama", "sohan", "Kari mom", "Kari dad")

    CRUCIAL ROUTING & ACCOUNTING LAWS:
    1. ACCOUNT SELECTION LOGIC:
       - If the user text explicitly includes the words "joint", "joint account", "joint wallet", or names the partner explicitly, set the "account" field to "Joint".
       - DEFAULT RULE: If the text does NOT explicitly say "joint" or "joint account" AND does not mention a specific partner name, it is a personal expense of the person logging it. Set "account" to exactly "${senderIdentity}".
    
    2. SETTLEMENT TOGGLE VELOCITY CHECK ("to_settle"):
       - If the text contains text fragments like "to be settled", "tosettle", or "to settle", set "toSettle" to true.
       - DEFAULT RULE: If those exact strings are missing, set "toSettle" to false.
    
    3. TRANSACTION TYPE LOGIC ("type"):
       - If the text or description includes words like "Salary", "Bonus", "Interest credited", "refund", or "rental income", set "type" to "income".
       - DEFAULT RULE: For all standard debits, merchant payments, or retail transactions, set "type" to "expense".
       
    4. DATA FORMATTING DEFINITIONS:
       - amount: Clean positive integer string representing the real value transaction text. Strip currency symbols.
       - note: Extract a clean, natural descriptive summary phrase of the event context (e.g., "Zepto grocery run", "Starbucks coffee", "Salary credit"). Strip out bank account strings or transaction codes from SMS.

    Return ONLY a raw valid JSON object. Do not enclose it in markdown blocks like \`\`\`json. Output format matching template pattern structure:
    {"amount": 1200, "category": "Online Groceries", "note": "Weekly Zepto run", "type": "expense", "account": "Joint", "toSettle": false}`;

    // Fire text payload directly to Gemini API
  const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Input text to process: "${rawText}"` }] }],
          }),
        }
      );

      const geminiData = await geminiRes.json();
      let rawJsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      rawJsonText = rawJsonText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsedTx = JSON.parse(rawJsonText);

      const insertPayload = {
        household_id: householdId,
        date: new Date().toISOString().slice(0, 10),
        amount: Number(parsedTx.amount || 0),
        category: parsedTx.category || 'Miscellaneous',
        type: parsedTx.type || 'expense',
        account_used: parsedTx.account,
        added_by: senderIdentity,
        note: parsedTx.note || 'Telegram automated entry',
        to_settle: Boolean(parsedTx.toSettle),
        settled: false,
        settled_with: null
      };

      if (insertPayload.amount <= 0) throw new Error("Parsed amount resolved invalid.");

      const { data: databaseResultRows, error: dbError } = await supabase
        .from('transactions')
        .insert([insertPayload])
        .select();

      if (dbError) throw dbError;
      if (!databaseResultRows || databaseResultRows.length === 0) throw new Error("Supabase insert empty response.");

      const realTx = databaseResultRows[0];
      const actualDatabaseId = realTx.id;

      const responseMsg = `<b>📥 Transaction Successfully Recorded!</b>\n\n💰 <b>Amount:</b> ₹${realTx.amount}\n📦 <b>Category:</b> ${realTx.category}\n📝 <b>Note:</b> ${realTx.note || 'None'}`;
      
      const inlineKeyboard = [[
        { text: "✏️ Change Category", callback_data: `s_${actualDatabaseId}` },
        { text: "🗑️ Delete Entry", callback_data: `d_${actualDatabaseId}` }
      ]];

      await sendTelegramMessageInline(chatId, responseMsg, inlineKeyboard);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Core Webhook Route Operations Error Failure:', err);
    return NextResponse.json({ ok: true }); 
  }
}

// ────────────────────────────────────────────────────────────────────────
// TELEGRAM CORE API ROUTING ENGINE
// ────────────────────────────────────────────────────────────────────────
async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' }),
  });
}

async function sendTelegramMessageInline(chatId: number, text: string, keyboard: any[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    }),
  });
}

async function editTelegramMessageInline(chatId: number, messageId: number, text: string, keyboard: any[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    }),
  });
}

async function answerCallbackQuery(callbackQueryId: string, alertText?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: alertText || "",
      show_alert: false
    }),
  });
}
