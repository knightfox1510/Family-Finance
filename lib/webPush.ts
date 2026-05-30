// lib/webPush.ts
// Web Push utilities for ChillarFlow.
//
// Server-side: uses the 'web-push' npm package (add to package.json).
// Client-side: subscription registration helpers.
//
// Setup steps:
//   1. npm install web-push
//   2. Generate VAPID keys once:
//        npx web-push generate-vapid-keys
//   3. Add to Vercel environment variables:
//        VAPID_PUBLIC_KEY=<your_public_key>
//        VAPID_PRIVATE_KEY=<your_private_key>
//        VAPID_EMAIL=mailto:team@chillarflow.com
//   4. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same_public_key> (client-readable)
//
// Supabase migration required (run once):
//   CREATE TABLE IF NOT EXISTS push_subscriptions (
//     id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
//     user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
//     endpoint     TEXT NOT NULL UNIQUE,
//     p256dh       TEXT NOT NULL,
//     auth_key     TEXT NOT NULL,
//     user_agent   TEXT,
//     created_at   TIMESTAMPTZ DEFAULT now(),
//     updated_at   TIMESTAMPTZ DEFAULT now()
//   );
//   CREATE INDEX IF NOT EXISTS push_subs_household_idx ON push_subscriptions(household_id);
//   CREATE INDEX IF NOT EXISTS push_subs_user_idx      ON push_subscriptions(user_id);

// ─── Client-side helpers ──────────────────────────────────────────────────────

/** Convert a base64url VAPID public key to a Uint8Array for the Push API */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/** Check if push is supported in this browser */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Request notification permission. Returns true if granted. */
export async function requestPermission(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** Subscribe to push notifications and persist the subscription via the API */
export async function subscribeToPush(householdId: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const granted = await requestPermission();
    if (!granted) return false;

    const reg = await navigator.serviceWorker.ready;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
      return false;
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const { endpoint, keys } = subscription.toJSON() as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    const res = await fetch('/api/notifications/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        householdId,
        endpoint,
        p256dh:    keys.p256dh,
        auth_key:  keys.auth,
        userAgent: navigator.userAgent,
      }),
    });

    return res.ok;
  } catch (err) {
    console.error('[Push] Subscribe failed:', err);
    return false;
  }
}

/** Unsubscribe from push and remove from DB */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const reg          = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return true;

    await fetch('/api/notifications/subscribe', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ endpoint: subscription.endpoint }),
    });

    return await subscription.unsubscribe();
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err);
    return false;
  }
}

/** Check current subscription status */
export async function getPushSubscriptionStatus(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as 'granted' | 'denied' | 'default';
}

// ─── Server-side sender (used only in API routes / cron) ─────────────────────
// Dynamically imported so web-push is never bundled on the client.

export interface PushPayload {
  title:   string;
  body:    string;
  tag:     string;
  url:     string;
  icon?:   string;
}

/**
 * Send a push notification to a single subscription endpoint.
 * Must only be called in server-side code.
 */
export async function sendPushToEndpoint(
  endpoint:  string,
  p256dh:    string,
  auth:      string,
  payload:   PushPayload,
): Promise<{ ok: boolean; expired?: boolean }> {
  try {
    // Dynamic import keeps web-push out of the client bundle
    const webpush = await import('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL ?? 'mailto:team@chillarflow.com',
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );

    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify(payload),
      { TTL: 86400 }, // 24h time-to-live
    );

    return { ok: true };
  } catch (err: any) {
    // 410 Gone = subscription no longer valid → mark for cleanup
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      return { ok: false, expired: true };
    }
    console.error('[Push] sendPushToEndpoint error:', err?.message);
    return { ok: false };
  }
}

/**
 * Send a notification to ALL subscriptions for a household.
 * Cleans up expired/invalid subscriptions automatically.
 */
export async function notifyHousehold(
  supabase:    any,
  householdId: string,
  payload:     PushPayload,
  skipUserId?: string, // don't notify the person who triggered the action
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
        sub.endpoint, sub.p256dh, sub.auth_key, payload
      );
      if (result.expired) expiredIds.push(sub.id);
    })
  );

  // Prune expired subscriptions
  if (expiredIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expiredIds);
  }
}
