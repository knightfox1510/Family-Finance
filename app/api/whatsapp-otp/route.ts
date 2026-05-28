// app/api/auth/whatsapp-otp/route.ts
// Two endpoints:
//   POST /api/auth/whatsapp-otp        → send OTP to a phone number
//   POST /api/auth/whatsapp-otp/verify → verify the OTP code
//
// Rate limiting is handled in-process using a simple Supabase-backed
// counter — no Upstash dependency required. If you later add Upstash,
// swap the rateLimit() function body only.
//
// Meta Cloud API prerequisites:
//   1. Create a Meta Business App at developers.facebook.com
//   2. Enable WhatsApp Cloud API product
//   3. Create and get approval for an OTP message template named
//      "auth_otp_verification" with one body variable (the OTP code)
//      and one URL button variable (also the OTP code)
//   4. Add env vars: META_PHONE_NUMBER_ID, META_ACCESS_TOKEN
//
// If Meta API is not yet configured, the route falls back to
// CONSOLE_OTP_MODE=true which logs the OTP to server console only.
// Useful for testing the full flow without Meta credentials.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const OTP_EXPIRY_MINUTES  = 5;
const MAX_ATTEMPTS        = 3;
const RATE_WINDOW_MINUTES = 15;
const CONSOLE_OTP_MODE    = process.env.CONSOLE_OTP_MODE === 'true';

// ── Rate limiter using the otp_verifications table ───────────────────────────
// Counts how many OTPs have been issued to a phone in the last window.
// This is lightweight and requires no additional infrastructure.
async function checkRateLimit(phone: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}> {
  const windowStart = new Date(
    Date.now() - RATE_WINDOW_MINUTES * 60 * 1000
  ).toISOString();

  // Count recent OTP requests by checking created_at on existing rows
  // We use a separate rate_log concept via the attempts column
  const { data: existing } = await supabase
    .from('otp_verifications')
    .select('attempts, created_at')
    .eq('phone_number', phone)
    .single();

  if (!existing) {
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetAt: new Date(Date.now() + RATE_WINDOW_MINUTES * 60 * 1000) };
  }

  // If the existing record is older than the window, it's a fresh slate
  const recordAge = Date.now() - new Date(existing.created_at).getTime();
  if (recordAge > RATE_WINDOW_MINUTES * 60 * 1000) {
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetAt: new Date(Date.now() + RATE_WINDOW_MINUTES * 60 * 1000) };
  }

  const attempts  = existing.attempts ?? 0;
  const remaining = Math.max(0, MAX_ATTEMPTS - attempts);
  const resetAt   = new Date(new Date(existing.created_at).getTime() + RATE_WINDOW_MINUTES * 60 * 1000);

  return { allowed: remaining > 0, remaining, resetAt };
}

// ── Generate cryptographically secure 6-digit OTP ───────────────────────────
function generateOTP(): string {
  // crypto.randomInt is available in Node 14.10+
  // Produces a uniformly distributed integer in [0, 900000)
  const n = crypto.randomInt(0, 900000);
  return String(n + 100000); // guarantees 6 digits
}

// ── Send via Meta Cloud API ──────────────────────────────────────────────────
async function sendWhatsAppOTP(phone: string, otp: string): Promise<{
  success: boolean;
  error?: string;
}> {
  if (CONSOLE_OTP_MODE) {
    // Development fallback — OTP printed to server logs only
    console.log(`[OTP DEV MODE] Phone: ${phone} → OTP: ${otp}`);
    return { success: true };
  }

  const phoneNumberId  = process.env.META_PHONE_NUMBER_ID;
  const accessToken    = process.env.META_ACCESS_TOKEN;
  const templateName   = process.env.META_OTP_TEMPLATE_NAME ?? 'auth_otp_verification';

  if (!phoneNumberId || !accessToken) {
    console.error('[OTP] META_PHONE_NUMBER_ID or META_ACCESS_TOKEN not set');
    return { success: false, error: 'WhatsApp service not configured' };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to:                phone,
          type:              'template',
          template: {
            name:     templateName,
            language: { code: 'en_US' },
            components: [
              {
                type:       'body',
                parameters: [{ type: 'text', text: otp }],
              },
              {
                // The URL button copies the OTP as a deep link parameter
                type:       'button',
                sub_type:   'url',
                index:      '0',
                parameters: [{ type: 'text', text: otp }],
              },
            ],
          },
        }),
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg     = errData?.error?.message ?? `Meta API error ${res.status}`;
      console.error('[OTP] Meta API error:', msg);
      return { success: false, error: msg };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[OTP] Network error:', err.message);
    return { success: false, error: 'Could not reach WhatsApp service' };
  }
}

// ── POST /api/auth/whatsapp-otp ──────────────────────────────────────────────
// Body: { phone_number: string }
// Cleans the number, checks rate limit, generates OTP, stores it,
// dispatches WhatsApp message.
export async function POST(req: Request) {
  try {
    const { phone_number } = await req.json();

    // Sanitise: strip all non-digits
    const cleanPhone = String(phone_number ?? '').replace(/\D/g, '');

    if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 15) {
      return NextResponse.json(
        { error: 'Enter a valid phone number with country code (e.g. 919876543210)' },
        { status: 400 }
      );
    }

    // ── Rate limit check ───────────────────────────────────────────────────
    const { allowed, remaining, resetAt } = await checkRateLimit(cleanPhone);

    if (!allowed) {
      const minutesLeft = Math.ceil((resetAt.getTime() - Date.now()) / 60000);
      return NextResponse.json(
        {
          error: `Too many attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
          reset_at: resetAt.toISOString(),
        },
        { status: 429 }
      );
    }

    // ── Generate and store OTP ─────────────────────────────────────────────
    const otp       = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    const { error: dbError } = await supabase
      .from('otp_verifications')
      .upsert(
        {
          phone_number: cleanPhone,
          otp_code:     otp,
          expires_at:   expiresAt,
          attempts:     1, // will be incremented on subsequent requests in the window
          created_at:   new Date().toISOString(),
        },
        { onConflict: 'phone_number' }
      );

    if (dbError) {
      console.error('[OTP] DB upsert error:', dbError.message);
      return NextResponse.json({ error: 'Could not store verification code' }, { status: 500 });
    }

    // Increment attempt counter for rate limiting
    await supabase.rpc('increment_otp_attempts', { p_phone: cleanPhone })
      .then(() => {})  // fire-and-forget, non-critical
      .catch(() => {});

    // ── Send OTP ───────────────────────────────────────────────────────────
    const { success, error: sendError } = await sendWhatsAppOTP(cleanPhone, otp);

    if (!success) {
      return NextResponse.json(
        { error: sendError ?? 'Could not send verification message' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success:   true,
      remaining: remaining - 1,
      expires_in_seconds: OTP_EXPIRY_MINUTES * 60,
      // In console mode, include OTP in response for easy testing
      ...(CONSOLE_OTP_MODE ? { dev_otp: otp } : {}),
    });

  } catch (err: any) {
    console.error('[OTP] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
