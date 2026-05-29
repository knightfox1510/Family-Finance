// app/api/groups/[groupId]/transactions/[txId]/flag/route.ts
// POST: flag a transaction for review (any member)
// DELETE: unflag/resolve a flagged transaction (admin or creator only)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logActivity }  from '@/lib/logActivity';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function resolveUserId(request: Request, fallback: string | null): Promise<string | null> {
  const ghostToken = request.headers.get('x-ghost-token');
  if (ghostToken) {
    try {
      const [p64] = ghostToken.split('.');
      const payload = JSON.parse(Buffer.from(p64, 'base64url').toString('utf8'));
      if (payload.profileId) {
        const { data } = await supabase.from('profiles').select('id').eq('id', payload.profileId).single();
        if (data?.id) return data.id;
      }
    } catch {}
  }
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
    if (user?.id) return user.id;
  }
  return fallback;
}

// ── POST — flag a transaction for review ──────────────────────────────────────
// Body: { userId, reason }
export async function POST(
  request: Request,
  { params }: { params: { groupId: string; txId: string } }
) {
  try {
    const { groupId, txId } = params;
    const body              = await request.json().catch(() => ({}));
    const { reason, userId: bodyUserId } = body;

    const callerId = await resolveUserId(request, bodyUserId ?? null);
    if (!callerId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    // Must be a group member
    const { data: mem } = await supabase
      .from('group_members').select('id').eq('group_id', groupId).eq('user_id', callerId).single();
    if (!mem) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    // Fetch transaction
    const { data: tx } = await supabase
      .from('group_transactions').select('id, group_id, description, created_by, paid_by, is_flagged')
      .eq('id', txId).eq('is_deleted', false).single();
    if (!tx || tx.group_id !== groupId) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    if (tx.is_flagged) return NextResponse.json({ error: 'Already flagged' }, { status: 409 });

    // Can't flag your own transaction
    if (tx.created_by === callerId || tx.paid_by === callerId) {
      return NextResponse.json({ error: 'You cannot flag your own transaction' }, { status: 400 });
    }

    const { error: updateErr } = await supabase.from('group_transactions').update({
      is_flagged:  true,
      flag_reason: reason?.trim() || null,
      flagged_by:  callerId,
      flagged_at:  new Date().toISOString(),
    }).eq('id', txId);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // Fetch flagger name for activity log
    const { data: flagger } = await supabase.from('profiles')
      .select('display_name, ghost_name').eq('id', callerId).single();
    const flaggerName = flagger?.display_name || flagger?.ghost_name || 'Someone';

    logActivity(groupId, callerId, 'UPDATE_SETTING',
      flaggerName + ' flagged \'' + tx.description + '\' for review' +
      (reason?.trim() ? ': ' + reason.trim() : '')
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[flag POST]', err);
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 });
  }
}

// ── DELETE — resolve/unflag a transaction (admin or creator only) ─────────────
export async function DELETE(
  request: Request,
  { params }: { params: { groupId: string; txId: string } }
) {
  try {
    const { groupId, txId } = params;
    const body              = await request.json().catch(() => ({}));
    const callerId          = await resolveUserId(request, body.userId ?? null);
    if (!callerId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data: mem } = await supabase
      .from('group_members').select('role').eq('group_id', groupId).eq('user_id', callerId).single();
    const { data: tx } = await supabase
      .from('group_transactions').select('id, group_id, description, created_by, paid_by')
      .eq('id', txId).single();

    if (!tx || tx.group_id !== groupId) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    const isCreator = tx.created_by === callerId || tx.paid_by === callerId;
    const isAdmin   = mem?.role === 'admin';
    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: 'Only the creator or a group admin can resolve flags' }, { status: 403 });
    }

    const { error: updateErr } = await supabase.from('group_transactions').update({
      is_flagged:  false,
      flag_reason: null,
      flagged_by:  null,
      flagged_at:  null,
    }).eq('id', txId);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    const { data: resolver } = await supabase.from('profiles')
      .select('display_name, ghost_name').eq('id', callerId).single();
    const resolverName = resolver?.display_name || resolver?.ghost_name || 'Someone';

    logActivity(groupId, callerId, 'UPDATE_SETTING',
      resolverName + ' resolved flag on \'' + tx.description + '\''
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[flag DELETE]', err);
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 });
  }
}
