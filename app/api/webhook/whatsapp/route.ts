// ─── app/api/webhook/whatsapp/route.ts ────────────────────────────────────────
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  supabaseBot,
  loadHouseholdSettings,
  formatTxSummary,
  settleTrackLabel,
} from '@/lib/botUtils';
import { canUseAI, incrementUsage, getUsageSummary, FREE_MONTHLY_LIMIT } from '@/lib/planUtils';

export const maxDuration = 60;
const WA_URL = 'https://graph.facebook.com/v19.0';

function verifySignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature || !appSecret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function markProcessed(messageId: string): Promise<boolean> {
  try {
    const { error } = await supabaseBot.from('processed_wa_messages').insert({ message_id: messageId });
    if (error?.code === '23505') return false;
    return !error;
  } catch {
    return true;
  }
}

const send = async (to: string, text: string): Promise<void> => {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token   = process.env.WHATSAPP_TOKEN;
  await fetch(`${WA_URL}/${phoneId}/messages`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    }),
  });
};

const sendButtons = async (to: string, bodyText: string, buttons: { id: string; title: string }[]): Promise<void> => {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token   = process.env.WHATSAPP_TOKEN;
  await fetch(`${WA_URL}/${phoneId}/messages`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: { buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
      },
    }),
  });
};

const sendList = async (
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
): Promise<void> => {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token   = process.env.WHATSAPP_TOKEN;
  await fetch(`${WA_URL}/${phoneId}/messages`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body:   { text: bodyText },
        action: { button: buttonLabel, sections },
      },
    }),
  });
};

const markRead = (messageId: string): void => {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token   = process.env.WHATSAPP_TOKEN;
  fetch(`${WA_URL}/${phoneId}/messages`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
  }).catch(() => {});
};

async function validateSender(phone: string): Promise<{
  householdId: string;
  senderIdentity: string;
  displayName: string;
} | null> {
  const cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return null;

  const { data, error } = await supabaseBot
    .from('profiles')
    .select('household_id, display_name')
    .eq('whatsapp_number', cleaned)
    .single();

  if (error || !data?.household_id) return null;

  return {
    householdId:    data.household_id,
    senderIdentity: data.display_name === 'Partner B' ? 'Partner B' : 'Partner A', 
    displayName:    data.display_name,
  };
}

const getWizard = async (phone: string) => {
  const { data } = await supabaseBot.from('wa_wizard').select().eq('phone', phone).single();
  return data || null;
};
const setWizard = async (phone: string, txId: string, step: string) => {
  await supabaseBot.from('wa_wizard').upsert({ phone, tx_id: txId, step, updated_at: new Date().toISOString() });
};
const clearWizard = async (phone: string) => {
  await supabaseBot.from('wa_wizard').delete().eq('phone', phone);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Verification failed', { status: 403 });
}

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const appSecret   = process.env.WHATSAPP_APP_SECRET;
  const signature   = request.headers.get('x-hub-signature-256');

  if (appSecret && !verifySignature(rawBody, signature, appSecret)) {
    console.warn('[WA webhook] Signature verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody);
    if (body.object !== 'whatsapp_business_account') return NextResponse.json({ ok: true });

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    if (value?.statuses) return NextResponse.json({ ok: true });

    const messages = value?.messages;
    if (!messages?.length) return NextResponse.json({ ok: true });

    const msg     = messages[0];
    const from    = msg.from;
    const msgId   = msg.id;
    const msgType = msg.type;

    const isNew = await markProcessed(msgId);
    if (!isNew) return NextResponse.json({ ok: true });

    markRead(msgId);

    const ctx = await validateSender(from);
    if (!ctx) {
      await send(from,
        'Hi! Your WhatsApp number is not linked to a ChillarFlow account.\n\n' +
        'Sign up at chillarflow.com and add your number in Settings → WhatsApp Integration.'
      );
      return NextResponse.json({ ok: true });
    }

    const { householdId, senderIdentity } = ctx;
    const { nameA, nameB, householdMode, expenseCats } = await loadHouseholdSettings(householdId);
    const isJoint = householdMode === 'joint', isSolo = householdMode === 'solo', hasPartner = !isSolo;
    const validCatSet = new Set(expenseCats);

    // ── INTERACTIVE COMPONENTS ───────────────────────────────────────────────
    if (msgType === 'interactive') {
      const interactive = msg.interactive;
      const replyId = interactive?.button_reply?.id || interactive?.list_reply?.id || '';
      const wizard  = await getWizard(from);

      if (replyId.startsWith('wiz_cat_') && wizard) {
        const catIndex = parseInt(replyId.replace('wiz_cat_', ''), 10);
        const chosen   = expenseCats[catIndex] ?? 'Miscellaneous';
        await supabaseBot.from('transactions').update({ category: chosen }).eq('id', wizard.tx_id);
        await setWizard(from, wizard.tx_id, 'account');

        const buttons = [
          { id: 'wiz_acc_PartnerA', title: nameA.slice(0, 20) },
          ...(!isSolo ? [{ id: 'wiz_acc_PartnerB', title: nameB.slice(0, 20) }] : []),
          ...(isJoint ? [{ id: 'wiz_acc_Joint',    title: 'Joint Account' }] : []),
        ].slice(0, 3);

        await sendButtons(from, 'Category: ' + chosen + '\n\nWhich account paid?', buttons);
        return NextResponse.json({ ok: true });
      }

      if (replyId.startsWith('wiz_acc_') && wizard) {
        const raw  = replyId.replace('wiz_acc_', '');
        const acct = raw === 'PartnerA' ? 'Partner A' : raw === 'PartnerB' ? 'Partner B' : 'Joint';
        await supabaseBot.from('transactions').update({ account_used: acct, settle_track: 'none', to_settle: false }).eq('id', wizard.tx_id);

        if (acct === 'Joint' || isSolo) {
          await clearWizard(from);
          const { data: rows } = await supabaseBot.from('transactions').select().eq('id', wizard.tx_id);
          if (rows?.[0]) await send(from, formatTxSummary(rows[0], nameA, nameB));
          return NextResponse.json({ ok: true });
        }

        await setWizard(from, wizard.tx_id, 'settle');
        const settleButtons = [
          { id: 'wiz_trk_none',    title: 'Personal (no split)' },
          ...(isJoint   ? [{ id: 'wiz_trk_joint',   title: 'Reimburse from pool' }] : []),
          ...(hasPartner ? [{ id: 'wiz_trk_partner', title: 'Split with partner' }] : []),
        ].slice(0, 3);

        await sendButtons(from, 'Account: ' + acct + '\n\nSettlement?', settleButtons);
        return NextResponse.json({ ok: true });
      }

      if (replyId.startsWith('wiz_trk_') && wizard) {
        const track = replyId.replace('wiz_trk_', '');
        await supabaseBot.from('transactions').update({ settle_track: track, to_settle: track === 'joint', split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5 }).eq('id', wizard.tx_id);
        await clearWizard(from);
        const { data: rows } = await supabaseBot.from('transactions').select().eq('id', wizard.tx_id);
        if (rows?.[0]) await send(from, formatTxSummary(rows[0], nameA, nameB));
        return NextResponse.json({ ok: true });
      }

      if (replyId.startsWith('edit_cat_')) {
        const parts = replyId.split('_'), catIdx = parseInt(parts[parts.length - 1], 10), txId = parts.slice(2, -1).join('_');
        const cat = catIdx >= 0 && catIdx < expenseCats.length ? expenseCats[catIdx] : 'Miscellaneous';
        await supabaseBot.from('transactions').update({ category: cat }).eq('id', txId);
        await send(from, 'Category updated to: ' + cat);
        return NextResponse.json({ ok: true });
      }

      if (replyId.startsWith('edit_del_')) {
        await supabaseBot.from('transactions').delete().eq('id', replyId.replace('edit_del_', ''));
        await send(from, 'Transaction deleted.');
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ ok: true });
    }

    // ── TEXT MESSAGES HANDLING ───────────────────────────────────────────────
    if (msgType !== 'text') return NextResponse.json({ ok: true });
    const rawText = (msg.text?.body || '').trim();
    if (!rawText) return NextResponse.json({ ok: true });
    const lower = rawText.toLowerCase();

    if (lower === '/start' || lower === 'hi' || lower === 'hello') {
      await send(from,
        'Welcome to ChillarFlow!\n\n' +
        '💬 *You can now chat with me!*\n' +
        '- Log an expense: "450 Zomato"\n' +
        '- Ask a question: "How much did I spend on groceries this month?"'
      );
      return NextResponse.json({ ok: true });
    }

    if (lower === '/summary') {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const nextMonthFirstDay = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

      const { data: txs } = await supabaseBot
        .from('transactions')
        .select()
        .gte('date', firstDay)
        .lt('date', nextMonthFirstDay)
        .eq('type', 'expense')
        .eq('household_id', householdId);

      if (!txs?.length) {
        await send(from, `No expenses logged this month yet.`);
        return NextResponse.json({ ok: true });
      }

      const total = txs.reduce((s, t) => s + Number(t.amount), 0);
      const byCat: Record<string, number> = {};
      txs.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount); });
      const top3  = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const lines = top3.map(([cat, amt], i) => `${i + 1}. ${cat}: Rs.${Math.round(amt).toLocaleString('en-IN')}`).join('\n');

      await send(from, `*Month Summary*\n\nTotal spent: Rs.${Math.round(total).toLocaleString('en-IN')}\n\nTop categories:\n${lines}`);
      return NextResponse.json({ ok: true });
    }

    if (lower === '/recent') {
      const { data: recent } = await supabaseBot.from('transactions').select().eq('household_id', householdId).order('created_at', { ascending: false }).limit(3);
      if (!recent?.length) { await send(from, 'No transactions logged yet.'); return NextResponse.json({ ok: true }); }
      for (const tx of recent) {
        const acct = tx.account_used === 'Partner A' ? nameA : tx.account_used === 'Partner B' ? nameB : 'Joint';
        const catIdx = expenseCats.indexOf(tx.category);
        const btns = [{ id: 'edit_del_' + tx.id, title: 'Delete' }];
        if (catIdx >= 0) btns.push({ id: `edit_cat_${tx.id}_${catIdx}`, title: 'Change category' });
        await sendButtons(from, `Rs.${tx.amount} - ${tx.category}\n${acct} | ${tx.date}\nNote: ${tx.note || '--'}`, btns.slice(0, 3));
      }
      return NextResponse.json({ ok: true });
    }

    if (/^\d+(\.\d+)?$/.test(rawText)) {
      const numericAmount = parseFloat(rawText);
      if (numericAmount > 0) {
        const txId = crypto.randomUUID();
        await supabaseBot.from('transactions').insert([{
          id: txId, household_id: householdId, date: new Date().toISOString().slice(0, 10),
          amount: numericAmount, category: 'Miscellaneous', type: 'expense', account_used: senderIdentity,
          added_by: senderIdentity, note: 'WhatsApp wizard', to_settle: false, settled: false, settle_track: 'none',
          split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5
        }]);
        await setWizard(from, txId, 'category');
        await sendList(from, `Amount: Rs.${numericAmount}\n\nSelect a category:`, 'Choose category', [{
          title: 'Categories', rows: expenseCats.slice(0, 10).map((cat, i) => ({ id: 'wiz_cat_' + i, title: cat.slice(0, 24) }))
        }]);
        return NextResponse.json({ ok: true });
      }
    }

    // ── AI INTERACTIVE ROUTER IMPLEMENTATION ─────────────────────────────────
    const { allowed } = await canUseAI(householdId);
    if (!allowed) {
      await send(from, 'AI parsing quota reached. Send a plain number for the quick guided wizard.');
      return NextResponse.json({ ok: true });
    }

    let targetedTxId: string | null = null;
    if (msg.context?.id) {
      const contextMsgId = msg.context.id;
      const { data: matchedTx } = await supabaseBot.from('transactions').select('id').eq('household_id', householdId).eq('note', `WA_MSG_${contextMsgId}`).single();
      if (matchedTx) targetedTxId = matchedTx.id;
    }

    const systemPrompt = 
      `You are a personal finance assistant for a household. Your job is to classify the user's intent into either logging/editing a transaction ("LOG_TRANSACTION") or answering a natural language question about their spending history ("QUERY_DATA").\n\n` +
      `Available Household Expense Categories:\n${expenseCats.join(', ')}\n\n` +
      `INTENT DEFAULTS:\n` +
      `- If the user is stating an expense or correcting an existing one (e.g., "450 zomato", "actually it was 550"), classify as "LOG_TRANSACTION".\n` +
      `- If the user is asking a question about statistics or history (e.g., "how much did I spend", "show me grocery total"), classify as "QUERY_DATA".\n\n` +
      `For LOG_TRANSACTION tasks, parse the transaction attributes exactly as requested. For QUERY_DATA tasks, extract the query parameters requested. Choose only valid categories from the list provided. If none fit, omit the category restriction. Timeframes can be "current_month", "previous_month", or "all_time".`;

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

    let promptContext = rawText;
    if (targetedTxId) {
      const { data: baseTx } = await supabaseBot.from('transactions').select().eq('id', targetedTxId).single();
      if (baseTx) promptContext = `The user is modifying an existing transaction record (${baseTx.amount} for ${baseTx.note}). Modification input: "${rawText}"`;
    }

    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: systemPrompt + `\n\nUser Input: "${promptContext}"` }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema }
        })
      }
    );
    
    const gemData = await gemRes.json();
    const rawJson = (gemData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!rawJson) {
      await send(from, 'Could not read message intent. Please structure your query cleanly.');
      return NextResponse.json({ ok: true });
    }

    const routerResult = JSON.parse(rawJson);
    await incrementUsage(householdId);

    // ── ROUTE PIPELINE 1: WRITE / MODIFY LOG TRANSACTION ────────────────────
    if (routerResult.intent === 'LOG_TRANSACTION' && routerResult.transaction_details?.length) {
      for (const tx of routerResult.transaction_details) {
        if (!tx.amount || Number(tx.amount) <= 0) continue;

        if (targetedTxId) {
          const track = ['none','joint','partner'].includes(tx.settle_track) ? tx.settle_track : 'none';
          const { data: updated } = await supabaseBot.from('transactions').update({
            amount: Number(tx.amount),
            category: validCatSet.has(tx.category) ? tx.category : 'Miscellaneous',
            note: tx.note || 'AI modified log',
            settle_track: track,
            to_settle: track === 'joint',
            account_used: tx.account || senderIdentity
          }).eq('id', targetedTxId).select();
          
          if (updated?.[0]) await send(from, `✏️ *Transaction Updated!*\n\n` + formatTxSummary(updated[0], nameA, nameB));
        } else {
          const track = ['none','joint','partner'].includes(tx.settle_track) ? tx.settle_track : 'none';
          const { data: inserted } = await supabaseBot.from('transactions').insert([{
            id: crypto.randomUUID(), household_id: householdId, date: new Date().toISOString().slice(0, 10),
            amount: Number(tx.amount), category: validCatSet.has(tx.category) ? tx.category : 'Miscellaneous',
            type: tx.type || 'expense', account_used: tx.account || senderIdentity, added_by: senderIdentity,
            note: `WA_MSG_${msgId}`, settle_track: track, to_settle: track === 'joint', split_mode: 'equal',
            partner_a_share: 0.5, partner_b_share: 0.5, settled: false
          }]).select();
          
          if (inserted?.[0]) await send(from, formatTxSummary(inserted[0], nameA, nameB));
        }
      }
    } 
    // ── ROUTE PIPELINE 2: READ READ-ONLY CONVERSATIONAL HISTORY QUERY ────────
    else if (routerResult.intent === 'QUERY_DATA' && routerResult.query_parameters) {
      const q = routerResult.query_parameters;
      const now = new Date();
      let startStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      let endStr = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

      if (q.timeframe === 'previous_month') {
        startStr = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
        endStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      }

      let dbQuery = supabaseBot.from('transactions').select('amount').eq('household_id', householdId).eq('type', 'expense');
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
        await send(from, `📊 You spent a total of *Rs. ${Math.round(totalSum).toLocaleString('en-IN')}* on *${q.category}* (${tfLabel}).`);
      } else {
        await send(from, `📊 Your total household spending for ${tfLabel} is *Rs. ${Math.round(totalSum).toLocaleString('en-IN')}*.`);
      }
    } else {
      await send(from, 'Could not break down your request. Try stating expenses cleanly or asking direct questions.');
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[WA Webhook Failure]:', err);
    return NextResponse.json({ ok: true });
  }
}
