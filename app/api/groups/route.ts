// app/api/groups/route.ts
// Patches applied:
//  - 'simplify_debts' added to PATCH allowed list (for GroupSettingsSheet)
//  - archived_at set to null when is_archived is set back to false (restore)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ── GET /api/groups?userId=xxx ─────────────────────────────────────────────
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  // Get all groups this user belongs to
  const { data: memberships, error: memErr } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
  if (!memberships?.length) return NextResponse.json({ groups: [] });

  const groupIds = memberships.map((m) => m.group_id);

  const { data: groups, error: grpErr } = await supabase
    .from('groups')
    .select('*')
    .in('id', groupIds)
    .eq('is_archived', false)           // active groups only
    .order('created_at', { ascending: false });   // last_activity col optional

  if (grpErr) return NextResponse.json({ error: grpErr.message }, { status: 500 });

  // Enrich each group with member list and net balance for current user
  const enriched = await Promise.all((groups ?? []).map(async (g) => {
    // Wrap entire enrichment so one failing group doesn't break the whole list
    // Members
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('user_id, role')
      .eq('group_id', g.id);

    const memberIds = (memberRows ?? []).map((r: any) => r.user_id);
    let members: any[] = [];
    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, ghost_name, is_ghost')
        .in('id', memberIds);
      members = profiles ?? [];
    }

    // Net balance for this user in this group
    const { data: balances } = await supabase
      .from('group_net_balances')
      .select('creditor_id, debtor_id, total_owed')
      .eq('group_id', g.id);

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

  // Filter out any null entries from enrichment failures
  const validGroups = enriched.filter(Boolean);

  return NextResponse.json({ groups: validGroups });
}

// ── POST /api/groups ────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const { name, description, currency = 'INR', createdBy } = await request.json();
    if (!name || !createdBy) {
      return NextResponse.json({ error: 'name and createdBy required' }, { status: 400 });
    }

    // Create the group
    const { data: group, error: grpErr } = await supabase
      .from('groups')
      .insert({ name, description, currency, created_by: createdBy, last_activity: new Date().toISOString() })
      .select()
      .single();

    if (grpErr || !group) {
      return NextResponse.json({ error: grpErr?.message ?? 'Failed to create group' }, { status: 500 });
    }

    // Add creator as admin member
    const { error: memErr } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: createdBy, role: 'admin' });

    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    // Generate invite token
    const inviteToken = Buffer.from(
      JSON.stringify({ groupId: group.id, createdAt: Date.now() })
    ).toString('base64url');

    const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.chillarflow.com';
    const inviteUrl = `${baseUrl}/join?token=${inviteToken}`;

    return NextResponse.json({ group, invite_url: inviteUrl }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── PATCH /api/groups ───────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { groupId, userId, ...updates } = body;

    if (!groupId || !userId) {
      return NextResponse.json({ error: 'groupId and userId required' }, { status: 400 });
    }

    // Verify requester is a member (admin check only for sensitive fields if needed)
    const { data: member } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    // Whitelist what can be updated via this route
    // 'simplify_debts' added so GroupSettingsSheet can save the toggle
    const allowed = ['name', 'description', 'is_archived', 'currency', 'simplify_debts'];
    const safeUpdates: Record<string, any> = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Auto-set / clear archived_at timestamp
    if (safeUpdates.is_archived === true) {
      safeUpdates.archived_at = new Date().toISOString();
    }
    // Clear archived_at when restoring a group
    if (safeUpdates.is_archived === false) {
      safeUpdates.archived_at = null;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('groups')
      .update(safeUpdates)
      .eq('id', groupId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ group: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── DELETE /api/groups ──────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const { groupId, userId } = await request.json();
    if (!groupId || !userId) {
      return NextResponse.json({ error: 'groupId and userId required' }, { status: 400 });
    }

    // Only admin can delete
    const { data: member } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

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
