// app/api/groups/[groupId]/transactions/[txId]/route.ts
// PATCH: edit an existing group transaction (creator or admin only)
// DELETE: soft-delete a transaction (creator or admin only)
// Fix 8 applied: resolveGhostToken replaced with resolveGhostUserId from lib/ghostToken.ts

import { NextResponse }       from 'next/server';
import { createClient }       from '@supabase/supabase-js';
import { logActivity }        from '@/lib/logActivity';
import { resolveGhostUserId } from '@/lib/ghostToken';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function resolveUserId(request: Request, fallback?: string | null): Promise<string | null> {
  const ghostToken = request.headers.get('x-ghost-token');
  if (ghostToken) return resolveGhostUserId(ghostToken, supabase);

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    if (user?.id) return user.id;
  }
  return fallback ?? null;
}

// ── PATCH /api/groups/[groupId]/transactions/[txId] ──────────────────────────
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
    const { data: tx, error: txErr } = await supabase
      .from('group_transactions')
      .select('id, group_id, created_by, paid_by, total_amount, description, split_type')
      .eq('id', txId)
      .eq('is_deleted', false)
      .single();

    if (txErr || !tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    if (tx.group_id !== groupId) return NextResponse.json({ error: 'Transaction not in this group' }, { status: 403 });

    const isCreator = tx.created_by === callerId || tx.paid_by === callerId;
    const { data: mem } = await supabase
      .from('group_members').select('role').eq('group_id', groupId).eq('user_id', callerId).single();
    const isAdmin = mem?.role === 'admin';

    if (!isCreator && !isAdmin) {
      return NextResponse.json(
        { error: 'Only the expense creator or a group admin can edit this transaction' },
        { status: 403 }
      );
    }

    const updates: Record<string, any> = {};
    if (description?.trim()) updates.description  = description.trim();
    if (category)             updates.category    = category;
    if (paidBy)               updates.paid_by     = paidBy;

    const newTotal = totalAmount ? Number(totalAmount) : null;
    if (newTotal && newTotal > 0) updates.total_amount = newTotal;

    const { error: updErr } = await supabase
      .from('group_transactions').update(updates).eq('id', txId);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // If amount changed, rebalance unsettled splits equally
    if (newTotal && newTotal !== tx.total_amount) {
      const { data: splits } = await supabase
        .from('transaction_splits').select('id, user_id, is_settled').eq('transaction_id', txId);

      const unsettled = (splits ?? []).filter((s) => !s.is_settled);
      if (unsettled.length > 0) {
        const totalPaisa  = Math.round(newTotal * 100);
        const basePaisa   = Math.floor(totalPaisa / unsettled.length);
        const remainPaisa = totalPaisa - basePaisa * unsettled.length;

        for (let i = 0; i < unsettled.length; i++) {
          await supabase
            .from('transaction_splits')
            .update({ share_amount: (basePaisa + (i < remainPaisa ? 1 : 0)) / 100 })
            .eq('id', unsettled[i].id);
        }
      }
    }

    logActivity(
      groupId, callerId, 'ADD_EXPENSE',
      `Edited '${updates.description ?? tx.description}'` +
      (newTotal ? ` → ₹${Math.round(newTotal)}` : ''),
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── DELETE /api/groups/[groupId]/transactions/[txId] ─────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: { groupId: string; txId: string } }
) {
  try {
    const { groupId, txId } = params;
    const body     = await request.json().catch(() => ({}));
    const callerId = await resolveUserId(request, body.userId ?? null);
    if (!callerId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data: tx } = await supabase
      .from('group_transactions')
      .select('created_by, paid_by, description, total_amount')
      .eq('id', txId)
      .single();

    const { data: membership } = await supabase
      .from('group_members').select('role').eq('group_id', groupId).eq('user_id', callerId).single();

    const isOwner = tx?.created_by === callerId || tx?.paid_by === callerId;
    const isAdmin = membership?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Only the creator or group admin can delete transactions' }, { status: 403 });
    }

    await supabase.from('group_transactions').update({ is_deleted: true }).eq('id', txId);
    supabase.from('groups').update({ last_activity: new Date().toISOString() }).eq('id', groupId);

    if (tx) {
      logActivity(
        groupId, callerId, 'DELETE_EXPENSE',
        `Deleted '${tx.description}' (₹${Math.round(tx.total_amount)})`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
