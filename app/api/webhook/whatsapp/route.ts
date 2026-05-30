// ─── app/api/webhook/whatsapp/route.ts ────────────────────────────────────────
// WhatsApp Cloud API webhook for ChillarFlow
//
// Changes from previous version:
//   1. HMAC signature verification (X-Hub-Signature-256) — prevents spoofed messages
//   2. Deduplication via processed_wa_messages table — prevents duplicate transactions on retry
//   3. validateByWhatsApp now does a direct .eq() lookup instead of loading all profiles
//   4. markRead is fire-and-forget (non-fatal)
//   5. expenseCats.indexOf safety — falls back to first valid index instead of -1
//   6. Added WHATSAPP_APP_SECRET to env requirements (see setup guide at bottom)
//
// Environment variables required:
//   WHATSAPP_TOKEN            — Meta access token
//   WHATSAPP_PHONE_NUMBER_ID  — phone number ID
//   WHATSAPP_VERIFY_TOKEN     — webhook verify token
//   WHATSAPP_APP_SECRET       — app secret for HMAC verification (from Meta app dashboard)
//   GEMINI_API_KEY
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Supabase migrations needed (run once):
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
//   CREATE INDEX IF NOT EXISTS profiles_whatsapp_idx ON profiles(whatsapp_number);
//
//   CREATE TABLE IF NOT EXISTS wa_wizard (
//     phone       TEXT PRIMARY KEY,
//     tx_id       TEXT,
//     step        TEXT,
//     updated_at  TIMESTAMPTZ DEFAULT now()
//   );
//
//   -- Deduplication table (prevents retried messages from creating duplicate transactions)
//   CREATE TABLE IF NOT EXISTS processed_wa_messages (
//     message_id  TEXT PRIMARY KEY,
//     processed_at TIMESTAMPTZ DEFAULT now()
//   );
//   -- Auto-prune messages older than 24h (run as a cron or add to pg_cron)
//   -- DELETE FROM processed_wa_messages WHERE processed_at < now() - interval '24 hours';

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  supabaseBot,
  loadHouseholdSettings,
  parseWithGemini,
  saveTransaction,
  formatTxSummary,
  settleTrackLabel,
} from '@/lib/botUtils';
import { canUseAI, incrementUsage, getUsageSummary, FREE_MONTHLY_LIMIT } from '@/lib/planUtils';

export const maxDuration = 60;

const WA_URL = 'https://graph.facebook.com/v19.0';

// ─── HMAC signature verification ─────────────────────────────────────────────
// Meta signs every webhook POST with X-Hub-Signature-256 using your app secret.
// Without this check anyone who knows your URL can POST fake messages.
function verifySignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature || !appSecret) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ─── Deduplication ────────────────────────────────────────────────────────────
// Meta retries failed deliveries, which can create duplicate transactions.
// We mark each message_id as processed and skip if we've seen it before.
async function markProcessed(messageId: string): Promise<boolean> {
  // Returns true if this is a NEW message (not a duplicate)
  try {
    const { error } = await supabaseBot
      .from('processed_wa_messages')
      .insert({ message_id: messageId });
    // If insert fails with unique violation, we've seen this message
    if (error?.code === '23505') return false; // duplicate key
    return !error;
  } catch {
    return true; // on unexpected error, allow processing
  }
}

// ─── WhatsApp API helpers ─────────────────────────────────────────────────────
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

// Fire-and-forget — don't let a failed markRead kill the whole handler
const markRead = (messageId: string): void => {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token   = process.env.WHATSAPP_TOKEN;
  fetch(`${WA_URL}/${phoneId}/messages`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status:     'read',
      message_id: messageId,
    }),
  }).catch(() => {}); // intentionally swallowed
};

// ─── Validate sender — direct DB lookup, no full table scan ──────────────────
// This replaces the validateByWhatsApp in botUtils.ts for the webhook route.
// botUtils.ts version loads all profiles; this does a single indexed query.
async function validateSender(phone: string): Promise<{
  householdId: string;
  senderIdentity: string;
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
  };
}

// ─── Wizard state ─────────────────────────────────────────────────────────────
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

// ─── GET — Meta webhook verification challenge ────────────────────────────────
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

// ─── POST — incoming messages ─────────────────────────────────────────────────
export async function POST(request: Request) {
  // Read raw body as text first — needed for HMAC verification.
  // We cannot call request.json() after request.text().
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ ok: true }); // always 200 to Meta
  }

  // ── 1. Verify Meta's HMAC signature ────────────────────────────────────────
  const appSecret   = process.env.WHATSAPP_APP_SECRET;
  const signature   = request.headers.get('x-hub-signature-256');

  // In production, reject unverified requests.
  // In development without APP_SECRET set, skip verification (log a warning).
  if (appSecret) {
    if (!verifySignature(rawBody, signature, appSecret)) {
      console.warn('[WA webhook] Signature verification failed — possible spoofed request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('[WA webhook] WHATSAPP_APP_SECRET not set — skipping signature verification');
  }

  try {
    const body = JSON.parse(rawBody);

    // Meta sends a test ping with a different shape — acknowledge and return
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ ok: true });
    }

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    // Status updates (delivered/read receipts) — nothing to do
    if (value?.statuses) return NextResponse.json({ ok: true });

    const messages = value?.messages;
    if (!messages?.length) return NextResponse.json({ ok: true });

    const msg     = messages[0];
    const from    = msg.from;    // E.164 without + (e.g. "919876543210" for India)
    const msgId   = msg.id;
    const msgType = msg.type;

    // ── 2. Deduplicate ─────────────────────────────────────────────────────────
    // Meta retries on timeout — without this, a slow Gemini call can log duplicates
    const isNew = await markProcessed(msgId);
    if (!isNew) {
      // Already processed this message — send nothing, return 200
      return NextResponse.json({ ok: true });
    }

    // ── 3. Mark as read (fire-and-forget, non-fatal) ───────────────────────────
    markRead(msgId);

    // ── 4. Validate sender ─────────────────────────────────────────────────────
    const ctx = await validateSender(from);
    if (!ctx) {
      await send(from,
        'Hi! Your WhatsApp number is not linked to a ChillarFlow account.\n\n' +
        'Sign up at chillarflow.com and add your number in Settings → WhatsApp Integration.'
      );
      return NextResponse.json({ ok: true });
    }

    const { householdId, senderIdentity } = ctx;

    // ── 5. Load household settings ─────────────────────────────────────────────
    const { nameA, nameB, householdMode, expenseCats, quickCats } =
      await loadHouseholdSettings(householdId);
    const isJoint     = householdMode === 'joint';
    const isSolo      = householdMode === 'solo';
    const hasPartner  = !isSolo;
    const validCatSet = new Set(expenseCats);

    // ── 6. INTERACTIVE button/list replies ─────────────────────────────────────
    if (msgType === 'interactive') {
      const interactive = msg.interactive;
      const replyId = interactive?.button_reply?.id || interactive?.list_reply?.id || '';
      const wizard  = await getWizard(from);

      // Wizard step: category chosen
      if (replyId.startsWith('wiz_cat_') && wizard) {
        const catIndex = parseInt(replyId.replace('wiz_cat_', ''), 10);
        const chosen   = expenseCats[catIndex] ?? 'Miscellaneous';
        await supabaseBot.from('transactions').update({ category: chosen }).eq('id', wizard.tx_id);
        await setWizard(from, wizard.tx_id, 'account');

        const buttons: { id: string; title: string }[] = [
          { id: 'wiz_acc_PartnerA', title: nameA.slice(0, 20) },
          ...(!isSolo ? [{ id: 'wiz_acc_PartnerB', title: nameB.slice(0, 20) }] : []),
          ...(isJoint ? [{ id: 'wiz_acc_Joint',    title: 'Joint Account' }] : []),
        ].slice(0, 3);

        await sendButtons(from, 'Category: ' + chosen + '\n\nWhich account paid?', buttons);
        return NextResponse.json({ ok: true });
      }

      // Wizard step: account chosen
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
          ...(isJoint   ? [{ id: 'wiz_trk_joint',   title: 'Reimburse from pool' }] : []),
          ...(hasPartner ? [{ id: 'wiz_trk_partner', title: 'Split with partner' }] : []),
        ].slice(0, 3);

        await sendButtons(from, 'Account: ' + acct + '\n\nSettlement?', settleButtons);
        return NextResponse.json({ ok: true });
      }

      // Wizard step: settlement chosen
      if (replyId.startsWith('wiz_trk_') && wizard) {
        const track = replyId.replace('wiz_trk_', '');
        await supabaseBot.from('transactions')
          .update({
            settle_track:    track,
            to_settle:       track === 'joint',
            split_mode:      'equal',
            partner_a_share: 0.5,
            partner_b_share: 0.5,
          })
          .eq('id', wizard.tx_id);
        await clearWizard(from);

        const { data: rows } = await supabaseBot.from('transactions').select().eq('id', wizard.tx_id);
        const tx = rows?.[0];
        if (tx) await send(from, formatTxSummary(tx, nameA, nameB));
        return NextResponse.json({ ok: true });
      }

      // Edit action: change category (from /recent)
      if (replyId.startsWith('edit_cat_')) {
        const parts  = replyId.split('_');
        const catIdx = parseInt(parts[parts.length - 1], 10);
        const txId   = parts.slice(2, parts.length - 1).join('_');
        // Guard against -1 (category no longer in list after settings change)
        const cat = catIdx >= 0 && catIdx < expenseCats.length
          ? expenseCats[catIdx]
          : 'Miscellaneous';
        await supabaseBot.from('transactions').update({ category: cat }).eq('id', txId);
        await send(from, 'Category updated to: ' + cat);
        return NextResponse.json({ ok: true });
      }

      // Edit action: delete (from /recent)
      if (replyId.startsWith('edit_del_')) {
        const txId = replyId.replace('edit_del_', '');
        await supabaseBot.from('transactions').delete().eq('id', txId);
        await send(from, 'Transaction deleted.');
        return NextResponse.json({ ok: true });
      }

      // Unknown interactive — ignore
      return NextResponse.json({ ok: true });
    }

    // ── 7. TEXT MESSAGES ───────────────────────────────────────────────────────
    if (msgType !== 'text') return NextResponse.json({ ok: true });
    const rawText = (msg.text?.body || '').trim();
    if (!rawText) return NextResponse.json({ ok: true });

    const lower = rawText.toLowerCase();

    // /start, hi, hello
    if (lower === '/start' || lower === 'hi' || lower === 'hello') {
      await send(from,
        'Welcome to ChillarFlow!\n\n' +
        'Log expenses by typing naturally:\n' +
        '- 450 Zomato\n' +
        '- 1200 grocery to settle\n' +
        '- Or send a number (e.g. 500) for the guided wizard\n\n' +
        'Commands:\n' +
        '/recent - last 3 transactions\n' +
        '/summary - this month snapshot\n' +
        '/usage - AI parse usage\n' +
        '/upgrade - unlock unlimited\n' +
        '/help - all commands'
      );
      return NextResponse.json({ ok: true });
    }

    // /help
    if (lower === '/help') {
      await send(from,
        'ChillarFlow commands:\n\n' +
        '/recent - view & edit last 3 transactions\n' +
        '/summary - this month spending snapshot\n' +
        '/usage - check AI parse usage\n' +
        '/upgrade - upgrade to Pro plan\n\n' +
        'Logging syntax:\n' +
        '450 Zomato - personal expense\n' +
        '450 Zomato to settle - joint pool reimburses\n' +
        '500 - open guided wizard (always free)'
      );
      return NextResponse.json({ ok: true });
    }

    // /recent
    if (lower === '/recent') {
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
        const acct = tx.account_used === 'Partner A' ? nameA
                   : tx.account_used === 'Partner B' ? nameB
                   : 'Joint';
        const summary =
          'Rs.' + tx.amount + ' - ' + tx.category + '\n' +
          acct + ' | ' + tx.date + '\n' +
          (tx.note || '--');

        // Safe category index — indexOf returns -1 if not found
        const catIdx = expenseCats.indexOf(tx.category);
        const btns: { id: string; title: string }[] = [
          { id: 'edit_del_' + tx.id, title: 'Delete' },
          // Only include change category button if category is still in the list
          ...(catIdx >= 0 ? [{ id: 'edit_cat_' + tx.id + '_' + catIdx, title: 'Change category' }] : []),
        ];

        if (btns.length >= 1) {
          await sendButtons(from, summary, btns.slice(0, 3));
        } else {
          await send(from, summary);
        }
      }
      return NextResponse.json({ ok: true });
    }

    // /summary
    if (lower === '/summary') {
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

      const total = txs.reduce((s: number, t: any) => s + Number(t.amount), 0);
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
        txs.length + ' transaction' + (txs.length !== 1 ? 's' : '') + ' logged'
      );
      return NextResponse.json({ ok: true });
    }

    // /usage
    if (lower === '/usage') {
      const { plan, count, month } = await getUsageSummary(householdId);
      if (plan === 'pro') {
        await send(from, 'Your plan: PRO\n\nUnlimited AI parses. Thank you for supporting ChillarFlow!');
      } else {
        const remaining = Math.max(0, FREE_MONTHLY_LIMIT - count);
        const filled    = Math.round((count / FREE_MONTHLY_LIMIT) * 10);
        const bar       = Array.from({ length: 10 }, (_, i) => i < filled ? '[x]' : '[ ]').join('');
        await send(from,
          'Your plan: Free\n\n' +
          'AI parses this month (' + month + '):\n' +
          bar + '\n' +
          count + ' / ' + FREE_MONTHLY_LIMIT + ' used\n\n' +
          (remaining > 0
            ? remaining + ' parses remaining.\nSend /upgrade for unlimited.'
            : 'Limit reached! Send /upgrade to unlock unlimited,\nor send just a number for the free guided wizard.')
        );
      }
      return NextResponse.json({ ok: true });
    }

    // /upgrade
    if (lower === '/upgrade') {
      await send(from,
        'Upgrade to ChillarFlow Pro\n\n' +
        'Free: ' + FREE_MONTHLY_LIMIT + ' AI parses/month\n' +
        'Pro: Unlimited AI parses\n\n' +
        'The number wizard is always free.\n\n' +
        'Contact us to upgrade:\nteam@chillarflow.com\n\nOr visit: chillarflow.com/pricing'
      );
      return NextResponse.json({ ok: true });
    }

    // ── NUMERIC WIZARD (always free, no Gemini) ────────────────────────────────
    // Only triggers on a message that is purely a number (no text around it)
    if (/^\d+(\.\d+)?$/.test(rawText.trim())) {
      const numericAmount = parseFloat(rawText.trim());
      if (numericAmount > 0) {
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

        const wizCats = expenseCats.slice(0, 10); // WhatsApp list max 10 per section
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

    // Settlement keyword validation before calling Gemini
    if (isSolo && (lower.includes('to settle') || lower.includes('settle with'))) {
      await send(from, 'Solo mode does not support settlements. Just send: amount description');
      return NextResponse.json({ ok: true });
    }
    if (!isJoint && lower.includes('to settle')) {
      await send(from, 'No joint pool in ' + householdMode + ' mode. Use: amount description settle with ' + nameB);
      return NextResponse.json({ ok: true });
    }

    // Parse with Gemini
    const parsed = await parseWithGemini(rawText, senderIdentity, nameA, nameB, householdMode, expenseCats);
    if (!parsed.length) {
      await send(from, 'Could not parse that. Try: 450 Zomato\nOr send just a number for the guided wizard.');
      return NextResponse.json({ ok: true });
    }

    await incrementUsage(householdId);

    for (const tx of parsed) {
      if (!tx.amount || Number(tx.amount) <= 0) continue;
      const saved = await saveTransaction(tx, householdId, senderIdentity, validCatSet);
      await send(from, formatTxSummary(saved, nameA, nameB));
    }

    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error('[WA webhook] Unhandled error:', err?.message ?? err);
    return NextResponse.json({ ok: true }); // always 200 to Meta — never let it retry due to a 5xx
  }
}

// ─── SETUP GUIDE ──────────────────────────────────────────────────────────────
//
// 1. Go to https://developers.facebook.com/
// 2. Create App → Business → WhatsApp
// 3. Under WhatsApp > Getting Started:
//    - Note your Phone Number ID (WHATSAPP_PHONE_NUMBER_ID)
//    - Create a permanent token via System User (WHATSAPP_TOKEN)
// 4. Under App Settings > Basic:
//    - Copy "App Secret" (WHATSAPP_APP_SECRET) — used for HMAC verification
// 5. Under WhatsApp > Configuration > Webhooks:
//    - Callback URL: https://chillarflow.com/api/webhook/whatsapp
//    - Verify Token: any string (WHATSAPP_VERIFY_TOKEN)
//    - Subscribe to: messages
// 6. Add env vars in Vercel:
//    WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET
// 7. Run Supabase migrations (see top of file)
// 8. Add whatsapp_number field to Settings page (see Settings.tsx)
// 9. Test: send "hi" to the bot number — should get the welcome message
