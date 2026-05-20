import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-build-phase';
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ─── Category lists ───────────────────────────────────────────────────────────
const MASTER_PREDICTIONS = [
  "Groceries", "Dining Out", "Online Groceries", "Online Food Orders",
  "Cab Services", "Personal Transportation", "Online Shopping", "Miscellaneous",
  "Entertainment", "Subscriptions"
];

const QUICK_CATEGORIES = [
  "Dining Out", "Online Food Orders", "Online Groceries", "Groceries",
  "Cab Services", "Personal Transportation", "Online Shopping", "Miscellaneous"
];

// ─── Shared helper: validate Telegram user against profiles ──────────────────
const validateTelegramUser = async (tgUser: string) => {
  const cleanHandle = tgUser.replace(/@/g, '').trim().toLowerCase();
  if (!cleanHandle) return null;

  const { data: allProfiles, error } = await supabase
    .from('profiles')
    .select('household_id, display_name, telegram_username');

  if (error || !allProfiles) return null;

  const match = allProfiles.find(p =>
    (p.telegram_username || '').replace(/@/g, '').trim().toLowerCase() === cleanHandle
  );

  if (!match) return null;

  return {
    householdId: match.household_id,
    senderIdentity: match.display_name === 'Partner B' ? 'Partner B' : 'Partner A'
  };
};

// ─── Shared helper: load household settings (names + mode) ───────────────────
const loadPartnerNames = async (householdId: string) => {
  let nameA = 'Partner A';
  let nameB = 'Partner B';
  let householdMode: 'joint' | 'separate' | 'solo' = 'joint';
  if (!householdId) return { nameA, nameB, householdMode };
  const { data: st } = await supabase
    .from('household_settings')
    .select('settings_data')
    .eq('household_id', householdId)
    .single();
  if (st?.settings_data) {
    const s = typeof st.settings_data === 'string' ? JSON.parse(st.settings_data) : st.settings_data;
    nameA = s.partnerAName || s.partner_a_name || nameA;
    nameB = s.partnerBName || s.partner_b_name || nameB;
    householdMode = s.householdMode || s.household_mode || householdMode;
  }
  return { nameA, nameB, householdMode };
};

// ─── Shared helper: build the settle_track label for display ─────────────────
const settleTrackLabel = (track: string, toSettle: boolean) => {
  if (track === 'partner') return '🤝 Partner Split';
  if (track === 'joint' || toSettle) return '🏦 Joint Reimbursement';
  return '✅ Personal (No Settlement)';
};

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // ────────────────────────────────────────────────────────────────────────
    // BRANCH A: CALLBACK QUERIES (button taps)
    // ────────────────────────────────────────────────────────────────────────
    if (payload.callback_query) {
      const cq = payload.callback_query;
      const chatId = cq.message.chat.id;
      const messageId = cq.message.message_id;
      const dataStr = cq.data || '';
      const tgUser = cq.from.username || '';

      const userContext = await validateTelegramUser(tgUser);
      if (!userContext) {
        await answerCallbackQuery(cq.id, '🚫 Unauthorized. Link your Telegram handle in Settings first.');
        return NextResponse.json({ ok: true });
      }

      // ── WIZARD STEP 2: category selected → choose account ─────────────────
      if (dataStr.startsWith('w_cat_')) {
        const parts = dataStr.split('_');
        // format: w_cat_<txId>_<catIndex>  (txId may contain hyphens)
        const catIndex = parseInt(parts[parts.length - 1], 10);
        const txId = parts.slice(2, parts.length - 1).join('_');
        const chosenCategory = MASTER_PREDICTIONS[catIndex];

        await supabase.from('transactions').update({ category: chosenCategory }).eq('id', txId);

        const { data: tx } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { nameA, nameB, householdMode: catMode } = await loadPartnerNames(tx?.household_id || '');

        // Only show Joint option for joint mode households
        const accountKeyboard: any[] = [
          [
            { text: `👤 ${nameA}`, callback_data: `w_acc_${txId}_PartnerA` },
            ...(catMode !== 'solo' ? [{ text: `👤 ${nameB}`, callback_data: `w_acc_${txId}_PartnerB` }] : [])
          ],
          ...(catMode === 'joint' ? [[{ text: '💳 Joint Account', callback_data: `w_acc_${txId}_Joint` }]] : [])
        ];

        await editTelegramMessageInline(chatId, messageId,
          `📦 <b>Category:</b> ${chosenCategory}\n\n🏧 <b>Which account was used to pay?</b>`,
          accountKeyboard);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── WIZARD STEP 3: account selected → choose settlement track ──────────
      if (dataStr.startsWith('w_acc_')) {
        const parts = dataStr.split('_');
        const rawAccount = parts[parts.length - 1];
        const txId = parts.slice(2, parts.length - 1).join('_');
        const normalizedAccount =
          rawAccount === 'PartnerA' ? 'Partner A' :
          rawAccount === 'PartnerB' ? 'Partner B' : 'Joint';

        await supabase.from('transactions')
          .update({ account_used: normalizedAccount, settle_track: 'none', to_settle: false })
          .eq('id', txId);

        // Joint account payments don't need settlement — go straight to menu
        if (normalizedAccount === 'Joint') {
          await answerCallbackQuery(cq.id, '✅ Logged to Joint Account!');
          return handleReturnToMenu(chatId, messageId, txId);
        }

        // Load mode to know which settlement options to offer
        const { data: txRow2 } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { householdMode: wMode } = await loadPartnerNames(txRow2?.household_id || '');

        const settleKeyboard: any[] = [
          [{ text: '❌ No Settlement — personal expense', callback_data: `w_trk_${txId}_none` }],
        ];
        if (wMode === 'joint') {
          settleKeyboard.push([{ text: '🏦 Reimburse from Joint Pool', callback_data: `w_trk_${txId}_joint` }]);
        }
        if (wMode !== 'solo') {
          settleKeyboard.push([{ text: '🤝 Partner Split — they owe me', callback_data: `w_trk_${txId}_partner` }]);
        }

        await editTelegramMessageInline(chatId, messageId,
          `🏧 <b>Account:</b> ${normalizedAccount}\n\n⚖️ <b>Settlement track:</b>`,
          settleKeyboard);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── WIZARD STEP 4: settlement track selected → done ────────────────────
      if (dataStr.startsWith('w_trk_')) {
        const parts = dataStr.split('_');
        const track = parts[parts.length - 1]; // 'none' | 'joint' | 'partner'
        const txId = parts.slice(2, parts.length - 1).join('_');

        const updatePayload: Record<string, any> = {
          settle_track: track,
          to_settle: track === 'joint',
          split_mode: 'equal',
          partner_a_share: 0.5,
          partner_b_share: 0.5,
        };

        await supabase.from('transactions').update(updatePayload).eq('id', txId);
        await answerCallbackQuery(cq.id, '🎉 Entry logged!');
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // ── SUB-MENU: category grid ────────────────────────────────────────────
      if (dataStr.startsWith('s_cat_')) {
        const txId = dataStr.split('s_cat_')[1];
        const keyboard: any[] = [];
        for (let i = 0; i < QUICK_CATEGORIES.length; i += 2) {
          keyboard.push([
            { text: QUICK_CATEGORIES[i],     callback_data: `v_cat_${txId}_${i}` },
            { text: QUICK_CATEGORIES[i + 1], callback_data: `v_cat_${txId}_${i + 1}` }
          ]);
        }
        keyboard.push([{ text: '◀ Back', callback_data: `menu_${txId}` }]);
        await editTelegramMessageInline(chatId, messageId, '📦 <b>Choose a new category:</b>', keyboard);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── SUB-MENU: account selection ────────────────────────────────────────
      if (dataStr.startsWith('s_acc_')) {
        const txId = dataStr.split('s_acc_')[1];
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const saccSettings = await loadPartnerNames(txRow?.household_id || '');
        const accMode = saccSettings.householdMode;
        const keyboard: any[] = [
          [
            { text: `👤 ${saccSettings.nameA}`, callback_data: `v_acc_${txId}_PartnerA` },
            ...(accMode !== 'solo' ? [{ text: `👤 ${saccSettings.nameB}`, callback_data: `v_acc_${txId}_PartnerB` }] : [])
          ],
          ...(accMode === 'joint' ? [[{ text: '💳 Joint Account', callback_data: `v_acc_${txId}_Joint` }]] : []),
          [{ text: '◀ Back', callback_data: `menu_${txId}` }]
        ];
        await editTelegramMessageInline(chatId, messageId, '🏧 <b>Choose the correct account:</b>', keyboard);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── SUB-MENU: note editing ─────────────────────────────────────────────
      if (dataStr.startsWith('s_not_')) {
        const txId = dataStr.split('s_not_')[1];
        await sendTelegramForceReply(chatId,
          `📝 <b>Editing note for transaction:</b>\n<code>${txId}</code>\n\nReply to this message with the new note.`);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── SUB-MENU: settlement track picker ─────────────────────────────────
      if (dataStr.startsWith('s_trk_')) {
        const txId = dataStr.split('s_trk_')[1];
        const { data: strkTx } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { householdMode: strkMode } = await loadPartnerNames(strkTx?.household_id || '');
        const keyboard: any[] = [
          [{ text: '❌ No Settlement', callback_data: `v_trk_${txId}_none` }],
          ...(strkMode === 'joint' ? [[{ text: '🏦 Reimburse from Joint Pool', callback_data: `v_trk_${txId}_joint` }]] : []),
          ...(strkMode !== 'solo' ? [[{ text: '🤝 Partner Split', callback_data: `v_trk_${txId}_partner` }]] : []),
          [{ text: '◀ Back', callback_data: `menu_${txId}` }]
        ];
        await editTelegramMessageInline(chatId, messageId, '⚖️ <b>Choose settlement track:</b>', keyboard);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── TOGGLE: expense ⇄ income ───────────────────────────────────────────
      if (dataStr.startsWith('t_typ_')) {
        const txId = dataStr.split('t_typ_')[1];
        const { data: current } = await supabase.from('transactions').select('type').eq('id', txId).single();
        if (current) {
          const nextType = current.type === 'expense' ? 'income' : 'expense';
          await supabase.from('transactions').update({ type: nextType }).eq('id', txId);
          await answerCallbackQuery(cq.id, `🔄 Switched to: ${nextType}`);
        }
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // ── VALUE: set category ────────────────────────────────────────────────
      if (dataStr.startsWith('v_cat_')) {
        const parts = dataStr.split('_');
        const idx = parseInt(parts[parts.length - 1], 10);
        const txId = parts.slice(2, parts.length - 1).join('_');
        const cat = QUICK_CATEGORIES[idx];
        await supabase.from('transactions').update({ category: cat }).eq('id', txId);
        await answerCallbackQuery(cq.id, `📦 ${cat}`);
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // ── VALUE: set account ─────────────────────────────────────────────────
      if (dataStr.startsWith('v_acc_')) {
        const parts = dataStr.split('_');
        const raw = parts[parts.length - 1];
        const txId = parts.slice(2, parts.length - 1).join('_');
        const acc = raw === 'PartnerA' ? 'Partner A' : raw === 'PartnerB' ? 'Partner B' : 'Joint';
        await supabase.from('transactions').update({ account_used: acc }).eq('id', txId);
        await answerCallbackQuery(cq.id, `🏧 ${acc}`);
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // ── VALUE: set settlement track ────────────────────────────────────────
      if (dataStr.startsWith('v_trk_')) {
        const parts = dataStr.split('_');
        const track = parts[parts.length - 1];
        const txId = parts.slice(2, parts.length - 1).join('_');
        await supabase.from('transactions').update({
          settle_track: track,
          to_settle: track === 'joint',
          split_mode: 'equal',
          partner_a_share: 0.5,
          partner_b_share: 0.5,
        }).eq('id', txId);
        await answerCallbackQuery(cq.id, settleTrackLabel(track, track === 'joint'));
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // ── DELETE ─────────────────────────────────────────────────────────────
      if (dataStr.startsWith('d_')) {
        const txId = dataStr.split('d_')[1];
        await supabase.from('transactions').delete().eq('id', txId);
        await editTelegramMessageInline(chatId, messageId,
          '🗑️ <b>Transaction deleted.</b>', []);
        await answerCallbackQuery(cq.id, 'Deleted.');
        return NextResponse.json({ ok: true });
      }

      // ── RETURN TO MENU ─────────────────────────────────────────────────────
      if (dataStr.startsWith('menu_')) {
        const txId = dataStr.split('menu_')[1];
        return handleReturnToMenu(chatId, messageId, txId);
      }

      return NextResponse.json({ ok: true });
    }

    // ────────────────────────────────────────────────────────────────────────
    // BRANCH B: INCOMING TEXT MESSAGES
    // ────────────────────────────────────────────────────────────────────────
    if (payload.message) {
      const chatId = payload.message.chat.id;
      const tgUser = payload.message.from.username || '';
      const rawText = (payload.message.text || '').trim();

      const userContext = await validateTelegramUser(tgUser);
      if (!userContext) {
        await sendTelegramMessage(chatId,
          `❌ <b>Access Denied</b>\n\n` +
          `<code>@${tgUser}</code> is not linked to any household profile.\n\n` +
          `Go to Settings → Telegram Bot Integration and link your handle.`);
        return NextResponse.json({ ok: true });
      }

      const { householdId, senderIdentity } = userContext;
      const { nameA, nameB, householdMode } = await loadPartnerNames(householdId);

      // ── Note edit reply interception ───────────────────────────────────────
      if (payload.message.reply_to_message?.text?.includes('Editing note for transaction:')) {
        const replyText = payload.message.reply_to_message.text;
        const txId = replyText.split('\n')[1]?.trim();
        if (txId) {
          await supabase.from('transactions').update({ note: rawText }).eq('id', txId);
          await sendTelegramMessage(chatId, `📝 <b>Note updated:</b> "${rawText}"`);
          return handleReturnToMenu(chatId, payload.message.message_id - 1, txId);
        }
      }

      if (rawText.startsWith('/start')) {
        await sendTelegramMessage(chatId,
          `👋 <b>Welcome to FamilyFinance Bot!</b>\n\n` +
          `<b>How to log:</b>\n` +
          `• <code>450 Zomato</code> → personal expense, no settlement\n` +
          `• <code>450 Zomato Gaurav</code> → logged under Gaurav's account\n` +
          `• <code>450 Zomato to settle</code> → Joint pool reimburses you\n` +
          `• <code>450 Zomato settle with Priya</code> → Priya owes you directly\n\n` +
          `Send a plain <b>number</b> (e.g. <code>500</code>) for the interactive wizard.\n` +
          `Send <b>multiple items</b> in one message and all get logged at once.`);
        return NextResponse.json({ ok: true });
      }

      const geminiKey = process.env.GEMINI_API_KEY;

      // ── PATH 1: NUMERIC AMOUNT → INTERACTIVE WIZARD ───────────────────────
      const numericAmount = Number(rawText);
      if (!isNaN(numericAmount) && numericAmount > 0) {
        const txId = crypto.randomUUID();

        await supabase.from('transactions').insert([{
          id: txId,
          household_id: householdId,
          date: new Date().toISOString().slice(0, 10),
          amount: numericAmount,
          category: 'Miscellaneous',
          type: 'expense',
          account_used: senderIdentity === 'Partner B' ? 'Partner B' : 'Partner A',
          added_by: senderIdentity,
          note: 'Quick Wizard Log',
          to_settle: false,
          settled: false,
          settle_track: 'none',
          split_mode: 'equal',
          partner_a_share: 0.5,
          partner_b_share: 0.5,
        }]);

        const categoryKeyboard: any[] = [];
        for (let i = 0; i < MASTER_PREDICTIONS.length; i += 2) {
          categoryKeyboard.push([
            { text: MASTER_PREDICTIONS[i],     callback_data: `w_cat_${txId}_${i}` },
            { text: MASTER_PREDICTIONS[i + 1], callback_data: `w_cat_${txId}_${i + 1}` }
          ]);
        }

        await sendTelegramMessageInline(chatId,
          `🔢 <b>Amount:</b> ₹${numericAmount}\n\n📦 <b>Select a category:</b>`,
          categoryKeyboard);
        return NextResponse.json({ ok: true });
      }

      // ── PATH 2: NATURAL LANGUAGE → AI PARSING ────────────────────────────
      //
      // PRE-PARSE MODE GUARD: reject settlement keywords that don't apply
      // to this household's mode, before wasting an AI call.
      const lowerText = rawText.toLowerCase();
      const mentionsToSettle = lowerText.includes('to settle');
      const mentionsSettleWith = lowerText.includes('settle with');

      if (householdMode === 'solo' && (mentionsToSettle || mentionsSettleWith)) {
        await sendTelegramMessage(chatId,
          `⚠️ <b>Solo mode doesn't support settlements.</b>\n\n` +
          `Your household is set to Solo — there's no partner or joint pool.\n` +
          `Just send: <code>amount description</code> to log an expense.`);
        return NextResponse.json({ ok: true });
      }

      if (householdMode === 'separate' && mentionsToSettle) {
        await sendTelegramMessage(chatId,
          `⚠️ <b>No joint pool in Separate mode.</b>\n\n` +
          `"To settle" means Joint pool reimbursement, but your household has no joint pool.\n` +
          `To log a partner split instead, use: <code>amount description settle with ${nameB}</code>`);
        return NextResponse.json({ ok: true });
      }

      //
      // LOGGING RULES (simple, in priority order):
      //
      // 1. Amount + Note only
      //    → logged as the sender's personal expense, no settlement
      //    → account = senderIdentity, settle_track = "none"
      //
      // 2. Amount + Note + Account name (partner name or "joint")
      //    → logged as paid by that person / from that account
      //    → account = whoever is mentioned, settle_track = "none"
      //
      // 3. Text includes "to settle" (anywhere)
      //    → sender paid personally, Joint pool to reimburse
      //    → account = senderIdentity, settle_track = "joint"
      //
      // 4. Text includes "settle with ${nameA}" or "settle with ${nameB}"
      //    → direct partner settlement
      //    → account = senderIdentity, settle_track = "partner"
      //
      // These four rules cover 99% of messages. AI must not invent settlement
      // unless one of the explicit keywords above is present.

      const systemPrompt = `You are a personal finance clerk extracting transactions from a message.
Extract EVERY transaction mentioned and return a JSON array. Keep it simple.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETTLEMENT RULES — apply in this exact order, stop at first match:

RULE 1 — DEFAULT (no settlement keywords):
  Message has only an amount and a description, or mentions an account name.
  → settle_track = "none"
  → account = whoever is mentioned, or default to "${senderIdentity}"

${householdMode !== 'solo' && householdMode !== 'separate' ? `RULE 2 — "to settle" appears anywhere in the message:
  ${senderIdentity} paid personally; the Joint pool should reimburse them.
  → settle_track = "joint"
  → account = "${senderIdentity}"` : `RULE 2 — DISABLED: this household has no joint pool (mode: ${householdMode}).
  If you see "to settle", treat it as settle_track = "none".`}

${householdMode !== 'solo' ? `RULE 3 — "settle with ${nameA}" OR "settle with ${nameB}" appears:
  Direct partner debt — the named person owes ${senderIdentity}.
  → settle_track = "partner"
  → account = "${senderIdentity}"` : `RULE 3 — DISABLED: solo mode has no partner.
  If you see "settle with", treat it as settle_track = "none".`}

DO NOT set settle_track to "joint" or "partner" unless one of the above
enabled explicit phrases is present. Most messages will be settle_track = "none".
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ACCOUNT RULES:
${householdMode === 'solo' ? `- Only valid account is "${senderIdentity}" (solo mode — no partner, no joint)
- Always set account = "${senderIdentity}"` : householdMode === 'separate' ? `- "Partner A" if text mentions ${nameA}
- "Partner B" if text mentions ${nameB}
- No "Joint" option — this household has no joint pool
- Default to "${senderIdentity}" if nothing is mentioned` : `- "Partner A" if text mentions ${nameA}
- "Partner B" if text mentions ${nameB}
- "Joint" if text says "joint" or "joint account" (and no settlement keyword)
- Default to "${senderIdentity}" if nothing is mentioned`}

CURRENT SESSION:
- Person sending this message: ${senderIdentity}
- "added_by" is always exactly "${senderIdentity}" — never change this

TYPE: "income" if text contains salary/bonus/credited/refund/interest. Otherwise "expense".

NOTE: Only the merchant name or item. Strip out partner names, settlement phrases, amounts.

CATEGORIES:
- "Alcohol" (Wine shops, Living Liquidz, pub/bar drinks, beer, whiskey)
- "Dining Out" (Restaurants, cafes, dine-in, coffee shops, physically eating out)
- "Education" (Course fees, certifications, books, training)
- "Entertainment" (Movie tickets, BookMyShow, gaming, concerts, events)
- "Groceries" (Offline kirana, Metro, physical vegetable/fruit markets)
- "Healthcare" (Pharmacies, Apollo, doctor, checkups, lab tests, medicines)
- "Gifting" (Gifts for friends/family, shagun/cash envelopes)
- "Housing" (Rent, society maintenance, home loan EMI)
- "Insurance" (Health, car, bike, term life insurance)
- "Investments" (Mutual funds, SIPs, Zerodha, Gold, US stocks, PPF, Index funds)
- "Miscellaneous" (Unclassifiable, ATM withdrawals, random items)
- "Offline Shopping" (Physical retail, apparel/footwear at a mall)
- "Online Shopping" (Amazon, Flipkart, Myntra, Ajio, Tata CLiQ)
- "Personal Care" (Salon, haircut, beauty parlour, spa, skincare)
- "Personal Transportation" (Petrol, bike EMI, car service, toll, fastag, parking)
- "Savings" (Transfers to emergency/sinking funds)
- "Subscriptions" (Netflix, Prime, Spotify, iCloud, YouTube Premium, gym)
- "Health & Fitness" (Protein, supplements, Yoga, fitness gear)
- "Taxes" (Income tax, property tax)
- "Technology" (Software, gadgets, accessories)
- "Travel" (Flights, hotels, Airbnb, IRCTC, vacation)
- "Utilities" (Mobile recharges, broadband, electricity, gas, maid, cook salary)
- "Online Food Orders" (Zomato, Swiggy, Domino's, cloud kitchens)
- "Household Items" (Cleaning supplies, detergents, decor, bedsheets)
- "Cab Services" (Uber, Ola, Rapido, InDrive, auto, rickshaw)
- "Hosting Day" (Bulk food/alcohol for guests at home)
- "Online Groceries" (Zepto, Blinkit, Swiggy Instamart, BigBasket)
- "Interest Earned" (Bank interest, FD payouts)
- "Spouse Gifting" (Gifts or surprises for your partner)
- "Family payments" (Money to parents/siblings — mom, dad, Kari mom, Kari dad)`;

      const transactionSchema = {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            amount:       { type: 'NUMBER', description: 'Transaction amount' },
            category:     { type: 'STRING', description: 'One of the valid category names' },
            note:         { type: 'STRING', description: 'Merchant or item name only' },
            type:         { type: 'STRING', description: 'Exactly "expense" or "income"' },
            account:      { type: 'STRING', description: 'Exactly "Partner A", "Partner B", or "Joint"' },
            settle_track: { type: 'STRING', description: 'Exactly "none", "joint", or "partner" — default "none"' },
          },
          required: ['amount', 'category', 'note', 'type', 'account', 'settle_track']
        }
      };

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Input: "${rawText}"` }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: transactionSchema }
          })
        }
      );

      const geminiData = await geminiRes.json();
      let rawJson = (geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      if (rawJson.includes('```')) rawJson = rawJson.replace(/```json/gi, '').replace(/```/g, '').trim();

      if (!rawJson) {
        await sendTelegramMessage(chatId, '⚠️ Could not parse that message. Try shorter, clearer text.');
        return NextResponse.json({ ok: true });
      }

      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed)) throw new Error('Gemini did not return an array.');

      for (const tx of parsed) {
        if (!tx.amount || Number(tx.amount) <= 0) continue;

        const track: string = ['none', 'joint', 'partner'].includes(tx.settle_track) ? tx.settle_track : 'none';
        const txId = crypto.randomUUID();

        const row = {
          id: txId,
          household_id: householdId,
          date: new Date().toISOString().slice(0, 10),
          amount: Number(tx.amount),
          category: tx.category || 'Miscellaneous',
          type: tx.type || 'expense',
          account_used: tx.account || senderIdentity,
          added_by: senderIdentity,
          note: tx.note || 'AI log',
          // New settlement columns
          settle_track: track,
          to_settle: track === 'joint',
          split_mode: 'equal',
          partner_a_share: 0.5,
          partner_b_share: 0.5,
          settled: false,
          settled_with: null,
        };

        const { data: dbRows } = await supabase.from('transactions').insert([row]).select();
        const saved = dbRows?.[0] || row;
        const activeId = saved.id;

        const accountDisplay =
          saved.account_used === 'Partner A' ? `👤 ${nameA}` :
          saved.account_used === 'Partner B' ? `👤 ${nameB}` : '💳 Joint';

        const trackLabel = settleTrackLabel(saved.settle_track, saved.to_settle);

        const msg =
          `<b>📥 Transaction Logged!</b>\n\n` +
          `💰 <b>Amount:</b> ₹${saved.amount}\n` +
          `📦 <b>Category:</b> ${saved.category}\n` +
          `🏧 <b>Account:</b> ${accountDisplay}\n` +
          `⚖️ <b>Settlement:</b> ${trackLabel}\n` +
          `🔄 <b>Type:</b> ${saved.type === 'expense' ? '🛑 Expense' : '💸 Income'}\n` +
          `📝 <b>Note:</b> ${saved.note}`;

        const keyboard = [
          [
            { text: '📦 Category', callback_data: `s_cat_${activeId}` },
            { text: '🏧 Account',  callback_data: `s_acc_${activeId}` },
            { text: '📝 Note',     callback_data: `s_not_${activeId}` }
          ],
          [
            { text: `⚖️ Settlement`,                                       callback_data: `s_trk_${activeId}` },
            { text: saved.type === 'expense' ? '🛑 Expense' : '💸 Income', callback_data: `t_typ_${activeId}` },
            { text: '🗑️ Delete',                                           callback_data: `d_${activeId}` }
          ]
        ];

        await sendTelegramMessageInline(chatId, msg, keyboard);
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error('Webhook error:', err);
    try {
      const raw = await request.clone().text();
      const p = JSON.parse(raw);
      const chatId = p?.message?.chat?.id || p?.callback_query?.message?.chat?.id;
      if (chatId) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `❌ <b>Error processing your message</b>\n\n<code>${err?.message || 'Unknown error'}</code>`,
            parse_mode: 'HTML'
          })
        });
      }
    } catch { /* ignore nested error */ }
    return NextResponse.json({ ok: true });
  }
}

// ─── Return to transaction menu ───────────────────────────────────────────────
async function handleReturnToMenu(chatId: number, messageId: number, txId: string) {
  const { data: rows } = await supabase.from('transactions').select().eq('id', txId);
  if (!rows?.[0]) return NextResponse.json({ ok: true });

  const tx = rows[0];
  const { nameA, nameB } = await loadPartnerNames(tx.household_id || '');

  const accountDisplay =
    tx.account_used === 'Partner A' ? `👤 ${nameA}` :
    tx.account_used === 'Partner B' ? `👤 ${nameB}` : '💳 Joint';

  const trackLabel = settleTrackLabel(tx.settle_track || 'none', tx.to_settle);

  const banner =
    `<b>📥 Transaction Recorded!</b>\n\n` +
    `💰 <b>Amount:</b> ₹${tx.amount}\n` +
    `📦 <b>Category:</b> ${tx.category}\n` +
    `🏧 <b>Account:</b> ${accountDisplay}\n` +
    `⚖️ <b>Settlement:</b> ${trackLabel}\n` +
    `🔄 <b>Type:</b> ${tx.type === 'expense' ? '🛑 Expense' : '💸 Income'}\n` +
    `📝 <b>Note:</b> ${tx.note}`;

  const keyboard = [
    [
      { text: '📦 Category', callback_data: `s_cat_${txId}` },
      { text: '🏧 Account',  callback_data: `s_acc_${txId}` },
      { text: '📝 Note',     callback_data: `s_not_${txId}` }
    ],
    [
      { text: `⚖️ Settlement`,                                    callback_data: `s_trk_${txId}` },
      { text: tx.type === 'expense' ? '🛑 Expense' : '💸 Income', callback_data: `t_typ_${txId}` },
      { text: '🗑️ Delete',                                        callback_data: `d_${txId}` }
    ]
  ];

  await editTelegramMessageInline(chatId, messageId, banner, keyboard);
  return NextResponse.json({ ok: true });
}

// ─── Telegram API helpers ─────────────────────────────────────────────────────
async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
}

async function sendTelegramMessageInline(chatId: number, text: string, keyboard: any[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } })
  });
}

async function editTelegramMessageInline(chatId: number, messageId: number, text: string, keyboard: any[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } })
  });
}

async function sendTelegramForceReply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { force_reply: true, selective: true } })
  });
}

async function answerCallbackQuery(callbackQueryId: string, alertText?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: alertText || '', show_alert: false })
  });
}