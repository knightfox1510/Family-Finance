// lib/ghostToken.ts
// Centralised ghost token resolver used by all API routes.
//
// Changes from previous version:
//   1. Imports GHOST_SECRET_BYTES from lib/env.ts — no more per-file fallbacks
//   2. Adds issueRefreshedToken() — call this when a token is within 7 days of expiry
//   3. Adds shouldRefreshToken() — lets routes decide whether to issue a new token
//   4. resolveGhostUserId() now returns a result object with profileId + exp, not just a string
//
// Usage in API routes:
//
//   import { resolveGhostUserId, shouldRefreshToken, issueRefreshedToken } from '@/lib/ghostToken';
//
//   const result = await resolveGhostUserId(token, supabase);
//   if (!result) return 401;
//
//   if (shouldRefreshToken(result.exp)) {
//     const newToken = issueRefreshedToken(result.profileId, result.phone);
//     // Add to response: headers.set('x-ghost-token-refreshed', newToken);
//   }

import { jwtVerify }                            from 'jose';
import crypto                                    from 'crypto';
import { GHOST_SECRET_BYTES, GHOST_SECRET_RAW } from '@/lib/env';
import type { SupabaseClient }                  from '@supabase/supabase-js';

const REFRESH_THRESHOLD_DAYS = 7;
const TOKEN_LIFETIME_DAYS    = 30;

export interface GhostTokenResult {
  profileId: string;
  phone:     string;
  exp:       number;
}

// ── shouldRefreshToken ────────────────────────────────────────────────────────

export function shouldRefreshToken(exp: number): boolean {
  const daysLeft = (exp - Math.floor(Date.now() / 1000)) / 86400;
  return daysLeft < REFRESH_THRESHOLD_DAYS;
}

// ── issueRefreshedToken ───────────────────────────────────────────────────────

export function issueRefreshedToken(profileId: string, phone: string): string {
  const payload = JSON.stringify({
    profileId,
    phone,
    isGhost: true,
    iat:     Math.floor(Date.now() / 1000),
    exp:     Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_DAYS * 86400,
  });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const signature  = crypto
    .createHmac('sha256', GHOST_SECRET_RAW)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${signature}`;
}

// ── resolveGhostUserId ────────────────────────────────────────────────────────

export async function resolveGhostUserId(
  token:    string,
  supabase: SupabaseClient,
): Promise<GhostTokenResult | null> {

  // Format 1: HMAC — exactly two dot-separated parts
  const parts = token.split('.');
  if (parts.length === 2) {
    const [payloadB64, sig] = parts;
    try {
      const key = await crypto.subtle.importKey(
        'raw', GHOST_SECRET_BYTES,
        { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
      );
      const valid = await crypto.subtle.verify(
        'HMAC', key,
        Buffer.from(sig, 'base64url'),
        Buffer.from(payloadB64),
      );
      if (!valid) return null;

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
        profileId?: string; phone?: string; exp?: number; isGhost?: boolean;
      };

      if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
      if (!payload.isGhost || !payload.profileId || !payload.phone)    return null;

      const { data } = await supabase
        .from('profiles').select('id').eq('id', payload.profileId).single();
      if (!data?.id) return null;

      return { profileId: data.id, phone: payload.phone, exp: payload.exp };
    } catch { return null; }
  }

  // Format 2: jose JWT — three dot-separated parts
  try {
    const { payload } = await jwtVerify(token, GHOST_SECRET_BYTES);
    const userId = payload.sub as string;
    if (!userId) return null;

    const { data } = await supabase
      .from('profiles').select('id').eq('id', userId).single();
    if (!data?.id) return null;

    return {
      profileId: data.id,
      phone:     (payload['phone'] as string) ?? '',
      exp:       payload.exp ?? 0,
    };
  } catch { return null; }
}

// ── Convenience: returns just userId string (drop-in for old callers) ─────────

export async function resolveGhostUserIdSimple(
  token:    string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const result = await resolveGhostUserId(token, supabase);
  return result?.profileId ?? null;
}
