// lib/webPushServer.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Never import this from any client component, hook, or shared
// lib. It must only ever appear in:
//   - app/api/**/route.ts
//   - app/api/cron/**/route.ts
//
// It imports web-push at the top level (not dynamically), which is fine
// because Next.js route files are always compiled for Node, never for the
// browser bundle.
//
// VAPID setup (run once, then add to Vercel env):
//   npx web-push generate-vapid-keys
//   VAPID_PUBLIC_KEY=<public>
//   VAPID_PRIVATE_KEY=<private>
//   VAPID_EMAIL=mailto:team@chillarflow.com
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same public key — readable by the browser>
// ─────────────────────────────────────────────────────────────────────────────

import webpush from 'web-push';

// Configure VAPID once at module load (safe — this file is Node-only)
webpush.setVapidDetails(
  process.env.VAPID_EMAIL         ?? 'mailto:team@chillarflow.com',
  process.env.VAPID_PUBLIC_KEY    ?? '',
  process.env.VAPID_PRIVATE_KEY   ?? '',
);

export interface PushPayload {
  title:  string;
  body:   string;
  tag:    string;
  url:    string;
  icon?:  string;
}

/**
 * Send a Web Push notification to a single subscription endpoint.
 * Returns { ok: true } on success, { ok: false, expired: true } when the
 * subscription is stale (410/404) and should be pruned from the DB.
 */
export async function sendPushToEndpoint(
  endpoint: string,
  p256dh:   string,
  auth:     string,
  payload:  PushPayload,
): Promise<{ ok: boolean; expired?: boolean }> {
  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify(payload),
      { TTL: 86400 }, // 24 h time-to-live
    );
    return { ok: true };
  } catch (err: any) {
    // 410 Gone or 404 = subscription no longer valid — caller should delete it
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      return { ok: false, expired: true };
    }
    console.error('[webPushServer] sendNotification error:', err?.message);
    return { ok: false };
  }
}

/**
 * Fan out a notification to every push subscription belonging to a household.
 * Automatically prunes expired subscriptions from the DB.
 *
 * @param supabase     Service-role Supabase client (from the calling route)
 * @param householdId  Target household
 * @param payload      Notification payload
 * @param skipUserId   Optional — skip the user who triggered the action
 */
export async function notifyHousehold(
  supabase:    any,
  householdId: string,
  payload:     PushPayload,
  skipUserId?: string,
): Promise<void> {
  let query = supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('household_id', householdId);

  if (skipUserId) query = query.neq('user_id', skipUserId);

  const { data: subs } = await query;
  if (!subs?.length) return;

  const expiredIds: string[] = [];

  await Promise.all(
    subs.map(async (sub: any) => {
      const result = await sendPushToEndpoint(
        sub.endpoint, sub.p256dh, sub.auth_key, payload,
      );
      if (result.expired) expiredIds.push(sub.id);
    }),
  );

  // Prune stale subscriptions so they don't accumulate
  if (expiredIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expiredIds);
  }
}
