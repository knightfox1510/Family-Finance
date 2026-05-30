// app/api/groups/route.ts  (rate-limited patch — POST only)
// Adds rate limiting to POST /groups: max 10 new groups per day per user.
// GET, PATCH, DELETE are unchanged from the original.

import { NextResponse }                          from 'next/server';
import { createClient }                          from '@supabase/supabase-js';
import { checkRateLimit, extractRateLimitId }   from '@/lib/rateLimiter';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ── GET (unchanged) ──────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data: memberships, error: memErr } = await supabase
    .from('group_members').select('group_id').eq('user_id', userId);
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
  if (!memberships?.length) return NextResponse.json({ groups: [] });

  const groupIds = memberships.map((m) => m.group_id);

  const { data: groups, error: grpErr } = await supabase
    .from('groups')
    .select('*')
    .in('id', groupIds)
    .eq('is_archived', false)
    .order('created_at', { ascending: false });

  if (grpErr) return NextResponse.json({ error: grpErr.message }, { status: 500 });

  const enriched = await Promise.all((groups ?? []).map(async (g) => {
    const { data: memberRows } = await supabase
      .from('group_members').select('user_id, role').eq('group_id', g.id);

    const memberIds = (memberRows ?? []).map((r: any) => r.user_id);
    let members: any[] = [];
    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles').select('id, display_name, ghost_name, is_ghost').in('id', memberIds);
      members = profiles ?? [];
    }

    const { data: balances } = await supabase
      .from('group_net_balances').select('creditor_id, debtor_id, total_owed').eq('group_id', g.id);

    const net = (balances ?? []).reduce((sum: number, b: any) => {
      if (b.creditor_id === userId) return sum + Number(b.total_owed);
      if (b.debtor_id   === userId) return sum - Number(b.total_owed);
      return sum;
    }, 0);

    return {
      ...g,
      members,
      member_count:  members.length,
      net_balance:   Math.round(net * 100) / 100,
      last_activity: g.last_activity ?? g.created_at,
    };
  }));

  return NextResponse.json({ groups: enriched.filter(Boolean) });
}

// ── POST — create group (rate-limited: 10 per 24h per user) ──────────────────
export async function POST(request: Request) {
  try {
    const { name, description, currency = 'INR', createdBy } = await request.json();

    if (!name || !createdBy) {
      return NextResponse.json({ error: 'name and createdBy required' }, { status: 400 });
    }

    // ── Rate limit: 10 group creates per 24 hours ─────────────────────────────
    const rateResult = await checkRateLimit(
      supabase,
      'group_create',
      extractRateLimitId(request, createdBy),
      10,     // max 10
      86400,  // per 24 hours
    );

    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: rateResult.error ?? 'You have reached the group creation limit for today.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000)),
            'X-RateLimit-Limit':     '10',
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    const { data: group, error: grpErr } = await supabase
      .from('groups')
      .insert({ name, description, currency, created_by: createdBy, last_activity: new Date().toISOString() })
      .select()
      .single();

    if (grpErr || !group) {
      return NextResponse.json({ error: grpErr?.message ?? 'Failed to create group' }, { status: 500 });
    }

    const { error: memErr } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: createdBy, role: 'admin' });

    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    const inviteCode  = 'CF-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const inviteExp   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await supabase.from('group_invites').insert({
      group_id:   group.id,
      code:       inviteCode,
      created_by: createdBy,
      expires_at: inviteExp,
    });

    const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.chillarflow.com';
    const inviteUrl  = `${siteUrl}/join?g=${inviteCode}`;

    return NextResponse.json(
      { group, invite_url: inviteUrl },
      {
        status: 201,
        headers: { 'X-RateLimit-Remaining': String(rateResult.remaining) },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── PATCH (unchanged) ────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { groupId, userId, ...updates } = body;

    if (!groupId || !userId) {
      return NextResponse.json({ error: 'groupId and userId required' }, { status: 400 });
    }

    const { data: member } = await supabase
      .from('group_members').select('role').eq('group_id', groupId).eq('user_id', userId).single();

    if (!member) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    const allowed = ['name', 'description', 'is_archived', 'currency', 'simplify_debts'];
    const safeUpdates: Record<string, any> = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    if (safeUpdates.is_archived === true)  safeUpdates.archived_at = new Date().toISOString();
    if (safeUpdates.is_archived === false) safeUpdates.archived_at = null;

    const { error: updateErr } = await supabase
      .from('groups').update(safeUpdates).eq('id', groupId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── DELETE (unchanged) ───────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const { groupId, userId } = await request.json();
    if (!groupId || !userId) {
      return NextResponse.json({ error: 'groupId and userId required' }, { status: 400 });
    }

    const { data: member } = await supabase
      .from('group_members').select('role').eq('group_id', groupId).eq('user_id', userId).single();

    if (!member || member.role !== 'admin') {
      return NextResponse.json({ error: 'Only group admins can delete groups' }, { status: 403 });
    }

    const { error } = await supabase.from('groups').delete().eq('id', groupId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
