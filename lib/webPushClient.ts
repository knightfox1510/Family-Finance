// lib/webPushClient.ts
// ─────────────────────────────────────────────────────────────────────────────
// CLIENT-ONLY. Safe to import from React components, hooks, and pages.
// Contains zero references to Node built-ins or the web-push package.
//
// Responsibilities:
//   • Convert VAPID public key to Uint8Array for the Push API
//   • Subscribe / unsubscribe via the browser PushManager
//   • Persist / remove subscriptions by calling our own API routes
// ─────────────────────────────────────────────────────────────────────────────

/** Convert the base64url VAPID public key to the Uint8Array the Push API needs */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/** True when this browser supports Web Push */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager'   in window    &&
    'Notification'  in window
  );
}

/** Current OS-level notification permission */
export function getPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Register the service worker (idempotent — safe to call on every mount).
 * Returns the registration, or null if SW is not supported.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.warn('[webPushClient] SW registration failed:', err);
    return null;
  }
}

/**
 * Subscribe to push notifications and persist the subscription via the API.
 * Returns true on success.
 */
export async function subscribeToPush(householdId: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    // Request OS permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.error('[webPushClient] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
      return false;
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const json = subscription.toJSON() as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    const res = await fetch('/api/notifications/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        householdId,
        endpoint:  json.endpoint,
        p256dh:    json.keys.p256dh,
        auth_key:  json.keys.auth,
        userAgent: navigator.userAgent,
      }),
    });

    return res.ok;
  } catch (err) {
    console.error('[webPushClient] subscribe failed:', err);
    return false;
  }
}

/**
 * Unsubscribe and remove the subscription from the DB.
 * Returns true if the subscription was removed (or there was nothing to remove).
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const reg          = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return true; // already gone

    // Tell the server first so it prunes the DB row
    await fetch('/api/notifications/subscribe', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ endpoint: subscription.endpoint }),
    });

    return await subscription.unsubscribe();
  } catch (err) {
    console.error('[webPushClient] unsubscribe failed:', err);
    return false;
  }
}

/**
 * Check whether there is currently an active push subscription.
 * Does NOT check OS permission — use getPermission() for that.
 */
export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}
