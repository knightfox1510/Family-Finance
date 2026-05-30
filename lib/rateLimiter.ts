// lib/rateLimiter.ts
// Lightweight rate limiter using a Supabase table as the counter store.
// Same pattern as otp_verifications — no Redis, no Upstash, zero extra infra.
//
// Supabase migration (run once):
//   CREATE TABLE IF NOT EXISTS rate_limit_counters (
//     key          TEXT NOT NULL,           -- e.g. "group_tx:user_id:YYYY-MM-DDTHH"
//     count        INT  NOT NULL DEFAULT 1,
//     window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
//     expires_at   TIMESTAMPTZ NOT NULL,
//     PRIMARY KEY  (key)
//   );
//   CREATE INDEX IF NOT EXISTS rate_limit_expires_idx ON rate_limit_counters(expires_at);
//
//   -- Optional: auto-prune expired rows daily
//   -- (can also prune inline in checkRateLimit)
//
// Usage:
//   const result = await checkRateLimit(supabase, 'group_tx', userId, 60, 3600);
//   if (!result.allowed) {
//     return NextResponse.json({ error: result.error }, { status: 429 });
//   }

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RateLimitResult {
  allowed:    boolean;
  remaining:  number;
  resetAt:    Date;
  error?:     string;
}

/**
 * Check and increment a rate limit counter.
 *
 * @param supabase     — service-role Supabase client
 * @param namespace    — logical bucket name, e.g. 'group_tx' | 'group_settle' | 'group_create'
 * @param identifier   — the entity being rate-limited (userId, IP, etc.)
 * @param maxRequests  — max allowed calls within the window
 * @param windowSecs   — rolling window length in seconds
 */
export async function checkRateLimit(
  supabase:    SupabaseClient,
  namespace:   string,
  identifier:  string,
  maxRequests: number,
  windowSecs:  number,
): Promise<RateLimitResult> {
  // Key is scoped to a fixed window start (floor to windowSecs)
  const now      = Math.floor(Date.now() / 1000);
  const windowId = Math.floor(now / windowSecs);
  const key      = `${namespace}:${identifier}:${windowId}`;
  const expiresAt = new Date((windowId + 1) * windowSecs * 1000).toISOString();
  const resetAt   = new Date((windowId + 1) * windowSecs * 1000);

  try {
    // Attempt to insert a new counter row (first request in this window)
    const { error: insertError } = await supabase
      .from('rate_limit_counters')
      .insert({ key, count: 1, window_start: new Date().toISOString(), expires_at: expiresAt });

    if (!insertError) {
      // Inserted successfully — first hit in this window
      return { allowed: true, remaining: maxRequests - 1, resetAt };
    }

    // Row already exists — increment it
    // Use a raw SQL RPC to atomically fetch+increment (avoids race condition)
    const { data, error: rpcError } = await supabase
      .rpc('increment_rate_limit', { p_key: key, p_max: maxRequests });

    if (rpcError) {
      // Fallback: read current count and decide
      const { data: existing } = await supabase
        .from('rate_limit_counters')
        .select('count')
        .eq('key', key)
        .single();

      const count = existing?.count ?? 0;
      if (count >= maxRequests) {
        return {
          allowed:   false,
          remaining: 0,
          resetAt,
          error:     buildErrorMessage(namespace, windowSecs, resetAt),
        };
      }
      // Update manually as fallback
      await supabase
        .from('rate_limit_counters')
        .update({ count: count + 1 })
        .eq('key', key);

      return { allowed: true, remaining: maxRequests - count - 1, resetAt };
    }

    // RPC returned the new count
    const newCount = typeof data === 'number' ? data : (data?.count ?? maxRequests + 1);

    if (newCount > maxRequests) {
      return {
        allowed:   false,
        remaining: 0,
        resetAt,
        error:     buildErrorMessage(namespace, windowSecs, resetAt),
      };
    }

    return { allowed: true, remaining: maxRequests - newCount, resetAt };
  } catch (err: any) {
    // On DB errors, fail open (better UX than hard blocking)
    console.error('[rateLimiter] Error:', err?.message);
    return { allowed: true, remaining: 0, resetAt };
  }
}

// ── Supabase RPC to create (add to your migration) ───────────────────────────
// CREATE OR REPLACE FUNCTION increment_rate_limit(p_key TEXT, p_max INT)
// RETURNS INT AS $$
// DECLARE
//   new_count INT;
// BEGIN
//   UPDATE rate_limit_counters
//   SET count = count + 1
//   WHERE key = p_key
//   RETURNING count INTO new_count;
//   RETURN COALESCE(new_count, p_max + 1);
// END;
// $$ LANGUAGE plpgsql;

function buildErrorMessage(namespace: string, windowSecs: number, resetAt: Date): string {
  const minutes = Math.ceil(windowSecs / 60);
  const label =
    namespace === 'group_tx'     ? 'transaction creation' :
    namespace === 'group_settle' ? 'settlement recording' :
    namespace === 'group_create' ? 'group creation'       : 'this action';

  const resetMins = Math.ceil((resetAt.getTime() - Date.now()) / 60000);
  return `Too many ${label} requests. Please wait ${resetMins} minute${resetMins !== 1 ? 's' : ''} before trying again.`;
}

// ── Convenience: extract caller ID from request ───────────────────────────────
// Returns the authenticated user ID or the requester's IP as a fallback.
export function extractRateLimitId(
  request:  Request,
  userId:   string | null,
): string {
  if (userId) return userId;
  // Fallback to IP (less precise, but blocks unauthenticated abuse)
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
