// hooks/usePushNotifications.ts
// ─────────────────────────────────────────────────────────────────────────────
// CLIENT-ONLY React hook.
// Imports only from lib/webPushClient — zero reference to web-push or any
// Node built-in. Safe to import from any component or page.
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  isPushSupported,
  getPermission,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
  getActiveSubscription,
} from '@/lib/webPushClient';

export type PushStatus =
  | 'loading'       // checking state on mount
  | 'unsupported'   // browser doesn't support Web Push
  | 'denied'        // OS permission is blocked
  | 'subscribed'    // active subscription exists
  | 'unsubscribed'; // supported & permitted, but no active subscription

interface UsePushNotificationsReturn {
  status:      PushStatus;
  isLoading:   boolean;
  subscribe:   () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

export function usePushNotifications(householdId?: string): UsePushNotificationsReturn {
  const [status,    setStatus]  = useState<PushStatus>('loading');
  const [isLoading, setLoading] = useState(false);

  // ── Resolve current state on mount ──────────────────────────────────────
  useEffect(() => {
    if (!isPushSupported()) {
      setStatus('unsupported');
      return;
    }

    let cancelled = false;

    const init = async () => {
      // Register SW (idempotent)
      await registerServiceWorker();
      if (cancelled) return;

      const permission = getPermission();
      if (permission === 'denied') {
        setStatus('denied');
        return;
      }

      // Check for an existing active subscription
      const sub = await getActiveSubscription();
      if (!cancelled) {
        setStatus(sub ? 'subscribed' : 'unsubscribed');
      }
    };

    init().catch(() => {
      if (!cancelled) setStatus('unsupported');
    });

    return () => { cancelled = true; };
  }, []);

  // ── Subscribe ────────────────────────────────────────────────────────────
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!householdId) return false;
    setLoading(true);
    try {
      const ok = await subscribeToPush(householdId);
      if (ok) {
        setStatus('subscribed');
      } else {
        // Re-check permission in case the user clicked "Block"
        const perm = getPermission();
        if (perm === 'denied') setStatus('denied');
      }
      return ok;
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  // ── Unsubscribe ──────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const ok = await unsubscribeFromPush();
      if (ok) setStatus('unsubscribed');
      return ok;
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, isLoading, subscribe, unsubscribe };
}
