// app/api/groups/members/route.ts
// Returns all members of a group with their profile data.
// Ghost token support: pass x-ghost-token header instead of Authorization.
// Fix 8 applied: ghost token now verified via resolveGhostUserId from lib/ghostToken.ts
//
// GET /api/groups/members?groupId=<uuid>&userId=<uuid>

import { NextResponse }       from 'next/server';
import { createClient }       from '@supabase/supabase-js';
import { resolveGhostUserIdSimple } from '@/lib/ghostToken';


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function resolveUserId(request: Request, fallback: string | null): Promise<string | null> {
  const ghostToken = request.headers.get('x-ghost-token');
  if (ghostToken) return resolveGhostUserIdSimple(ghostToken, supabase);

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    return user?.id ?? null;
  }

  return fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupId   = searchParams.get('groupId');
  const rawUserId = searchParams.get('userId');

  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 });

  const userId = await resolveUserId(request, rawUserId);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { data: membership } = await supabase
    .from('group_members').select('id').eq('group_id', groupId).eq('user_id', userId).single();

  if (!membership) return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });

  const { data: rows, error } = await supabase
    .from('group_members')
    .select(`
      user_id,
      role,
      joined_at,
      profiles (
        id,
        display_name,
        ghost_name,
        is_ghost,
        phone_number,
        email
      )
    `)
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('[groups/members] DB error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const members = (rows ?? [])
    .map((row: any) => {
      const profile = row.profiles;
      if (!profile) return null;
      return {
        id:           profile.id,
        display_name: profile.display_name,
        ghost_name:   profile.ghost_name,
        is_ghost:     profile.is_ghost ?? false,
        role:         row.role,
        joined_at:    row.joined_at,
        // phone_number and email omitted for privacy
      };
    })
    .filter(Boolean);

  return NextResponse.json({ members, count: members.length });
}
