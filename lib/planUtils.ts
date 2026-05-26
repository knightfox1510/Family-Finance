// ─── lib/planUtils.ts ────────────────────────────────────────────────────────
// Plan and usage metering for the Telegram AI parsing feature.
//
// Uses the existing `households` table — no separate table needed.
// Run this migration once in Supabase SQL editor:
//
//   ALTER TABLE households
//     ADD COLUMN IF NOT EXISTS plan            TEXT NOT NULL DEFAULT 'free',
//     ADD COLUMN IF NOT EXISTS ai_parse_count  INT  NOT NULL DEFAULT 0,
//     ADD COLUMN IF NOT EXISTS usage_month     TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM');
//
//   CREATE OR REPLACE FUNCTION increment_ai_parse_count(p_household_id UUID)
//   RETURNS void AS $$
//     UPDATE households
//     SET
//       ai_parse_count = CASE
//         WHEN usage_month = to_char(now(), 'YYYY-MM') THEN ai_parse_count + 1
//         ELSE 1
//       END,
//       usage_month = to_char(now(), 'YYYY-MM')
//     WHERE id = p_household_id;
//   $$ LANGUAGE sql;
//
// To upgrade a household to Pro (after receiving payment):
//   UPDATE households SET plan = 'pro' WHERE id = 'household-uuid-here';

import { createClient } from '@supabase/supabase-js';

// planUtils runs in the BROWSER (dynamic import from page.tsx).
// Must use the anon key — SUPABASE_SERVICE_ROLE_KEY is undefined client-side.
// The anon key with RLS is sufficient for reading your own household row.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ─── Constants ────────────────────────────────────────────────────────────────
export const FREE_MONTHLY_LIMIT = 30;
export type Plan = 'free' | 'pro';

// ─── Current month string ─────────────────────────────────────────────────────
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

// ─── Check if a household can make an AI parse call ──────────────────────────
// Reads from the households table directly.
export async function canUseAI(householdId: string): Promise<{
  allowed: boolean;
  plan: Plan;
  count: number;
  remaining: number;
}> {
  const { data, error } = await supabase
    .from('households')
    .select('id, plan, ai_parse_count, usage_month')
    .eq('id', householdId)
    .single();

  if (error || !data || data.ai_parse_count === null || data.ai_parse_count === undefined) {
    // Row missing or columns not yet migrated — fail open
    return { allowed: true, plan: 'free', count: 0, remaining: FREE_MONTHLY_LIMIT };
  }

  const plan: Plan = data.plan === 'pro' ? 'pro' : 'free';

  if (plan === 'pro') {
    return { allowed: true, plan, count: data.ai_parse_count, remaining: Infinity };
  }

  // For free plan: check if the stored month matches the current month.
  // If not, the counter has effectively reset (the RPC will reset it on next write).
  const isCurrentMonth = data.usage_month === currentMonth();
  const count = isCurrentMonth ? (data.ai_parse_count ?? 0) : 0;
  const remaining = Math.max(0, FREE_MONTHLY_LIMIT - count);

  return { allowed: remaining > 0, plan, count, remaining };
}

// ─── Increment the AI parse counter (calls the Supabase RPC) ─────────────────
// The RPC handles month rollover atomically — no race conditions.
export async function incrementUsage(householdId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_ai_parse_count', {
    p_household_id: householdId,
  });

  if (error) {
    // Log but don't throw — a failed counter shouldn't block the user's expense
    console.error('planUtils.incrementUsage error:', error.message);
  }
}

// ─── Get full usage summary for display (Settings UI) ────────────────────────
export async function getUsageSummary(householdId: string): Promise<{
  plan: Plan;
  count: number;
  limit: number;
  remaining: number;
  month: string;
  pct: number;
}> {
  const { data, error } = await supabase
    .from('households')
    .select('id, plan, ai_parse_count, usage_month')
    .eq('id', householdId)
    .single();

  if (error || !data) {
    console.warn('planUtils.getUsageSummary: could not read households row.', householdId, error?.message);
    return { plan: 'free', count: 0, limit: FREE_MONTHLY_LIMIT, remaining: FREE_MONTHLY_LIMIT, month: currentMonth(), pct: 0 };
  }

  // Handle null — column exists but is NULL for rows before migration
  if (data.ai_parse_count === null || data.ai_parse_count === undefined) {
    return { plan: 'free', count: 0, limit: FREE_MONTHLY_LIMIT, remaining: FREE_MONTHLY_LIMIT, month: currentMonth(), pct: 0 };
  }

  const plan: Plan = data.plan === 'pro' ? 'pro' : 'free';
  // Always use the stored count — don't zero it out on month mismatch here,
  // the RPC handles month rollover atomically on increment.
  const count = Number(data.ai_parse_count ?? 0);
  const month = data.usage_month ?? currentMonth();

  if (plan === 'pro') {
    return { plan, count, limit: Infinity, remaining: Infinity, month, pct: 0 };
  }

  const remaining = Math.max(0, FREE_MONTHLY_LIMIT - count);
  const pct = Math.min(100, (count / FREE_MONTHLY_LIMIT) * 100);
  return { plan, count, limit: FREE_MONTHLY_LIMIT, remaining, month, pct };
}
