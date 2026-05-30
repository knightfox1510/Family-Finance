// app/api/groups/invite/route.ts
// FIX: GET now resolves the creator's real display_name via a fallback chain:
//   1. household_settings.partnerAName / partnerBName  (setup wizard names)
//   2. profiles.display_name  (raw stored value)
//   3. profiles.ghost_name
//   4. "Someone"
// This prevents "Partner A invited you" from appearing on the join page.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chillarflow.com';

// Role strings that should never be shown to outsiders
const ROLE_STRINGS = new Set(['Partner A', 'Partner B', 'partner_a', 'partner_b']);

async function resolveCreatorName(creatorId: string): Promise<string> {
  // 1. Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, ghost_name, household_id')
    .eq('id', creatorId)
    .single();

  if (!profile) return 'Someone';

  const dn = profile.display_name ?? '';
  const gn = profile.ghost_name ?? '';

  // 2. If display_name is a real name (not a role string), use it directly
  if (dn && !ROLE_STRINGS.has(dn)) return dn;

  // 3. Try household_settings for the real partner name
  if (profile.household_id) {
    const { data: settings } = await supabase
      .from('household_settings')
      .select('settings_data')
      .eq('household_id', profile.household_id)
      .single();

    if (settings?.settings_data) {
      const s = typeof settings.settings_data === 'string'
        ? JSON.parse(settings.settings_data)
        : settings.settings_data;

      // Partner A is always the group creator in normal flow
      const nameA = s.partnerAName;
      if (nameA && !ROLE_STRINGS.has(nameA)) return nameA;
    }
  }

  // 4. Fall back to ghost_name or generic
  return gn || 'Someone';
}

// ── GET /api/groups/invite?code=CF-XXXXXX ────────────────────────────────────
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
      created_by,
      groups (
        id,
        name,
        description,
        currency,
        created_by
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

  const { count: memberCount } = await supabase
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', invite.group_id);

  const group = invite.groups as any;

  // Resolve a real human name for the invite creator
  const creatorId   = invite.created_by ?? group?.created_by;
  const creatorName = creatorId ? await resolveCreatorName(creatorId) : 'Someone';

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
export async function POST(request: Request) {
  try {
    const { groupId, userId } = await request.json();

    if (!groupId || !userId) {
      return NextResponse.json({ error: 'groupId and userId required' }, { status: 400 });
    }

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
export async function PATCH(request: Request) {
  try {
    const { code, newUserId, displayName } = await request.json();

    if (!code || !newUserId) {
      return NextResponse.json({ error: 'code and newUserId required' }, { status: 400 });
    }

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

    const { data: existing } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', invite.group_id)
      .eq('user_id', newUserId)
      .single();

    if (!existing) {
      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: invite.group_id,
          user_id:  newUserId,
          role:     'member',
        });

      if (memberError) {
        return NextResponse.json({ error: memberError.message }, { status: 500 });
      }

      // Update the new member's display_name in profiles if a real name is provided
      // and the current display_name is still a role string or blank
      if (displayName) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', newUserId)
          .single();

        const currentDn = prof?.display_name ?? '';
        if (!currentDn || ROLE_STRINGS.has(currentDn)) {
          await supabase
            .from('profiles')
            .update({ display_name: displayName })
            .eq('id', newUserId);
        }
      }

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
