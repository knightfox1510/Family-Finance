// app/api/groups/[groupId]/settle/route.ts
// Handles settlement between group members.
// GET:  returns the net balance matrix for all members in a group
// POST: marks specific splits as settled
//
// Ghost token support:
//   Ghost users send x-ghost-token header. Their userId is resolved from the JWT.
//   Ghosts can GET balances and POST settlements (same as real members).

import { NextResponse } from 'next/server';
import { createClient }  from '@supabase/supabase-js';
import { jwtVerify }     from 'jose';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const GHOST_SECRET = new TextEncoder().encode(
  process.env.GHOST_SESSION_SECRET ?? 'fallback-secret-change-in-prod'
);

async function resolveGhostToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, GHOST_SECRET);
    const userId = payload.sub as string;
    if (!userId) return null;
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

async function resolveUserId(request: Request, fallbackParam?: string | null): Promise<string | null> {
  const ghostToken = request.headers.get('x-ghost-token');
  if (ghostToken) return resolveGhostToken(ghostToken);
  if (fallbackParam) return fallbackParam;
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    return user?.id ?? null;
  }
  return null;
}

// ── GET /api/groups/[groupId]/settle?userId=xxx ──────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const { groupId } = params;
  const urlUserId   = new URL(request.url).searchParams.get('userId');
  const userId      = await resolveUserId(request, urlUserId);

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  // Verify membership
  const { data: member } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();

  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  // Fetch net balances from the pre-computed view
  const { data: balances } = await supabase
    .from('group_net_balances')
    .select('*')
    .eq('group_id', groupId);

  // Fetch all members for the balance matrix display
  const { data: members } = await supabase
    .from('group_members')
    .select(`
      user_id,
      role,
      profiles (id, display_name, ghost_name, is_ghost)
    `)
    .eq('group_id', groupId);

  // Fetch this user's unsettled splits (what they owe others)
  const { data: mySplits } = await supabase
    .from('transaction_splits')
    .select(`
      id,
      share_amount,
      item_name,
      is_settled,
      transaction_id,
      group_transactions!inner (
        id,
        description,
        total_amount,
        category,
        created_at,
        paid_by,
        payer:profiles!group_transactions_paid_by_fkey (
          id, display_name, ghost_name
        )
      )
    `)
    .eq('user_id', userId)
    .eq('is_settled', false)
    .eq('group_transactions.group_id', groupId)
    .eq('group_transactions.is_deleted', false);

  // Compute simplified net balance pairs
  const balanceMap: Record<string, Record<string, number>> = {};
  (balances ?? []).forEach((b: any) => {
    if (!balanceMap[b.creditor_id]) balanceMap[b.creditor_id] = {};
    balanceMap[b.creditor_id][b.debtor_id] =
      (balanceMap[b.creditor_id]?.[b.debtor_id] ?? 0) + Number(b.total_owed);
  });

  // Simplify: cancel out A→B and B→A to get net direction
  const netPairs: { creditor: string; debtor: string; amount: number }[] = [];
  const processed = new Set<string>();

  Object.entries(balanceMap).forEach(([creditorId, debtors]) => {
    Object.entries(debtors).forEach(([debtorId, amount]) => {
      const pairKey = [creditorId, debtorId].sort().join('_');
      if (processed.has(pairKey)) return;
      processed.add(pairKey);

      const reverse = balanceMap[debtorId]?.[creditorId] ?? 0;
      const net     = amount - reverse;

      if (net > 0.01) {
        netPairs.push({ creditor: creditorId, debtor: debtorId, amount: net });
      } else if (net < -0.01) {
        netPairs.push({ creditor: debtorId, debtor: creditorId, amount: -net });
      }
    });
  });

  return NextResponse.json({
    net_pairs:     netPairs,
    members:       (members ?? []).map((m: any) => m.profiles).filter(Boolean),
    my_splits:     mySplits ?? [],
    my_total_owed: (mySplits ?? []).reduce(
      (sum: number, s: any) => sum + Number(s.share_amount), 0
    ),
  });
}

// ── POST /api/groups/[groupId]/settle ────────────────────────────────────────
// Body:
// {
//   settledBy:  string (user_id doing the settling),
//   splitIds:   string[] (specific transaction_split IDs to mark settled),
//   settledVia: 'upi' | 'cash' | 'manual',
//   note:       string (optional)
// }
// Ghost users: send x-ghost-token header. settledBy must match ghost's resolved userId.
export async function POST(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;

    // Resolve caller identity
    const ghostToken = request.headers.get('x-ghost-token');
    let callerId: string | null = null;
    if (ghostToken) {
      callerId = await resolveGhostToken(ghostToken);
      if (!callerId) {
        return NextResponse.json({ error: 'Invalid or expired ghost token' }, { status: 401 });
      }
    }

    const { settledBy, splitIds, settledVia = 'manual', note } = await request.json();

    if (!settledBy || !splitIds?.length) {
      return NextResponse.json(
        { error: 'settledBy and splitIds required' },
        { status: 400 }
      );
    }

    // If ghost: ensure settledBy matches resolved ghost userId (prevent spoofing)
    if (callerId && callerId !== settledBy) {
      return NextResponse.json({ error: 'settledBy must match authenticated user' }, { status: 403 });
    }

    const resolvedUserId = callerId ?? settledBy;

    // Verify membership
    const { data: member } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', resolvedUserId)
      .single();

    if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    // Verify all splits belong to this user and this group
    const { data: splits, error: fetchError } = await supabase
      .from('transaction_splits')
      .select(`
        id, user_id,
        group_transactions!inner ( group_id )
      `)
      .in('id', splitIds)
      .eq('user_id', resolvedUserId)
      .eq('group_transactions.group_id', groupId);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!splits || splits.length !== splitIds.length) {
      return NextResponse.json(
        { error: 'Some splits are invalid or do not belong to you' },
        { status: 400 }
      );
    }

    // Mark all as settled
    const { error: updateError } = await supabase
      .from('transaction_splits')
      .update({
        is_settled:  true,
        settled_at:  new Date().toISOString(),
        settled_via: note ? `${settledVia}: ${note}` : settledVia,
      })
      .in('id', splitIds);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { data: remainingUnsettled } = await supabase
      .from('transaction_splits')
      .select('id, share_amount')
      .eq('user_id', resolvedUserId)
      .eq('is_settled', false);

    return NextResponse.json({
      ok:               true,
      settled_count:    splitIds.length,
      remaining_splits: remainingUnsettled?.length ?? 0,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
