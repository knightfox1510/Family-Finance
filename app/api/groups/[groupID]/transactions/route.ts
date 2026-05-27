// app/api/groups/[groupId]/transactions/route.ts
// Handles expense logging for a specific group.
// POST: creates a group_transaction + individual transaction_splits
// GET:  returns paginated transactions with split details

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ── GET /api/groups/[groupId]/transactions ───────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const { groupId } = params;
  const url         = new URL(request.url);
  const userId      = url.searchParams.get('userId');
  const page        = parseInt(url.searchParams.get('page') ?? '0', 10);
  const pageSize    = 20;

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  // Verify membership
  const { data: member } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();

  if (!member) return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });

  // Fetch transactions with splits and payer profile
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
// Body:
// {
//   paidBy:      string (user_id),
//   description: string,
//   totalAmount: number,
//   splitType:   'equal' | 'custom' | 'itemized',
//   category:    string,
//   notes:       string,
//   receiptUrl:  string | null,
//   splits: [
//     // For 'equal'    — just list member user_ids
//     // For 'custom'   — { userId, amount }
//     // For 'itemized' — { userId, itemName, amount }
//     { userId: string, amount?: number, itemName?: string }
//   ]
// }
export async function POST(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const body        = await request.json();

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

    // ── Validation ─────────────────────────────────────────────────────────
    if (!paidBy || !description?.trim() || !totalAmount || !createdBy) {
      return NextResponse.json(
        { error: 'paidBy, description, totalAmount, and createdBy are required' },
        { status: 400 }
      );
    }

    if (totalAmount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    if (splits.length === 0) {
      return NextResponse.json({ error: 'At least one split participant required' }, { status: 400 });
    }

    // Verify creator is a group member
    const { data: member } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', createdBy)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    // ── Compute split amounts ───────────────────────────────────────────────
    let computedSplits: { userId: string; itemName: string; shareAmount: number }[] = [];

    if (splitType === 'equal') {
      const perPerson = totalAmount / splits.length;
      // Use banker's rounding to avoid penny discrepancies
      const base      = Math.floor(perPerson * 100) / 100;
      const remainder = Math.round((totalAmount - base * splits.length) * 100);

      computedSplits = splits.map((s: any, i: number) => ({
        userId:      s.userId,
        itemName:    'Shared Cost',
        shareAmount: i < remainder ? base + 0.01 : base,
      }));

    } else if (splitType === 'custom') {
      // Validate custom amounts sum to total
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
      // Each split has a specific item — amounts can vary, total must still match
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
        created_by:   createdBy,
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
      // The payer's own split is pre-settled (they already paid)
      is_settled:     s.userId === paidBy,
      settled_at:     s.userId === paidBy ? new Date().toISOString() : null,
      settled_via:    s.userId === paidBy ? 'direct_payment' : null,
    }));

    const { error: splitError } = await supabase
      .from('transaction_splits')
      .insert(splitRows);

    if (splitError) {
      // Rollback transaction if splits fail
      await supabase.from('group_transactions').delete().eq('id', transaction.id);
      return NextResponse.json({ error: splitError.message }, { status: 500 });
    }

    // ── Return enriched transaction ─────────────────────────────────────────
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

    return NextResponse.json({ transaction: enriched ?? transaction });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── DELETE /api/groups/[groupId]/transactions ────────────────────────────────
// Body: { transactionId, userId }
// Soft-delete only. Hard deletes blocked — settlement history must persist.
export async function DELETE(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const { transactionId, userId } = await request.json();

    if (!transactionId || !userId) {
      return NextResponse.json({ error: 'transactionId and userId required' }, { status: 400 });
    }

    // Only the creator or a group admin can delete
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
