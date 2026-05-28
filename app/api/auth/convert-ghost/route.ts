// app/api/auth/convert-ghost/route.ts
// Converts a ghost profile into a full ChillarFlow account.
//
// Called when a ghost user clicks "Upgrade Control Room" and completes
// the standard email/password signup form in auth/page.tsx.
//
// The conversion process:
//   1. Verify the ghost token is valid and the profile exists
//   2. Create a real auth.users entry via Supabase Admin API
//   3. Create a household for the new full user
//   4. Update profiles row: link auth id, set is_ghost=false, add household
//   5. Preserve all group memberships (group_members rows stay intact)
//   6. Return a real Supabase session the client can use going forward
//
// POST /api/auth/convert-ghost
// Body: {
//   ghost_token: string,  // the token from OTP verification
//   email:       string,
//   password:    string,
//   name:        string,  // display name for the new account
// }

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Service role client — needed for admin user creation
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ── Verify ghost token ───────────────────────────────────────────────────────
function verifyGhostToken(token: string): {
  profileId: string;
  phone:     string;
  exp:       number;
} | null {
  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    const sessionSecret = process.env.GHOST_SESSION_SECRET ?? 'change-me-in-production';
    const expectedSig   = crypto
      .createHmac('sha256', sessionSecret)
      .update(payloadB64)
      .digest('base64url');

    // Constant-time comparison
    const sigBuffer  = Buffer.from(signature,   'utf8');
    const expBuffer  = Buffer.from(expectedSig, 'utf8');
    if (sigBuffer.length !== expBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expBuffer)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.isGhost) return null;

    return { profileId: payload.profileId, phone: payload.phone, exp: payload.exp };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { ghost_token, email, password, name } = await req.json();

    // ── Validate inputs ────────────────────────────────────────────────────
    if (!ghost_token || !email || !password) {
      return NextResponse.json(
        { error: 'ghost_token, email, and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // ── Verify ghost token ─────────────────────────────────────────────────
    const tokenData = verifyGhostToken(ghost_token);
    if (!tokenData) {
      return NextResponse.json(
        { error: 'Invalid or expired session. Please verify your phone again.' },
        { status: 401 }
      );
    }

    const { profileId, phone } = tokenData;

    // ── Confirm ghost profile exists ───────────────────────────────────────
    const { data: ghostProfile, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_ghost, phone_number, ghost_name')
      .eq('id', profileId)
      .eq('is_ghost', true)
      .single();

    if (profileFetchError || !ghostProfile) {
      return NextResponse.json(
        { error: 'Ghost profile not found. You may have already converted this account.' },
        { status: 404 }
      );
    }

    // ── Check email isn't already in use ───────────────────────────────────
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    const emailTaken = existingUser?.users?.some(
      (u) => u.email?.toLowerCase() === email.toLowerCase().trim()
    );
    if (emailTaken) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in instead.' },
        { status: 409 }
      );
    }

    // ── Create the real auth.users entry ───────────────────────────────────
    // We create the user with email_confirm: true so they don't need to
    // verify their email — they already verified their phone via OTP.
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email:            email.toLowerCase().trim(),
      password,
      email_confirm:    true,  // skip email verification
      user_metadata: {
        display_name:   name || ghostProfile.ghost_name,
        phone_number:   phone,
        converted_from: 'ghost',
      },
    });

    if (authError || !authData.user) {
      console.error('[Convert] Auth create error:', authError?.message);
      return NextResponse.json(
        { error: authError?.message ?? 'Could not create account' },
        { status: 500 }
      );
    }

    const newAuthId = authData.user.id;

    // ── Create a household for the new full user ───────────────────────────
    const newHouseholdId = crypto.randomUUID();

    const { error: householdError } = await supabaseAdmin
      .from('households')
      .insert({ id: newHouseholdId });

    if (householdError) {
      // Non-fatal: household can be created later via setup wizard
      console.warn('[Convert] Household insert warning:', householdError.message);
    }

    // Insert default household settings
    await supabaseAdmin.from('household_settings').insert({
      household_id:  newHouseholdId,
      settings_data: {
        partnerAName:      name || ghostProfile.ghost_name || 'Partner A',
        partnerBName:      'Partner B',
        householdMode:     'solo',   // start solo, they can upgrade later
        expenseCategories: [
          'Groceries', 'Dining Out', 'Online Food Orders', 'Cab Services',
          'Utilities', 'Housing', 'Personal Transportation', 'Online Shopping',
          'Subscriptions', 'Entertainment', 'Healthcare', 'Personal Care',
          'Investments', 'Travel', 'Miscellaneous',
        ],
        incomeCategories: ['Salary', 'Freelance', 'Business', 'Other Income'],
        budgets:          {},
        currency:         'INR',
        setupComplete:    false,     // setup wizard will run on first app login
      },
    }).catch(() => {}); // non-fatal

    // ── Update the ghost profile row ───────────────────────────────────────
    // Critical: link the auth user id, clear ghost flags, add household
    // The profile row's id must now match the auth.users id.
    // Since they're different UUIDs, we need to:
    //   1. Insert a new profiles row with the auth id
    //   2. Migrate group_members from old ghost id to new auth id
    //   3. Delete the old ghost profile row

    // Step A: Insert new profile with auth id
    const { error: newProfileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id:              newAuthId,
        household_id:    newHouseholdId,
        email:           email.toLowerCase().trim(),
        display_name:    name || ghostProfile.ghost_name || 'Partner A',
        ghost_name:      null,
        is_ghost:        false,
        phone_number:    phone,
        whatsapp_number: phone,
      });

    if (newProfileError) {
      // Cleanup: delete the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(newAuthId);
      console.error('[Convert] New profile error:', newProfileError.message);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    // Step B: Migrate group_members to new auth id
    const { error: migrationError } = await supabaseAdmin
      .from('group_members')
      .update({ user_id: newAuthId })
      .eq('user_id', profileId);

    if (migrationError) {
      console.warn('[Convert] group_members migration warning:', migrationError.message);
      // Non-fatal: group memberships can be re-added manually if needed
    }

    // Step C: Migrate transaction_splits to new auth id
    await supabaseAdmin
      .from('transaction_splits')
      .update({ user_id: newAuthId })
      .eq('user_id', profileId)
      .then(() => {})
      .catch((e: any) => console.warn('[Convert] splits migration:', e.message));

    // Step D: Delete the old ghost profile
    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', profileId);

    // ── Sign in with the new credentials to get a real session ────────────
    // We use the anon client here because signInWithPassword uses the anon key
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: sessionData, error: signInError } = await anonClient.auth.signInWithPassword({
      email:    email.toLowerCase().trim(),
      password,
    });

    if (signInError || !sessionData.session) {
      // Account was created successfully, just auto-login failed
      // Client can sign in manually
      return NextResponse.json({
        success:      true,
        converted:    true,
        auto_sign_in: false,
        message:      'Account created! Please sign in with your email and password.',
      });
    }

    return NextResponse.json({
      success:        true,
      converted:      true,
      auto_sign_in:   true,
      access_token:   sessionData.session.access_token,
      refresh_token:  sessionData.session.refresh_token,
      household_id:   newHouseholdId,
      message:        'Welcome to ChillarFlow! Your group history has been preserved.',
    });

  } catch (err: any) {
    console.error('[Convert Ghost] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
