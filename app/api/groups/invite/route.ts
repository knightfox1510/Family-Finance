// app/api/groups/invite/members/route.ts
// Public endpoint used by the /join page to show real member avatars.
// Returns minimal profile info (id, first name initial, avatar_url) for a group.
// No auth required — this is intentionally public for the invite preview UX.
// Sensitive fields (email, phone) are never returned.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const ROLE_STRINGS = new Set(['Partner A', 'Partner B', 'partner_a', 'partner_b']);

export async function GET(request: Request) {
  const groupId = new URL(request.url).searchParams.get('groupId');
  if (!groupId) {
    return NextResponse.json({ error: 'groupId required' }, { status: 400 });
  }

  // Verify the group exists and has an active invite
  const { data: invite } = await supabase
    .from('group_invites')
    .select('id')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .single();

  if (!invite) {
    // No active invite — don't expose member info
    return NextResponse.json({ members: [] });
  }

  const { data: rows } = await supabase
    .from('group_members')
    .select(`
      user_id,
      profiles (
        id,
        display_name,
        ghost_name,
        avatar_url,
        household_id
      )
    `)
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true })
    .limit(8); // only need enough for avatar stack

  if (!rows) return NextResponse.json({ members: [] });

  // Collect household IDs to resolve real names from settings
  const householdIds = [...new Set(
    (rows ?? [])
      .map((r: any) => r.profiles?.household_id)
      .filter(Boolean)
  )];

  const settingsMap: Record<string, any> = {};
  if (householdIds.length > 0) {
    const { data: settingsRows } = await supabase
      .from('household_settings')
      .select('household_id, settings_data')
      .in('household_id', householdIds);

    for (const row of settingsRows ?? []) {
      const s = typeof row.settings_data === 'string'
        ? JSON.parse(row.settings_data)
        : row.settings_data;
      settingsMap[row.household_id] = s;
    }
  }

  const members = (rows ?? []).map((row: any) => {
    const p = row.profiles;
    if (!p) return null;

    let displayName = p.display_name;

    // Resolve real name from household settings if display_name is a role string
    if (!displayName || ROLE_STRINGS.has(displayName)) {
      const s = settingsMap[p.household_id];
      if (s) {
        const isPartnerB = displayName === 'Partner B' || displayName === 'partner_b';
        displayName = isPartnerB
          ? (s.partnerBName || s.partnerAName || displayName)
          : (s.partnerAName || displayName);
      }
    }

    // Only return first name for privacy on public invite page
    const firstName = (displayName || p.ghost_name || 'Member').split(' ')[0];

    return {
      id:           p.id,
      display_name: firstName,
      ghost_name:   p.ghost_name,
      avatar_url:   p.avatar_url ?? null,
    };
  }).filter(Boolean);

  return NextResponse.json({ members });
}
