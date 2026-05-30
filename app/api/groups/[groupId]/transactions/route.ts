// app/api/groups/[groupId]/transactions/route.ts  (rate-limited version)
// Patch: adds checkRateLimit() to POST (60/hour per user) and DELETE (30/hour).
// All other logic is unchanged from the original.
// Only the POST and DELETE handlers are shown here — GET is identical to original.
// ─────────────────────────────────────────────────────────────────────────────
// To apply: replace the POST export in the original file with this one,
// and add the import for rateLimiter at the top.

import { NextResponse }                          from 'next/server';
import { logActivity }                           from '@/lib/logActivity';
import { createClient }                          from '@supabase/supabase-js';
import { resolveGhostUserIdSimple }              from '@/lib/ghostToken';
import { checkRateLimit, extractRateLimitId }   from '@/lib/rateLimiter';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function resolveUserId(request: Request, fallbackUserId?: string | null): Promise<string | null> {
  const ghostToken = request.headers.get('x-ghost-token');
  if (ghostToken) return resolveGhostUserIdSimple(ghostToken, supabase);

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user?.id) return user.id;
  }

  if (fallbackUserId) {
    const { data } = await supabase
      .from('profiles').select('id').eq('id', fallbackUserId).single();
    if (data?.id) return data.id;
  }
  return null;
}

// ── GET (unchanged — no rate limit needed for reads) ─────────────────────────
export async function GET(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const { groupId } = params;
  const url         = new URL(request.url);
  const page        = parseInt(url.searchParams.get('page') ?? '0', 10);
  const pageSize    = 20;
  const urlUserId   = url.searchParams.get('userId');
  const userId      = await resolveUserId(request, urlUserId);

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data: member } = await supabase
    .from('group_members').select('id').eq('group_id', groupId).eq('user_id', userId).single();
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

// ── POST — create a group transaction (rate-limited: 60/hour per user) ────────
export async function POST(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const body = await request.json();

    const {
      paidBy, description, totalAmount,
      splitType   = 'equal',
      category    = 'Miscellaneous',
      notes       = '',
      receiptUrl  = null,
      splits      = [],
      createdBy,
    } = body;

    const fallbackId = createdBy ?? paidBy ?? null;
    const callerId   = await resolveUserId(request, fallbackId);

    if (!callerId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    // ── Rate limit: 60 transaction creates per hour per user ──────────────────
    const rateLimitId = extractRateLimitId(request, callerId);
    const rateResult  = await checkRateLimit(
      supabase,
      'group_tx',
      rateLimitId,
      60,     // max 60
      3600,   // per hour
    );

    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: rateResult.error ?? 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000)),
            'X-RateLimit-Limit':     '60',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset':     String(Math.floor(rateResult.resetAt.getTime() / 1000)),
          },
        }
      );
    }

    // ── Validation ────────────────────────────────────────────────────────────
    if (!paidBy || !description?.trim() || !totalAmount) {
      return NextResponse.json({ error: 'paidBy, description, and totalAmount are required' }, { status: 400 });
    }
    if (totalAmount <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    if (splits.length === 0) return NextResponse.json({ error: 'At least one split participant required' }, { status: 400 });

    const { data: member } = await supabase
      .from('group_members').select('id').eq('group_id', groupId).eq('user_id', callerId).single();
    if (!member) return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });

    // ── Compute splits ─────────────────────────────────────────────────────────
    let computedSplits: { userId: string; itemName: string; shareAmount: number }[] = [];

    const totalPaisa = Math.round(totalAmount * 100);

    function distributeWithRemainder(
      entries: { userId: string; itemName: string; paisaShare: number }[],
      totalPaisa: number,
    ) {
      const sumPaisa = entries.reduce((s, e) => s + e.paisaShare, 0);
      const diff = totalPaisa - sumPaisa;
      if (diff === 0) return entries.map((e) => ({ userId: e.userId, itemName: e.itemName, shareAmount: e.paisaShare / 100 }));
      let maxIdx = 0;
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].paisaShare > entries[maxIdx].paisaShare) maxIdx = i;
      }
      return entries.map((e, i) => ({
        userId:      e.userId,
        itemName:    e.itemName,
        shareAmount: (e.paisaShare + (i === maxIdx ? diff : 0)) / 100,
      }));
    }

    if (splitType === 'equal') {
      const basePaisa      = Math.floor(totalPaisa / splits.length);
      const remainderPaisa = totalPaisa - basePaisa * splits.length;
      computedSplits = splits.map((s: any, i: number) => ({
        userId:      s.userId,
        itemName:    'Shared Cost',
        shareAmount: (basePaisa + (i < remainderPaisa ? 1 : 0)) / 100,
      }));
    } else if (splitType === 'custom') {
      const rawEntries = splits.map((s: any) => ({
        userId:     s.userId,
        itemName:   'Custom Share',
        paisaShare: Math.round(Number(s.amount ?? 0) * 100),
      }));
      const sumPaisa = rawEntries.reduce((acc: number, e: any) => acc + e.paisaShare, 0);
      if (Math.abs(sumPaisa - totalPaisa) > 2) {
        return NextResponse.json({ error: `Custom split amounts must equal total` }, { status: 400 });
      }
      computedSplits = distributeWithRemainder(rawEntries, totalPaisa);
    } else if (splitType === 'itemized') {
      const rawEntries = splits.map((s: any) => ({
        userId:     s.userId,
        itemName:   s.itemName ?? 'Item',
        paisaShare: Math.round(Number(s.amount ?? 0) * 100),
      }));
      const sumPaisa = rawEntries.reduce((acc: number, e: any) => acc + e.paisaShare, 0);
      if (Math.abs(sumPaisa - totalPaisa) > 2) {
        return NextResponse.json({ error: `Itemized amounts must equal total` }, { status: 400 });
      }
      computedSplits = distributeWithRemainder(rawEntries, totalPaisa);
    }

    // ── Insert transaction ─────────────────────────────────────────────────────
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
        created_by:   createdBy ?? callerId,
      })
      .select()
      .single();

    if (txError || !transaction) {
      return NextResponse.json({ error: txError?.message ?? 'Failed to create transaction' }, { status: 500 });
    }

    // ── Insert splits ──────────────────────────────────────────────────────────
    const splitRows = computedSplits.map((s) => ({
      transaction_id: transaction.id,
      user_id:        s.userId,
      item_name:      s.itemName,
      share_amount:   s.shareAmount,
      is_settled:     s.userId === paidBy,
      settled_at:     s.userId === paidBy ? new Date().toISOString() : null,
      settled_via:    s.userId === paidBy ? 'direct_payment' : null,
    }));

    const { error: splitError } = await supabase.from('transaction_splits').insert(splitRows);
    if (splitError) {
      await supabase.from('group_transactions').delete().eq('id', transaction.id);
      return NextResponse.json({ error: splitError.message }, { status: 500 });
    }

    // ── Return enriched transaction ────────────────────────────────────────────
    const { data: enriched } = await supabase
      .from('group_transactions')
      .select(`
        *,
        payer:profiles!group_transactions_paid_by_fkey ( id, display_name, ghost_name ),
        transaction_splits (
          id, user_id, item_name, share_amount, is_settled,
          profiles!transaction_splits_user_id_fkey ( id, display_name, ghost_name )
        )
      `)
      .eq('id', transaction.id)
      .single();

    supabase.from('groups').update({ last_activity: new Date().toISOString() }).eq('id', groupId);

    const { data: payerProfile } = await supabase
      .from('profiles').select('display_name, ghost_name').eq('id', paidBy).single();
    const payerName = payerProfile?.display_name || payerProfile?.ghost_name || 'Someone';

    logActivity(
      groupId, callerId, 'ADD_EXPENSE',
      `${payerName} added '${description.trim()}' (₹${Math.round(totalAmount)})`,
      { transaction_id: transaction.id, amount: totalAmount }
    );

    return NextResponse.json(
      { transaction: enriched ?? transaction },
      {
        headers: {
          'X-RateLimit-Remaining': String(rateResult.remaining),
          'X-RateLimit-Reset':     String(Math.floor(rateResult.resetAt.getTime() / 1000)),
        },
      }
    );

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── DELETE (rate-limited: 30/hour per user) ──────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const { transactionId, userId } = await request.json();

    if (!transactionId || !userId) {
      return NextResponse.json({ error: 'transactionId and userId required' }, { status: 400 });
    }

    // Rate limit deletes at a lower threshold
    const rateResult = await checkRateLimit(supabase, 'group_tx_delete', userId, 30, 3600);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: rateResult.error ?? 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000)) } }
      );
    }

    const { data: tx } = await supabase
      .from('group_transactions').select('created_by, paid_by').eq('id', transactionId).single();

    const { data: membership } = await supabase
      .from('group_members').select('role').eq('group_id', params.groupId).eq('user_id', userId).single();

    const isOwner = tx?.created_by === userId || tx?.paid_by === userId;
    const isAdmin = membership?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Only the creator or group admin can delete transactions' }, { status: 403 });
    }

    await supabase.from('group_transactions').update({ is_deleted: true }).eq('id', transactionId);
    supabase.from('groups').update({ last_activity: new Date().toISOString() }).eq('id', params.groupId);

    const { data: deletedTx } = await supabase
      .from('group_transactions').select('description, total_amount').eq('id', transactionId).single();
    if (deletedTx) {
      logActivity(params.groupId, userId, 'DELETE_EXPENSE',
        `Deleted '${deletedTx.description}' (₹${Math.round(deletedTx.total_amount)})`);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
