import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const maxDuration = 60; 

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-build-phase'; 
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// The top 10 predicted categories for the quick-add wizard grid
const MASTER_PREDICTIONS = [
  "Groceries", "Dining Out", "Online Groceries", "Online Food Orders",
  "Cab Services", "Personal Transportation", "Utilities", "Miscellaneous",
  "Entertainment", "Subscriptions"
];

const QUICK_CATEGORIES = [
  "Dining Out", "Online Food Orders", "Online Groceries", "Groceries",
  "Cab Services", "Personal Transportation", "Utilities", "Miscellaneous"
];

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // ────────────────────────────────────────────────────────────────────────
    // BRANCH A: INTERACTIVE CONTROL CONSOLE DISPATCH (CALLBACK QUERIES)
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

      // ─── WIZARD STEP 2: MULTI-TENANT GENERIC NAME LOOKUP ───
      if (dataStr.startsWith('w_cat_')) {
        const [_, __, txId, catIndex] = dataStr.split('_');
        const chosenCategory = MASTER_PREDICTIONS[parseInt(catIndex, 10)];

        await supabase.from('transactions').update({ category: chosenCategory }).eq('id', txId);

        // Fetch the transaction details to find the household context
        const { data: tx } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        
        // Generic defaults for multi-user scaling
        let nameA = "Partner A"; 
        let nameB = "Partner B";

        if (tx?.household_id) {
          // Read the dynamic configurations from the settings table
          const { data: st } = await supabase.from('household_settings').select('settings_data').eq('household_id', tx.household_id).single();
          if (st?.settings_data) {
            const settings = typeof st.settings_data === 'string' ? JSON.parse(st.settings_data) : st.settings_data;
            // Support both standard camelCase or snake_case dynamic keys configuration pairs
            nameA = settings.partnerAName || settings.partner_a_name || nameA;
            nameB = settings.partnerBName || settings.partner_b_name || nameB;
          }
        }

        const accountKeyboard = [
          [
            { text: `👤 ${nameA}`, callback_data: `w_acc_${txId}_PartnerA` },
            { text: `👤 ${nameB}`, callback_data: `w_acc_${txId}_PartnerB` }
          ],
          [{ text: "💳 Joint Wallet", callback_data: `w_acc_${txId}_Joint` }]
        ];

        await editTelegramMessageInline(chatId, messageId, `📦 <b>Category Set:</b> ${chosenCategory}\n\n🏧 <b>Next, choose the funding account used:</b>`, accountKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // ─── WIZARD STEP 3: ACCOUNT SELECTED -> CHOOSE SETTLEMENT ───
      if (dataStr.startsWith('w_acc_')) {
        const [_, __, txId, rawAccount] = dataStr.split('_');
        const normalizedAccount = rawAccount === 'PartnerA' ? 'Partner A' : rawAccount === 'PartnerB' ? 'Partner B' : 'Joint';

        await supabase.from('transactions').update({ account_used: normalizedAccount }).eq('id', txId);

        if (normalizedAccount === 'Joint') {
          await answerCallbackQuery(callbackQuery.id, "✅ Wizard Entry Finished!");
          return handleReturnToMenu(chatId, messageId, txId);
        }

        const settleKeyboard = [
          [
            { text: "⚠️ Yes, Split 50/50", callback_data: `w_fin_${txId}_true` },
            { text: "✅ No, Personal Expense", callback_data: `w_fin_${txId}_false` }
          ]
        ];

        await editTelegramMessageInline(chatId, messageId, `🏧 <b>Account Set:</b> ${normalizedAccount}\n\n⚖️ <b>Should this out-of-pocket cost be settled by the joint pool?</b>`, settleKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // ─── WIZARD STEP 4: SETTLEMENT SET -> CONCLUDE AND SHOW MAIN DOCK ───
      if (dataStr.startsWith('w_fin_')) {
        const [_, __, txId, settleFlag] = dataStr.split('_');
        const toSettleValue = settleFlag === 'true';

        await supabase.from('transactions').update({ to_settle: toSettleValue }).eq('id', txId);
        await answerCallbackQuery(callbackQuery.id, "🎉 Entry Successfully Compiled!");
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // --- STANDARD SUB-MENU: SHOW CATEGORY GRID ---
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

      // --- STANDARD SUB-MENU: SHOW ACCOUNT SELECTION WITH DYNAMIC NAMES ---
      if (dataStr.startsWith('s_acc_')) {
        const txId = dataStr.split('s_acc_')[1];
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        
        let nameA = "Gaurav";
        let nameB = "Karishma";
        if (txRow?.household_id) {
          const { data: settingsRow } = await supabase.from('household_settings').select('settings_data').eq('household_id', txRow.household_id).single();
          if (settingsRow?.settings_data) {
            const settings = typeof settingsRow.settings_data === 'string' ? JSON.parse(settingsRow.settings_data) : settingsRow.settings_data;
            nameA = settings.partnerAName || settings.partner_a_name || nameA;
            nameB = settings.partnerBName || settings.partner_b_name || nameB;
          }
        }

        const inlineKeyboard = [
          [
            { text: `👤 ${nameA}`, callback_data: `v_acc_${txId}_PartnerA` },
            { text: `👤 ${nameB}`, callback_data: `v_acc_${txId}_PartnerB` }
          ],
          [{ text: "💳 Joint Wallet", callback_data: `v_acc_${txId}_Joint` }],
          [{ text: "◀ Return to Menu", callback_data: `menu_${txId}` }]
        ];
        
        await editTelegramMessageInline(chatId, messageId, "🏧 <b>Select the correct target funding account:</b>", inlineKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // --- STANDARD ACTION: PROMPT USER FOR NOTE TEXT ---
      if (dataStr.startsWith('s_not_')) {
        const txId = dataStr.split('s_not_')[1];
        const promptMsg = `📝 <b>Editing Note for transaction reference:</b>\n<code>${txId}</code>\n\nPlease reply directly to this message block with your new custom note content.`;
        await sendTelegramForceReply(chatId, promptMsg);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // --- STANDARD TOGGLE ACTION: SETTLEMENT STATUS SWITCH ---
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

      // --- STANDARD TOGGLE ACTION: EXPENSE ⇄ INCOME SWITCH ---
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

      // --- STANDARD VALUE EXECUTION RESOLUTIONS ---
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
      const rawText = (payload.message.text || '').trim();
      
      const allowedUsers = (process.env.TELEGRAM_ALLOWED_USER_NAMES || '').toLowerCase().split(',');
      if (!allowedUsers.includes(tgUser.toLowerCase())) {
        await sendTelegramMessage(chatId, "🚫 Access Denied: Unauthorized profile.");
        return NextResponse.json({ ok: true });
      }

      // --- INTERCEPT INLINE TEXT NOTE EDIT MODIFICATIONS ---
      if (payload.message.reply_to_message && payload.message.reply_to_message.text) {
        const replyText = payload.message.reply_to_message.text;
        if (replyText.includes('Editing Note for transaction reference:')) {
          const txId = replyText.split('\n')[1]?.trim();
          if (txId) {
            await supabase.from('transactions').update({ note: rawText }).eq('id', txId);
            await sendTelegramMessage(chatId, `📝 <b>Note updated successfully to:</b> "${rawText}"`);
            return handleReturnToMenu(chatId, payload.message.message_id - 1, txId);
          }
        }
      }

      if (rawText.startsWith('/start')) {
        await sendTelegramMessage(chatId, "👋 Welcome! Send a plain number (e.g., <code>500</code>) to trigger the interactive Wizard, or send a natural text description sentence to log automatically via AI.");
        return NextResponse.json({ ok: true });
      }

      const householdId = process.env.TELEGRAM_DEFAULT_HOUSEHOLD_ID;
      const geminiKey = process.env.GEMINI_API_KEY;
      const isPartnerA = tgUser.toLowerCase().includes('goku');
      const senderIdentity = isPartnerA ? 'Partner A' : 'Partner B';

      // ─── 💥 PATH 1: THE ZERO-COST INTERACTIVE WIZARD TRIGGER ───
      const cleanNumericAmount = Number(rawText);
      if (!isNaN(cleanNumericAmount) && cleanNumericAmount > 0) {
        const secureUuidFallback = crypto.randomUUID();

        // Write initial baseline rows directly to your table disk
        const skeletonPayload = {
          id: secureUuidFallback,
          household_id: householdId,
          date: new Date().toISOString().slice(0, 10),
          amount: cleanNumericAmount,
          category: 'Miscellaneous', 
          type: 'expense',
          account_used: 'Joint',     
          added_by: senderIdentity,
          note: 'Quick Wizard Log',
          to_settle: false,
          settled: false
        };

        await supabase.from('transactions').insert([skeletonPayload]);

        // Generate the 10 prediction grid matrix choices
        const categoryKeyboard: any[] = [];
        for (let i = 0; i < MASTER_PREDICTIONS.length; i += 2) {
          categoryKeyboard.push([
            { text: MASTER_PREDICTIONS[i], callback_data: `w_cat_${secureUuidFallback}_${i}` },
            { text: MASTER_PREDICTIONS[i+1], callback_data: `w_cat_${secureUuidFallback}_${i+1}` }
          ]);
        }

        const greetingHeader = `🔢 <b>Amount Logged:</b> ₹${cleanNumericAmount}\n\n📦 <b>Select a category below to compile entry data:</b>`;
        await sendTelegramMessageInline(chatId, greetingHeader, categoryKeyboard);
        return NextResponse.json({ ok: true });
      }

      // ─── 🤖 PATH 2: STANDARD NATURAL LANGUAGE PARSER PIPELINE ───
      const systemPrompt = `You are an expert personal finance clerk processing raw ledger data. Map text input to valid JSON.
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
    
      ACCOUNT SELECTION: "Joint" if text says joint/joint account/joint wallet. "Partner A" if mentions Gaurav. "Partner B" if mentions Karishma. Else default to "${senderIdentity}".
      SETTLEMENT: true if text contains "to settle", "tosettle", "to be settled". Else false.
      TYPE: "income" if text contains salary/bonus/interest credited/refund. Else "expense".

      Return ONLY a raw valid JSON string:
      {"amount": 500, "category": "Online Groceries", "note": "Zepto", "type": "expense", "account": "Joint", "toSettle": false}`;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Input: "${rawText}"` }] }] })
      });

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
// TELEGRAM CORE FRAMEWORK API PIPELINES
// ────────────────────────────────────────────────────────────────────────
async function handleReturnToMenu(chatId: number, messageId: number, txId: string) {
  const { data: txRows } = await supabase.from('transactions').select().eq('id', txId);
  if (txRows && txRows[0]) {
    const tx = txRows[0];
    
    // Multi-tenant generic baseline defaults
    let nameA = "Partner A";
    let nameB = "Partner B";
    
    if (tx.household_id) {
      const { data: settingsRow } = await supabase.from('household_settings').select('settings_data').eq('household_id', tx.household_id).single();
      
      if (settingsRow?.settings_data) {
        const settings = typeof settingsRow.settings_data === 'string' 
          ? JSON.parse(settingsRow.settings_data) 
          : settingsRow.settings_data;
        
        nameA = settings.partnerAName || settings.partner_a_name || nameA;
        nameB = settings.partnerBName || settings.partner_b_name || nameB;
      }
    }

    // Assign text display strings dynamically based on tenant variables
    let accountDisplay = '💳 Joint Wallet';
    if (tx.account_used === 'Partner A') accountDisplay = `👤 ${nameA}`;
    if (tx.account_used === 'Partner B') accountDisplay = `👤 ${nameB}`;

    const baseBanner = `<b>📥 Transaction Successfully Recorded!</b>\n\n💰 <b>Amount:</b> ₹${tx.amount}\n📦 <b>Category:</b> ${tx.category}\n🏧 <b>Account:</b> ${accountDisplay}\n⚖️ <b>To Settle:</b> ${tx.to_settle ? '⚠️ Yes' : '✅ No'}\n🔄 <b>Flow Type:</b> ${tx.type === 'expense' ? '🛑 Expense' : '💸 Income'}\n📝 <b>Note:</b> ${tx.note}`;
    
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
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' }),
  });
}

async function sendTelegramMessageInline(chatId: number, text: string, keyboard: any[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }),
  });
}

async function editTelegramMessageInline(chatId: number, messageId: number, text: string, keyboard: any[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }),
  });
}

async function sendTelegramForceReply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', reply_markup: { force_reply: true, selective: true } }),
  });
}

async function answerCallbackQuery(callbackQueryId: string, alertText?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: alertText || "", show_alert: false }),
  });
}
