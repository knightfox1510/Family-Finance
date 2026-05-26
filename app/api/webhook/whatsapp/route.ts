// ─── app/api/webhook/whatsapp/route.ts ────────────────────────────────────────
// WhatsApp Cloud API webhook for ChillarFlow
//
// Environment variables required (add to Vercel):
//   WHATSAPP_TOKEN          — your Meta access token (from Meta Developer portal)
//   WHATSAPP_PHONE_NUMBER_ID — the phone number ID (from Meta Developer portal)
//   WHATSAPP_VERIFY_TOKEN   — any string you choose, set the same in Meta webhook config
//   GEMINI_API_KEY          — already set for Telegram
//   NEXT_PUBLIC_SUPABASE_URL — already set
//   SUPABASE_SERVICE_ROLE_KEY — already set
//
// Supabase migration needed (run once):
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
//   CREATE INDEX IF NOT EXISTS profiles_whatsapp_idx ON profiles(whatsapp_number);
//
// Meta Developer setup steps (see guide at bottom of this file):
//   1. Create Meta App → WhatsApp → Cloud API
//   2. Set webhook URL: https://chillarflow.com/api/webhook/whatsapp
//   3. Set verify token: same as WHATSAPP_VERIFY_TOKEN env var
//   4. Subscribe to: messages

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  supabaseBot,
  loadHouseholdSettings,
  validateByWhatsApp,
  parseWithGemini,
  saveTransaction,
  formatTxSummary,
  settleTrackLabel,
} from '@/lib/botUtils';
import { canUseAI, incrementUsage, getUsageSummary, FREE_MONTHLY_LIMIT } from '@/lib/planUtils';

export const maxDuration = 60;

// ─── WhatsApp API helpers ─────────────────────────────────────────────────────
const WA_URL = 'https://graph.facebook.com/v19.0';

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

// WhatsApp supports interactive list messages (up to 10 items per section)
// and reply buttons (up to 3). We use lists for category selection.
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

// Reply buttons — max 3 options
const sendButtons = async (
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[]
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
        type: 'button',
        body:   { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type:  'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    }),
  });
};

// Mark message as read (shows blue ticks)
const markRead = async (messageId: string): Promise<void> => {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token   = process.env.WHATSAPP_TOKEN;
  await fetch(`${WA_URL}/${phoneId}/messages`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status:     'read',
      message_id: messageId,
    }),
  });
};

// ─── Wizard state — stored in Supabase for persistence across messages ─────────
// We store wizard state in a temp table. Lightweight — only active wizard sessions.
// Supabase migration:
//   CREATE TABLE IF NOT EXISTS wa_wizard (
//     phone TEXT PRIMARY KEY,
//     tx_id TEXT,
//     step  TEXT,   -- 'category' | 'account' | 'settle'
//     updated_at TIMESTAMPTZ DEFAULT now()
//   );
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

// ─── GET handler — Meta webhook verification challenge ────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    return new Response(challenge, { status: 200 });
  }
  return new Response('Verification failed', { status: 403 });
}

// ─── POST handler — incoming messages ─────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Meta sends a test ping with this shape — acknowledge and return
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ ok: true });
    }

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    // Handle status updates (delivered, read) — just acknowledge
    if (value?.statuses) return NextResponse.json({ ok: true });

    const messages = value?.messages;
    if (!messages?.length) return NextResponse.json({ ok: true });

    const msg     = messages[0];
    const from    = msg.from;         // sender's phone in E.164 (e.g. "919876543210")
    const msgId   = msg.id;
    const msgType = msg.type;         // 'text' | 'interactive' | 'button'

    // Mark as read immediately — shows blue ticks
    await markRead(msgId);

    // ── Validate sender ────────────────────────────────────────────────────────
    const ctx = await validateByWhatsApp(from);
    if (!ctx) {
      await send(from,
        'Hi! Your WhatsApp number is not linked to a ChillarFlow account.\n\n' +
        'Sign up at chillarflow.com and link your number in Settings to start logging expenses here.'
      );
      return NextResponse.json({ ok: true });
    }

    const { householdId, senderIdentity } = ctx;
    const { nameA, nameB, householdMode, expenseCats, quickCats } =
      await loadHouseholdSettings(householdId);
    const isJoint    = householdMode === 'joint';
    const isSolo     = householdMode === 'solo';
    const hasPartner = !isSolo;
    const validCatSet = new Set(expenseCats);

    // ── INTERACTIVE replies (button/list selections) ───────────────────────────
    if (msgType === 'interactive') {
      const interactive = msg.interactive;
      const replyId = interactive?.button_reply?.id || interactive?.list_reply?.id || '';
      const wizard  = await getWizard(from);

      // Wizard: category selected
      if (replyId.startsWith('wiz_cat_') && wizard) {
        const catIndex = parseInt(replyId.replace('wiz_cat_', ''), 10);
        const chosen   = expenseCats[catIndex] ?? 'Miscellaneous';
        await supabaseBot.from('transactions').update({ category: chosen }).eq('id', wizard.tx_id);
        await setWizard(from, wizard.tx_id, 'account');

        // Account selection buttons
        const buttons: { id: string; title: string }[] = [
          { id: `wiz_acc_PartnerA`, title: nameA },
          ...(!isSolo ? [{ id: 'wiz_acc_PartnerB', title: nameB }] : []),
          ...(isJoint ? [{ id: 'wiz_acc_Joint',   title: 'Joint Account' }] : []),
        ].slice(0, 3); // WhatsApp max 3 buttons

        await sendButtons(from, 'Category: ' + chosen + '\n\nWhich account paid?', buttons);
        return NextResponse.json({ ok: true });
      }

      // Wizard: account selected
      if (replyId.startsWith('wiz_acc_') && wizard) {
        const raw  = replyId.replace('wiz_acc_', '');
        const acct = raw === 'PartnerA' ? 'Partner A' : raw === 'PartnerB' ? 'Partner B' : 'Joint';
        await supabaseBot.from('transactions')
          .update({ account_used: acct, settle_track: 'none', to_settle: false })
          .eq('id', wizard.tx_id);

        if (acct === 'Joint' || isSolo) {
          await clearWizard(from);
          const { data: rows } = await supabaseBot.from('transactions').select().eq('id', wizard.tx_id);
          const tx = rows?.[0];
          if (tx) await send(from, formatTxSummary(tx, nameA, nameB));
          return NextResponse.json({ ok: true });
        }

        await setWizard(from, wizard.tx_id, 'settle');

        const settleButtons: { id: string; title: string }[] = [
          { id: 'wiz_trk_none',    title: 'Personal (no split)' },
          ...(isJoint  ? [{ id: 'wiz_trk_joint',   title: 'Reimburse from pool' }] : []),
          ...(hasPartner ? [{ id: 'wiz_trk_partner', title: 'Split with partner' }] : []),
        ].slice(0, 3);

        await sendButtons(from, 'Account: ' + acct + '\n\nSettlement?', settleButtons);
        return NextResponse.json({ ok: true });
      }

      // Wizard: settlement selected
      if (replyId.startsWith('wiz_trk_') && wizard) {
        const track = replyId.replace('wiz_trk_', '');
        await supabaseBot.from('transactions')
          .update({ settle_track: track, to_settle: track === 'joint', split_mode: 'equal', partner_a_share: 0.5, partner_b_share: 0.5 })
          .eq('id', wizard.tx_id);
        await clearWizard(from);

        const { data: rows } = await supabaseBot.from('transactions').select().eq('id', wizard.tx_id);
        const tx = rows?.[0];
        if (tx) await send(from, formatTxSummary(tx, nameA, nameB));
        return NextResponse.json({ ok: true });
      }

      // Edit: category picker (from /edit command)
      if (replyId.startsWith('edit_cat_')) {
        const parts   = replyId.split('_');
        const catIdx  = parseInt(parts[parts.length - 1], 10);
        const txId    = parts.slice(2, parts.length - 1).join('_');
        const cat     = expenseCats[catIdx] ?? 'Miscellaneous';
        await supabaseBot.from('transactions').update({ category: cat }).eq('id', txId);
        await send(from, 'Category updated to: ' + cat);
        return NextResponse.json({ ok: true });
      }

      // Edit: delete
      if (replyId.startsWith('edit_del_')) {
        const txId = replyId.replace('edit_del_', '');
        await supabaseBot.from('transactions').delete().eq('id', txId);
        await send(from, 'Transaction deleted.');
        return NextResponse.json({ ok: true });
      }
    }

    // ── TEXT MESSAGES ──────────────────────────────────────────────────────────
    if (msgType !== 'text') return NextResponse.json({ ok: true });
    const rawText = (msg.text?.body || '').trim();
    if (!rawText) return NextResponse.json({ ok: true });

    // ── /start ─────────────────────────────────────────────────────────────────
    if (rawText.toLowerCase() === '/start' || rawText.toLowerCase() === 'hi' || rawText.toLowerCase() === 'hello') {
      await send(from,
        'Welcome to ChillarFlow!\n\n' +
        'How to log expenses:\n' +
        '- Send: 450 Zomato\n' +
        '- Send: 1200 grocery to settle\n' +
        '- Send a number (e.g. 500) for the guided wizard\n\n' +
        'Commands:\n' +
        '/recent - last 3 transactions\n' +
        '/summary - this month snapshot\n' +
        '/usage - AI parse usage\n' +
        '/upgrade - unlock unlimited\n' +
        '/help - all commands'
      );
      return NextResponse.json({ ok: true });
    }

    // ── /help ──────────────────────────────────────────────────────────────────
    if (rawText.toLowerCase() === '/help') {
      await send(from,
        'ChillarFlow commands:\n\n' +
        '/recent - view & edit last 3 transactions\n' +
        '/summary - this month spending snapshot\n' +
        '/usage - check AI parse usage\n' +
        '/upgrade - upgrade to Pro plan\n\n' +
        'Logging:\n' +
        '450 Zomato - personal expense\n' +
        '450 Zomato to settle - joint pool reimburses\n' +
        '500 - open wizard (always free)'
      );
      return NextResponse.json({ ok: true });
    }

    // ── /recent ────────────────────────────────────────────────────────────────
    if (rawText.toLowerCase() === '/recent') {
      const { data: recent } = await supabaseBot
        .from('transactions')
        .select()
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (!recent?.length) {
        await send(from, 'No transactions logged yet.');
        return NextResponse.json({ ok: true });
      }

      for (const tx of recent) {
        const acct = tx.account_used === 'Partner A' ? nameA : tx.account_used === 'Partner B' ? nameB : 'Joint';
        const summary =
          'Rs.' + tx.amount + ' - ' + tx.category + '\n' +
          acct + ' | ' + tx.date + '\n' +
          (tx.note || '--');

        // Offer quick edit buttons (max 3)
        const btns = [
          { id: 'edit_del_' + tx.id, title: 'Delete' },
          { id: 'edit_cat_' + tx.id + '_' + expenseCats.indexOf(tx.category), title: 'Change category' },
        ];
        await sendButtons(from, summary, btns);
      }
      return NextResponse.json({ ok: true });
    }

    // ── /summary ───────────────────────────────────────────────────────────────
    if (rawText.toLowerCase() === '/summary') {
      const thisMonth = new Date().toISOString().slice(0, 7);
      const { data: txs } = await supabaseBot
        .from('transactions')
        .select()
        .eq('household_id', householdId)
        .like('date', thisMonth + '%')
        .eq('type', 'expense');

      if (!txs?.length) {
        await send(from, 'No expenses in ' + thisMonth + ' yet.');
        return NextResponse.json({ ok: true });
      }

      const total  = txs.reduce((s: number, t: any) => s + Number(t.amount), 0);
      const byCat: Record<string, number> = {};
      txs.forEach((t: any) => { byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount); });
      const top3  = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const lines = top3.map(([cat, amt], i) =>
        (i + 1) + '. ' + cat + ': Rs.' + Math.round(amt as number).toLocaleString('en-IN')
      ).join('\n');

      await send(from,
        'Month summary - ' + thisMonth + '\n\n' +
        'Total spent: Rs.' + Math.round(total).toLocaleString('en-IN') + '\n\n' +
        'Top categories:\n' + lines + '\n\n' +
        txs.length + ' transactions logged'
      );
      return NextResponse.json({ ok: true });
    }

    // ── /usage ─────────────────────────────────────────────────────────────────
    if (rawText.toLowerCase() === '/usage') {
      const { plan, count, month } = await getUsageSummary(householdId);
      if (plan === 'pro') {
        await send(from, 'Your plan: PRO\n\nUnlimited AI parses. Thank you for supporting ChillarFlow!');
      } else {
        const remaining = Math.max(0, FREE_MONTHLY_LIMIT - count);
        const bar = Array.from({ length: 10 }, (_, i) =>
          i < Math.round((count / FREE_MONTHLY_LIMIT) * 10) ? '[x]' : '[ ]'
        ).join('');
        await send(from,
          'Your plan: Free\n\n' +
          'AI parses this month (' + month + '):\n' +
          bar + '\n' +
          count + ' / ' + FREE_MONTHLY_LIMIT + ' used\n\n' +
          (remaining > 0
            ? remaining + ' parses remaining.\nSend /upgrade for unlimited.'
            : 'Limit reached! Send /upgrade to unlock unlimited, or send a number for the free wizard.')
        );
      }
      return NextResponse.json({ ok: true });
    }

    // ── /upgrade ───────────────────────────────────────────────────────────────
    if (rawText.toLowerCase() === '/upgrade') {
      await send(from,
        'Upgrade to ChillarFlow Pro\n\n' +
        'Free: ' + FREE_MONTHLY_LIMIT + ' AI parses/month\n' +
        'Pro: Unlimited AI parses\n\n' +
        'The number wizard is always free.\n\n' +
        'To upgrade, contact us:\nteam@chillarflow.com\n\nOr visit: chillarflow.com/pricing'
      );
      return NextResponse.json({ ok: true });
    }

    // ── NUMERIC WIZARD ─────────────────────────────────────────────────────────
    // Sending a number triggers the guided wizard — always free (no Gemini)
    const numericAmount = Number(rawText.replace(/[^0-9.]/g, ''));
    if (!isNaN(numericAmount) && numericAmount > 0 && /^\d+(\.\d+)?$/.test(rawText.trim())) {
      const txId = crypto.randomUUID();

      await supabaseBot.from('transactions').insert([{
        id:              txId,
        household_id:    householdId,
        date:            new Date().toISOString().slice(0, 10),
        amount:          numericAmount,
        category:        'Miscellaneous',
        type:            'expense',
        account_used:    senderIdentity,
        added_by:        senderIdentity,
        note:            'WhatsApp wizard',
        to_settle:       false,
        settled:         false,
        settle_track:    'none',
        split_mode:      'equal',
        partner_a_share: 0.5,
        partner_b_share: 0.5,
      }]);

      await setWizard(from, txId, 'category');

      // Show first 10 categories as a list (WhatsApp list max 10 rows per section)
      const wizCats = expenseCats.slice(0, 10);
      await sendList(
        from,
        'Amount: Rs.' + numericAmount + '\n\nSelect a category:',
        'Choose category',
        [{
          title: 'Categories',
          rows: wizCats.map((cat, i) => ({ id: 'wiz_cat_' + i, title: cat.slice(0, 24) })),
        }]
      );
      return NextResponse.json({ ok: true });
    }

    // ── AI NATURAL LANGUAGE PARSING ────────────────────────────────────────────
    const { allowed, count: usageCount } = await canUseAI(householdId);
    if (!allowed) {
      const bar = Array.from({ length: 10 }, () => '[x]').join('');
      await send(from,
        'Free plan limit reached (' + FREE_MONTHLY_LIMIT + ' AI parses/month)\n\n' +
        bar + ' ' + usageCount + ' / ' + FREE_MONTHLY_LIMIT + '\n\n' +
        'Send a number (e.g. 500) for the free guided wizard.\nSend /upgrade for unlimited.'
      );
      return NextResponse.json({ ok: true });
    }

    // Settlement keyword validation
    const lower = rawText.toLowerCase();
    if (isSolo && (lower.includes('to settle') || lower.includes('settle with'))) {
      await send(from, 'Solo mode does not support settlements. Just send: amount description');
      return NextResponse.json({ ok: true });
    }
    if (!isJoint && lower.includes('to settle')) {
      await send(from, 'No joint pool in ' + householdMode + ' mode. Use: amount description settle with ' + nameB);
      return NextResponse.json({ ok: true });
    }

    // Call Gemini
    const parsed = await parseWithGemini(rawText, senderIdentity, nameA, nameB, householdMode, expenseCats);
    if (!parsed.length) {
      await send(from, 'Could not parse that. Try: 450 Zomato\nOr send a number for the guided wizard.');
      return NextResponse.json({ ok: true });
    }

    // Increment usage counter
    await incrementUsage(householdId);

    // Save each transaction and confirm
    for (const tx of parsed) {
      if (!tx.amount || Number(tx.amount) <= 0) continue;
      const saved = await saveTransaction(tx, householdId, senderIdentity, validCatSet);
      await send(from, formatTxSummary(saved, nameA, nameB));
    }

    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error('WhatsApp webhook error:', err);
    return NextResponse.json({ ok: true }); // always 200 to Meta
  }
}

// ─── SETUP GUIDE ──────────────────────────────────────────────────────────────
//
// 1. Go to https://developers.facebook.com/
// 2. Create App → Business → WhatsApp
// 3. Under WhatsApp > Getting Started:
//    - Note your Phone Number ID
//    - Note your Temporary Access Token (or create a permanent one via System User)
// 4. Under WhatsApp > Configuration > Webhooks:
//    - Callback URL: https://chillarflow.com/api/webhook/whatsapp
//    - Verify Token: (any string — save as WHATSAPP_VERIFY_TOKEN in Vercel)
//    - Subscribe to: messages
// 5. Add environment variables in Vercel:
//    WHATSAPP_TOKEN = <your token>
//    WHATSAPP_PHONE_NUMBER_ID = <your phone number ID>
//    WHATSAPP_VERIFY_TOKEN = <your chosen verify string>
// 6. Run migration in Supabase SQL Editor:
//    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
//    CREATE TABLE IF NOT EXISTS wa_wizard (
//      phone TEXT PRIMARY KEY,
//      tx_id TEXT,
//      step TEXT,
//      updated_at TIMESTAMPTZ DEFAULT now()
//    );
// 7. Add whatsapp_number field to Settings.tsx (same as telegram_username input)
// 8. Deploy and test with the free test number Meta provides
