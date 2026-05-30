// app/api/notifications/subscribe/route.ts
// Manages Web Push subscriptions.
//
// POST   /api/notifications/subscribe  — save or update a subscription
// DELETE /api/notifications/subscribe  — remove a subscription by endpoint

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getAuthUser(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
    if (user) return user;
  }

  // Fall back to cookie-based session
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

// ── POST — save or upsert a push subscription ─────────────────────────────────
export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    const { householdId, endpoint, p256dh, auth_key, userAgent } = body;

    if (!endpoint || !p256dh || !auth_key) {
      return NextResponse.json(
        { error: 'endpoint, p256dh, and auth_key are required' },
        { status: 400 }
      );
    }

    // Resolve household from user if not provided
    let hId = householdId;
    if (!hId && user?.id) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();
      hId = profile?.household_id;
    }

    if (!hId) {
      return NextResponse.json({ error: 'Could not resolve household' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        {
          household_id: hId,
          user_id:      user?.id ?? null,
          endpoint,
          p256dh,
          auth_key,
          user_agent:   userAgent ?? null,
          updated_at:   new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('[Push subscribe] DB error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Push subscribe] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE — remove a subscription by endpoint ────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const { endpoint } = await req.json();

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
    }

    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Push unsubscribe] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
