// app/api/groups/[groupId]/members/route.ts
// PATCH: update a member's role (admin only)
// DELETE: remove a member from group (admin only, can't remove last admin)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logActivity }  from '@/lib/logActivity';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function resolveUserId(request: Request, fallback: string | null): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
    if (user?.id) return user.id;
  }
  return fallback;
}

// ── PATCH — change a member's role ───────────────────────────────────────────
// Body: { callerId, targetUserId, role: 'admin' | 'member' }
export async function PATCH(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const { groupId } = params;
  const { callerId, targetUserId, role } = await request.json();
  const resolvedCaller = await resolveUserId(request, callerId ?? null);
  if (!resolvedCaller) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  // Caller must be admin
  const { data: callerMem } = await supabase
    .from('group_members').select('role').eq('group_id', groupId).eq('user_id', resolvedCaller).single();
  if (callerMem?.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  // Can't demote yourself if you're the only admin
  if (targetUserId === resolvedCaller && role === 'member') {
    const { count } = await supabase
      .from('group_members').select('*', { count: 'exact', head: true })
      .eq('group_id', groupId).eq('role', 'admin');
    if ((count ?? 0) <= 1) return NextResponse.json({ error: 'Cannot remove the only admin' }, { status: 400 });
  }

  if (!['admin', 'member'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

  await supabase.from('group_members').update({ role }).eq('group_id', groupId).eq('user_id', targetUserId);

  // Fetch names for activity
  const { data: target } = await supabase.from('profiles').select('display_name, ghost_name').eq('id', targetUserId).single();
  const { data: caller } = await supabase.from('profiles').select('display_name, ghost_name').eq('id', resolvedCaller).single();
  const targetName = target?.display_name || target?.ghost_name || 'Member';
  const callerName = caller?.display_name || caller?.ghost_name || 'Admin';

  await logActivity(groupId, resolvedCaller, 'UPDATE_SETTING',
    callerName + ' ' + (role === 'admin' ? 'promoted ' : 'demoted ') + targetName +
    (role === 'admin' ? ' to admin' : ' to member')
  );

  return NextResponse.json({ ok: true });
}

// ── DELETE — remove a member ──────────────────────────────────────────────────
// Body: { callerId, targetUserId }
export async function DELETE(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  const { groupId } = params;
  const { callerId, targetUserId } = await request.json();
  const resolvedCaller = await resolveUserId(request, callerId ?? null);
  if (!resolvedCaller) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { data: callerMem } = await supabase
    .from('group_members').select('role').eq('group_id', groupId).eq('user_id', resolvedCaller).single();
  
  const isSelf  = targetUserId === resolvedCaller;
  const isAdmin = callerMem?.role === 'admin';
  if (!isSelf && !isAdmin) return NextResponse.json({ error: 'Admin access required to remove others' }, { status: 403 });

  // Can't remove the only admin
  if (isAdmin && isSelf) {
    const { count } = await supabase
      .from('group_members').select('*', { count: 'exact', head: true })
      .eq('group_id', groupId).eq('role', 'admin');
    if ((count ?? 0) <= 1) return NextResponse.json({ error: 'Assign another admin before leaving' }, { status: 400 });
  }

  const { data: target } = await supabase.from('profiles').select('display_name, ghost_name').eq('id', targetUserId).single();
  const targetName = target?.display_name || target?.ghost_name || 'Member';

  await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', targetUserId);

  await logActivity(groupId, resolvedCaller, 'UPDATE_SETTING',
    isSelf ? targetName + ' left the group' : targetName + ' was removed from the group'
  );

  return NextResponse.json({ ok: true });
}
