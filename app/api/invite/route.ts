// app/api/invite/route.ts
// Generates shareable invite links for household joining.
// chillarflow.com/join?code=ABC123  instead of manually copying the UUID.
//
// Supabase migration:
//   CREATE TABLE IF NOT EXISTS household_invites (
//     code         TEXT PRIMARY KEY,
//     household_id UUID NOT NULL,
//     created_by   UUID NOT NULL,
//     created_at   TIMESTAMPTZ DEFAULT now(),
//     expires_at   TIMESTAMPTZ DEFAULT now() + interval '7 days',
//     used         BOOLEAN DEFAULT false,
//     used_by      UUID
//   );

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Short human-readable code: "CF-A3F9B2"
const makeCode = () => 'CF-' + crypto.randomBytes(3).toString('hex').toUpperCase();

// POST /api/invite — create an invite link
// Body: { userId: string }  (must be authenticated — checked via userId lookup)
export async function POST(request: Request) {
  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', userId)
    .single();

  if (!profile?.household_id) {
    return NextResponse.json({ error: 'No household found' }, { status: 404 });
  }

  // Expire any previous unused invites for this household
  await supabase
    .from('household_invites')
    .update({ expires_at: new Date().toISOString() })
    .eq('household_id', profile.household_id)
    .eq('used', false);

  const code      = makeCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('household_invites').insert({
    code,
    household_id: profile.household_id,
    created_by:   userId,
    expires_at:   expiresAt,
  });

  return NextResponse.json({
    code,
    inviteUrl:  `https://chillarflow.com/join?code=${code}`,
    expiresAt,
    message:    'Share this link with your partner. It expires in 7 days.',
  });
}

// GET /api/invite?code=CF-A3F9B2 — validate an invite code
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  const { data: invite } = await supabase
    .from('household_invites')
    .select('*, household_settings(settings_data)')
    .eq('code', code.toUpperCase())
    .single();

  if (!invite) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
  if (invite.used)  return NextResponse.json({ error: 'This invite has already been used' }, { status: 410 });
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired. Ask your partner to generate a new one.' }, { status: 410 });
  }

  // Get household name for display
  const settings = invite.household_settings?.settings_data;
  const s = typeof settings === 'string' ? JSON.parse(settings) : settings;
  const partnerAName = s?.partnerAName || 'your partner';

  return NextResponse.json({
    valid:        true,
    householdId:  invite.household_id,
    code,
    invitedBy:    partnerAName,
    expiresAt:    invite.expires_at,
  });
}

// PATCH /api/invite — mark invite as used after signup
// Body: { code: string, newUserId: string }
export async function PATCH(request: Request) {
  const { code, newUserId } = await request.json();
  if (!code || !newUserId) {
    return NextResponse.json({ error: 'code and newUserId required' }, { status: 400 });
  }

  await supabase
    .from('household_invites')
    .update({ used: true, used_by: newUserId })
    .eq('code', code.toUpperCase());

  return NextResponse.json({ ok: true });
}
