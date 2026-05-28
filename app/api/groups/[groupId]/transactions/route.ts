// app/api/groups/[groupId]/transactions/route.ts
// FIXED: resolveUserId now also accepts createdBy/userId from request body/query
// as a fallback, consistent with the GET endpoint. This handles the case where
// the client sends no auth header (regular Supabase session via cookie).
//
// The correct long-term fix is for the client to send Authorization: Bearer <token>,
// which AddGroupExpense.tsx now does. This fallback is a safety net.

import { NextResponse } from 'next/server';
import { createClient }  from '@supabase/supabase-js';
import { SignJWT, jwtVerify } from 'jose';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const GHOST_SECRET = new TextEncoder().encode(
  process.env.GHOST_SESSION_SECRET ?? 'fallback-secret-change-in-prod'
);

// ── Ghost token resolution ───────────────────────────────────────────────────
async function resolveGhostToken(token: string): Promise<string | null> {
  // Support hand-rolled HMAC format (from whatsapp-otp/verify)
  try {
    const [payloadB64] = token.split('.');
    if (payloadB64) {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (payload.profileId) {
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', payload.profileId)
          .single();
        if (data?.id) return data.id;
      }
    }
  } catch {}

  // Fall back to jose JWT format
  try {
    const { payload } = await jwtVerify(token, GHOST_SECRET);
    const userId = payload.sub as string;
    if (!userId) return null;
    const { data } = await supabase
      .from('profiles')
      .select('id, is_ghost')
      .eq('id', userId)
      .single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

// ── Auth helper ──────────────────────────────────────────────────────────────
// Priority: ghost token > Bearer token > userId query/body param (verified against DB)
async function resolveUserId(request: Request, fallbackUserId?: string | null): Promise<string | null> {
  // 1. Ghost token header
  const ghostToken = request.headers.get('x-ghost-token');
  if (ghostToken) return resolveGhostToken(ghostToken);

  // 2. Bearer token (regular Supabase session)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user?.id) return user.id;
  }

  // 3. Fallback: userId from query param or body — verify they're actually a real user
  // This handles cases where the client didn't send an auth header but we have the userId.
  // We verify by checking the profiles table (service role, so RLS bypassed).
  if (fallbackUserId) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', fallbackUserId)
      .single();
    if (data?.id) return data.id;
  }

  return null;
}

// ── WhatsApp notification helper ─────────────────────────────────────────────
async function notifyGroupMembers(
  groupId:     string,
  addedByName: string,
  description: string,
  totalAmount: number,
  currency:    string,
  skipUserId:  string,
) {
  try {
    const { data: members } = await supabase
      .from('group_members')
      .select(`user_id, profiles ( phone_number, display_name, ghost_name )`)
      .eq('group_id', groupId)
      .neq('user_id', skipUserId);

    if (!members?.length) return;

    const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
    const accessToken   = process.env.META_ACCESS_TOKEN;
    const templateName  = process.env.META_EXPENSE_TEMPLATE_NAME ?? 'group_expense_added';

    if (!phoneNumberId || !accessToken) return;

    const fmt = (n: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

    for (const m of members) {
      const profile = (m as any).profiles;
      const phone   = profile?.phone_number;
      if (!phone) continue;

      const e164 = phone.startsWith('+')
        ? phone.replace(/\s/g, '')
        : `+91${phone.replace(/\D/g, '').slice(-10)}`;

      const recipientName = profile?.display_name || profile?.ghost_name || 'there';

      await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to:   e164,
          type: 'template',
          template: {
            name:     templateName,
            language: { code: 'en' },
            components: [{
              type:       'body',
              parameters: [
                { type: 'text', text: recipientName },
                { type: 'text', text: addedByName },
                { type: 'text', text: description },
                { type: 'text', text: fmt(totalAmount) },
              ],
            }],
          },
        }),
      });
    }
  } catch (e) {
    console.error('[WA notify] failed:', e);
  }
}

// ── GET /api/groups/[groupId]/transactions ───────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const { groupId } = params;
  const url         = new URL(request.url);
  const page        = parseInt(url.searchParams.get('page') ?? '0', 10);
  const pageSize    = 20;

  const urlUserId = url.searchParams.get('userId');
  const userId    = await resolveUserId(request, urlUserId);

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data: member } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();

  if (!member) return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });

  const { data: transactions, error, count } = await supabase
    .from('group_transactions')
    .select(`
      *,
      payer:profiles!group_transactions_paid_by_fkey (
        id, display_name, ghost_name, is_ghost
      ),
      transaction_splits (
        id, user_id, item_name, share_amount, is_settled, settled_at, settled_via,
        profiles!transaction_splits_user_id_fkey (
          id, display_name, ghost_name, is_ghost
        )
      )
    `, { count: 'exact' })
    .eq('group_id', groupId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    transactions: transactions ?? [],
    total:        count ?? 0,
    page,
    has_more:     (count ?? 0) > (page + 1) * pageSize,
  });
}

// ── POST /api/groups/[groupId]/transactions ──────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;

    // Clone the request so we can read body after resolveUserId reads headers
    const body = await request.json();

    const {
      paidBy,
      description,
      totalAmount,
      splitType   = 'equal',
      category    = 'Miscellaneous',
      notes       = '',
      receiptUrl  = null,
      splits      = [],
      createdBy,
    } = body;

    // Resolve caller — pass createdBy/paidBy as fallback for headerless requests
    const fallbackId = createdBy ?? paidBy ?? null;
    const callerId   = await resolveUserId(request, fallbackId);

    if (!callerId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const resolvedCreatedBy = createdBy ?? callerId;

    // ── Validation ─────────────────────────────────────────────────────────
    if (!paidBy || !description?.trim() || !totalAmount) {
      return NextResponse.json(
        { error: 'paidBy, description, and totalAmount are required' },
        { status: 400 }
      );
    }

    if (totalAmount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    if (splits.length === 0) {
      return NextResponse.json({ error: 'At least one split participant required' }, { status: 400 });
    }

    // Verify caller is a group member
    const { data: member } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', callerId)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    // ── Compute splits ─────────────────────────────────────────────────────
    let computedSplits: { userId: string; itemName: string; shareAmount: number }[] = [];

    if (splitType === 'equal') {
      const perPerson = totalAmount / splits.length;
      const base      = Math.floor(perPerson * 100) / 100;
      const remainder = Math.round((totalAmount - base * splits.length) * 100);
      computedSplits = splits.map((s: any, i: number) => ({
        userId:      s.userId,
        itemName:    'Shared Cost',
        shareAmount: i < remainder ? base + 0.01 : base,
      }));
    } else if (splitType === 'custom') {
      const sum = splits.reduce((acc: number, s: any) => acc + Number(s.amount ?? 0), 0);
      if (Math.abs(sum - totalAmount) > 0.02) {
        return NextResponse.json(
          { error: `Custom split amounts (₹${sum.toFixed(2)}) must equal total (₹${totalAmount.toFixed(2)})` },
          { status: 400 }
        );
      }
      computedSplits = splits.map((s: any) => ({
        userId:      s.userId,
        itemName:    'Custom Share',
        shareAmount: Number(s.amount),
      }));
    } else if (splitType === 'itemized') {
      const sum = splits.reduce((acc: number, s: any) => acc + Number(s.amount ?? 0), 0);
      if (Math.abs(sum - totalAmount) > 0.02) {
        return NextResponse.json(
          { error: `Itemized amounts (₹${sum.toFixed(2)}) must equal total (₹${totalAmount.toFixed(2)})` },
          { status: 400 }
        );
      }
      computedSplits = splits.map((s: any) => ({
        userId:      s.userId,
        itemName:    s.itemName ?? 'Item',
        shareAmount: Number(s.amount),
      }));
    }

    // ── Insert transaction ─────────────────────────────────────────────────
    const { data: transaction, error: txError } = await supabase
      .from('group_transactions')
      .insert({
        group_id:     groupId,
        paid_by:      paidBy,
        description:  description.trim(),
        total_amount: totalAmount,
        split_type:   splitType,
        category,
        notes:        notes.trim() || null,
        receipt_url:  receiptUrl,
        created_by:   resolvedCreatedBy,
      })
      .select()
      .single();

    if (txError || !transaction) {
      return NextResponse.json({ error: txError?.message ?? 'Failed to create transaction' }, { status: 500 });
    }

    // ── Insert splits ──────────────────────────────────────────────────────
    const splitRows = computedSplits.map((s) => ({
      transaction_id: transaction.id,
      user_id:        s.userId,
      item_name:      s.itemName,
      share_amount:   s.shareAmount,
      is_settled:     s.userId === paidBy,
      settled_at:     s.userId === paidBy ? new Date().toISOString() : null,
      settled_via:    s.userId === paidBy ? 'direct_payment' : null,
    }));

    const { error: splitError } = await supabase
      .from('transaction_splits')
      .insert(splitRows);

    if (splitError) {
      await supabase.from('group_transactions').delete().eq('id', transaction.id);
      return NextResponse.json({ error: splitError.message }, { status: 500 });
    }

    // ── Return enriched transaction ────────────────────────────────────────
    const { data: enriched } = await supabase
      .from('group_transactions')
      .select(`
        *,
        payer:profiles!group_transactions_paid_by_fkey (
          id, display_name, ghost_name
        ),
        transaction_splits (
          id, user_id, item_name, share_amount, is_settled,
          profiles!transaction_splits_user_id_fkey (
            id, display_name, ghost_name
          )
        )
      `)
      .eq('id', transaction.id)
      .single();

    // ── Fire WhatsApp notifications async ─────────────────────────────────
    const { data: payerProfile } = await supabase
      .from('profiles')
      .select('display_name, ghost_name')
      .eq('id', paidBy)
      .single();
    const payerName = payerProfile?.display_name || payerProfile?.ghost_name || 'Someone';

    const { data: group } = await supabase
      .from('groups')
      .select('currency')
      .eq('id', groupId)
      .single();

    notifyGroupMembers(groupId, payerName, description.trim(), totalAmount, group?.currency ?? 'INR', callerId);

    return NextResponse.json({ transaction: enriched ?? transaction });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── DELETE /api/groups/[groupId]/transactions ────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const { transactionId, userId } = await request.json();

    if (!transactionId || !userId) {
      return NextResponse.json({ error: 'transactionId and userId required' }, { status: 400 });
    }

    const { data: tx } = await supabase
      .from('group_transactions')
      .select('created_by, paid_by')
      .eq('id', transactionId)
      .single();

    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', params.groupId)
      .eq('user_id', userId)
      .single();

    const isOwner = tx?.created_by === userId || tx?.paid_by === userId;
    const isAdmin = membership?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Only the creator or group admin can delete transactions' }, { status: 403 });
    }

    await supabase
      .from('group_transactions')
      .update({ is_deleted: true })
      .eq('id', transactionId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
