// app/api/groups/[groupId]/settle/route.ts
// FIXED: member query now correctly returns ghost profiles.
// Ghost users have rows in public.profiles but NOT in auth.users.
// The nested select `profiles (...)` via a FK join can return null for ghosts
// under certain RLS policies. We fix this by querying profiles separately
// using the service-role client which bypasses RLS entirely.
//
// Ghost token support unchanged.

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
  // Support both jose JWT format and the hand-rolled HMAC format
  // Try hand-rolled first (used by whatsapp-otp/verify route)
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

  // Fall back to jose JWT verification
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

// ── GET /api/groups/[groupId]/settle ─────────────────────────────────────────
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

  // ── Fetch members — FIXED ───────────────────────────────────────────────────
  // Step 1: get all user_ids from group_members
  const { data: memberRows } = await supabase
    .from('group_members')
    .select('user_id, role')
    .eq('group_id', groupId);

  const memberUserIds = (memberRows ?? []).map((r: any) => r.user_id);

  // Step 2: fetch profiles separately using service role (bypasses RLS, works for ghosts)
  // This is the key fix — ghost profiles have no auth.users row so a FK-based
  // nested select can silently return null under RLS. Direct query always works.
  let profilesMap: Record<string, any> = {};
  if (memberUserIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, display_name, ghost_name, is_ghost, household_id')
      .in('id', memberUserIds);

    for (const p of profileRows ?? []) {
      profilesMap[p.id] = p;
    }
  }

  // Step 3: for non-ghost members whose display_name is a role string ("Partner A" / "Partner B"),
  // look up the real name from their household_settings so we show e.g. "Rahul" not "Partner A".
  const householdIds = [...new Set(
    Object.values(profilesMap)
      .filter((p: any) => !p.is_ghost && p.household_id)
      .map((p: any) => p.household_id)
  )];

  const householdSettingsMap: Record<string, any> = {};
  if (householdIds.length > 0) {
    const { data: settingsRows } = await supabase
      .from('household_settings')
      .select('household_id, settings_data')
      .in('household_id', householdIds);

    for (const row of settingsRows ?? []) {
      const s = typeof row.settings_data === 'string'
        ? JSON.parse(row.settings_data)
        : row.settings_data;
      householdSettingsMap[row.household_id] = s;
    }
  }

  // Step 4: compose member list with resolved display names
  const ROLE_STRINGS = new Set(['Partner A', 'Partner B', 'partner_a', 'partner_b']);

  const members = (memberRows ?? [])
    .map((row: any) => {
      const profile = profilesMap[row.user_id];
      if (!profile) return null;

      // For ghost users: always use ghost_name (that's the name they typed when joining)
      if (profile.is_ghost) {
        return {
          id:           profile.id,
          display_name: profile.ghost_name || profile.display_name,
          ghost_name:   profile.ghost_name,
          is_ghost:     true,
          role:         row.role,
        };
      }

      // For real users: if display_name is a role string, resolve from household settings
      let resolvedName = profile.display_name;
      if (!resolvedName || ROLE_STRINGS.has(resolvedName)) {
        const settings = householdSettingsMap[profile.household_id];
        if (settings) {
          // Match by role string to pick the right partner name
          if (profile.display_name === 'Partner B') {
            resolvedName = settings.partnerBName || settings.partnerAName || profile.display_name;
          } else {
            // Default to partnerAName for "Partner A" or any unrecognised role
            resolvedName = settings.partnerAName || profile.display_name;
          }
        }
      }

      return {
        id:           profile.id,
        display_name: resolvedName,
        ghost_name:   profile.ghost_name,
        is_ghost:     false,
        role:         row.role,
      };
    })
    .filter(Boolean);

  // ── Fetch balance view ────────────────────────────────────────────────────
  const { data: balances } = await supabase
    .from('group_net_balances')
    .select('*')
    .eq('group_id', groupId);

  // ── Fetch my unsettled splits ──────────────────────────────────────────────
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

  // ── Compute net pairs ──────────────────────────────────────────────────────
  const balanceMap: Record<string, Record<string, number>> = {};
  (balances ?? []).forEach((b: any) => {
    if (!balanceMap[b.creditor_id]) balanceMap[b.creditor_id] = {};
    balanceMap[b.creditor_id][b.debtor_id] =
      (balanceMap[b.creditor_id]?.[b.debtor_id] ?? 0) + Number(b.total_owed);
  });

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
    members,                          // ← now always includes ghost members
    my_splits:     mySplits ?? [],
    my_total_owed: (mySplits ?? []).reduce(
      (sum: number, s: any) => sum + Number(s.share_amount), 0
    ),
  });
}

// ── POST /api/groups/[groupId]/settle ────────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;

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
      return NextResponse.json({ error: 'settledBy and splitIds required' }, { status: 400 });
    }

    if (callerId && callerId !== settledBy) {
      return NextResponse.json({ error: 'settledBy must match authenticated user' }, { status: 403 });
    }

    const resolvedUserId = callerId ?? settledBy;

    const { data: member } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', resolvedUserId)
      .single();

    if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    const { data: splits, error: fetchError } = await supabase
      .from('transaction_splits')
      .select(`id, user_id, group_transactions!inner ( group_id )`)
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
