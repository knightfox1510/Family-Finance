// app/api/groups/[groupId]/settle/route.ts  (rate-limited patch)
// Adds rate limiting to POST /settle: max 20 per hour per user.
// GET is unchanged (reads don't need limiting).
// Import additions at the top; POST handler gains the rate-limit check.

import { NextResponse }    from 'next/server';
import { logActivity }     from '@/lib/logActivity';
import { createClient }    from '@supabase/supabase-js';
import { computeNetDebts } from '@/lib/debtEngine';
import {
  resolveGhostUserIdSimple,
  resolveGhostUserId,
  shouldRefreshToken,
  issueRefreshedToken,
} from '@/lib/ghostToken';
import { checkRateLimit, extractRateLimitId } from '@/lib/rateLimiter';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function resolveUserId(request: Request, fallback?: string | null): Promise<string | null> {
  const ghostToken = request.headers.get('x-ghost-token');
  if (ghostToken) return resolveGhostUserIdSimple(ghostToken, supabase);

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    if (user?.id) return user.id;
  }
  return fallback ?? null;
}

// ── GET (unchanged) ──────────────────────────────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const { groupId } = params;
  const urlUserId   = new URL(request.url).searchParams.get('userId');
  const userId      = await resolveUserId(request, urlUserId);

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data: member } = await supabase
    .from('group_members').select('id').eq('group_id', groupId).eq('user_id', userId).single();
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  let shouldSimplify = false;
  try {
    const { data: groupConfig } = await supabase
      .from('groups').select('simplify_debts').eq('id', groupId).single();
    if (groupConfig?.simplify_debts != null) shouldSimplify = groupConfig.simplify_debts;
  } catch {}

  const { data: memberRows } = await supabase
    .from('group_members').select('user_id, role').eq('group_id', groupId);

  const memberUserIds = (memberRows ?? []).map((r: any) => r.user_id);
  let profilesMap: Record<string, any> = {};
  if (memberUserIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, display_name, ghost_name, is_ghost, household_id')
      .in('id', memberUserIds);
    for (const p of profileRows ?? []) profilesMap[p.id] = p;
  }

  const ROLE_STRINGS = new Set(['Partner A', 'Partner B', 'partner_a', 'partner_b']);
  const householdIds = [...new Set(
    Object.values(profilesMap)
      .filter((p: any) => !p.is_ghost && p.household_id)
      .map((p: any) => p.household_id)
  )];

  const householdSettingsMap: Record<string, any> = {};
  if (householdIds.length > 0) {
    const { data: settingsRows } = await supabase
      .from('household_settings').select('household_id, settings_data').in('household_id', householdIds);
    for (const row of settingsRows ?? []) {
      const s = typeof row.settings_data === 'string' ? JSON.parse(row.settings_data) : row.settings_data;
      householdSettingsMap[row.household_id] = s;
    }
  }

  const members = (memberRows ?? []).map((row: any) => {
    const profile = profilesMap[row.user_id];
    if (!profile) return null;
    if (profile.is_ghost) {
      return { id: profile.id, display_name: profile.ghost_name || profile.display_name, ghost_name: profile.ghost_name, is_ghost: true, role: row.role };
    }
    let resolvedName = profile.display_name;
    if (!resolvedName || ROLE_STRINGS.has(resolvedName)) {
      const settings = householdSettingsMap[profile.household_id];
      if (settings) {
        resolvedName = profile.display_name === 'Partner B'
          ? (settings.partnerBName || settings.partnerAName || profile.display_name)
          : (settings.partnerAName || profile.display_name);
      }
    }
    return { id: profile.id, display_name: resolvedName, ghost_name: profile.ghost_name, is_ghost: false, role: row.role };
  }).filter(Boolean);

  const { data: balances } = await supabase
    .from('group_net_balances').select('*').eq('group_id', groupId);

  const netPairs = computeNetDebts(balances ?? [], shouldSimplify);

  const { data: mySplits } = await supabase
    .from('transaction_splits')
    .select(`
      id, share_amount, item_name, is_settled, transaction_id,
      group_transactions!inner (
        id, description, total_amount, category, created_at, paid_by,
        payer:profiles!group_transactions_paid_by_fkey ( id, display_name, ghost_name )
      )
    `)
    .eq('user_id', userId)
    .eq('is_settled', false)
    .eq('group_transactions.group_id', groupId)
    .eq('group_transactions.is_deleted', false);

  return NextResponse.json({
    net_pairs:      netPairs,
    members,
    my_splits:      mySplits ?? [],
    my_total_owed:  (mySplits ?? []).reduce((sum: number, s: any) => sum + Number(s.share_amount), 0),
    simplify_debts: shouldSimplify,
  });
}

// ── POST (rate-limited: 20/hour per user) ────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const ghostToken  = request.headers.get('x-ghost-token');
    let callerId: string | null = null;
    let ghostResult: Awaited<ReturnType<typeof resolveGhostUserId>> = null;

    if (ghostToken) {
      ghostResult = await resolveGhostUserId(ghostToken, supabase);
      if (!ghostResult) return NextResponse.json({ error: 'Invalid or expired ghost token' }, { status: 401 });
      callerId = ghostResult.profileId;
    } else {
      callerId = await resolveUserId(request);
    }

    if (!callerId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    // ── Rate limit: 20 settle actions per hour ────────────────────────────────
    const rateLimitId = extractRateLimitId(request, callerId);
    const rateResult  = await checkRateLimit(
      supabase,
      'group_settle',
      rateLimitId,
      20,    // max 20
      3600,  // per hour
    );

    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: rateResult.error ?? 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000)),
            'X-RateLimit-Limit':     '20',
            'X-RateLimit-Remaining': '0',
          },
        }
      );
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
      .from('group_members').select('id').eq('group_id', groupId).eq('user_id', resolvedUserId).single();
    if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    const { data: splits, error: fetchError } = await supabase
      .from('transaction_splits')
      .select(`id, user_id, group_transactions!inner ( group_id )`)
      .in('id', splitIds)
      .eq('user_id', resolvedUserId)
      .eq('group_transactions.group_id', groupId);

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
    if (!splits || splits.length !== splitIds.length) {
      return NextResponse.json({ error: 'Some splits are invalid or do not belong to you' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('transaction_splits')
      .update({
        is_settled:  true,
        settled_at:  new Date().toISOString(),
        settled_via: note ? `${settledVia}: ${note}` : settledVia,
      })
      .in('id', splitIds);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const { data: remainingUnsettled } = await supabase
      .from('transaction_splits').select('id, share_amount').eq('user_id', resolvedUserId).eq('is_settled', false);

    logActivity(
      groupId, resolvedUserId, 'SETTLE_DEBT',
      `Recorded a settlement of ${splitIds.length} item${splitIds.length !== 1 ? 's' : ''}`,
      { split_ids: splitIds, method: settledVia }
    );

    const responseHeaders: Record<string, string> = {
      'X-RateLimit-Remaining': String(rateResult.remaining),
    };
    if (ghostResult && shouldRefreshToken(ghostResult.exp)) {
      responseHeaders['x-ghost-token-refreshed'] = issueRefreshedToken(
        ghostResult.profileId,
        ghostResult.phone,
      );
    }

    return NextResponse.json(
      { ok: true, settled_count: splitIds.length, remaining_splits: remainingUnsettled?.length ?? 0 },
      { headers: responseHeaders }
    );

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
