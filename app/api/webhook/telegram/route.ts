import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    // BRANCH A: THE ADVANCED INTERACTIVE CONTROL CONSOLE (CALLBACK QUERIES)
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

      // --- SUB-MENU: SHOW CATEGORY GRID ---
      if (dataStr.startsWith('s_cat_')) {
        const txId = dataStr.split('s_cat_')[1];
        const inlineKeyboard: any[] = [];
        for (let i = 0; i < QUICK_CATEGORIES.length; i += 2) {
          inlineKeyboard.push([
            { text: QUICK_CATEGORIES[i], callback_data: `v_cat_${txId}_${i}` },
            { text: QUICK_CATEGORIES[i+1], callback_data: `v_cat_${txId}_${i+1}` }
          ]);
        }
        inlineKeyboard.push([{ text: "◀ Return to Menu", callback_data: `menu_${txId}` }]);
        await editTelegramMessageInline(chatId, messageId, "✏️ <b>Select the replacement category below:</b>", inlineKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // --- SUB-MENU: SHOW ACCOUNT SELECTION ---
      if (dataStr.startsWith('s_acc_')) {
        const txId = dataStr.split('s_acc_')[1];
        const inlineKeyboard = [
          [
            { text: "👤 Partner A", callback_data: `v_acc_${txId}_PartnerA` },
            { text: "👤 Partner B", callback_data: `v_acc_${txId}_PartnerB` }
          ],
          [{ text: "💳 Joint Wallet", callback_data: `v_acc_${txId}_Joint` }],
          [{ text: "◀ Return to Menu", callback_data: `menu_${txId}` }]
        ];
        await editTelegramMessageInline(chatId, messageId, "🏧 <b>Select the correct target funding account:</b>", inlineKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // --- ACTION: PROMPT USER FOR NOTE TEXT ---
      if (dataStr.startsWith('s_not_')) {
        const txId = dataStr.split('s_not_')[1];
        // Using ForceReply prompts Telegram to auto-focus the user's typing bar bound to this exact text block
        const promptMsg = `📝 <b>Editing Note for transaction reference:</b>\n<code>${txId}</code>\n\nPlease reply directly to this message block with your new custom note content.`;
        await sendTelegramForceReply(chatId, promptMsg);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // --- DIRECT TOGGLE ACTION: SETTLEMENT STATUS SWITCH ---
      if (dataStr.startsWith('t_set_')) {
        const txId = dataStr.split('t_set_')[1];
        const { data: current } = await supabase.from('transactions').select('to_settle').eq('id', txId).single();
        if (current) {
          const nextState = !current.to_settle;
          await supabase.from('transactions').update({ to_settle: nextState }).eq('id', txId);
          await answerCallbackQuery(callbackQuery.id, `⚖️ Settlement flipped to: ${nextState ? 'Yes' : 'No'}`);
        }
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // --- DIRECT TOGGLE ACTION: EXPENSE ⇄ INCOME SWITCH ---
      if (dataStr.startsWith('t_typ_')) {
        const txId = dataStr.split('t_typ_')[1];
        const { data: current } = await supabase.from('transactions').select('type').eq('id', txId).single();
        if (current) {
          const nextType = current.type === 'expense' ? 'income' : 'expense';
          await supabase.from('transactions').update({ type: nextType }).eq('id', txId);
          await answerCallbackQuery(callbackQuery.id, `🔄 Flow type swapped to: ${nextType}`);
        }
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // --- VALUE EXECUTION RESOLUTIONS ---
      if (dataStr.startsWith('v_cat_')) {
        const [_, __, txId, indexStr] = dataStr.split('_');
        const targetCategory = QUICK_CATEGORIES[parseInt(indexStr, 10)];
        await supabase.from('transactions').update({ category: targetCategory }).eq('id', txId);
        await answerCallbackQuery(callbackQuery.id, `📦 Updated to ${targetCategory}`);
        return handleReturnToMenu(chatId, messageId, txId);
      }

      if (dataStr.startsWith('v_acc_')) {
        const [_, __, txId, rawAccount] = dataStr.split('_');
        const normalizedAccount = rawAccount === 'PartnerA' ? 'Partner A' : rawAccount === 'PartnerB' ? 'Partner B' : 'Joint';
        await supabase.from('transactions').update({ account_used: normalizedAccount }).eq('id', txId);
        await answerCallbackQuery(callbackQuery.id, `🏧 Account mapped: ${normalizedAccount}`);
        return handleReturnToMenu(chatId, messageId, txId);
      }

      if (dataStr.startsWith('d_')) {
        const txId = dataStr.split('d_')[1];
        await supabase.from('transactions').delete().eq('id', txId);
        await editTelegramMessageInline(chatId, messageId, "🗑️ <b>Transaction permanently deleted from cloud ledger.</b>", []);
        await answerCallbackQuery(callbackQuery.id, "Purged.");
        return NextResponse.json({ ok: true });
      }

      if (dataStr.startsWith('menu_')) {
        const txId = dataStr.split('menu_')[1];
        return handleReturnToMenu(chatId, messageId, txId);
      }

      return NextResponse.json({ ok: true });
    }

    // ────────────────────────────────────────────────────────────────────────
    // BRANCH B: STANDARD MESSAGES & TEXT REPLY LISTENER HANDLERS
    // ────────────────────────────────────────────────────────────────────────
    if (payload.message) {
      const chatId = payload.message.chat.id;
      const tgUser = payload.message.from.username || '';
      
      const allowedUsers = (process.env.TELEGRAM_ALLOWED_USER_NAMES || '').toLowerCase().split(',');
      if (!allowedUsers.includes(tgUser.toLowerCase())) {
        await sendTelegramMessage(chatId, "🚫 Access Denied: Unauthorized profile.");
        return NextResponse.json({ ok: true });
      }

      // 🛑 OPTION RUNTIME CHECK: IS THIS A REPLY ATTEMPT TO MODIFY A NOTE?
      if (payload.message.reply_to_message && payload.message.reply_to_message.text) {
        const replyText = payload.message.reply_to_message.text;
        
        // Scan the parent system alert to extract the matching unique key identifier
        if (replyText.includes('Editing Note for transaction reference:')) {
          const textLines = replyText.split('\n');
          const txId = textLines[1]?.trim(); // Extracts the exact UUID from line 2
          const freshNoteContent = payload.message.text;

          if (txId) {
            // Update the note field inside Supabase instantly
            await supabase.from('transactions').update({ note: freshNoteContent }).eq('id', txId);
            await sendTelegramMessage(chatId, `📝 <b>Note updated successfully to:</b> "${freshNoteContent}"`);
            
            // Re-fetch database metrics to paint a fresh dashboard interface
            const { data: txRows } = await supabase.from('transactions').select().eq('id', txId);
            if (txRows && txRows[0]) {
              // Re-post a pristine main tracking view console down down below
              const tx = txRows[0];
              const baseBanner = `<b>📥 Transaction Updated Console</b>\n\n💰 <b>Amount:</b> ₹${tx.amount}\n📦 <b>Category:</b> ${tx.category}\n🏧 <b>Account:</b> ${tx.account_used === 'Joint' ? '💳 Joint Wallet' : '👤 ' + tx.account_used}\n⚖️ <b>To Settle:</b> ${tx.to_settle ? '⚠️ Yes' : '✅ No'}\n🔄 <b>Flow Type:</b> ${tx.type === 'expense' ? '🛑 Expense' : '💸 Income'}\n📝 <b>Note:</b> ${tx.note}`;
              const inlineKeyboard = [
                [
                  { text: "📦 Category", callback_data: `s_cat_${txId}` },
                  { text: "🏧 Account", callback_data: `s_acc_${txId}` },
                  { text: "📝 Edit Note", callback_data: `s_not_${txId}` }
                ],
                [
                  { text: tx.to_settle ? "⚖️ To Settle: Yes" : "⚖️ To Settle: No", callback_data: `t_set_${txId}` },
                  { text: tx.type === 'expense' ? "🛑 Type: Expense" : "💸 Type: Income", callback_data: `t_typ_${txId}` },
                  { text: "🗑️ Delete", callback_data: `d_${txId}` }
                ]
              ];
              await sendTelegramMessageInline(chatId, baseBanner, inlineKeyboard);
            }
            return NextResponse.json({ ok: true });
          }
        }
      }

      // --- STANDARD TEXT EXPENSE ADDITIONS PIPELINE ---
      const rawText = payload.message.text || '';
      if (rawText.startsWith('/start')) {
        await sendTelegramMessage(chatId, "👋 Welcome! Send transactions naturally. Use the control panel dashboard grid beneath confirmation logs to alter any matrix metric dynamically.");
        return NextResponse.json({ ok: true });
      }

      const householdId = process.env.TELEGRAM_DEFAULT_HOUSEHOLD_ID;
      const geminiKey = process.env.GEMINI_API_KEY;
      const isPartnerA = tgUser.toLowerCase().includes('goku');
      const senderIdentity = isPartnerA ? 'Partner A' : 'Partner B';

      const systemPrompt = `You are an expert personal finance data-entry clerk processing text for a household ledger in India.
      Analyze the text input and map it cleanly into a structured JSON payload matching these criteria:

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
      1. ACCOUNT SELECTION LOGIC:
         - If the text explicitly contains the words "joint", "joint account", or "joint wallet", set "account" to "Joint".
         - If the text explicitly mentions "Partner A" or the name "Gaurav", set "account" to "Partner A".
         - If the text explicitly mentions "Partner B" or the name "Karishma", set "account" to "Partner B".
         - DEFAULT: If neither are explicitly stated, default to exactly "${senderIdentity}".
      
      2. SETTLEMENT TOGGLE ("to_settle"): If text contains "to be settled", "tosettle", or "to settle", set "toSettle" to true. Else false.
      3. TRANSACTION TYPE ("type"): If text contains "Salary", "Bonus", "Interest credited", "refund", or "rental income", set "type" to "income". Else "expense".

      Return ONLY a raw valid JSON object pattern matching structure:
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

      const { data: dbRows, error: dbError } = await supabase.from('transactions').insert([insertPayload]).select();
      if (dbError) throw dbError;

      const realTx = dbRows && dbRows[0] ? dbRows[0] : insertPayload;
      const activeId = realTx.id;

      const responseMsg = `<b>📥 Transaction Successfully Recorded!</b>\n\n💰 <b>Amount:</b> ₹${realTx.amount}\n📦 <b>Category:</b> ${realTx.category}\n🏧 <b>Account:</b> ${realTx.account_used === 'Joint' ? '💳 Joint Wallet' : '👤 ' + realTx.account_used}\n⚖️ <b>To Settle:</b> ${realTx.to_settle ? '⚠️ Yes' : '✅ No'}\n🔄 <b>Flow Type:</b> ${realTx.type === 'expense' ? '🛑 Expense' : '💸 Income'}\n📝 <b>Note:</b> ${realTx.note}`;
      
      // 📡 THE CONTROL PANEL HUB GRID
      const inlineKeyboard = [
        [
          { text: "📦 Category", callback_data: `s_cat_${activeId}` },
          { text: "🏧 Account", callback_data: `s_acc_${activeId}` },
          { text: "📝 Edit Note", callback_data: `s_not_${activeId}` }
        ],
        [
          { text: realTx.to_settle ? "⚖️ To Settle: Yes" : "⚖️ To Settle: No", callback_data: `t_set_${activeId}` },
          { text: realTx.type === 'expense' ? "🛑 Type: Expense" : "💸 Type: Income", callback_data: `t_typ_${activeId}` },
          { text: "🗑️ Delete", callback_data: `d_${activeId}` }
        ]
      ];

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
// DYNAMIC REDRAW ENGINE & TELEGRAM DISPATCH PIPELINES
// ────────────────────────────────────────────────────────────────────────
async function handleReturnToMenu(chatId: number, messageId: number, txId: string) {
  const { data: txRows } = await supabase.from('transactions').select().eq('id', txId);
  if (txRows && txRows[0]) {
    const tx = txRows[0];
    const baseBanner = `<b>📥 Transaction Successfully Recorded!</b>\n\n💰 <b>Amount:</b> ₹${tx.amount}\n📦 <b>Category:</b> ${tx.category}\n🏧 <b>Account:</b> ${tx.account_used === 'Joint' ? '💳 Joint Wallet' : '👤 ' + tx.account_used}\n⚖️ <b>To Settle:</b> ${tx.to_settle ? '⚠️ Yes' : '✅ No'}\n🔄 <b>Flow Type:</b> ${tx.type === 'expense' ? '🛑 Expense' : '💸 Income'}\n📝 <b>Note:</b> ${tx.note}`;
    
    const inlineKeyboard = [
      [
        { text: "📦 Category", callback_data: `s_cat_${txId}` },
        { text: "🏧 Account", callback_data: `s_acc_${txId}` },
        { text: "📝 Edit Note", callback_data: `s_not_${txId}` }
      ],
      [
        { text: tx.to_settle ? "⚖️ To Settle: Yes" : "⚖️ To Settle: No", callback_data: `t_set_${txId}` },
        { text: tx.type === 'expense' ? "🛑 Type: Expense" : "💸 Type: Income", callback_data: `t_typ_${txId}` },
        { text: "🗑️ Delete", callback_data: `d_${txId}` }
      ]
    ];
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

async function sendTelegramForceReply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: { force_reply: true, selective: true }
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
