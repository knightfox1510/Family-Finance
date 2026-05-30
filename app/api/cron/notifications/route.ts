// app/api/cron/notifications/route.ts
// Scheduled notification checks. Called by Vercel Cron or an external scheduler.
//
// Vercel cron configuration (in vercel.json):
//   {
//     "crons": [
//       { "path": "/api/cron/notifications", "schedule": "0 9 * * *" }
//     ]
//   }
//
// Environment variables required:
//   CRON_SECRET  — secret token sent in Authorization header by Vercel Cron
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL
//
// Three checks are run in priority order:
//   1. Budget overage alerts    — categories at or over monthly budget
//   2. Settlement reminders     — partner-split items unsettled for 3+ days
//   3. Recurring expense nudges — recurring items that have passed their due date
//
// Each household only receives one notification per check type per day (dedup
// via a simple check against notified_at stored in a notifications_log table).
//
// Supabase migration for log table (run once):
//   CREATE TABLE IF NOT EXISTS notification_log (
//     id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     household_id    UUID NOT NULL,
//     notification_type TEXT NOT NULL,
//     sent_at         TIMESTAMPTZ DEFAULT now(),
//     meta            JSONB
//   );
//   CREATE INDEX IF NOT EXISTS notif_log_household_type_idx
//     ON notification_log(household_id, notification_type, sent_at);

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyHousehold, type PushPayload } from '@/lib/webPush';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ── Auth guard ────────────────────────────────────────────────────────────────
function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In development without a secret, allow all
  if (!cronSecret) return true;

  return authHeader === `Bearer ${cronSecret}`;
}

// ── Month key helper ──────────────────────────────────────────────────────────
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Already notified today? ───────────────────────────────────────────────────
async function alreadyNotifiedToday(
  householdId: string,
  type: string,
): Promise<boolean> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('notification_log')
    .select('id')
    .eq('household_id', householdId)
    .eq('notification_type', type)
    .gte('sent_at', dayStart.toISOString())
    .limit(1)
    .single();

  return !!data;
}

// ── Log a notification send ───────────────────────────────────────────────────
async function logNotification(
  householdId: string,
  type: string,
  meta?: Record<string, any>,
): Promise<void> {
  await supabase.from('notification_log').insert({
    household_id:      householdId,
    notification_type: type,
    meta:              meta ?? null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 1: Budget overage alerts
// Finds households where a category has exceeded its monthly budget
// and the notification settings have budgetAlert enabled.
// ─────────────────────────────────────────────────────────────────────────────
async function runBudgetAlerts(): Promise<number> {
  let alertsSent = 0;
  const monthKey = currentMonthKey();

  // Fetch all households that have push subscribers AND budgets configured
  const { data: households } = await supabase
    .from('push_subscriptions')
    .select('household_id')
    .limit(500);

  if (!households?.length) return 0;

  const householdIds = [...new Set(households.map((h: any) => h.household_id))];

  for (const householdId of householdIds) {
    // Get settings
    const { data: settingsRow } = await supabase
      .from('household_settings')
      .select('settings_data')
      .eq('household_id', householdId)
      .single();

    if (!settingsRow?.settings_data) continue;

    const settings = typeof settingsRow.settings_data === 'string'
      ? JSON.parse(settingsRow.settings_data)
      : settingsRow.settings_data;

    // Check if budget alerts are enabled
    if (!settings?.notifications?.budgetAlert) continue;

    const budgets: Record<string, number> = settings.budgets ?? {};
    if (Object.keys(budgets).length === 0) continue;

    const threshold = settings.notifications?.budgetThreshold ?? 80;

    // Fetch this month's expenses
    const { data: transactions } = await supabase
      .from('transactions')
      .select('category, amount')
      .eq('household_id', householdId)
      .eq('type', 'expense')
      .like('date', `${monthKey}%`);

    if (!transactions?.length) continue;

    // Sum by category
    const catTotals: Record<string, number> = {};
    for (const tx of transactions) {
      catTotals[tx.category] = (catTotals[tx.category] ?? 0) + Number(tx.amount);
    }

    // Find overages
    const overages: string[] = [];
    for (const [cat, budget] of Object.entries(budgets)) {
      if (!budget || budget <= 0) continue;
      const spent = catTotals[cat] ?? 0;
      const pct   = (spent / budget) * 100;
      if (pct >= threshold) {
        overages.push(`${cat}: ₹${Math.round(spent).toLocaleString('en-IN')} of ₹${Math.round(budget).toLocaleString('en-IN')}`);
      }
    }

    if (overages.length === 0) continue;

    const alreadyNotified = await alreadyNotifiedToday(householdId, 'budget_alert');
    if (alreadyNotified) continue;

    const payload: PushPayload = {
      title: '⚠️ Budget Alert',
      body:  overages.length === 1
        ? `${overages[0]} (${threshold}%+ used this month)`
        : `${overages.length} categories at ${threshold}%+ this month`,
      tag:   'budget-alert',
      url:   '/app?view=dashboard',
    };

    await notifyHousehold(supabase, householdId, payload);
    await logNotification(householdId, 'budget_alert', { overages });
    alertsSent++;
  }

  return alertsSent;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 2: Settlement reminders
// Partner-split transactions unsettled for 3+ days.
// ─────────────────────────────────────────────────────────────────────────────
async function runSettlementReminders(): Promise<number> {
  let remindersSent = 0;
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const cutoffDate = threeDaysAgo.toISOString().slice(0, 10);

  // Find households with push subscribers
  const { data: households } = await supabase
    .from('push_subscriptions')
    .select('household_id')
    .limit(500);

  if (!households?.length) return 0;
  const householdIds = [...new Set(households.map((h: any) => h.household_id))];

  for (const householdId of householdIds) {
    // Check if settlement notifications are enabled
    const { data: settingsRow } = await supabase
      .from('household_settings')
      .select('settings_data')
      .eq('household_id', householdId)
      .single();

    const settings = settingsRow?.settings_data
      ? (typeof settingsRow.settings_data === 'string'
          ? JSON.parse(settingsRow.settings_data)
          : settingsRow.settings_data)
      : null;

    if (!settings?.notifications?.settlement) continue;

    // Find unsettled partner-split transactions older than 3 days
    const { data: unsettled } = await supabase
      .from('transactions')
      .select('id, category, amount, date')
      .eq('household_id', householdId)
      .eq('settle_track', 'partner')
      .eq('settled', false)
      .lte('date', cutoffDate)
      .limit(10);

    if (!unsettled?.length) continue;

    const alreadyNotified = await alreadyNotifiedToday(householdId, 'settlement_reminder');
    if (alreadyNotified) continue;

    const totalOwed = unsettled.reduce((s: number, tx: any) => s + Number(tx.amount), 0);
    const count     = unsettled.length;

    const payload: PushPayload = {
      title: '💸 Settlement Reminder',
      body:  `${count} unsettled split${count > 1 ? 's' : ''} totalling ₹${Math.round(totalOwed).toLocaleString('en-IN')} — over 3 days old`,
      tag:   'settlement-reminder',
      url:   '/app?view=settle',
    };

    await notifyHousehold(supabase, householdId, payload);
    await logNotification(householdId, 'settlement_reminder', { count, totalOwed });
    remindersSent++;
  }

  return remindersSent;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 3: Recurring expense reminders
// Recurring transactions whose due date has passed without a new entry.
// Only monthly recurrences are checked (daily/weekly are too noisy for push).
// ─────────────────────────────────────────────────────────────────────────────
async function runRecurringReminders(): Promise<number> {
  let remindersSent = 0;
  const today       = new Date();
  const monthKey    = currentMonthKey();

  const { data: households } = await supabase
    .from('push_subscriptions')
    .select('household_id')
    .limit(500);

  if (!households?.length) return 0;
  const householdIds = [...new Set(households.map((h: any) => h.household_id))];

  for (const householdId of householdIds) {
    // Check if notifications are enabled at all
    const { data: settingsRow } = await supabase
      .from('household_settings')
      .select('settings_data')
      .eq('household_id', householdId)
      .single();

    const settings = settingsRow?.settings_data
      ? (typeof settingsRow.settings_data === 'string'
          ? JSON.parse(settingsRow.settings_data)
          : settingsRow.settings_data)
      : null;

    if (!settings?.notifications?.enabled) continue;

    // Find monthly recurring templates (most recent instance per category+note)
    const { data: recurring } = await supabase
      .from('transactions')
      .select('id, category, note, amount, date, recurrence_interval')
      .eq('household_id', householdId)
      .eq('is_recurring', true)
      .eq('recurrence_interval', 'monthly')
      .order('date', { ascending: false })
      .limit(50);

    if (!recurring?.length) continue;

    // Deduplicate — keep only the latest per category+note combo
    const seen = new Map<string, any>();
    for (const tx of recurring) {
      const key = `${tx.category}|${tx.note ?? ''}`;
      if (!seen.has(key)) seen.set(key, tx);
    }

    // Check which ones have NOT been logged this month
    const due: any[] = [];
    for (const [, tx] of seen) {
      const { data: thisMonth } = await supabase
        .from('transactions')
        .select('id')
        .eq('household_id', householdId)
        .eq('category', tx.category)
        .eq('note', tx.note ?? '')
        .like('date', `${monthKey}%`)
        .limit(1)
        .single();

      if (!thisMonth) {
        // Check if we're past the day-of-month from the original
        const originalDay = new Date(tx.date).getDate();
        if (today.getDate() >= originalDay) {
          due.push(tx);
        }
      }
    }

    if (due.length === 0) continue;

    const alreadyNotified = await alreadyNotifiedToday(householdId, 'recurring_reminder');
    if (alreadyNotified) continue;

    const names = due.slice(0, 3).map((t: any) => t.note || t.category).join(', ');
    const more  = due.length > 3 ? ` + ${due.length - 3} more` : '';

    const payload: PushPayload = {
      title: '🔄 Recurring Expenses Due',
      body:  `Not yet logged this month: ${names}${more}`,
      tag:   'recurring-reminder',
      url:   '/app?view=add',
    };

    await notifyHousehold(supabase, householdId, payload);
    await logNotification(householdId, 'recurring_reminder', { due_count: due.length });
    remindersSent++;
  }

  return remindersSent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main GET handler — Vercel Cron hits this endpoint
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startMs = Date.now();

  try {
    const [budget, settlement, recurring] = await Promise.all([
      runBudgetAlerts(),
      runSettlementReminders(),
      runRecurringReminders(),
    ]);

    const durationMs = Date.now() - startMs;

    console.log(
      `[Cron/notifications] budget=${budget} settlement=${settlement} recurring=${recurring} duration=${durationMs}ms`
    );

    return NextResponse.json({
      ok:         true,
      budget_alerts:       budget,
      settlement_reminders: settlement,
      recurring_reminders:  recurring,
      duration_ms: durationMs,
    });
  } catch (err: any) {
    console.error('[Cron/notifications] Fatal error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}

// Also accept POST for manual triggers (e.g. from Supabase pg_cron via HTTP extension)
export const POST = GET;
