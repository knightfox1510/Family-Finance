// lib/ghostToken.ts
// Centralised ghost token resolver used by all API routes.
//
// Ghost tokens come in two formats:
//
//   Format 1 — hand-rolled HMAC (issued by whatsapp-otp/verify/route.ts)
//     Structure: base64url(payload).base64url(hmac-sha256-signature)
//     The payload is a JSON object with { profileId, phone, isGhost, iat, exp }
//     The HMAC is signed with GHOST_SESSION_SECRET.
//     SECURITY: the signature MUST be verified before trusting profileId.
//
//   Format 2 — jose JWT (some older code paths)
//     Standard JWT verified with jwtVerify from the 'jose' library.
//
// Usage in any API route:
//
//   import { resolveGhostUserId } from '@/lib/ghostToken';
//
//   const userId = await resolveGhostUserId(ghostTokenHeaderValue, supabase);
//   if (!userId) return 401;

import { jwtVerify } from 'jose';
import type { SupabaseClient } from '@supabase/supabase-js';

const GHOST_SECRET = new TextEncoder().encode(
  process.env.GHOST_SESSION_SECRET ?? 'fallback-secret-change-in-prod'
);

/**
 * Verify and resolve a ghost token string to a profile ID.
 *
 * Tries Format 1 (HMAC) first, falls back to Format 2 (jose JWT).
 * Returns null if the token is invalid, expired, or the profile no longer exists.
 *
 * @param token   The raw token string from the x-ghost-token header.
 * @param supabase A Supabase client with service role access (for profile lookup).
 */
export async function resolveGhostUserId(
  token:    string,
  supabase: SupabaseClient,
): Promise<string | null> {
  // ── Format 1: hand-rolled HMAC ────────────────────────────────────────────
  // Split on the first dot — payload is everything before, signature is after.
  const dotIndex = token.indexOf('.');
  if (dotIndex > 0) {
    const payloadB64 = token.slice(0, dotIndex);
    const sig        = token.slice(dotIndex + 1);

    // Only attempt HMAC verification if there's exactly one dot
    // (jose JWTs have two dots: header.payload.sig)
    if (token.split('.').length === 2) {
      try {
        const key = await crypto.subtle.importKey(
          'raw',
          GHOST_SECRET,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['verify'],
        );

        const sigBytes     = Buffer.from(sig, 'base64url');
        const payloadBytes = Buffer.from(payloadB64);
        const valid        = await crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes);

        if (!valid) return null; // signature mismatch — reject immediately

        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

        // Enforce expiry
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

        if (!payload.profileId) return null;

        // Confirm profile still exists in DB
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', payload.profileId)
          .single();

        return data?.id ?? null;
      } catch {
        return null;
      }
    }
  }

  // ── Format 2: jose JWT ───────────────────────────────────────────────────
  try {
    const { payload } = await jwtVerify(token, GHOST_SECRET);
    const userId = payload.sub as string;
    if (!userId) return null;

    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    return data?.id ?? null;
  } catch {
    return null;
  }
}
