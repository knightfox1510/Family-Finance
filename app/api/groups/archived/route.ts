// app/api/groups/archived/route.ts
// Returns archived groups for a user.
// Kept separate from the main groups route to avoid bloating the active list query.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data: memberships } = await supabase
    .from('group_members').select('group_id').eq('user_id', userId);
  if (!memberships?.length) return NextResponse.json({ groups: [] });

  const groupIds = memberships.map((m) => m.group_id);

  const { data: groups } = await supabase
    .from('groups')
    .select('*')
    .in('id', groupIds)
    .eq('is_archived', true)           // ← only archived
    .order('archived_at', { ascending: false });

  // Attach member count
  const enriched = await Promise.all((groups ?? []).map(async (g) => {
    const { count } = await supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', g.id);
    return { ...g, member_count: count ?? 0 };
  }));

  return NextResponse.json({ groups: enriched });
}
