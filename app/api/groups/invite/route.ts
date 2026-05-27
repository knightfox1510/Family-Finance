// app/api/groups/invite/route.ts
// Generate and validate group invite links.
// Mirrors the pattern in app/api/invite/route.ts but for friend groups.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chillarflow.com';

// ── GET /api/groups/invite?code=CF-XXXXXX ────────────────────────────────────
// Validates an invite code and returns group preview info.
// Called when someone lands on /join?g=CF-XXXXXX before signing up.
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'code required' }, { status: 400 });
  }

  const { data: invite, error } = await supabase
    .from('group_invites')
    .select(`
      id,
      code,
      expires_at,
      used_count,
      max_uses,
      is_active,
      group_id,
      groups (
        id,
        name,
        description,
        currency,
        created_by,
        profiles!groups_created_by_fkey (
          display_name,
          ghost_name
        )
      )
    `)
    .eq('code', code.toUpperCase())
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
  }

  if (!invite.is_active) {
    return NextResponse.json({ error: 'This invite link has been deactivated' }, { status: 410 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'This invite has expired. Ask the group admin to generate a new one.' },
      { status: 410 }
    );
  }

  if (invite.used_count >= invite.max_uses) {
    return NextResponse.json({ error: 'This invite link has reached its usage limit' }, { status: 410 });
  }

  // Get current member count for the preview
  const { count: memberCount } = await supabase
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', invite.group_id);

  const group = invite.groups as any;
  const creatorName =
    group?.profiles?.display_name ||
    group?.profiles?.ghost_name ||
    'Someone';

  return NextResponse.json({
    valid:        true,
    code:         invite.code,
    group_id:     invite.group_id,
    group_name:   group?.name,
    description:  group?.description,
    currency:     group?.currency ?? 'INR',
    invited_by:   creatorName,
    member_count: memberCount ?? 0,
    expires_at:   invite.expires_at,
  });
}

// ── POST /api/groups/invite ───────────────────────────────────────────────────
// Body: { groupId, userId }
// Generates a new invite link. Existing active links for this group remain valid
// (groups support multiple simultaneous invite links unlike households).
export async function POST(request: Request) {
  try {
    const { groupId, userId } = await request.json();

    if (!groupId || !userId) {
      return NextResponse.json({ error: 'groupId and userId required' }, { status: 400 });
    }

    // Verify the user is a member (any role can generate invites)
    const { data: member } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'You are not a member of this group' }, { status: 403 });
    }

    const code      = 'CF-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invite, error } = await supabase
      .from('group_invites')
      .insert({
        group_id:   groupId,
        code,
        created_by: userId,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      code,
      invite_url: `${SITE_URL}/join?g=${code}`,
      expires_at: expiresAt,
      message:    'Share this link. It expires in 7 days and can be used up to 50 times.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── PATCH /api/groups/invite ──────────────────────────────────────────────────
// Body: { code, newUserId, displayName? }
// Called after a user signs up or logs in via an invite link.
// Adds them to the group and increments used_count.
export async function PATCH(request: Request) {
  try {
    const { code, newUserId, displayName } = await request.json();

    if (!code || !newUserId) {
      return NextResponse.json({ error: 'code and newUserId required' }, { status: 400 });
    }

    // Validate invite is still usable
    const { data: invite } = await supabase
      .from('group_invites')
      .select('id, group_id, used_count, max_uses, expires_at, is_active')
      .eq('code', code.toUpperCase())
      .single();

    if (!invite?.is_active || new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite is no longer valid' }, { status: 410 });
    }

    if (invite.used_count >= invite.max_uses) {
      return NextResponse.json({ error: 'Invite usage limit reached' }, { status: 410 });
    }

    // Check if already a member (idempotent — safe to call twice)
    const { data: existing } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', invite.group_id)
      .eq('user_id', newUserId)
      .single();

    if (!existing) {
      // Add to group
      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id:   invite.group_id,
          user_id:    newUserId,
          role:       'member',
        });

      if (memberError) {
        return NextResponse.json({ error: memberError.message }, { status: 500 });
      }

      // Increment used_count
      await supabase
        .from('group_invites')
        .update({ used_count: invite.used_count + 1 })
        .eq('id', invite.id);
    }

    return NextResponse.json({
      ok:       true,
      group_id: invite.group_id,
      message:  existing ? 'Already a member' : 'Added to group successfully',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
