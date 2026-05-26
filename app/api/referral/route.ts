// app/api/referral/route.ts
// Referral system: generate codes, apply them, credit bonus parses.
//
// Supabase migration:
//   ALTER TABLE profiles
//     ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
//     ADD COLUMN IF NOT EXISTS referred_by   TEXT,
//     ADD COLUMN IF NOT EXISTS referral_bonus_parses INT DEFAULT 0;
//
//   -- Referral bonus: when someone signs up with your code,
//   -- both parties get REFERRAL_BONUS extra AI parses this month.
//   -- Stored as referral_bonus_parses on profile, added to FREE_MONTHLY_LIMIT.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const REFERRAL_BONUS = 30; // extra parses for both parties

// Generate a short, readable referral code
const generateCode = () =>
  crypto.randomBytes(4).toString('hex').toUpperCase(); // e.g. "A3F9B2C1"

// GET /api/referral?userId=xxx  — get or create referral code for a user
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code, referred_by, referral_bonus_parses, household_id')
    .eq('id', userId)
    .single();

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  // Create code if missing
  if (!profile.referral_code) {
    const code = generateCode();
    await supabase.from('profiles').update({ referral_code: code }).eq('id', userId);
    profile.referral_code = code;
  }

  // Count how many people used this code
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by', profile.referral_code);

  return NextResponse.json({
    code:         profile.referral_code,
    shareUrl:     `https://chillarflow.com/app?ref=${profile.referral_code}`,
    referredCount: count || 0,
    bonusParses:  profile.referral_bonus_parses || 0,
    message:      `Share your code and you both get ${REFERRAL_BONUS} extra AI parses when they sign up.`,
  });
}

// POST /api/referral — apply a referral code at signup
// Body: { newUserId: string, referralCode: string }
export async function POST(request: Request) {
  const { newUserId, referralCode } = await request.json();
  if (!newUserId || !referralCode) {
    return NextResponse.json({ error: 'newUserId and referralCode required' }, { status: 400 });
  }

  const code = referralCode.trim().toUpperCase();

  // Find the referrer
  const { data: referrer } = await supabase
    .from('profiles')
    .select('id, household_id, referral_code, referral_bonus_parses')
    .eq('referral_code', code)
    .single();

  if (!referrer) {
    return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 });
  }

  // Make sure the new user hasn't already used a code
  const { data: newUser } = await supabase
    .from('profiles')
    .select('referred_by')
    .eq('id', newUserId)
    .single();

  if (newUser?.referred_by) {
    return NextResponse.json({ error: 'Referral code already applied' }, { status: 400 });
  }

  // Can't refer yourself
  if (referrer.id === newUserId) {
    return NextResponse.json({ error: 'Cannot use your own referral code' }, { status: 400 });
  }

  // Apply to new user
  await supabase
    .from('profiles')
    .update({
      referred_by:            code,
      referral_bonus_parses:  REFERRAL_BONUS,
    })
    .eq('id', newUserId);

  // Credit the referrer too
  await supabase
    .from('profiles')
    .update({ referral_bonus_parses: (referrer.referral_bonus_parses || 0) + REFERRAL_BONUS })
    .eq('id', referrer.id);

  return NextResponse.json({
    ok:      true,
    bonus:   REFERRAL_BONUS,
    message: `Both you and your referrer get ${REFERRAL_BONUS} extra AI parses this month!`,
  });
}
