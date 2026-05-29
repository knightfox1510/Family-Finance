// app/api/groups/[groupId]/transactions/[txId]/route.ts
// PATCH: edit a single group transaction (creator/admin only)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logActivity }  from '@/lib/logActivity';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function resolveUserId(request: Request, fallback: string | null): Promise<string | null> {
  const ghostToken = request.headers.get('x-ghost-token');
  if (ghostToken) {
    try {
      const [payloadB64] = ghostToken.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (payload.profileId) {
        const { data } = await supabase.from('profiles').select('id').eq('id', payload.profileId).single();
        if (data?.id) return data.id;
      }
    } catch {}
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    if (user?.id) return user.id;
  }
  return fallback;
}

export async function PATCH(
  request: Request,
  { params }: { params: { groupId: string; txId: string } }
) {
  try {
    const { groupId, txId } = params;
    const body = await request.json();
    const { description, totalAmount, category, paidBy, userId: bodyUserId } = body;

    const callerId = await resolveUserId(request, bodyUserId ?? null);
    if (!callerId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    // Fetch existing transaction
    const { data: tx } = await supabase
      .from('group_transactions')
      .select('id, group_id, created_by, paid_by, total_amount, description')
      .eq('id', txId)
      .eq('is_deleted', false)
      .single();

    if (!tx)                  return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    if (tx.group_id !== groupId) return NextResponse.json({ error: 'Not in this group' }, { status: 403 });

    // Permission: creator, payer, or admin
    const isCreator = tx.created_by === callerId || tx.paid_by === callerId;
    const { data: mem } = await supabase.from('group_members').select('role').eq('group_id', groupId).eq('user_id', callerId).single();
    if (!isCreator && mem?.role !== 'admin') {
      return NextResponse.json({ error: 'Only the creator or a group admin can edit this transaction' }, { status: 403 });
    }

    // Update transaction fields
    const updates: Record<string, any> = {};
    if (description?.trim()) updates.description  = description.trim();
    if (category)             updates.category    = category;
    if (paidBy)               updates.paid_by     = paidBy;
    const newTotal = totalAmount ? Number(totalAmount) : null;
    if (newTotal && newTotal > 0) updates.total_amount = newTotal;

    const { error: updErr } = await supabase.from('group_transactions').update(updates).eq('id', txId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // Rebalance unsettled splits if amount changed
    if (newTotal && newTotal !== tx.total_amount) {
      const { data: splits } = await supabase
        .from('transaction_splits').select('id, is_settled').eq('transaction_id', txId);
      const unsettled = (splits ?? []).filter((s: any) => !s.is_settled);
      if (unsettled.length > 0) {
        const totalPaisa  = Math.round(newTotal * 100);
        const basePaisa   = Math.floor(totalPaisa / unsettled.length);
        const remainPaisa = totalPaisa - basePaisa * unsettled.length;
        for (let i = 0; i < unsettled.length; i++) {
          await supabase.from('transaction_splits')
            .update({ share_amount: (basePaisa + (i < remainPaisa ? 1 : 0)) / 100 })
            .eq('id', unsettled[i].id);
        }
      }
    }

    // If paidBy changed, update the payer's own split settlement status
    if (paidBy && paidBy !== tx.paid_by) {
      // Mark old payer's split as unsettled, new payer's split as settled
      await supabase.from('transaction_splits')
        .update({ is_settled: false, settled_at: null, settled_via: null })
        .eq('transaction_id', txId).eq('user_id', tx.paid_by);
      await supabase.from('transaction_splits')
        .update({ is_settled: true, settled_at: new Date().toISOString(), settled_via: 'direct_payment' })
        .eq('transaction_id', txId).eq('user_id', paidBy);
    }

    logActivity(groupId, callerId, 'ADD_EXPENSE',
      'Edited \'' + (updates.description ?? tx.description) + '\'' +
      (newTotal ? ' → ₹' + Math.round(newTotal) : '')
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
