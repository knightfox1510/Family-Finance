// app/api/groups/route.ts
// CRUD for friend groups.
// All writes use service role key — handles ghost profile creation too.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ── GET /api/groups?userId=xxx ────────────────────────────────────────────────
// Returns all active groups the user belongs to, with member count
// and the latest transaction date for sorting.
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  // Fetch group IDs this user belongs to
  const { data: memberships, error: memError } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);

  if (memError) {
    return NextResponse.json({ error: memError.message }, { status: 500 });
  }

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  const groupIds = memberships.map((m) => m.group_id);

  // Fetch group details
  const { data: groups, error: groupError } = await supabase
    .from('groups')
    .select('*')
    .in('id', groupIds)
    .eq('is_archived', false)
    .order('created_at', { ascending: false });

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  // For each group, get member count and unsettled balance for this user
  const enriched = await Promise.all(
    (groups ?? []).map(async (g) => {
      const [memberRes, balanceRes, txRes] = await Promise.all([
        // Member count
        supabase
          .from('group_members')
          .select('user_id, profiles(id, display_name, ghost_name, is_ghost)',
            { count: 'exact' })
          .eq('group_id', g.id),

        // This user's unsettled balance (what they are owed or owe)
        supabase
          .from('group_net_balances')
          .select('total_owed, debtor_id, creditor_id')
          .eq('group_id', g.id)
          .or(`debtor_id.eq.${userId},creditor_id.eq.${userId}`),

        // Latest transaction date
        supabase
          .from('group_transactions')
          .select('created_at')
          .eq('group_id', g.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      // Net balance: positive = others owe you, negative = you owe others
      let netBalance = 0;
      (balanceRes.data ?? []).forEach((b: any) => {
        if (b.creditor_id === userId) netBalance += Number(b.total_owed);
        if (b.debtor_id === userId)   netBalance -= Number(b.total_owed);
      });

      return {
        ...g,
        member_count:    memberRes.count ?? 0,
        members:         (memberRes.data ?? []).map((m: any) => m.profiles).filter(Boolean),
        net_balance:     netBalance,
        last_activity:   txRes.data?.[0]?.created_at ?? g.created_at,
      };
    })
  );

  return NextResponse.json({ groups: enriched });
}

// ── POST /api/groups ──────────────────────────────────────────────────────────
// Body: { name, description?, currency?, createdBy }
// Creates the group and adds the creator as admin member.
export async function POST(request: Request) {
  try {
    const { name, description, currency = 'INR', createdBy } = await request.json();

    if (!name?.trim() || !createdBy) {
      return NextResponse.json(
        { error: 'name and createdBy required' },
        { status: 400 }
      );
    }

    // Create the group
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({
        name:        name.trim(),
        description: description?.trim() || null,
        currency,
        created_by:  createdBy,
      })
      .select()
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: groupError?.message }, { status: 500 });
    }

    // Add creator as admin member
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({
        group_id:   group.id,
        user_id:    createdBy,
        role:       'admin',
        invited_by: createdBy,
      });

    if (memberError) {
      // Rollback: delete the group if member insert fails
      await supabase.from('groups').delete().eq('id', group.id);
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    // Auto-generate an invite code for immediate sharing
    const code = 'CF-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    await supabase.from('group_invites').insert({
      group_id:   group.id,
      code,
      created_by: createdBy,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return NextResponse.json({
      group,
      invite_code: code,
      invite_url:  `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chillarflow.com'}/join?g=${code}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── PATCH /api/groups ─────────────────────────────────────────────────────────
// Body: { groupId, userId, name?, description?, is_archived? }
// Admin-only updates.
export async function PATCH(request: Request) {
  try {
    const { groupId, userId, ...updates } = await request.json();

    if (!groupId || !userId) {
      return NextResponse.json({ error: 'groupId and userId required' }, { status: 400 });
    }

    // Verify admin role
    const { data: member } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (member?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const allowed = ['name', 'description', 'is_archived', 'currency'];
    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );

    if (safeUpdates.is_archived === true) {
      safeUpdates.archived_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('groups')
      .update(safeUpdates)
      .eq('id', groupId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ group: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
