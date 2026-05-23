import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-build-phase';
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ─── Category description enrichment ─────────────────────────────────────────
// Rich descriptions for standard categories. Any household that has these
// categories in their settings gets the detailed description injected into
// the AI prompt. Custom categories not in this map get a generic description.
// Your personal categories (Kari mom, Living Liquidz etc.) are preserved here.
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'Alcohol':                'Wine shops, Living Liquidz, pub/bar drinks, beer, whiskey, gin, vodka',
  'Dining Out':             'Restaurants, cafes, dine-in, fine dining, coffee shops, physically eating out at a venue',
  'Education':              'Course fees, certifications, books, training programs, upskilling materials',
  'Entertainment':          'Movie tickets, BookMyShow, gaming arcades, bowling alleys, concerts, events, fun outings',
  'Groceries':              'Offline local kirana stores, Metro, fruits, physical vegetable/fruit markets, cash grocery purchases',
  'Healthcare':             'Pharmacies, Apollo, doctor visits, checkups, lab tests, dental, medicines',
  'Gifting':                'Buying gifts for friends, family, relatives; shagun/cash envelopes for weddings or birthdays',
  'Housing':                'Monthly house rent, society maintenance bills, home loan EMI',
  'Insurance':              'Health insurance premiums, car/bike motor insurance renewals, term life insurance policies',
  'Investments':            'Mutual fund allocations, SIPs, Smallcase, Zerodha, Gold, US stocks, IND Money, PPF, Index funds',
  'Miscellaneous':          'Unexpected or unclassifiable payments, ATM cash withdrawals, random one-off pocket cash items',
  'Offline Shopping':       'Physical retail checkout, apparel or footwear bought at a mall/store',
  'Online Shopping':        'Amazon, Flipkart, Myntra, Ajio, Tata CLiQ, non-grocery online packages, retail websites',
  'Personal Care':          'Salon visits, haircuts, beauty parlour, grooming, spa, cosmetics, skincare',
  'Personal Transportation':'Petrol, bike EMI, helmet, car/motorcycle service/repairs, toll, fastag, parking fees',
  'Savings':                'Manual transfers to long-term cash reserves, emergency savings, sinking fund transfers',
  'Subscriptions':          'Netflix, Amazon Prime, Spotify, iCloud, YouTube Premium, gym memberships, recurring software',
  'Health & Fitness':       'Protein powder, gym supplements, Yoga classes, workout gear, organic health food',
  'Taxes':                  'Income tax filings, property tax, municipal or government duty filings',
  'Technology':             'Software licenses, digital tools, cloud hosting, gadgets, computer/mobile accessories',
  'Travel':                 'Flight tickets, hotel bookings, Airbnb, IRCTC, vacation bookings, luggage',
  'Utilities':              'Mobile recharges (Jio/Airtel/VI), home broadband, electricity, piped gas, maid/cook salary',
  'Online Food Orders':     'Zomato, Swiggy, EatClub, Dominos, pizza/burger delivery, cloud kitchen orders',
  'Household Items':        'Cleaning liquids, detergents, garbage bags, mop replacements, house decor, bedsheets',
  'Cab Services':           'Uber, Ola, Rapido, InDrive, auto, rickshaw, cab rides',
  'Hosting Day':            'Ordering bulk food/alcohol/snacks when friends/family visit the house for a social gathering',
  'Online Groceries':       'Zepto, Blinkit, Swiggy Instamart, BigBasket, daily milk/produce apps',
  'Interest Earned':        'Bank savings account interest payouts, fixed deposit (FD) interest pay-ins',
  'Spouse Gifting':         'Anniversary gestures, birthday surprises, or customised items bought as a gift for your partner',
  'Family payments':        'Sending money home to parents/siblings — mom, dad, Kari mom, Kari dad, sohan',
};

// Default description for categories not in the enrichment map
const DEFAULT_CAT_DESC = 'Expenses in this category';

// ─── Shared helper: load household settings ───────────────────────────────────
const loadHouseholdSettings = async (householdId: string) => {
  let nameA          = 'Partner A';
  let nameB          = 'Partner B';
  let householdMode  = 'joint';
  let expenseCats: string[] = Object.keys(CATEGORY_DESCRIPTIONS); // fallback = full standard list
  let quickCats: string[]   = ['Dining Out', 'Online Food Orders', 'Online Groceries', 'Groceries',
                                'Cab Services', 'Personal Transportation', 'Online Shopping', 'Miscellaneous'];

  if (!householdId) return { nameA, nameB, householdMode, expenseCats, quickCats };

  const { data: st } = await supabase
    .from('household_settings')
    .select('settings_data')
    .eq('household_id', householdId)
    .single();

  if (st?.settings_data) {
    const s = typeof st.settings_data === 'string' ? JSON.parse(st.settings_data) : st.settings_data;
    nameA         = s.partnerAName     || s.partner_a_name || nameA;
    nameB         = s.partnerBName     || s.partner_b_name || nameB;
    householdMode = s.householdMode    || s.household_mode || householdMode;

    // Use the household's own category list if available
    if (Array.isArray(s.expenseCategories) && s.expenseCategories.length > 0) {
      expenseCats = s.expenseCategories;
      // Build quickCats: prefer the first 8 of their list, using standard quick picks where available
      const STANDARD_QUICK = ['Dining Out', 'Online Food Orders', 'Online Groceries', 'Groceries',
                               'Cab Services', 'Personal Transportation', 'Online Shopping', 'Miscellaneous'];
      const theirQuick = STANDARD_QUICK.filter((c) => expenseCats.includes(c));
      // Fill remaining slots from their custom categories
      const extras = expenseCats.filter((c) => !STANDARD_QUICK.includes(c));
      quickCats = [...theirQuick, ...extras].slice(0, 8);
      // Pad to 8 with Miscellaneous if needed (ensures even grid)
      while (quickCats.length < 8) quickCats.push('Miscellaneous');
    }
  }

  return { nameA, nameB, householdMode, expenseCats, quickCats };
};

// ─── Build the category prompt block for a household ─────────────────────────
const buildCategoryPrompt = (cats: string[]): string => {
  return cats.map((cat) => {
    const desc = CATEGORY_DESCRIPTIONS[cat] || DEFAULT_CAT_DESC;
    return `      - "${cat}" (${desc})`;
  }).join('\n');
};

// ─── Settle track label ───────────────────────────────────────────────────────
const settleTrackLabel = (track: string, toSettle: boolean) => {
  if (track === 'partner') return '🤝 Partner Split';
  if (track === 'joint' || toSettle) return '🏦 Joint Reimbursement';
  return '✅ Personal (No Settlement)';
};

// ─── Telegram user validation ─────────────────────────────────────────────────
const validateTelegramUser = async (tgUser: string) => {
  const cleanHandle = tgUser.replace(/@/g, '').trim().toLowerCase();
  if (!cleanHandle) return null;
  const { data: allProfiles, error } = await supabase
    .from('profiles')
    .select('household_id, display_name, telegram_username');
  if (error || !allProfiles) return null;
  const match = allProfiles.find((p) =>
    (p.telegram_username || '').replace(/@/g, '').trim().toLowerCase() === cleanHandle
  );
  if (!match) return null;
  return {
    householdId: match.household_id,
    senderIdentity: match.display_name === 'Partner B' ? 'Partner B' : 'Partner A',
  };
};

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // ────────────────────────────────────────────────────────────────────────
    // BRANCH A: CALLBACK QUERIES (button taps)
    // ────────────────────────────────────────────────────────────────────────
    if (payload.callback_query) {
      const cq        = payload.callback_query;
      const chatId    = cq.message.chat.id;
      const messageId = cq.message.message_id;
      const dataStr   = cq.data || '';
      const tgUser    = cq.from.username || '';

      const userContext = await validateTelegramUser(tgUser);
      if (!userContext) {
        await answerCallbackQuery(cq.id, '🚫 Unauthorized. Link your Telegram handle in Settings first.');
        return NextResponse.json({ ok: true });
      }

      // ── WIZARD STEP 2: category selected → choose account ─────────────────
      if (dataStr.startsWith('w_cat_')) {
        const parts     = dataStr.split('_');
        const catIndex  = parseInt(parts[parts.length - 1], 10);
        const txId      = parts.slice(2, parts.length - 1).join('_');

        // Fetch this household's settings to resolve category name + accounts
        const { data: tx } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { nameA, nameB, householdMode, expenseCats } = await loadHouseholdSettings(tx?.household_id || '');
        const chosenCategory = expenseCats[catIndex] ?? 'Miscellaneous';

        await supabase.from('transactions').update({ category: chosenCategory }).eq('id', txId);

        const isSolo      = householdMode === 'solo';
        const isJoint     = householdMode === 'joint';
        const accountRows: any[] = [[{ text: `👤 ${nameA}`, callback_data: `w_acc_${txId}_PartnerA` }]];
        if (!isSolo) accountRows[0].push({ text: `👤 ${nameB}`, callback_data: `w_acc_${txId}_PartnerB` });
        if (isJoint)  accountRows.push([{ text: '💳 Joint Account', callback_data: `w_acc_${txId}_Joint` }]);

        await editTelegramMessageInline(chatId, messageId,
          `📦 <b>Category:</b> ${chosenCategory}\n\n🏧 <b>Which account was used to pay?</b>`,
          accountRows);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── WIZARD STEP 3: account selected → choose settlement track ──────────
      if (dataStr.startsWith('w_acc_')) {
        const parts           = dataStr.split('_');
        const rawAccount      = parts[parts.length - 1];
        const txId            = parts.slice(2, parts.length - 1).join('_');
        const normalizedAcct  = rawAccount === 'PartnerA' ? 'Partner A' : rawAccount === 'PartnerB' ? 'Partner B' : 'Joint';

        await supabase.from('transactions')
          .update({ account_used: normalizedAcct, settle_track: 'none', to_settle: false })
          .eq('id', txId);

        if (normalizedAcct === 'Joint') {
          await answerCallbackQuery(cq.id, '✅ Logged to Joint Account!');
          return handleReturnToMenu(chatId, messageId, txId);
        }

        const { data: tx2 } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { householdMode } = await loadHouseholdSettings(tx2?.household_id || '');
        const isJoint2    = householdMode === 'joint';
        const hasPartner2 = householdMode !== 'solo';

        const settleKeyboard: any[] = [
          [{ text: '❌ No Settlement — personal expense', callback_data: `w_trk_${txId}_none` }],
          ...(isJoint2    ? [[{ text: '🏦 Reimburse from Joint Pool', callback_data: `w_trk_${txId}_joint`   }]] : []),
          ...(hasPartner2 ? [[{ text: '🤝 Partner Split — they owe me', callback_data: `w_trk_${txId}_partner` }]] : []),
        ];

        await editTelegramMessageInline(chatId, messageId,
          `🏧 <b>Account:</b> ${normalizedAcct}\n\n⚖️ <b>Settlement track:</b>`,
          settleKeyboard);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── WIZARD STEP 4: settlement track selected ────────────────────────────
      if (dataStr.startsWith('w_trk_')) {
        const parts = dataStr.split('_');
        const track = parts[parts.length - 1];
        const txId  = parts.slice(2, parts.length - 1).join('_');
        await supabase.from('transactions').update({
          settle_track: track, to_settle: track === 'joint',
          split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5,
        }).eq('id', txId);
        await answerCallbackQuery(cq.id, '🎉 Entry logged!');
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // ── Sub-menu: category grid (quick picks — first 8) ─────────────────────
      if (dataStr.startsWith('s_cat_') && !dataStr.startsWith('s_cat2_')) {
        const txId = dataStr.split('s_cat_')[1];
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { quickCats, expenseCats } = await loadHouseholdSettings(txRow?.household_id || '');

        const keyboard: any[] = [];
        for (let i = 0; i < quickCats.length; i += 2) {
          keyboard.push([
            { text: quickCats[i],           callback_data: `v_cat_${txId}_${i}`     },
            { text: quickCats[i + 1] ?? '—', callback_data: `v_cat_${txId}_${i + 1}` },
          ]);
        }
        // Always offer full list access
        if (expenseCats.length > 8) {
          keyboard.push([{ text: '📂 Full list (all categories) →', callback_data: `s_cat2_${txId}_0` }]);
        }
        keyboard.push([{ text: '◀ Back', callback_data: `menu_${txId}` }]);
        await editTelegramMessageInline(chatId, messageId, '📦 <b>Quick picks — or see full list below:</b>', keyboard);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── Sub-menu: full category list with pagination ───────────────────────
      // Callback format: s_cat2_{txId}_{pageIndex}
      if (dataStr.startsWith('s_cat2_')) {
        const parts    = dataStr.split('_');
        const page     = parseInt(parts[parts.length - 1], 10);
        const txId     = parts.slice(2, parts.length - 1).join('_');
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { expenseCats } = await loadHouseholdSettings(txRow?.household_id || '');

        const PAGE_SIZE = 8;
        const pageStart = page * PAGE_SIZE;
        const pageCats  = expenseCats.slice(pageStart, pageStart + PAGE_SIZE);
        const totalPages = Math.ceil(expenseCats.length / PAGE_SIZE);

        const keyboard: any[] = [];
        for (let i = 0; i < pageCats.length; i += 2) {
          const globalIdxA = pageStart + i;
          const globalIdxB = pageStart + i + 1;
          const row: any[] = [{ text: pageCats[i], callback_data: `v_cat_${txId}_${globalIdxA}` }];
          if (pageCats[i + 1]) row.push({ text: pageCats[i + 1], callback_data: `v_cat_${txId}_${globalIdxB}` });
          keyboard.push(row);
        }
        // Prev / Next navigation
        const nav: any[] = [];
        if (page > 0)              nav.push({ text: '◀ Previous',  callback_data: `s_cat2_${txId}_${page - 1}` });
        if (page < totalPages - 1) nav.push({ text: 'Next ▶',      callback_data: `s_cat2_${txId}_${page + 1}` });
        if (nav.length > 0) keyboard.push(nav);
        keyboard.push([
          { text: '🔙 Quick picks', callback_data: `s_cat_${txId}` },
          { text: '◀ Back to menu', callback_data: `menu_${txId}`  },
        ]);

        await editTelegramMessageInline(chatId, messageId,
          `📦 <b>All categories</b> — page ${page + 1} of ${totalPages}:`,
          keyboard);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── Sub-menu: account selection ────────────────────────────────────────
      if (dataStr.startsWith('s_acc_')) {
        const txId = dataStr.split('s_acc_')[1];
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { nameA, nameB, householdMode } = await loadHouseholdSettings(txRow?.household_id || '');
        const isSolo  = householdMode === 'solo';
        const isJoint = householdMode === 'joint';

        const keyboard: any[] = [
          [{ text: `👤 ${nameA}`, callback_data: `v_acc_${txId}_PartnerA` },
           ...(!isSolo ? [{ text: `👤 ${nameB}`, callback_data: `v_acc_${txId}_PartnerB` }] : [])],
          ...(isJoint ? [[{ text: '💳 Joint Account', callback_data: `v_acc_${txId}_Joint` }]] : []),
          [{ text: '◀ Back', callback_data: `menu_${txId}` }],
        ];
        await editTelegramMessageInline(chatId, messageId, '🏧 <b>Choose the correct account:</b>', keyboard);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── Sub-menu: note editing ─────────────────────────────────────────────
      if (dataStr.startsWith('s_not_')) {
        const txId = dataStr.split('s_not_')[1];
        await sendTelegramForceReply(chatId,
          `📝 <b>Editing note for transaction:</b>\n<code>${txId}</code>\n\nReply to this message with the new note.`);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── Sub-menu: amount editing ────────────────────────────────────────────
      if (dataStr.startsWith('s_amt_')) {
        const txId = dataStr.split('s_amt_')[1];
        const { data: txRow } = await supabase.from('transactions').select('amount').eq('id', txId).single();
        await sendTelegramForceReply(chatId,
          `✏️ <b>Editing amount for transaction:</b>\n<code>${txId}</code>\n\nCurrent amount: ₹${txRow?.amount ?? '?'}\n\nReply with the corrected amount (numbers only, e.g. <code>450</code>).`);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── Sub-menu: settlement track picker ─────────────────────────────────
      if (dataStr.startsWith('s_trk_')) {
        const txId = dataStr.split('s_trk_')[1];
        const { data: strkTx } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { householdMode } = await loadHouseholdSettings(strkTx?.household_id || '');
        const keyboard: any[] = [
          [{ text: '❌ No Settlement', callback_data: `v_trk_${txId}_none` }],
          ...(householdMode === 'joint'  ? [[{ text: '🏦 Reimburse from Joint Pool', callback_data: `v_trk_${txId}_joint`   }]] : []),
          ...(householdMode !== 'solo'   ? [[{ text: '🤝 Partner Split',            callback_data: `v_trk_${txId}_partner` }]] : []),
          [{ text: '◀ Back', callback_data: `menu_${txId}` }],
        ];
        await editTelegramMessageInline(chatId, messageId, '⚖️ <b>Choose settlement track:</b>', keyboard);
        await answerCallbackQuery(cq.id);
        return NextResponse.json({ ok: true });
      }

      // ── Toggle: expense ⇄ income ───────────────────────────────────────────
      if (dataStr.startsWith('t_typ_')) {
        const txId = dataStr.split('t_typ_')[1];
        const { data: current } = await supabase.from('transactions').select('type').eq('id', txId).single();
        if (current) {
          await supabase.from('transactions').update({ type: current.type === 'expense' ? 'income' : 'expense' }).eq('id', txId);
        }
        await answerCallbackQuery(cq.id);
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // ── Value: set category ────────────────────────────────────────────────
      // Index is into the full expenseCats list (not quickCats) so pagination works
      if (dataStr.startsWith('v_cat_')) {
        const parts = dataStr.split('_');
        const idx   = parseInt(parts[parts.length - 1], 10);
        const txId  = parts.slice(2, parts.length - 1).join('_');
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { expenseCats } = await loadHouseholdSettings(txRow?.household_id || '');
        const cat = expenseCats[idx] ?? expenseCats[0] ?? 'Miscellaneous';
        await supabase.from('transactions').update({ category: cat }).eq('id', txId);
        await answerCallbackQuery(cq.id, `📦 ${cat}`);
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // ── Value: set account ─────────────────────────────────────────────────
      if (dataStr.startsWith('v_acc_')) {
        const parts = dataStr.split('_');
        const raw   = parts[parts.length - 1];
        const txId  = parts.slice(2, parts.length - 1).join('_');
        const acc   = raw === 'PartnerA' ? 'Partner A' : raw === 'PartnerB' ? 'Partner B' : 'Joint';
        await supabase.from('transactions').update({ account_used: acc }).eq('id', txId);
        await answerCallbackQuery(cq.id, `🏧 ${acc}`);
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // ── Value: set settlement track ────────────────────────────────────────
      if (dataStr.startsWith('v_trk_')) {
        const parts = dataStr.split('_');
        const track = parts[parts.length - 1];
        const txId  = parts.slice(2, parts.length - 1).join('_');
        await supabase.from('transactions').update({
          settle_track: track, to_settle: track === 'joint',
          split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5,
        }).eq('id', txId);
        await answerCallbackQuery(cq.id, settleTrackLabel(track, track === 'joint'));
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // ── Delete ─────────────────────────────────────────────────────────────
      if (dataStr.startsWith('d_')) {
        const txId = dataStr.split('d_')[1];
        await supabase.from('transactions').delete().eq('id', txId);
        await editTelegramMessageInline(chatId, messageId, '🗑️ <b>Transaction deleted.</b>', []);
        await answerCallbackQuery(cq.id, 'Deleted.');
        return NextResponse.json({ ok: true });
      }

      // ── Return to menu ─────────────────────────────────────────────────────
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
      const chatId    = payload.message.chat.id;
      const tgUser    = payload.message.from.username || '';
      const rawText   = (payload.message.text || '').trim();

      const userContext = await validateTelegramUser(tgUser);
      if (!userContext) {
        await sendTelegramMessage(chatId,
          `❌ <b>Access Denied</b>\n\n` +
          `<code>@${tgUser}</code> is not linked to any household.\n\n` +
          `Go to Settings → Telegram Bot Integration and link your handle.`);
        return NextResponse.json({ ok: true });
      }

      const { householdId, senderIdentity } = userContext;
      const { nameA, nameB, householdMode, expenseCats, quickCats } =
        await loadHouseholdSettings(householdId);

      const isJoint    = householdMode === 'joint';
      const isSolo     = householdMode === 'solo';
      const hasPartner = householdMode !== 'solo';

      // ── Note edit reply interception ───────────────────────────────────────
      if (payload.message.reply_to_message?.text?.includes('Editing note for transaction:')) {
        const txId = payload.message.reply_to_message.text.split('\n')[1]?.trim();
        if (txId) {
          await supabase.from('transactions').update({ note: rawText }).eq('id', txId);
          await sendTelegramMessage(chatId, `📝 <b>Note updated:</b> "${rawText}"`);
          return handleReturnToMenu(chatId, payload.message.message_id - 1, txId);
        }
      }

      // ── Amount edit reply interception ─────────────────────────────────────
      if (payload.message.reply_to_message?.text?.includes('Editing amount for transaction:')) {
        const txId = payload.message.reply_to_message.text.split('\n')[1]?.trim();
        if (txId) {
          const newAmount = parseFloat(rawText.replace(/[^0-9.]/g, ''));
          if (isNaN(newAmount) || newAmount <= 0) {
            await sendTelegramMessage(chatId, `❌ Invalid amount. Please send a number like <code>450</code>.`);
            return NextResponse.json({ ok: true });
          }
          await supabase.from('transactions').update({ amount: newAmount }).eq('id', txId);
          await sendTelegramMessage(chatId, `✏️ <b>Amount updated to:</b> ₹${newAmount}`);
          return handleReturnToMenu(chatId, payload.message.message_id - 1, txId);
        }
      }

      // ── /recent — show last 3 transactions ────────────────────────────────
      if (rawText === '/recent') {
        const { data: recent } = await supabase
          .from('transactions')
          .select()
          .eq('household_id', householdId)
          .order('created_at', { ascending: false })
          .limit(3);
        if (!recent || recent.length === 0) {
          await sendTelegramMessage(chatId, '📭 No transactions logged yet.');
          return NextResponse.json({ ok: true });
        }
        for (const tx of recent) {
          const accountDisplay =
            tx.account_used === 'Partner A' ? `👤 ${nameA}` :
            tx.account_used === 'Partner B' ? `👤 ${nameB}` : '💳 Joint';
          const msg =
            `💰 <b>₹${tx.amount}</b> — ${tx.category}
` +
            `🏧 ${accountDisplay} · 📅 ${tx.date}
` +
            `📝 ${tx.note || '—'}`;
          const keyboard = [[
            { text: '📦 Category', callback_data: `s_cat_${tx.id}` },
            { text: '✏️ Amount',   callback_data: `s_amt_${tx.id}` },
            { text: '🗑️ Delete',  callback_data: `d_${tx.id}`     },
          ]];
          await sendTelegramMessageInline(chatId, msg, keyboard);
        }
        return NextResponse.json({ ok: true });
      }

      // ── /summary — this month's spending summary ──────────────────────────
      if (rawText === '/summary') {
        const thisMonth = new Date().toISOString().slice(0, 7);
        const { data: txs } = await supabase
          .from('transactions')
          .select()
          .eq('household_id', householdId)
          .like('date', `${thisMonth}%`)
          .eq('type', 'expense');
        if (!txs || txs.length === 0) {
          await sendTelegramMessage(chatId, `📊 No expenses logged in ${thisMonth} yet.`);
          return NextResponse.json({ ok: true });
        }
        const total = txs.reduce((s: number, t: any) => s + Number(t.amount), 0);
        const byCat: Record<string, number> = {};
        txs.forEach((t: any) => { byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount); });
        const top3 = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const lines = top3.map(([cat, amt], i) =>
          `${['🥇','🥈','🥉'][i]} ${cat}: ₹${Math.round(amt).toLocaleString()}`
        ).join('
');
        await sendTelegramMessage(chatId,
          `📊 <b>Month summary — ${thisMonth}</b>

` +
          `💸 <b>Total spent:</b> ₹${Math.round(total).toLocaleString()}

` +
          `<b>Top categories:</b>
${lines}

` +
          `<i>${txs.length} transactions logged</i>`);
        return NextResponse.json({ ok: true });
      }

      if (rawText.startsWith('/start')) {
        await sendTelegramMessage(chatId,
          `👋 <b>Welcome to FamilyFinance Bot!</b>\n\n` +
          `<b>How to log:</b>\n` +
          `• <code>450 Zomato</code> → personal expense, no settlement\n` +
          `• <code>450 Zomato ${nameA}</code> → logged under ${nameA}'s account\n` +
          `• <code>450 Zomato to settle</code> → ${isJoint ? 'Joint pool reimburses you' : 'logged as personal'}\n` +
          `• <code>450 Zomato settle with ${nameB}</code> → ${hasPartner ? `${nameB} owes you directly` : 'logged as personal'}\n\n` +
          `Send a plain <b>number</b> (e.g. <code>500</code>) for the interactive wizard.\n\n` +
          `<b>Quick commands:</b>\n` +
          `• /recent — view & edit your last 3 transactions\n` +
          `• /summary — this month\'s spending snapshot`);
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
          to_settle: false, settled: false,
          settle_track: 'none', split_mode: 'equal',
          partner_a_share: 0.5, partner_b_share: 0.5,
        }]);

        // Wizard shows first 10 categories + "More" button if the household has more
        const wizardCats = expenseCats.slice(0, 10);
        const categoryKeyboard: any[] = [];
        for (let i = 0; i < wizardCats.length; i += 2) {
          const row: any[] = [{ text: wizardCats[i], callback_data: `w_cat_${txId}_${i}` }];
          if (wizardCats[i + 1]) row.push({ text: wizardCats[i + 1], callback_data: `w_cat_${txId}_${i + 1}` });
          categoryKeyboard.push(row);
        }
        if (expenseCats.length > 10) {
          categoryKeyboard.push([{ text: '📂 More categories →', callback_data: `s_cat2_${txId}_0` }]);
        }

        await sendTelegramMessageInline(chatId,
          `🔢 <b>Amount:</b> ₹${numericAmount}\n\n📦 <b>Select a category:</b>`,
          categoryKeyboard);
        return NextResponse.json({ ok: true });
      }

      // ── PATH 2: NATURAL LANGUAGE → AI PARSING ────────────────────────────
      // Settlement pre-parse guard
      const lowerText        = rawText.toLowerCase();
      const mentionsToSettle = lowerText.includes('to settle');
      const mentionsSettle   = lowerText.includes('settle with');

      if (isSolo && (mentionsToSettle || mentionsSettle)) {
        await sendTelegramMessage(chatId,
          `⚠️ <b>Solo mode doesn't support settlements.</b>\n\nJust send: <code>amount description</code>`);
        return NextResponse.json({ ok: true });
      }
      if (!isJoint && mentionsToSettle) {
        await sendTelegramMessage(chatId,
          `⚠️ <b>No joint pool in ${householdMode} mode.</b>\n\nUse: <code>amount description settle with ${nameB}</code> for a direct split.`);
        return NextResponse.json({ ok: true });
      }

      // Build the per-household category prompt block
      const categoryPromptBlock = buildCategoryPrompt(expenseCats);

      const systemPrompt = `You are a personal finance clerk extracting transactions from a message.
Extract EVERY transaction mentioned and return a JSON array.

SETTLEMENT RULES — apply in this exact order, stop at first match:

RULE 1 — DEFAULT (no settlement keywords):
  → settle_track = "none", account = whoever is mentioned or "${senderIdentity}"

${isJoint ? `RULE 2 — "to settle" appears anywhere:
  ${senderIdentity} paid personally; the Joint pool reimburses them.
  → settle_track = "joint", account = "${senderIdentity}"` : `RULE 2 — DISABLED: no joint pool in ${householdMode} mode.`}

${hasPartner ? `RULE 3 — "settle with ${nameA}" OR "settle with ${nameB}" appears:
  Direct partner debt.
  → settle_track = "partner", account = "${senderIdentity}"` : `RULE 3 — DISABLED: no partner in solo mode.`}

DO NOT set settle_track to "joint" or "partner" unless the exact phrase is present.
Most messages → settle_track = "none".

ACCOUNT RULES:
${isSolo
  ? `- Only valid account: "${senderIdentity}" (solo mode — no partner, no joint)`
  : !isJoint
  ? `- "Partner A" if text mentions ${nameA}\n- "Partner B" if text mentions ${nameB}\n- No "Joint" option (${householdMode} mode)\n- Default: "${senderIdentity}"`
  : `- "Partner A" if text mentions ${nameA}\n- "Partner B" if text mentions ${nameB}\n- "Joint" if text says "joint" or "joint account"\n- Default: "${senderIdentity}"`}

SESSION:
- Person sending this: ${senderIdentity}
- "added_by" is always exactly "${senderIdentity}"

TYPE: "income" if text contains salary/bonus/credited/refund/interest. Otherwise "expense".

NOTE: Only the merchant name or item. Strip partner names, settlement phrases, amounts.

THIS HOUSEHOLD'S CATEGORIES (use ONLY these, pick the best match):
${categoryPromptBlock}

If nothing matches well, use "Miscellaneous".`;

      const transactionSchema = {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            amount:       { type: 'NUMBER',  description: 'Transaction amount' },
            category:     { type: 'STRING',  description: 'One of the household categories listed above' },
            note:         { type: 'STRING',  description: 'Merchant or item name only' },
            type:         { type: 'STRING',  description: 'Exactly "expense" or "income"' },
            account:      { type: 'STRING',  description: 'Exactly "Partner A", "Partner B", or "Joint"' },
            settle_track: { type: 'STRING',  description: 'Exactly "none", "joint", or "partner" — default "none"' },
          },
          required: ['amount', 'category', 'note', 'type', 'account', 'settle_track'],
        },
      };

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Input: "${rawText}"` }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: transactionSchema },
          }),
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

      // Validate category — must be one the household actually has
      const validCatSet = new Set(expenseCats);

      for (const tx of parsed) {
        if (!tx.amount || Number(tx.amount) <= 0) continue;

        const track: string = ['none', 'joint', 'partner'].includes(tx.settle_track) ? tx.settle_track : 'none';
        // Miscellaneous is now a protected category — always present in every household.
        // Safe to use as a guaranteed fallback when AI returns an unrecognised category.
        const category = validCatSet.has(tx.category) ? tx.category : 'Miscellaneous';
        const txId = crypto.randomUUID();

        const row = {
          id: txId, household_id: householdId,
          date: new Date().toISOString().slice(0, 10),
          amount: Number(tx.amount),
          category,
          type: tx.type || 'expense',
          account_used: tx.account || senderIdentity,
          added_by: senderIdentity,
          note: tx.note || 'AI log',
          settle_track: track,
          to_settle: track === 'joint',
          split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5,
          settled: false, settled_with: null,
        };

        const { data: dbRows } = await supabase.from('transactions').insert([row]).select();
        const saved   = dbRows?.[0] || row;
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
            { text: '📝 Note',     callback_data: `s_not_${activeId}` },
          ],
          [
            { text: '✏️ Amount',                                              callback_data: `s_amt_${activeId}` },
            { text: '⚖️ Settlement',                                          callback_data: `s_trk_${activeId}` },
            { text: saved.type === 'expense' ? '🛑 Expense' : '💸 Income',    callback_data: `t_typ_${activeId}` },
          ],
          [
            { text: '🗑️ Delete',                                              callback_data: `d_${activeId}`     },
          ],
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
      const p   = JSON.parse(raw);
      const chatId = p?.message?.chat?.id || p?.callback_query?.message?.chat?.id;
      if (chatId) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `❌ <b>Error:</b> <code>${err?.message || 'Unknown'}</code>`, parse_mode: 'HTML' }),
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
  const { nameA, nameB } = await loadHouseholdSettings(tx.household_id || '');

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
      { text: '📝 Note',     callback_data: `s_not_${txId}` },
    ],
    [
      { text: '✏️ Amount',                                         callback_data: `s_amt_${txId}` },
      { text: '⚖️ Settlement',                                     callback_data: `s_trk_${txId}` },
      { text: tx.type === 'expense' ? '🛑 Expense' : '💸 Income',  callback_data: `t_typ_${txId}` },
    ],
    [
      { text: '🗑️ Delete',                                         callback_data: `d_${txId}`     },
    ],
  ];

  await editTelegramMessageInline(chatId, messageId, banner, keyboard);
  return NextResponse.json({ ok: true });
}

// ─── Telegram API helpers ─────────────────────────────────────────────────────
async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function sendTelegramMessageInline(chatId: number, text: string, keyboard: any[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }),
  });
}

async function editTelegramMessageInline(chatId: number, messageId: number, text: string, keyboard: any[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }),
  });
}

async function sendTelegramForceReply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { force_reply: true, selective: true } }),
  });
}

async function answerCallbackQuery(callbackQueryId: string, alertText?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: alertText || '', show_alert: false }),
  });
}
