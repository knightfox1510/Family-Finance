import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { canUseAI, incrementUsage, getUsageSummary, FREE_MONTHLY_LIMIT } from '@/lib/planUtils';
import {
  supabaseBot as supabase,
  CATEGORY_DESCRIPTIONS,
  loadHouseholdSettings,
  buildCategoryPrompt,
  settleTrackLabel,
  parseWithGemini,
  saveTransaction,
  formatTxSummary,
  validateByTelegram,
} from '@/lib/botUtils';

export const maxDuration = 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────
// validateByTelegram imported from botUtils

// ─── Telegram API wrappers ────────────────────────────────────────────────────
const tgPost = async (method: string, body: object) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
};
const sendMsg        = (chatId: number, text: string) => tgPost('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
const sendMsgInline  = (chatId: number, text: string, keyboard: any[]) => tgPost('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
const editMsgInline  = (chatId: number, mid: number, text: string, keyboard: any[]) => tgPost('editMessageText', { chat_id: chatId, message_id: mid, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
const sendForceReply = (chatId: number, text: string) => tgPost('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { force_reply: true, selective: true } });
const answerCQ       = (id: string, text?: string) => tgPost('answerCallbackQuery', { callback_query_id: id, text: text || '', show_alert: false });

// ─── Standard keyboard ────────────────────────────────────────────────────────
const txKeyboard = (txId: string, type: string) => [
  [{ text: 'Category', callback_data: `s_cat_${txId}` }, { text: 'Account', callback_data: `s_acc_${txId}` }, { text: 'Note', callback_data: `s_not_${txId}` }],
  [{ text: 'Edit Amount', callback_data: `s_amt_${txId}` }, { text: 'Settlement', callback_data: `s_trk_${txId}` }, { text: type === 'expense' ? 'Expense' : 'Income', callback_data: `t_typ_${txId}` }],
  [{ text: 'Delete', callback_data: `d_${txId}` }],
];

// ─── Return to menu ───────────────────────────────────────────────────────────
async function handleReturnToMenu(chatId: number, messageId: number, txId: string) {
  const { data: rows } = await supabase.from('transactions').select().eq('id', txId);
  if (!rows?.[0]) return NextResponse.json({ ok: true });
  const tx = rows[0];
  const { nameA, nameB } = await loadHouseholdSettings(tx.household_id || '');
  const acct = tx.account_used === 'Partner A' ? nameA : tx.account_used === 'Partner B' ? nameB : 'Joint';
  const banner =
    '<b>Transaction Recorded!</b>\n\n' +
    'Amount: ' + tx.amount + '\n' +
    'Category: ' + tx.category + '\n' +
    'Account: ' + acct + '\n' +
    'Settlement: ' + settleLabel(tx.settle_track || 'none', tx.to_settle) + '\n' +
    'Type: ' + (tx.type === 'expense' ? 'Expense' : 'Income') + '\n' +
    'Note: ' + (tx.note || '--');
  await editMsgInline(chatId, messageId, banner, txKeyboard(txId, tx.type));
  return NextResponse.json({ ok: true });
}

// ─── Main POST handler ────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // ── CALLBACK QUERIES ────────────────────────────────────────────────────
    if (payload.callback_query) {
      const cq = payload.callback_query;
      const chatId = cq.message.chat.id;
      const mid    = cq.message.message_id;
      const data   = cq.data || '';
      const ctx    = await validateByTelegram(cq.from.username || '');
      if (!ctx) { await answerCQ(cq.id, 'Unauthorized. Link your Telegram handle in Settings first.'); return NextResponse.json({ ok: true }); }

      // Wizard: category
      if (data.startsWith('w_cat_')) {
        const parts = data.split('_'), idx = parseInt(parts[parts.length - 1], 10), txId = parts.slice(2, -1).join('_');
        const { data: tx } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { nameA, nameB, householdMode, expenseCats } = await loadHouseholdSettings(tx?.household_id || '');
        const chosen = expenseCats[idx] ?? 'Miscellaneous';
        await supabase.from('transactions').update({ category: chosen }).eq('id', txId);
        const isSolo = householdMode === 'solo', isJoint = householdMode === 'joint';
        const kb: any[] = [[{ text: nameA, callback_data: `w_acc_${txId}_PartnerA` }, ...(!isSolo ? [{ text: nameB, callback_data: `w_acc_${txId}_PartnerB` }] : [])]];
        if (isJoint) kb.push([{ text: 'Joint Account', callback_data: `w_acc_${txId}_Joint` }]);
        await editMsgInline(chatId, mid, 'Category: ' + chosen + '\n\nWhich account paid?', kb);
        await answerCQ(cq.id);
        return NextResponse.json({ ok: true });
      }

      // Wizard: account
      if (data.startsWith('w_acc_')) {
        const parts = data.split('_'), raw = parts[parts.length - 1], txId = parts.slice(2, -1).join('_');
        const acct = raw === 'PartnerA' ? 'Partner A' : raw === 'PartnerB' ? 'Partner B' : 'Joint';
        await supabase.from('transactions').update({ account_used: acct, settle_track: 'none', to_settle: false }).eq('id', txId);
        if (acct === 'Joint') { await answerCQ(cq.id, 'Logged to Joint!'); return handleReturnToMenu(chatId, mid, txId); }
        const { data: tx2 } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { householdMode } = await loadHouseholdSettings(tx2?.household_id || '');
        const kb: any[] = [[{ text: 'No Settlement', callback_data: `w_trk_${txId}_none` }]];
        if (householdMode === 'joint') kb.push([{ text: 'Reimburse from Joint Pool', callback_data: `w_trk_${txId}_joint` }]);
        if (householdMode !== 'solo')  kb.push([{ text: 'Partner Split', callback_data: `w_trk_${txId}_partner` }]);
        await editMsgInline(chatId, mid, 'Account: ' + acct + '\n\nSettlement track:', kb);
        await answerCQ(cq.id);
        return NextResponse.json({ ok: true });
      }

      // Wizard: settlement
      if (data.startsWith('w_trk_')) {
        const parts = data.split('_'), track = parts[parts.length - 1], txId = parts.slice(2, -1).join('_');
        await supabase.from('transactions').update({ settle_track: track, to_settle: track === 'joint', split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5 }).eq('id', txId);
        await answerCQ(cq.id, 'Entry logged!');
        return handleReturnToMenu(chatId, mid, txId);
      }

      // Sub-menu: quick categories
      if (data.startsWith('s_cat_') && !data.startsWith('s_cat2_')) {
        const txId = data.split('s_cat_')[1];
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { quickCats, expenseCats } = await loadHouseholdSettings(txRow?.household_id || '');
        const kb: any[] = [];
        for (let i = 0; i < quickCats.length; i += 2) {
          kb.push([{ text: quickCats[i], callback_data: `v_cat_${txId}_${i}` }, { text: quickCats[i+1] ?? '--', callback_data: `v_cat_${txId}_${i+1}` }]);
        }
        if (expenseCats.length > 8) kb.push([{ text: 'Full list (all categories) ->', callback_data: `s_cat2_${txId}_0` }]);
        kb.push([{ text: 'Back', callback_data: `menu_${txId}` }]);
        await editMsgInline(chatId, mid, 'Quick picks:', kb);
        await answerCQ(cq.id);
        return NextResponse.json({ ok: true });
      }

      // Sub-menu: paginated full category list
      if (data.startsWith('s_cat2_')) {
        const parts = data.split('_'), page = parseInt(parts[parts.length - 1], 10), txId = parts.slice(2, -1).join('_');
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { expenseCats } = await loadHouseholdSettings(txRow?.household_id || '');
        const PAGE = 8, start = page * PAGE, pageCats = expenseCats.slice(start, start + PAGE), total = Math.ceil(expenseCats.length / PAGE);
        const kb: any[] = [];
        for (let i = 0; i < pageCats.length; i += 2) {
          const gA = start + i, gB = start + i + 1;
          const row: any[] = [{ text: pageCats[i], callback_data: `v_cat_${txId}_${gA}` }];
          if (pageCats[i+1]) row.push({ text: pageCats[i+1], callback_data: `v_cat_${txId}_${gB}` });
          kb.push(row);
        }
        const nav: any[] = [];
        if (page > 0)          nav.push({ text: 'Prev', callback_data: `s_cat2_${txId}_${page-1}` });
        if (page < total - 1)  nav.push({ text: 'Next', callback_data: `s_cat2_${txId}_${page+1}` });
        if (nav.length) kb.push(nav);
        kb.push([{ text: 'Quick picks', callback_data: `s_cat_${txId}` }, { text: 'Back to menu', callback_data: `menu_${txId}` }]);
        await editMsgInline(chatId, mid, 'All categories -- page ' + (page+1) + ' of ' + total + ':', kb);
        await answerCQ(cq.id);
        return NextResponse.json({ ok: true });
      }

      // Sub-menu: account
      if (data.startsWith('s_acc_')) {
        const txId = data.split('s_acc_')[1];
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { nameA, nameB, householdMode } = await loadHouseholdSettings(txRow?.household_id || '');
        const isSolo = householdMode === 'solo', isJoint = householdMode === 'joint';
        const kb: any[] = [
          [{ text: nameA, callback_data: `v_acc_${txId}_PartnerA` }, ...(!isSolo ? [{ text: nameB, callback_data: `v_acc_${txId}_PartnerB` }] : [])],
          ...(isJoint ? [[{ text: 'Joint Account', callback_data: `v_acc_${txId}_Joint` }]] : []),
          [{ text: 'Back', callback_data: `menu_${txId}` }],
        ];
        await editMsgInline(chatId, mid, 'Choose account:', kb);
        await answerCQ(cq.id);
        return NextResponse.json({ ok: true });
      }

      // Sub-menu: note
      if (data.startsWith('s_not_')) {
        const txId = data.split('s_not_')[1];
        await sendForceReply(chatId, 'Edit note:\n<code>' + txId + '</code>\n\nReply with the new note.');
        await answerCQ(cq.id);
        return NextResponse.json({ ok: true });
      }

      // Sub-menu: amount
      if (data.startsWith('s_amt_')) {
        const txId = data.split('s_amt_')[1];
        const { data: txRow } = await supabase.from('transactions').select('amount').eq('id', txId).single();
        await sendForceReply(chatId, 'Edit amount:\n<code>' + txId + '</code>\n\nCurrent: ' + (txRow?.amount ?? '?') + '\n\nReply with corrected amount (e.g. <code>450</code>).');
        await answerCQ(cq.id);
        return NextResponse.json({ ok: true });
      }

      // Sub-menu: settlement track
      if (data.startsWith('s_trk_')) {
        const txId = data.split('s_trk_')[1];
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { householdMode } = await loadHouseholdSettings(txRow?.household_id || '');
        const kb: any[] = [
          [{ text: 'No Settlement', callback_data: `v_trk_${txId}_none` }],
          ...(householdMode === 'joint' ? [[{ text: 'Reimburse from Joint Pool', callback_data: `v_trk_${txId}_joint` }]] : []),
          ...(householdMode !== 'solo'  ? [[{ text: 'Partner Split',             callback_data: `v_trk_${txId}_partner` }]] : []),
          [{ text: 'Back', callback_data: `menu_${txId}` }],
        ];
        await editMsgInline(chatId, mid, 'Choose settlement track:', kb);
        await answerCQ(cq.id);
        return NextResponse.json({ ok: true });
      }

      // Toggle type
      if (data.startsWith('t_typ_')) {
        const txId = data.split('t_typ_')[1];
        const { data: cur } = await supabase.from('transactions').select('type').eq('id', txId).single();
        if (cur) await supabase.from('transactions').update({ type: cur.type === 'expense' ? 'income' : 'expense' }).eq('id', txId);
        await answerCQ(cq.id);
        return handleReturnToMenu(chatId, mid, txId);
      }

      // Set category (index into expenseCats full list)
      if (data.startsWith('v_cat_')) {
        const parts = data.split('_'), idx = parseInt(parts[parts.length - 1], 10), txId = parts.slice(2, -1).join('_');
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { expenseCats } = await loadHouseholdSettings(txRow?.household_id || '');
        const cat = expenseCats[idx] ?? 'Miscellaneous';
        await supabase.from('transactions').update({ category: cat }).eq('id', txId);
        await answerCQ(cq.id, cat);
        return handleReturnToMenu(chatId, mid, txId);
      }

      // Set account
      if (data.startsWith('v_acc_')) {
        const parts = data.split('_'), raw = parts[parts.length - 1], txId = parts.slice(2, -1).join('_');
        const acc = raw === 'PartnerA' ? 'Partner A' : raw === 'PartnerB' ? 'Partner B' : 'Joint';
        await supabase.from('transactions').update({ account_used: acc }).eq('id', txId);
        await answerCQ(cq.id, acc);
        return handleReturnToMenu(chatId, mid, txId);
      }

      // Set settlement track
      if (data.startsWith('v_trk_')) {
        const parts = data.split('_'), track = parts[parts.length - 1], txId = parts.slice(2, -1).join('_');
        await supabase.from('transactions').update({ settle_track: track, to_settle: track === 'joint', split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5 }).eq('id', txId);
        await answerCQ(cq.id, settleLabel(track, track === 'joint'));
        return handleReturnToMenu(chatId, mid, txId);
      }

      // Delete
      if (data.startsWith('d_')) {
        await supabase.from('transactions').delete().eq('id', data.split('d_')[1]);
        await editMsgInline(chatId, mid, 'Transaction deleted.', []);
        await answerCQ(cq.id, 'Deleted.');
        return NextResponse.json({ ok: true });
      }

      // Return to menu
      if (data.startsWith('menu_')) return handleReturnToMenu(chatId, mid, data.split('menu_')[1]);

      return NextResponse.json({ ok: true });
    }

    // ── TEXT MESSAGES ───────────────────────────────────────────────────────
    if (payload.message) {
      const chatId  = payload.message.chat.id;
      const rawText = (payload.message.text || '').trim();
      const ctx     = await validateByTelegram(payload.message.from.username || '');

      if (!ctx) {
        await sendMsg(chatId, 'Access Denied. Go to Settings to link your Telegram handle.');
        return NextResponse.json({ ok: true });
      }

      const { householdId, senderIdentity } = ctx;
      const { nameA, nameB, householdMode, expenseCats, quickCats } = await loadHouseholdSettings(householdId);
      const isJoint = householdMode === 'joint', isSolo = householdMode === 'solo', hasPartner = !isSolo;
      const validCatSet = new Set(expenseCats);

      // Note edit reply
      if (payload.message.reply_to_message?.text?.includes('Edit note:')) {
        const txId = payload.message.reply_to_message.text.split('\n')[1]?.trim();
        if (txId) {
          await supabase.from('transactions').update({ note: rawText }).eq('id', txId);
          await sendMsg(chatId, 'Note updated: "' + rawText + '"');
          return handleReturnToMenu(chatId, payload.message.message_id - 1, txId);
        }
      }

      // Amount edit reply
      if (payload.message.reply_to_message?.text?.includes('Edit amount:')) {
        const txId = payload.message.reply_to_message.text.split('\n')[1]?.trim();
        if (txId) {
          const newAmt = parseFloat(rawText.replace(/[^0-9.]/g, ''));
          if (isNaN(newAmt) || newAmt <= 0) { await sendMsg(chatId, 'Invalid amount. Send a number like <code>450</code>.'); return NextResponse.json({ ok: true }); }
          await supabase.from('transactions').update({ amount: newAmt }).eq('id', txId);
          await sendMsg(chatId, 'Amount updated to: ' + newAmt);
          return handleReturnToMenu(chatId, payload.message.message_id - 1, txId);
        }
      }

      // /recent
      if (rawText === '/recent') {
        const { data: recent } = await supabase.from('transactions').select().eq('household_id', householdId).order('created_at', { ascending: false }).limit(3);
        if (!recent?.length) { await sendMsg(chatId, 'No transactions logged yet.'); return NextResponse.json({ ok: true }); }
        for (const tx of recent) {
          const acct = tx.account_used === 'Partner A' ? nameA : tx.account_used === 'Partner B' ? nameB : 'Joint';
          await sendMsgInline(chatId,
            tx.amount + ' -- ' + tx.category + '\n' + acct + ' | ' + tx.date + '\n' + (tx.note || '--'),
            txKeyboard(tx.id, tx.type));
        }
        return NextResponse.json({ ok: true });
      }

      // /summary
      if (rawText === '/summary') {
        const thisMonth = new Date().toISOString().slice(0, 7);
        const { data: txs } = await supabase.from('transactions').select().eq('household_id', householdId).like('date', thisMonth + '%').eq('type', 'expense');
        if (!txs?.length) { await sendMsg(chatId, 'No expenses in ' + thisMonth + ' yet.'); return NextResponse.json({ ok: true }); }
        const total = txs.reduce((s: number, t: any) => s + Number(t.amount), 0);
        const byCat: Record<string, number> = {};
        txs.forEach((t: any) => { byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount); });
        const top3  = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const lines = top3.map(([cat, amt], i) => (i === 0 ? '1. ' : i === 1 ? '2. ' : '3. ') + cat + ': ' + Math.round(amt as number).toLocaleString()).join('\n');
        await sendMsg(chatId,
          '<b>Month summary -- ' + thisMonth + '</b>\n\n' +
          'Total spent: ' + Math.round(total).toLocaleString() + '\n\n' +
          'Top categories:\n' + lines + '\n\n' +
          txs.length + ' transactions logged');
        return NextResponse.json({ ok: true });
      }

      // /start
      if (rawText.startsWith('/start')) {
        await sendMsg(chatId,
          '<b>Welcome to ChillarFlow!</b>\n\n' +
          'How to log:\n' +
          '- 450 Zomato -> personal expense\n' +
          '- 450 Zomato ' + nameA + ' -> ' + nameA + "'s account\n" +
          '- 450 Zomato to settle -> ' + (isJoint ? 'Joint pool reimburses you' : 'logged as personal') + '\n' +
          (hasPartner ? '- 450 Zomato settle with ' + nameB + ' -> ' + nameB + ' owes you\n' : '') +
          '\nSend a plain number (e.g. 500) for the interactive wizard.\n\n' +
          'Commands:\n' +
          '- /recent -- view & edit last 3 transactions\n' +
          '- /summary -- this month spending snapshot\n' +
          '- /usage -- check your AI parse usage\n' +
          '- /upgrade -- upgrade to Pro plan');
        return NextResponse.json({ ok: true });
      }

      // /usage command
      if (rawText === '/usage') {
        const { plan, count, remaining, month } = await getUsageSummary(householdId);
        if (plan === 'pro') {
          await sendMsg(chatId,
            '<b>Your Plan: PRO</b>\n\nUnlimited AI expense logging. Thank you for supporting ChillarFlow!');
        } else {
          const bar = Array.from({ length: 10 }, (_, i) => i < Math.round((count / FREE_MONTHLY_LIMIT) * 10) ? '\u25a0' : '\u25a1').join('');
          const usageMsg = '<b>Your Plan: Free</b>\n\n' +
            'AI parses this month (' + month + '):\n' +
            bar + ' ' + count + ' / ' + FREE_MONTHLY_LIMIT + '\n\n' +
            (remaining > 0
              ? remaining + ' AI parses remaining this month.\n\nSend /upgrade to unlock unlimited.'
              : 'Limit reached! Send /upgrade for unlimited access, or use the number wizard (send just a number) which is always free.');
          await sendMsg(chatId, usageMsg);
        }
        return NextResponse.json({ ok: true });
      }

      // /upgrade command
      if (rawText === '/upgrade') {
        const upgradeMsg =
          '<b>Upgrade to ChillarFlow Pro</b>\n\n' +
          'Free plan: ' + FREE_MONTHLY_LIMIT + ' AI expense parses per month\n' +
          'Pro plan: Unlimited AI parses\n\n' +
          '<b>How to upgrade:</b>\n' +
          '1. Contact us to arrange payment\n' +
          '2. Once confirmed, your account is upgraded instantly\n' +
          '3. The interactive number wizard is always free regardless of plan\n\n' +
          'Reply to this message or reach us via the app Settings to get started.';
        await sendMsg(chatId, upgradeMsg);
        return NextResponse.json({ ok: true });
      }

      // Numeric wizard
      const numericAmount = Number(rawText);
      if (!isNaN(numericAmount) && numericAmount > 0) {
        const txId = crypto.randomUUID();
        await supabase.from('transactions').insert([{
          id: txId, household_id: householdId,
          date: new Date().toISOString().slice(0, 10),
          amount: numericAmount, category: 'Miscellaneous', type: 'expense',
          account_used: senderIdentity, added_by: senderIdentity,
          note: 'Quick Wizard Log', to_settle: false, settled: false,
          settle_track: 'none', split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5,
        }]);
        const wizCats = expenseCats.slice(0, 10);
        const kb: any[] = [];
        for (let i = 0; i < wizCats.length; i += 2) {
          const row: any[] = [{ text: wizCats[i], callback_data: `w_cat_${txId}_${i}` }];
          if (wizCats[i+1]) row.push({ text: wizCats[i+1], callback_data: `w_cat_${txId}_${i+1}` });
          kb.push(row);
        }
        if (expenseCats.length > 10) kb.push([{ text: 'More categories ->', callback_data: `s_cat2_${txId}_1` }]);
        await sendMsgInline(chatId, 'Amount: ' + numericAmount + '\n\nSelect a category:', kb);
        return NextResponse.json({ ok: true });
      }

      // Natural language AI parsing — gated by plan/usage
      const { allowed, plan: usagePlan, count: usageCount, remaining } = await canUseAI(householdId);
      if (!allowed) {
        const bar = Array.from({ length: 10 }, () => '■').join('');
        const limitMsg =
          '<b>Free plan limit reached (' + FREE_MONTHLY_LIMIT + ' AI parses/month)</b>\n\n' +
          bar + ' ' + usageCount + ' / ' + FREE_MONTHLY_LIMIT + '\n\n' +
          'The interactive wizard (send just a number) is always free.\n\n' +
          'Send /upgrade to unlock unlimited AI logging.';
        await sendMsg(chatId, limitMsg);
        return NextResponse.json({ ok: true });
      }

      const lower = rawText.toLowerCase();
      if (isSolo && (lower.includes('to settle') || lower.includes('settle with'))) {
        await sendMsg(chatId, 'Solo mode does not support settlements. Just send: amount description');
        return NextResponse.json({ ok: true });
      }
      if (!isJoint && lower.includes('to settle')) {
        await sendMsg(chatId, 'No joint pool in ' + householdMode + ' mode. Use: amount description settle with ' + nameB);
        return NextResponse.json({ ok: true });
      }

      const systemPrompt =
        'You are a personal finance clerk extracting transactions from a message.\n' +
        'Extract EVERY transaction mentioned and return a JSON array.\n\n' +
        'SETTLEMENT RULES:\n' +
        'RULE 1 - DEFAULT: settle_track = "none", account = whoever mentioned or "' + senderIdentity + '"\n' +
        (isJoint ? 'RULE 2 - "to settle" appears: settle_track = "joint", account = "' + senderIdentity + '"\n' : 'RULE 2 - DISABLED (no joint pool)\n') +
        (hasPartner ? 'RULE 3 - "settle with ' + nameA + '" or "settle with ' + nameB + '": settle_track = "partner", account = "' + senderIdentity + '"\n' : 'RULE 3 - DISABLED (solo mode)\n') +
        'DO NOT set settle_track to "joint" or "partner" unless the exact phrase is present.\n\n' +
        'ACCOUNTS: ' + (isSolo ? '"' + senderIdentity + '" only' : '"Partner A" = ' + nameA + ', "Partner B" = ' + nameB + (isJoint ? ', "Joint" = joint account' : '') + '. Default: "' + senderIdentity + '"') + '\n' +
        'added_by is always "' + senderIdentity + '".\n' +
        'TYPE: "income" for salary/bonus/refund/interest, else "expense".\n' +
        'NOTE: merchant or item only. Strip names, settlement phrases, amounts.\n\n' +
        'THIS HOUSEHOLD\'S CATEGORIES (use ONLY these):\n' + buildCategoryPrompt(expenseCats) + '\n\nIf no category fits, use "Miscellaneous".';

      const schema = {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            amount:       { type: 'NUMBER', description: 'Transaction amount' },
            category:     { type: 'STRING', description: 'One of the household categories' },
            note:         { type: 'STRING', description: 'Merchant or item name only' },
            type:         { type: 'STRING', description: '"expense" or "income"' },
            account:      { type: 'STRING', description: '"Partner A", "Partner B", or "Joint"' },
            settle_track: { type: 'STRING', description: '"none", "joint", or "partner"' },
          },
          required: ['amount', 'category', 'note', 'type', 'account', 'settle_track'],
        },
      };

      const gemRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\nUser Input: "' + rawText + '"' }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } }) }
      );
      const gemData = await gemRes.json();
      let rawJson = (gemData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
      if (!rawJson) { await sendMsg(chatId, 'Could not parse that message. Try shorter, clearer text.'); return NextResponse.json({ ok: true }); }
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed)) throw new Error('Gemini did not return an array.');

      // Increment usage counter after a successful AI parse
      await incrementUsage(householdId);

      for (const tx of parsed) {
        if (!tx.amount || Number(tx.amount) <= 0) continue;
        const track    = ['none','joint','partner'].includes(tx.settle_track) ? tx.settle_track : 'none';
        const category = validCatSet.has(tx.category) ? tx.category : 'Miscellaneous';
        const txId     = crypto.randomUUID();
        const row      = {
          id: txId, household_id: householdId,
          date: new Date().toISOString().slice(0, 10),
          amount: Number(tx.amount), category, type: tx.type || 'expense',
          account_used: tx.account || senderIdentity, added_by: senderIdentity,
          note: tx.note || 'AI log', settle_track: track, to_settle: track === 'joint',
          split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5, settled: false, settled_with: null,
        };
        const { data: dbRows } = await supabase.from('transactions').insert([row]).select();
        const saved = dbRows?.[0] || row;
        const acct  = saved.account_used === 'Partner A' ? nameA : saved.account_used === 'Partner B' ? nameB : 'Joint';
        const msg   =
          '<b>Transaction Logged!</b>\n\n' +
          'Amount: ' + saved.amount + '\n' +
          'Category: ' + saved.category + '\n' +
          'Account: ' + acct + '\n' +
          'Settlement: ' + settleLabel(saved.settle_track, saved.to_settle) + '\n' +
          'Type: ' + (saved.type === 'expense' ? 'Expense' : 'Income') + '\n' +
          'Note: ' + saved.note;
        await sendMsgInline(chatId, msg, txKeyboard(saved.id, saved.type));
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error('Webhook error:', err);
    try {
      const p = JSON.parse(await request.clone().text());
      const chatId = p?.message?.chat?.id || p?.callback_query?.message?.chat?.id;
      if (chatId) await tgPost('sendMessage', { chat_id: chatId, text: 'Error: ' + (err?.message || 'Unknown'), parse_mode: 'HTML' });
    } catch { /* ignore */ }
    return NextResponse.json({ ok: true });
  }
}
