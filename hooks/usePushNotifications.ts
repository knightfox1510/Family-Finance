// hooks/usePushNotifications.ts
// React hook that manages service worker registration and push subscription state.
// Import this in app/page.tsx and call it once after the user is authenticated.

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getPushSubscriptionStatus,
} from '@/lib/webPush';

export type PushStatus = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

interface UsePushNotificationsReturn {
  status:     PushStatus;
  subscribe:  () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  isLoading:  boolean;
}

export function usePushNotifications(householdId?: string): UsePushNotificationsReturn {
  const [status, setStatus]     = useState<PushStatus>('loading');
  const [isLoading, setLoading] = useState(false);

  // ── Register service worker and resolve current status ──────────────────────
  useEffect(() => {
    if (!isPushSupported()) {
      setStatus('unsupported');
      return;
    }

    let mounted = true;

    const init = async () => {
      try {
        // Register the service worker if not already registered
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        const permission = await getPushSubscriptionStatus();
        if (!mounted) return;

        if (permission === 'denied') {
          setStatus('denied');
          return;
        }

        // Check if there is an active subscription
        const reg          = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.getSubscription();
        setStatus(subscription ? 'subscribed' : 'unsubscribed');
      } catch (err) {
        console.warn('[Push] Init error:', err);
        if (mounted) setStatus('unsupported');
      }
    };

    init();
    return () => { mounted = false; };
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!householdId) return false;
    setLoading(true);
    try {
      const ok = await subscribeToPush(householdId);
      if (ok) setStatus('subscribed');
      else if (Notification.permission === 'denied') setStatus('denied');
      return ok;
    } finally {
      setLoading(false);
    }
  }, [householdId]);

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

  return { status, subscribe, unsubscribe, isLoading };
}
