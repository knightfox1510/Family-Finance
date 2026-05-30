// lib/env.ts
// Boot-time validation of critical environment variables.
//
// Import this at the top of any API route that uses sensitive secrets.
// It throws immediately on startup if a required var is missing or
// still set to the insecure fallback defaults.
//
// Usage:
//   import '@/lib/env';          // just the side-effect (throws on bad config)
//   import { env } from '@/lib/env';  // typed access to validated vars
//
// In Next.js, API routes are initialised once per server instance,
// so this check runs once on cold start — not on every request.

const INSECURE_FALLBACKS = new Set([
  'fallback-secret-change-in-prod',
  'change-me-in-production',
  'secret',
  'your-secret',
  'development',
]);

function requireEnv(name: string, opts: { noFallback?: boolean } = {}): string {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(
      `[ChillarFlow] Missing required environment variable: ${name}\n` +
      `Set it in your .env.local (development) or Vercel environment variables (production).`,
    );
  }

  if (opts.noFallback && INSECURE_FALLBACKS.has(value.trim())) {
    throw new Error(
      `[ChillarFlow] ${name} is still set to the insecure default value "${value}".\n` +
      `Generate a secure secret with: openssl rand -base64 32\n` +
      `Then set it as ${name} in your environment variables.`,
    );
  }

  return value.trim();
}

// ── Validated env object ──────────────────────────────────────────────────────
// Only call this on the server — these are never exposed to the client.

function buildEnv() {
  // Skip validation during build time (Next.js static analysis)
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return {
      GHOST_SESSION_SECRET:   process.env.GHOST_SESSION_SECRET ?? '',
      SUPABASE_URL:           process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      SUPABASE_SERVICE_ROLE:  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    };
  }

  return {
    GHOST_SESSION_SECRET:  requireEnv('GHOST_SESSION_SECRET',      { noFallback: true }),
    SUPABASE_URL:          requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export const env = buildEnv();

// ── Typed secret for ghostToken.ts ───────────────────────────────────────────
// Export as Uint8Array so it can be used directly with Web Crypto and jose.
export const GHOST_SECRET_BYTES = new TextEncoder().encode(env.GHOST_SESSION_SECRET);
export const GHOST_SECRET_RAW   = env.GHOST_SESSION_SECRET;
