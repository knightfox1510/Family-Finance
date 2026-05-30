// ─── app/api/webhook/telegram/route.ts ───────────────────────────────────────
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { canUseAI, incrementUsage, FREE_MONTHLY_LIMIT } from '@/lib/planUtils';
import {
  supabaseBot as supabase,
  loadHouseholdSettings,
  settleTrackLabel,
  validateByTelegram,
} from '@/lib/botUtils';

export const maxDuration = 60;

const tgPost = async (method: string, body: object) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
};

const sendMsg = (chatId: number, text: string) => tgPost('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
const sendMsgInline = (chatId: number, text: string, keyboard: any[]) => tgPost('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
const editMsgInline = (chatId: number, mid: number, text: string, keyboard: any[]) => tgPost('editMessageText', { chat_id: chatId, message_id: mid, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
const answerCQ = (id: string, text?: string) => tgPost('answerCallbackQuery', { callback_query_id: id, text: text || '', show_alert: false });

const txKeyboard = (txId: string, type: string) => [
  [{ text: 'Category', callback_data: `s_cat_${txId}` }, { text: 'Account', callback_data: `s_acc_${txId}` }],
  [{ text: 'Settlement', callback_data: `s_trk_${txId}` }, { text: type === 'expense' ? 'Toggle to Income' : 'Toggle to Expense', callback_data: `t_typ_${txId}` }],
  [{ text: '🗑️ Delete', callback_data: `d_${txId}` }],
];

async function handleReturnToMenu(chatId: number, messageId: number, txId: string) {
  const { data: rows } = await supabase.from('transactions').select().eq('id', txId);
  if (!rows?.[0]) return NextResponse.json({ ok: true });
  const tx = rows[0];
  const { nameA, nameB } = await loadHouseholdSettings(tx.household_id || '');
  const acct = tx.account_used === 'Partner A' ? nameA : tx.account_used === 'Partner B' ? nameB : 'Joint';
  
  const banner = `<b>Transaction Confirmed!</b>\n\n<b>Amount:</b> Rs.${tx.amount}\n<b>Category:</b> ${tx.category}\n<b>Account:</b> ${acct}\n<b>Settlement:</b> ${settleTrackLabel(tx.settle_track || 'none', tx.to_settle)}\n<b>Note:</b> ${tx.note || '--'}`;
  await editMsgInline(chatId, messageId, banner, txKeyboard(txId, tx.type));
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const tgSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (process.env.TELEGRAM_WEBHOOK_SECRET && tgSecret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Unauthorized Webhook Origin', { status: 401 });
  }

  try {
    const payload = await request.json();

    if (payload.callback_query) {
      const cq = payload.callback_query;
      const chatId = cq.message.chat.id;
      const mid    = cq.message.message_id;
      const data   = cq.data || '';
      const ctx    = await validateByTelegram(cq.from.username || '');
      if (!ctx) { await answerCQ(cq.id, 'Unauthorized handler.'); return NextResponse.json({ ok: true }); }

      if (data.startsWith('w_cat_')) {
        const parts = data.split('_'), idx = parseInt(parts[parts.length - 1], 10), txId = parts.slice(2, -1).join('_');
        const { data: tx } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { nameA, nameB, householdMode, expenseCats } = await loadHouseholdSettings(tx?.household_id || '');
        const chosen = expenseCats[idx] ?? 'Miscellaneous';
        await supabase.from('transactions').update({ category: chosen }).eq('id', txId);
        
        const isSolo = householdMode === 'solo', isJoint = householdMode === 'joint';
        const kb: any[] = [[{ text: nameA, callback_data: `w_acc_${txId}_PartnerA` }, ...(!isSolo ? [{ text: nameB, callback_data: `w_acc_${txId}_PartnerB` }] : [])]];
        if (isJoint) kb.push([{ text: 'Joint Account', callback_data: `w_acc_${txId}_Joint` }]);
        
        await editMsgInline(chatId, mid, `Category chosen: <b>${chosen}</b>\n\nWhich account paid?`, kb);
        await answerCQ(cq.id);
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith('w_acc_')) {
        const parts = data.split('_'), raw = parts[parts.length - 1], txId = parts.slice(2, -1).join('_');
        const acct = raw === 'PartnerA' ? 'Partner A' : raw === 'PartnerB' ? 'Partner B' : 'Joint';
        await supabase.from('transactions').update({ account_used: acct, settle_track: 'none', to_settle: false }).eq('id', txId);
        
        if (acct === 'Joint') { await answerCQ(cq.id, 'Logged!'); return handleReturnToMenu(chatId, mid, txId); }
        const { data: tx2 } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { householdMode } = await loadHouseholdSettings(tx2?.household_id || '');
        
        const kb: any[] = [[{ text: 'No Settlement', callback_data: `w_trk_${txId}_none` }]];
        if (householdMode === 'joint') kb.push([{ text: 'Pool Reimburse', callback_data: `w_trk_${txId}_joint` }]);
        if (householdMode !== 'solo')  kb.push([{ text: 'Split 50-50', callback_data: `w_trk_${txId}_partner` }]);
        
        await editMsgInline(chatId, mid, `Account recorded: <b>${acct}</b>\n\nSelect settlement parameters:`, kb);
        await answerCQ(cq.id);
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith('w_trk_')) {
        const parts = data.split('_'), track = parts[parts.length - 1], txId = parts.slice(2, -1).join('_');
        await supabase.from('transactions').update({ settle_track: track, to_settle: track === 'joint', split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5 }).eq('id', txId);
        await answerCQ(cq.id, 'Logged!');
        return handleReturnToMenu(chatId, mid, txId);
      }

      if (data.startsWith('s_cat_') && !data.startsWith('s_cat2_')) {
        const txId = data.split('s_cat_')[1];
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { expenseCats } = await loadHouseholdSettings(txRow?.household_id || '');
        const kb: any[] = [];
        for (let i = 0; i < Math.min(expenseCats.length, 8); i += 2) {
          kb.push([{ text: expenseCats[i], callback_data: `v_cat_${txId}_${i}` }, { text: expenseCats[i+1] ?? '--', callback_data: `v_cat_${txId}_${i+1}` }]);
        }
        if (expenseCats.length > 8) kb.push([{ text: 'All Categories ➡️', callback_data: `s_cat2_${txId}_0` }]);
        kb.push([{ text: '⬅️ Back', callback_data: `menu_${txId}` }]);
        await editMsgInline(chatId, mid, 'Select quick category pick:', kb);
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith('s_cat2_')) {
        const parts = data.split('_'), page = parseInt(parts[parts.length - 1], 10), txId = parts.slice(2, -1).join('_');
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { expenseCats } = await loadHouseholdSettings(txRow?.household_id || '');
        const PAGE = 8, start = page * PAGE, pageCats = expenseCats.slice(start, start + PAGE), total = Math.ceil(expenseCats.length / PAGE);
        
        const kb: any[] = [];
        for (let i = 0; i < pageCats.length; i += 2) {
          const gA = start + i, gB = start + i + 1;
          const row = [{ text: pageCats[i], callback_data: `v_cat_${txId}_${gA}` }];
          if (pageCats[i+1]) row.push({ text: pageCats[i+1], callback_data: `v_cat_${txId}_${gB}` });
          kb.push(row);
        }
        
        const nav: any[] = [];
        if (page > 0) nav.push({ text: '⬅️ Prev', callback_data: `s_cat2_${txId}_${page-1}` });
        if (page < total - 1) nav.push({ text: 'Next ➡️', callback_data: `s_cat2_${txId}_${page+1}` });
        if (nav.length) kb.push(nav);
        
        kb.push([{ text: '⬅️ Back to Menu', callback_data: `menu_${txId}` }]);
        await editMsgInline(chatId, mid, `All categories (Page ${page + 1} of ${total}):`, kb);
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith('s_acc_')) {
        const txId = data.split('s_acc_')[1];
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { nameA, nameB, householdMode } = await loadHouseholdSettings(txRow?.household_id || '');
        const isSolo = householdMode === 'solo', isJoint = householdMode === 'joint';
        const kb = [
          [{ text: nameA, callback_data: `v_acc_${txId}_PartnerA` }, ...(!isSolo ? [{ text: nameB, callback_data: `v_acc_${txId}_PartnerB` }] : [])],
          ...(isJoint ? [[{ text: 'Joint Pool Account', callback_data: `v_acc_${txId}_Joint` }]] : []),
          [{ text: '⬅️ Back', callback_data: `menu_${txId}` }]
        ];
        await editMsgInline(chatId, mid, 'Select account paid from:', kb);
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith('s_trk_')) {
        const txId = data.split('s_trk_')[1];
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { householdMode } = await loadHouseholdSettings(txRow?.household_id || '');
        const kb = [
          [{ text: 'Personal Expense (No split)', callback_data: `v_trk_${txId}_none` }],
          ...(householdMode === 'joint' ? [[{ text: 'Reimburse from Joint Pool', callback_data: `v_trk_${txId}_joint` }]] : []),
          ...(householdMode !== 'solo'  ? [[{ text: 'Split with Partner', callback_data: `v_trk_${txId}_partner` }]] : []),
          [{ text: '⬅️ Back', callback_data: `menu_${txId}` }]
        ];
        await editMsgInline(chatId, mid, 'Select settlement rule logic:', kb);
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith('t_typ_')) {
        const txId = data.split('t_typ_')[1];
        const { data: cur } = await supabase.from('transactions').select('type').eq('id', txId).single();
        if (cur) await supabase.from('transactions').update({ type: cur.type === 'expense' ? 'income' : 'expense' }).eq('id', txId);
        await answerCQ(cq.id);
        return handleReturnToMenu(chatId, mid, txId);
      }

      if (data.startsWith('v_cat_')) {
        const parts = data.split('_'), idx = parseInt(parts[parts.length - 1], 10), txId = parts.slice(2, -1).join('_');
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        const { expenseCats } = await loadHouseholdSettings(txRow?.household_id || '');
        const cat = expenseCats[idx] ?? 'Miscellaneous';
        await supabase.from('transactions').update({ category: cat }).eq('id', txId);
        await answerCQ(cq.id, cat);
        return handleReturnToMenu(chatId, mid, txId);
      }

      if (data.startsWith('v_acc_')) {
        const parts = data.split('_'), raw = parts[parts.length - 1], txId = parts.slice(2, -1).join('_');
        const acc = raw === 'PartnerA' ? 'Partner A' : raw === 'PartnerB' ? 'Partner B' : 'Joint';
        await supabase.from('transactions').update({ account_used: acc }).eq('id', txId);
        await answerCQ(cq.id, acc);
        return handleReturnToMenu(chatId, mid, txId);
      }

      if (data.startsWith('v_trk_')) {
        const parts = data.split('_'), track = parts[parts.length - 1], txId = parts.slice(2, -1).join('_');
        await supabase.from('transactions').update({ settle_track: track, to_settle: track === 'joint', split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5 }).eq('id', track);
        await answerCQ(cq.id, track);
        return handleReturnToMenu(chatId, mid, txId);
      }

      if (data.startsWith('d_')) {
        await supabase.from('transactions').delete().eq('id', data.split('d_')[1]);
        await editMsgInline(chatId, mid, 'Transaction deleted successfully.', []);
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith('menu_')) return handleReturnToMenu(chatId, mid, data.split('menu_')[1]);
      return NextResponse.json({ ok: true });
    }

    // ── TEXT MESSAGES HANDLING ───────────────────────────────────────────────
    if (payload.message) {
      const chatId  = payload.message.chat.id;
      const rawText = (payload.message.text || '').trim();
      
      const ctx = await validateByTelegram(payload.message.from.username || '');
      if (!ctx) { await sendMsg(chatId, 'Access Denied. Link your user profile handles.'); return NextResponse.json({ ok: true }); }

      const { householdId, senderIdentity } = ctx;
      const { nameA, nameB, householdMode, expenseCats } = await loadHouseholdSettings(householdId);
      const isJoint = householdMode === 'joint', isSolo = householdMode === 'solo';
      const validCatSet = new Set(expenseCats);

      if (rawText.startsWith('/start')) {
        await sendMsg(chatId, '<b>Welcome to ChillarFlow Bot!</b>\n\nYou can log expenses or query your household statistics cleanly using conversation text panels.');
        return NextResponse.json({ ok: true });
      }

      if (rawText === '/summary') {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const nextMonthFirstDay = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

        const { data: txs } = await supabase
          .from('transactions')
          .select()
          .gte('date', firstDay)
          .lt('date', nextMonthFirstDay)
          .eq('type', 'expense')
          .eq('household_id', householdId);

        if (!txs?.length) { await sendMsg(chatId, 'No entries found recorded this current billing cycle.'); return NextResponse.json({ ok: true }); }
        
        const total = txs.reduce((s, t) => s + Number(t.amount), 0);
        const byCat: Record<string, number> = {};
        txs.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount); });
        const top3 = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const lines = top3.map(([cat, amt], i) => `${i + 1}. ${cat}: Rs.${Math.round(amt).toLocaleString()}`).join('\n');
        
        await sendMsg(chatId, `<b>Current Month Snapshot</b>\n\nTotal Spent: Rs.${Math.round(total).toLocaleString()}\n\nTop Categories:\n${lines}`);
        return NextResponse.json({ ok: true });
      }

      if (rawText === '/recent') {
        const { data: recent } = await supabase.from('transactions').select().eq('household_id', householdId).order('created_at', { ascending: false }).limit(3);
        if (!recent?.length) { await sendMsg(chatId, 'No entries located.'); return NextResponse.json({ ok: true }); }
        for (const tx of recent) {
          const acct = tx.account_used === 'Partner A' ? nameA : tx.account_used === 'Partner B' ? nameB : 'Joint';
          await sendMsgInline(chatId, `Rs.${tx.amount} -- ${tx.category}\n${acct} | ${tx.date}\nNote: ${tx.note || '--'}`, txKeyboard(tx.id, tx.type));
        }
        return NextResponse.json({ ok: true });
      }

      const numericAmount = Number(rawText);
      if (!isNaN(numericAmount) && numericAmount > 0) {
        const txId = crypto.randomUUID();
        await supabase.from('transactions').insert([{
          id: txId, household_id: householdId, date: new Date().toISOString().slice(0, 10),
          amount: numericAmount, category: 'Miscellaneous', type: 'expense', account_used: senderIdentity,
          added_by: senderIdentity, note: 'Quick Wizard Log', to_settle: false, settled: false, settle_track: 'none',
          split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5
        }]);
        const wizCats = expenseCats.slice(0, 8);
        const kb: any[] = [];
        for (let i = 0; i < wizCats.length; i += 2) {
          const row = [{ text: wizCats[i], callback_data: `w_cat_${txId}_${i}` }];
          if (wizCats[i+1]) row.push({ text: wizCats[i+1], callback_data: `w_cat_${txId}_${i+1}` });
          kb.push(row);
        }
        await sendMsgInline(chatId, `Amount: Rs.${numericAmount}\n\nSelect category pick below:`, kb);
        return NextResponse.json({ ok: true });
      }

      // Inline message context thread resolving matches
      let targetedTxId: string | null = null;
      if (payload.message.reply_to_message) {
        const replyText = payload.message.reply_to_message.text || '';
        const amtMatch = replyText.match(/Amount:\s*Rs?\.?\s*([\d.]+)/i);
        if (amtMatch) {
          const { data: possibleMatch } = await supabase.from('transactions')
            .select('id')
            .eq('household_id', householdId)
            .eq('amount', parseFloat(amtMatch[1]))
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (possibleMatch) targetedTxId = possibleMatch.id;
        }
      }

      const { allowed } = await canUseAI(householdId);
      if (!allowed) { await sendMsg(chatId, 'AI processing limits reached.'); return NextResponse.json({ ok: true }); }

      const lower = rawText.toLowerCase();
      if (isSolo && (lower.includes('to settle') || lower.includes('settle with'))) {
        await sendMsg(chatId, 'Solo mode accounts do not support cross-splitting configuration metrics.'); return NextResponse.json({ ok: true });
      }

      // ── CONVERSATIONAL ROUTER PROMPT DEFINITIONS ────────────────────────────
      const systemPrompt = 
        `You are a personal finance assistant clerk. Determine if the user intends to log or edit a transaction record ("LOG_TRANSACTION") or query conversational metrics about their history ("QUERY_DATA").\n\n` +
        `Household Custom Categories:\n${expenseCats.join(', ')}\n\n` +
        `Decide carefully based on query types. History requests map to QUERY_DATA, transactions statements map to LOG_TRANSACTION. Timeframe labels: "current_month", "previous_month", or "all_time".`;

      const schema = {
        type: 'OBJECT',
        properties: {
          intent: { type: 'STRING', description: '"LOG_TRANSACTION" or "QUERY_DATA"' },
          transaction_details: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                amount: { type: 'NUMBER' },
                category: { type: 'STRING' },
                note: { type: 'STRING' },
                type: { type: 'STRING' },
                account: { type: 'STRING' },
                settle_track: { type: 'STRING' }
              },
              required: ['amount', 'category', 'note', 'type', 'account', 'settle_track']
            }
          },
          query_parameters: {
            type: 'OBJECT',
            properties: {
              target: { type: 'STRING', description: '"category_spent", "total_spent", or "highest_expense"' },
              category: { type: 'STRING', description: 'Matched clean household category or null' },
              timeframe: { type: 'STRING', description: '"current_month", "previous_month", or "all_time"' }
            },
            required: ['target', 'category', 'timeframe']
          }
        },
        required: ['intent']
      };

      let inputStr = rawText;
      if (targetedTxId) {
        const { data: baseTx } = await supabase.from('transactions').select().eq('id', targetedTxId).single();
        if (baseTx) inputStr = `The user is editing an existing transaction record with amount ${baseTx.amount} and note "${baseTx.note}". Application update text: "${rawText}"`;
      }

      const gemRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: systemPrompt + `\n\nUser Input: "${inputStr}"` }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: schema }
          })
        }
      );

      const gemData = await gemRes.json();
      const rawJson = (gemData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      if (!rawJson) { await sendMsg(chatId, 'Could not establish execution intent safely.'); return NextResponse.json({ ok: true }); }

      const routerResult = JSON.parse(rawJson);
      await incrementUsage(householdId);

      // ── ROUTE INTERPRETER EXECUTION PATHWAYS ───────────────────────────────
      if (routerResult.intent === 'LOG_TRANSACTION' && routerResult.transaction_details?.length) {
        for (const tx of routerResult.transaction_details) {
          if (!tx.amount || Number(tx.amount) <= 0) continue;
          
          if (targetedTxId) {
            const track = ['none','joint','partner'].includes(tx.settle_track) ? tx.settle_track : 'none';
            const { data: updated } = await supabase.from('transactions').update({
              amount: Number(tx.amount),
              category: validCatSet.has(tx.category) ? tx.category : 'Miscellaneous',
              note: tx.note || 'AI inline updated',
              settle_track: track,
              to_settle: track === 'joint',
              account_used: tx.account || senderIdentity
            }).eq('id', targetedTxId).select();
            
            if (updated?.[0]) {
              const saved = updated[0];
              const acct = saved.account_used === 'Partner A' ? nameA : saved.account_used === 'Partner B' ? nameB : 'Joint';
              await sendMsgInline(chatId, `✏️ <b>Transaction Updated Inline!</b>\n\n<b>Amount:</b> Rs.${saved.amount}\n<b>Category:</b> ${saved.category}\n<b>Account:</b> ${acct}\n<b>Note:</b> ${saved.note}`, txKeyboard(saved.id, saved.type));
            }
          } else {
            const track = ['none','joint','partner'].includes(tx.settle_track) ? tx.settle_track : 'none';
            const { data: dbRows } = await supabase.from('transactions').insert([{
              id: crypto.randomUUID(), household_id: householdId, date: new Date().toISOString().slice(0, 10),
              amount: Number(tx.amount), category: validCatSet.has(tx.category) ? tx.category : 'Miscellaneous',
              type: tx.type || 'expense', account_used: tx.account || senderIdentity, added_by: senderIdentity,
              note: tx.note || 'AI log', settle_track: track, to_settle: track === 'joint', split_mode: 'equal',
              partner_a_share: 0.5, partner_b_share: 0.5, settled: false
            }]).select();
            
            if (dbRows?.[0]) {
              const saved = dbRows[0];
              const acct = saved.account_used === 'Partner A' ? nameA : saved.account_used === 'Partner B' ? nameB : 'Joint';
              await sendMsgInline(chatId, `<b>Transaction Logged!</b>\n\n<b>Amount:</b> Rs.${saved.amount}\n<b>Category:</b> ${saved.category}\n<b>Account:</b> ${acct}\n<b>Note:</b> ${saved.note}`, txKeyboard(saved.id, saved.type));
            }
          }
        }
      } 
      else if (routerResult.intent === 'QUERY_DATA' && routerResult.query_parameters) {
        const q = routerResult.query_parameters;
        const now = new Date();
        let startStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        let endStr = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

        if (q.timeframe === 'previous_month') {
          startStr = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
          endStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        }

        let dbQuery = supabase.from('transactions').select('amount').eq('household_id', householdId).eq('type', 'expense');
        if (q.timeframe !== 'all_time') {
          dbQuery = dbQuery.gte('date', startStr).lt('date', endStr);
        }
        if (q.category) {
          dbQuery = dbQuery.eq('category', q.category);
        }

        const { data: records } = await dbQuery;
        const totalSum = records?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
        const tfLabel = q.timeframe === 'previous_month' ? 'last month' : q.timeframe === 'all_time' ? 'all time' : 'this month';

        if (q.category) {
          await sendMsg(chatId, `📊 You spent a total of <b>Rs. ${Math.round(totalSum).toLocaleString()}</b> on <b>${q.category}</b> (${tfLabel}).`);
        } else {
          await sendMsg(chatId, `📊 Your total household spending for ${tfLabel} is <b>Rs. ${Math.round(totalSum).toLocaleString()}</b>.`);
        }
      } else {
        await sendMsg(chatId, 'Could not determine intent structure accurately.');
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Webhook processing failure:', err);
    return NextResponse.json({ ok: true });
  }
}
