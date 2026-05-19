import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ⚡ VERCEL EXECUTION MAXIMIZATION PASS
// Forces Vercel to allow the function to run up to 60 seconds, preventing early timeout drops
export const maxDuration = 60; 

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
    // BRANCH A: INTERACTIVE MULTI-FIELD EDITING ENGINE (CALLBACK QUERIES)
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

      // --- SUB-MENU 1: REVEAL QUICK CATEGORY MATRIX ---
      if (dataStr.startsWith('s_cat_')) {
        const txId = dataStr.split('s_cat_')[1];
        const inlineKeyboard: any[] = [];
        for (let i = 0; i < QUICK_CATEGORIES.length; i += 2) {
          inlineKeyboard.push([
            { text: QUICK_CATEGORIES[i], callback_data: `v_cat_${txId}_${i}` },
            { text: QUICK_CATEGORIES[i+1], callback_data: `v_cat_${txId}_${i+1}` }
          ]);
        }
        inlineKeyboard.push([{ text: "◀ Return to Main Menu", callback_data: `menu_${txId}` }]);
        await editTelegramMessageInline(chatId, messageId, "✏️ <b>Select the replacement category below:</b>", inlineKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // --- SUB-MENU 2: REVEAL ACCOUNT SWITCHING SELECTION ---
      if (dataStr.startsWith('s_acc_')) {
        const txId = dataStr.split('s_acc_')[1];
        const inlineKeyboard = [
          [
            { text: "👤 Partner A", callback_data: `v_acc_${txId}_PartnerA` },
            { text: "👤 Partner B", callback_data: `v_acc_${txId}_PartnerB` }
          ],
          [{ text: "💳 Joint Wallet", callback_data: `v_acc_${txId}_Joint` }],
          [{ text: "◀ Return to Main Menu", callback_data: `menu_${txId}` }]
        ];
        await editTelegramMessageInline(chatId, messageId, "🏧 <b>Select the correct target funding account:</b>", inlineKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // --- EXECUTE UPDATE: CATEGORY CHANGE ---
      if (dataStr.startsWith('v_cat_')) {
        const [_, __, txId, indexStr] = dataStr.split('_');
        const targetCategory = QUICK_CATEGORIES[parseInt(indexStr, 10)];

        await supabase.from('transactions').update({ category: targetCategory }).eq('id', txId);
        await answerCallbackQuery(callbackQuery.id, `📦 Adjusted to ${targetCategory}`);
        // Reset view back to primary selection card options
        return handleReturnToMenu(chatId, messageId, txId, callbackQuery.id);
      }

      // --- EXECUTE UPDATE: ACCOUNT RE-ASSIGNMENT ---
      if (dataStr.startsWith('v_acc_')) {
        const [_, __, txId, rawAccount] = dataStr.split('_');
        const normalizedAccount = rawAccount === 'PartnerA' ? 'Partner A' : rawAccount === 'PartnerB' ? 'Partner B' : 'Joint';

        await supabase.from('transactions').update({ account_used: normalizedAccount }).eq('id', txId);
        await answerCallbackQuery(callbackQuery.id, `🏧 Account remapped to ${normalizedAccount}`);
        return handleReturnToMenu(chatId, messageId, txId, callbackQuery.id);
      }

      // --- EXECUTE UPDATE: PURGE TRANSACTION ---
      if (dataStr.startsWith('d_')) {
        const txId = dataStr.split('d_')[1];
        await supabase.from('transactions').delete().eq('id', txId);
        await editTelegramMessageInline(chatId, messageId, "🗑️ <b>Transaction permanently deleted from cloud ledger.</b>", []);
        await answerCallbackQuery(callbackQuery.id, " Purged successfully.");
        return NextResponse.json({ ok: true });
      }

      // --- UTILITY ACTION: RESTORE MAIN DOCK MENU ---
      if (dataStr.startsWith('menu_')) {
        const txId = dataStr.split('menu_')[1];
        return handleReturnToMenu(chatId, messageId, txId, callbackQuery.id);
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
        await sendTelegramMessage(chatId, "👋 Welcome! Send transactions naturally. Use the control panel buttons to alter any logged row field dynamically.");
        return NextResponse.json({ ok: true });
      }

      const householdId = process.env.TELEGRAM_DEFAULT_HOUSEHOLD_ID;
      const geminiKey = process.env.GEMINI_API_KEY;
      const isPartnerA = tgUser.toLowerCase().includes('goku');
      const senderIdentity = isPartnerA ? 'Partner A' : 'Partner B';

      // 💥 REWORKED SYSTEM PROMPT MATRIX WITH REMAPPED ACCOUNT LOGIC
      const systemPrompt = `You are an expert personal finance data-entry clerk processing raw text and banking SMS strings for a household ledger in India.
      Analyze the user text input and map it cleanly into a structured JSON payload that matches the exact database schema rules.

      ---------------------------------------------------------------------------------------------------------
      🌟 GOLDEN RULE #1: EXPLICIT CATEGORY OVERRIDE
      If the text explicitly mentions ANY of the valid system categories listed below by name (case-insensitive), 
      you MUST prioritize and select that category over any generic semantic or merchant mapping rules.
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
      
      CRUCIAL ACCOUNTING & ROUTING LAWS:
      1. REWORKED ACCOUNT SELECTION LOGIC:
         - If the text explicitly contains the words "joint", "joint account", or "joint wallet", set the "account" field to exactly "Joint".
         - If the text explicitly mentions "Partner A" or the name "Gaurav", set the "account" field to exactly "Partner A" (Even if added by Partner B).
         - If the text explicitly mentions "Partner B" or the name "Karishma", set the "account" field to exactly "Partner B" (Even if added by Partner A).
         - DEFAULT CONDITION: If neither "joint" nor specific partner identities are explicitly spelled out, set "account" to exactly the identity of the person typing the message: "${senderIdentity}".
      
      2. SETTLEMENT TOGGLE VELOCITY CHECK ("to_settle"):
         - If the text contains text fragments like "to be settled", "tosettle", or "to settle", set "toSettle" to true. Else false.
      
      3. TRANSACTION TYPE LOGIC ("type"):
         - If the text contains "Salary", "Bonus", "Interest credited", "refund", or "rental income", set "type" to "income". Else "expense".

      Return ONLY a raw valid JSON object matching this structural pattern:
      {"amount": 1200, "category": "Online Groceries", "note": "Weekly Zepto run", "type": "expense", "account": "Joint", "toSettle": false}`;

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

      const secureUuidFallback = crypto.randomUUID();

      const insertPayload = {
        id: secureUuidFallback,
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

      const { data: dbRows, error: dbError } = await supabase
        .from('transactions')
        .insert([insertPayload])
        .select();

      if (dbError) throw dbError;

      const activeId = dbRows && dbRows[0] ? dbRows[0].id : secureUuidFallback;

      const responseMsg = `<b>📥 Transaction Successfully Recorded!</b>\n\n💰 <b>Amount:</b> ₹${insertPayload.amount}\n📦 <b>Category:</b> ${insertPayload.category}\n🏧 <b>Account:</b> ${insertPayload.account_used === 'Joint' ? '💳 Joint Wallet' : '👤 ' + insertPayload.account_used}\n📝 <b>Note:</b> ${insertPayload.note}`;
      
      // 📡 ADVANCED CONTROL CONSOLE ROW: Splits management into dedicated edit paths
      const inlineKeyboard = [[
        { text: "📦 Category", callback_data: `s_cat_${activeId}` },
        { text: "🏧 Account", callback_data: `s_acc_${activeId}` },
        { text: "🗑️ Delete", callback_data: `d_${activeId}` }
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
// TELEGRAM RUNTIME CENTRAL SWITCHBOARD CONTROLLERS
// ────────────────────────────────────────────────────────────────────────
async function handleReturnToMenu(chatId: number, messageId: number, txId: string, queryId: string) {
  const { data: txRows } = await supabase.from('transactions').select().eq('id', txId);
  if (txRows && txRows[0]) {
    const tx = txRows[0];
    const baseBanner = `<b>📥 Transaction Successfully Recorded!</b>\n\n💰 <b>Amount:</b> ₹${tx.amount}\n📦 <b>Category:</b> ${tx.category}\n🏧 <b>Account:</b> ${tx.account_used === 'Joint' ? '💳 Joint Wallet' : '👤 ' + tx.account_used}\n📝 <b>Note:</b> ${tx.note}`;
    
    const inlineKeyboard = [[
      { text: "📦 Category", callback_data: `s_cat_${txId}` },
      { text: "🏧 Account", callback_data: `s_acc_${txId}` },
      { text: "🗑️ Delete", callback_data: `d_${txId}` }
    ]];
    await editTelegramMessageInline(chatId, messageId, baseBanner, inlineKeyboard);
  }
  return NextResponse.json({ ok: true });
}

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
