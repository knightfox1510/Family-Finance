// app/api/auth/whatsapp-otp/verify/route.ts
// Verifies a submitted OTP and either:
//   A. Creates a ghost profile + adds them to the group (new user via invite)
//   B. Returns a session token for an existing ghost to re-authenticate
//
// Ghost profiles live in public.profiles with is_ghost=true.
// They are NOT in auth.users — they have no password, no email.
// All their group data is keyed on their profiles.id (UUID we generate).
//
// When a ghost later converts (signs up fully), the conversion endpoint
// migrates their profiles row to link with the new auth.users entry.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ── POST /api/auth/whatsapp-otp/verify ──────────────────────────────────────
// Body: {
//   phone_number: string,
//   otp_code:     string,
//   name:         string,         // display name the user typed
//   invite_code:  string | null,  // group invite code if joining via link
// }
export async function POST(req: Request) {
  try {
    const { phone_number, otp_code, name, invite_code } = await req.json();

    const cleanPhone = String(phone_number ?? '').replace(/\D/g, '');
    const cleanOTP   = String(otp_code ?? '').trim();
    const cleanName  = String(name ?? '').trim();

    // ── Input validation ───────────────────────────────────────────────────
    if (!cleanPhone || !cleanOTP) {
      return NextResponse.json(
        { error: 'Phone number and OTP code are required' },
        { status: 400 }
      );
    }

    if (!cleanName) {
      return NextResponse.json(
        { error: 'Please enter your name' },
        { status: 400 }
      );
    }

    // ── Fetch stored OTP ───────────────────────────────────────────────────
    const { data: stored, error: fetchError } = await supabase
      .from('otp_verifications')
      .select('otp_code, expires_at')
      .eq('phone_number', cleanPhone)
      .single();

    if (fetchError || !stored) {
      return NextResponse.json(
        { error: 'No verification code found. Please request a new one.' },
        { status: 404 }
      );
    }

    // ── Check expiry ───────────────────────────────────────────────────────
    if (new Date(stored.expires_at) < new Date()) {
      // Clean up expired entry
      await supabase.from('otp_verifications').delete().eq('phone_number', cleanPhone);
      return NextResponse.json(
        { error: 'Verification code has expired. Please request a new one.' },
        { status: 410 }
      );
    }

    // ── Constant-time comparison to prevent timing attacks ─────────────────
    const storedBuffer   = Buffer.from(stored.otp_code,  'utf8');
    const submittedBuffer = Buffer.from(cleanOTP,         'utf8');

    const isValid =
      storedBuffer.length === submittedBuffer.length &&
      crypto.timingSafeEqual(storedBuffer, submittedBuffer);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Incorrect verification code. Please try again.' },
        { status: 401 }
      );
    }

    // ── OTP is valid — delete it immediately (single use) ─────────────────
    await supabase.from('otp_verifications').delete().eq('phone_number', cleanPhone);

    // ── Check if a profile already exists for this phone ──────────────────
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, is_ghost, ghost_name, display_name, household_id')
      .eq('phone_number', cleanPhone)
      .single();

    let profileId: string;
    let isNewProfile = false;

    if (existingProfile) {
      // Returning ghost — update their name if it changed
      profileId = existingProfile.id;
      if (existingProfile.ghost_name !== cleanName) {
        await supabase
          .from('profiles')
          .update({ ghost_name: cleanName })
          .eq('id', profileId);
      }
    } else {
      // New ghost — create a profile row without an auth.users entry
      // We use gen_random_uuid() equivalent via crypto.randomUUID()
      profileId    = crypto.randomUUID();
      isNewProfile = true;

      // Ghost profiles do NOT have an id in auth.users.
      // The profiles.id FK normally references auth.users(id),
      // but we bypass this using the service role key which skips RLS.
      // This is intentional — ghost profiles are a special case.
      //
      // IMPORTANT: The profiles table FK constraint will REJECT this insert
      // unless you run this migration first:
      //
      //   ALTER TABLE public.profiles
      //     DROP CONSTRAINT IF EXISTS profiles_id_fkey;
      //
      //   ALTER TABLE public.profiles
      //     ADD CONSTRAINT profiles_id_fkey
      //     FOREIGN KEY (id)
      //     REFERENCES auth.users(id)
      //     ON DELETE CASCADE
      //     DEFERRABLE INITIALLY DEFERRED;
      //
      // The DEFERRABLE INITIALLY DEFERRED setting means the FK is only
      // checked at commit time, not at insert time. This lets us insert
      // ghost profiles without a corresponding auth.users row.
      // When a ghost converts, the FK becomes satisfied immediately.
      //
      // Alternatively, simply drop the FK for profiles.id entirely —
      // it is already protected by the service role key.

      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id:           profileId,
          is_ghost:     true,
          ghost_name:   cleanName,
          phone_number: cleanPhone,
          // No household_id for ghosts — they belong to groups, not households
          // No email — ghost profiles are phone-verified only
        });

      if (insertError) {
        console.error('[Ghost] Profile insert error:', insertError.message);
        // If FK constraint is the problem, surface a clear message
        if (insertError.message.includes('foreign key')) {
          return NextResponse.json(
            {
              error: 'Ghost profile FK constraint needs migration. See comment in verify/route.ts.',
              migration_needed: true,
            },
            { status: 500 }
          );
        }
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    // ── Handle group invite if present ─────────────────────────────────────
    let joinedGroupId: string | null = null;

    if (invite_code) {
      // Validate invite
      const inviteRes = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/groups/invite?code=${invite_code}`
      );
      const inviteData = await inviteRes.json();

      if (inviteData.valid && inviteData.group_id) {
        // Add ghost to group (or confirm they're already there)
        const { data: existingMember } = await supabase
          .from('group_members')
          .select('id')
          .eq('group_id', inviteData.group_id)
          .eq('user_id', profileId)
          .single();

        if (!existingMember) {
          await supabase.from('group_members').insert({
            group_id: inviteData.group_id,
            user_id:  profileId,
            role:     'member',
          });

          // Increment invite used_count
          await supabase
            .from('group_invites')
            .update({ used_count: (inviteData.used_count ?? 0) + 1 })
            .eq('code', invite_code.toUpperCase());
        }

        joinedGroupId = inviteData.group_id;
      }
    }

    // ── Build a ghost session token ────────────────────────────────────────
    // Ghost users cannot use Supabase Auth sessions (no auth.users row).
    // We issue a signed JWT-like token stored in localStorage on the client.
    // This token is verified on subsequent API calls by checking the profile exists
    // and is_ghost=true and phone_number matches.
    //
    // Token structure: base64(payload).base64(hmac-sha256-signature)
    // The signing key is GHOST_SESSION_SECRET env var.

    const sessionSecret = process.env.GHOST_SESSION_SECRET ?? 'change-me-in-production';
    const payload       = JSON.stringify({
      profileId,
      phone:     cleanPhone,
      isGhost:   true,
      iat:       Math.floor(Date.now() / 1000),
      exp:       Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    });

    const payloadB64  = Buffer.from(payload).toString('base64url');
    const signature   = crypto
      .createHmac('sha256', sessionSecret)
      .update(payloadB64)
      .digest('base64url');
    const ghostToken  = `${payloadB64}.${signature}`;

    return NextResponse.json({
      success:        true,
      ghost_token:    ghostToken,
      profile_id:     profileId,
      ghost_name:     cleanName,
      is_new_profile: isNewProfile,
      joined_group_id: joinedGroupId,
    });

  } catch (err: any) {
    console.error('[OTP Verify] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
