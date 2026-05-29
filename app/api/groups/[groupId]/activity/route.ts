// app/api/groups/[groupId]/activity/route.ts
// GET: paginated activity log for a group
// Supports ghost token auth (x-ghost-token header) and Bearer token

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const GHOST_SECRET = new TextEncoder().encode(
  process.env.GHOST_SESSION_SECRET ?? 'fallback-secret-change-in-prod'
);

async function resolveGhostToken(token: string): Promise<string | null> {
  // Format 1: hand-rolled HMAC (profileId in payload)
  try {
    const [payloadB64, sig] = token.split('.');
    if (payloadB64 && sig) {
      // Verify HMAC signature before trusting payload
      const key = await crypto.subtle.importKey(
        'raw',
        GHOST_SECRET,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const sigBytes = Buffer.from(sig, 'base64url');
      const valid = await crypto.subtle.verify('HMAC', key, sigBytes, Buffer.from(payloadB64));
      if (valid) {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        if (payload.profileId) {
          const { data } = await supabase.from('profiles').select('id').eq('id', payload.profileId).single();
          if (data?.id) return data.id;
        }
      }
    }
  } catch {}

  // Format 2: jose JWT
  try {
    const { payload } = await jwtVerify(token, GHOST_SECRET);
    const userId = payload.sub as string;
    if (!userId) return null;
    const { data } = await supabase.from('profiles').select('id').eq('id', userId).single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

async function resolveUserId(request: Request, fallback?: string | null): Promise<string | null> {
  const ghostToken = request.headers.get('x-ghost-token');
  if (ghostToken) return resolveGhostToken(ghostToken);

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    if (user?.id) return user.id;
  }

  return fallback ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const url         = new URL(request.url);
    const page        = parseInt(url.searchParams.get('page') ?? '0', 10);
    const limit       = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50);
    const urlUserId   = url.searchParams.get('userId');

    const userId = await resolveUserId(request, urlUserId);
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    // Verify membership
    const { data: member } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    // Fetch activities with actor profile join
    const { data: activities, error, count } = await supabase
      .from('group_activities')
      .select(`
        id,
        user_id,
        action_type,
        description,
        meta,
        created_at,
        actor:profiles!group_activities_user_id_fkey (
          id,
          display_name,
          ghost_name,
          is_ghost,
          avatar_url
        )
      `, { count: 'exact' })
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (error) {
      console.error('[activity GET] DB error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      activities: activities ?? [],
      total:      count ?? 0,
      page,
      has_more:   (count ?? 0) > (page + 1) * limit,
    });
  } catch (err: any) {
    console.error('[activity GET] error:', err);
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 });
  }
}
