// ─── lib/supabaseHelpers.ts ───────────────────────────────────────────────────
// All Supabase interactions live here.
//
// KEY DESIGN PRINCIPLE — targeted updates, no full reloads:
//   Every write function returns the minimal change needed so the caller
//   can do a surgical setData() instead of re-fetching everything.
//
// The only time we do a full loadData() is on first mount and after
// joinHousehold (which changes the household entirely).

import { supabase } from '@/lib/supabaseClient';
import type {
  AppData, Expense, Contribution, Goal, Loan, Settings, SettleTrack,
} from '@/types';
import { DEFAULT_SETTINGS } from '@/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps display name ↔ system key ("Partner A" / "Partner B") */
export function toSystemKey(
  val: string,
  settings: Pick<Settings, 'partnerAName' | 'partnerBName'>,
): string {
  if (val === settings.partnerAName) return 'Partner A';
  if (val === settings.partnerBName) return 'Partner B';
  return val;
}

/** Maps system key → display name */
export function toDisplayName(
  val: string,
  settings: Pick<Settings, 'partnerAName' | 'partnerBName'>,
): string {
  if (!val) return '';
  if (val === 'Partner A') return settings.partnerAName;
  if (val === 'Partner B') return settings.partnerBName;
  return val;
}

// ---------------------------------------------------------------------------
// Full load (used only on mount and after joinHousehold)
// ---------------------------------------------------------------------------
export async function loadData(userId: string): Promise<AppData> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('household_id')
      .eq('id', userId)
      .single();

    if (!profile) throw new Error('Profile not found');
    const hId: string = profile.household_id;

    // Paginated transaction fetch
    let allTransactions: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: txChunk, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('household_id', hId)
        .order('date', { ascending: false })
        .order('id', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (txError) throw txError;
      if (!txChunk || txChunk.length === 0) {
        hasMore = false;
      } else {
        allTransactions = [...allTransactions, ...txChunk];
        hasMore = txChunk.length === pageSize;
        page++;
      }
    }

    // Parallel fetches
    const [gl, ln, cb, st, currentProfileRow] = await Promise.all([
      supabase.from('goals').select('*').eq('household_id', hId),
      supabase.from('loans').select('*').eq('household_id', hId),
      supabase.from('contributions').select('*').eq('household_id', hId),
      supabase.from('household_settings').select('*').eq('household_id', hId),
      supabase.from('profiles').select('telegram_username, display_name').eq('id', userId).single(),
    ]);

    // Resolve settings
    let cloudSettingsRow: any = null;
    if (st.data && st.data.length > 0) {
      const sorted = [...st.data].sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      cloudSettingsRow = sorted[0];
    }

    let unpacked: any = {};
    if (cloudSettingsRow?.settings_data) {
      unpacked = typeof cloudSettingsRow.settings_data === 'string'
        ? JSON.parse(cloudSettingsRow.settings_data)
        : cloudSettingsRow.settings_data;
    } else if (cloudSettingsRow) {
      unpacked = cloudSettingsRow;
    }

    // setupComplete = true only if the user has explicitly completed the wizard.
    // New users have no household_settings row, so this will be false → wizard shows.
    // Existing users who signed up before this feature also get false once,
    // then wizard shows once and marks them complete.
    const setupComplete: boolean = Boolean(
      cloudSettingsRow && (unpacked.setupComplete === true || unpacked.setup_complete === true)
    );

    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      ...unpacked,
      householdMode: unpacked.householdMode ?? unpacked.household_mode ?? 'joint',
      partnerAName:  unpacked.partnerAName  ?? unpacked.partner_a_name ?? 'Partner A',
      partnerBName:  unpacked.partnerBName  ?? unpacked.partner_b_name ?? 'Partner B',
      expenseCategories: unpacked.expenseCategories ?? unpacked.expense_categories ?? DEFAULT_SETTINGS.expenseCategories,
      incomeCategories:  unpacked.incomeCategories  ?? unpacked.income_categories  ?? DEFAULT_SETTINGS.incomeCategories,
      budgets:       unpacked.budgets ?? {},
      telegramUsername: currentProfileRow.data?.telegram_username ?? unpacked.telegramUsername ?? '',
      setupComplete,
    };

    const toUI = (val: string) => toDisplayName(val, settings);

    const expenses: Expense[] = allTransactions.map((r: any) => {
      // ── Backward-compatible settlement mapping ─────────────────────────────
      // Old system used: to_settle (bool), settled (bool), settled_with (string)
      // New system adds: settle_track ('none'|'joint'|'partner'), split_mode,
      //                  partner_a_share, partner_b_share
      //
      // Rules:
      //  1. If settle_track is set, trust it. It's the authoritative new value.
      //  2. If settle_track is null/missing, derive it from old columns:
      //       to_settle=true  → 'joint'  (was flagged for joint reimbursement)
      //       otherwise       → 'none'
      //  3. toSettle (UI flag for "pending in settle queue") = true when:
      //       - settle_track is 'joint' (new), OR
      //       - to_settle is true (old), AND not yet settled
      //  4. Partner-track items are NEVER in the joint settle queue (toSettle=false)
      //     — they appear in the partner ledger instead.

      const rawSettleTrack = r.settle_track;
      const settleTrack: SettleTrack =
        rawSettleTrack === 'joint'   ? 'joint'   :
        rawSettleTrack === 'partner' ? 'partner' :
        rawSettleTrack === 'none'    ? 'none'    :
        r.to_settle === true         ? 'joint'   : 'none';

      const isSettled = r.settled === true || r.settled === 'true';

      // toSettle = "show in the joint settlement queue"
      // partner-track items never appear there
      const toSettle =
        !isSettled &&
        settleTrack !== 'partner' &&
        (settleTrack === 'joint' || r.to_settle === true);

      return {
        id: r.id,
        date: r.date,
        amount: r.amount,
        category: r.category,
        type: r.type,
        account: toUI(r.account_used),
        addedBy: toUI(r.added_by),
        note: r.note ?? '',
        settled: isSettled,
        settledFor: r.settled_with ? toUI(r.settled_with) : null,
        isRecurring: r.is_recurring ?? false,
        recurrenceInterval: r.recurrence_interval ?? 'monthly',
        settleTrack,
        splitMode: r.split_mode ?? 'equal',
        partnerAShare: Number(r.partner_a_share ?? 0.5),
        partnerBShare: Number(r.partner_b_share ?? 0.5),
        toSettle,
      };
    });

    const goals: Goal[] = (gl.data ?? []).map((r: any) => {
      const target   = Number(r.target_amount ?? 0);
      const pATarget = Number(r.partner_a_target  ?? 0);
      const pBTarget = Number(r.partner_b_target  ?? 0);
      const pACur    = Number(r.partner_a_current ?? 0);
      const pBCur    = Number(r.partner_b_current ?? 0);
      const current  = pACur + pBCur;
      const shortfall = Math.max(0, target - current);
      const shortfallA = Math.max(0, pATarget - pACur);
      const shortfallB = Math.max(0, pBTarget - pBCur);
      const now = new Date();
      const targetDate = r.target_date ? new Date(r.target_date) : null;
      let monthsRemaining = 0;
      if (targetDate && targetDate > now) {
        monthsRemaining = Math.max(1,
          (targetDate.getFullYear() - now.getFullYear()) * 12 +
          (targetDate.getMonth() - now.getMonth())
        );
      }
      const velocityA = monthsRemaining > 0 ? Math.round(shortfallA / monthsRemaining) : 0;
      const velocityB = monthsRemaining > 0 ? Math.round(shortfallB / monthsRemaining) : 0;
      const pct = target > 0 ? (current / target) * 100 : 0;
      const paceStatus =
        current >= target ? 'Completed' :
        pct < 50 && monthsRemaining <= 3 ? 'Critical' :
        pct < 25 && monthsRemaining <= 6 ? 'Needs Attention' : 'On Track';

      return {
        id: r.id, name: r.name, target, partnerATarget: pATarget, partnerBTarget: pBTarget,
        partnerACurrent: pACur, partnerBCurrent: pBCur, current, targetDate: r.target_date ?? null,
        strategy: r.strategy ?? 'Short-Term', shortfall, monthsRemaining,
        velocityA, velocityB, paceStatus, icon: r.icon ?? '🎯', color: r.color ?? '#00e5ff',
      };
    });

    const loans: Loan[] = (ln.data ?? []).map((r: any) => ({
      id: r.id, name: r.name, lender: r.lender ?? '',
      principal: r.principal, outstanding: r.outstanding, emi: r.emi,
      interestRate: r.interest_rate, startDate: r.start_date,
      tenureMonths: r.tenure_months, paymentDay: r.payment_day ?? 1,
    }));

    const contributions: Contribution[] = (cb.data ?? []).map((r: any) => ({
      id: r.id, month: r.month,
      partnerA: r.partner_a_amount, partnerB: r.partner_b_amount,
    }));

    return {
      householdId: hId,
      expenses,
      goals,
      loans,
      contributions,
      settings,
      currentUserRole: currentProfileRow.data?.display_name ?? 'Partner A',
    };
  } catch (err) {
    console.error('loadData error:', err);
    return seedData();
  }
}

// ---------------------------------------------------------------------------
// Seed (empty state for first-time users)
// ---------------------------------------------------------------------------
export function seedData(): AppData {
  return {
    householdId: '',
    expenses: [],
    contributions: [{ id: crypto.randomUUID(), month: todayMonthKey(), partnerA: 0, partnerB: 0 }],
    goals: [],
    loans: [],
    settings: DEFAULT_SETTINGS,
    currentUserRole: 'Partner A',
  };
}

// ---------------------------------------------------------------------------
// Targeted write helpers
// Each returns { error } so the hook can handle UI feedback.
// ---------------------------------------------------------------------------

export async function dbAddExpense(
  tx: Expense, // <-- Change Omit<Expense, never> to just Expense
  householdId: string,
  settings: Settings,
) {
  const row = expenseToRow(tx, householdId, settings);
  return supabase.from('transactions').insert([row]);
}

export async function dbUpdateExpense(
  id: string,
  updated: Partial<Expense>,
  settings: Settings,
) {
  return supabase
    .from('transactions')
    .update(expenseFieldsToRow(updated, settings))
    .eq('id', id);
}

export async function dbDeleteExpense(id: string) {
  return supabase.from('transactions').delete().eq('id', id);
}

export async function dbBulkDelete(ids: string[]) {
  return supabase.from('transactions').delete().in('id', ids);
}

export async function dbBulkUpdate(ids: string[], fields: Record<string, unknown>) {
  return supabase.from('transactions').update(fields).in('id', ids);
}

export async function dbUpsertContribution(
  c: Contribution,
  householdId: string,
) {
  return supabase.from('contributions').upsert(
    { id: c.id, household_id: householdId, month: c.month, partner_a_amount: c.partnerA, partner_b_amount: c.partnerB },
    { onConflict: 'household_id,month' },
  );
}

export async function dbSaveSettings(
  s: Settings,
  householdId: string,
  userId: string,
) {
  const deviceRole =
    typeof window !== 'undefined'
      ? (localStorage.getItem('active_partner_role') ?? 'Partner A')
      : 'Partner A';

  const [settingsResult, profileResult] = await Promise.all([
    supabase.from('household_settings').upsert(
      { household_id: householdId, settings_data: s },
      { onConflict: 'household_id' },
    ),
    supabase.from('profiles')
      .update({ display_name: deviceRole, telegram_username: s.telegramUsername })
      .eq('id', userId),
  ]);

  return settingsResult.error ?? profileResult.error ?? null;
}

export async function dbAddGoal(g: Goal, householdId: string) {
  return supabase.from('goals').insert([goalToRow(g, householdId)]);
}

export async function dbUpdateGoal(id: string, g: Partial<Goal>) {
  return supabase.from('goals').update(goalFieldsToRow(g)).eq('id', id);
}

export async function dbDeleteGoal(id: string) {
  return supabase.from('goals').delete().eq('id', id);
}

export async function dbAddLoan(l: Loan, householdId: string) {
  return supabase.from('loans').insert([loanToRow(l, householdId)]);
}

export async function dbUpdateLoan(id: string, l: Partial<Loan>) {
  return supabase.from('loans').update(loanFieldsToRow(l)).eq('id', id);
}

export async function dbDeleteLoan(id: string) {
  return supabase.from('loans').delete().eq('id', id);
}

// ---------------------------------------------------------------------------
// Row mappers (AppData shape → Supabase column names)
// ---------------------------------------------------------------------------

function expenseToRow(e: Expense, householdId: string, settings: Settings) {
  return {
    id: e.id,
    household_id: householdId,
    date: e.date,
    amount: e.amount,
    category: e.category,
    type: e.type,
    account_used: toSystemKey(e.account, settings),
    added_by: toSystemKey(e.addedBy, settings),
    note: e.note,
    settled: e.settled,
    settled_with: e.settledFor ? toSystemKey(e.settledFor, settings) : null,
    is_recurring: e.isRecurring,
    recurrence_interval: e.recurrenceInterval,
    settle_track: e.settleTrack,
    split_mode: e.splitMode,
    partner_a_share: e.partnerAShare,
    partner_b_share: e.partnerBShare,
    to_settle: e.settleTrack === 'joint',
  };
}

function expenseFieldsToRow(fields: Partial<Expense>, settings: Settings) {
  const row: Record<string, unknown> = {};
  if (fields.date !== undefined)               row.date               = fields.date;
  if (fields.amount !== undefined)             row.amount             = fields.amount;
  if (fields.category !== undefined)           row.category           = fields.category;
  if (fields.type !== undefined)               row.type               = fields.type;
  if (fields.account !== undefined)            row.account_used       = toSystemKey(fields.account, settings);
  if (fields.addedBy !== undefined)            row.added_by           = toSystemKey(fields.addedBy, settings);
  if (fields.note !== undefined)               row.note               = fields.note;
  if (fields.settled !== undefined)            row.settled            = fields.settled;
  if (fields.settledFor !== undefined)         row.settled_with       = fields.settledFor ? toSystemKey(fields.settledFor, settings) : null;
  if (fields.isRecurring !== undefined)        row.is_recurring       = fields.isRecurring;
  if (fields.recurrenceInterval !== undefined) row.recurrence_interval = fields.recurrenceInterval;
  if (fields.settleTrack !== undefined)        row.settle_track       = fields.settleTrack;
  if (fields.splitMode !== undefined)          row.split_mode         = fields.splitMode;
  if (fields.partnerAShare !== undefined)      row.partner_a_share    = fields.partnerAShare;
  if (fields.partnerBShare !== undefined)      row.partner_b_share    = fields.partnerBShare;
  if (fields.settleTrack !== undefined)        row.to_settle          = fields.settleTrack === 'joint';
  return row;
}

function goalToRow(g: Goal, householdId: string) {
  return {
    id: g.id, household_id: householdId, name: g.name,
    target_amount: g.target, partner_a_target: g.partnerATarget, partner_b_target: g.partnerBTarget,
    partner_a_current: g.partnerACurrent, partner_b_current: g.partnerBCurrent,
    target_date: g.targetDate ?? null, strategy: g.strategy, icon: g.icon, color: g.color,
  };
}

function goalFieldsToRow(g: Partial<Goal>) {
  const row: Record<string, unknown> = {};
  if (g.name !== undefined)            row.name              = g.name;
  if (g.target !== undefined)          row.target_amount     = g.target;
  if (g.partnerATarget !== undefined)  row.partner_a_target  = g.partnerATarget;
  if (g.partnerBTarget !== undefined)  row.partner_b_target  = g.partnerBTarget;
  if (g.partnerACurrent !== undefined) row.partner_a_current = g.partnerACurrent;
  if (g.partnerBCurrent !== undefined) row.partner_b_current = g.partnerBCurrent;
  if (g.targetDate !== undefined)      row.target_date       = g.targetDate;
  if (g.strategy !== undefined)        row.strategy          = g.strategy;
  if (g.icon !== undefined)            row.icon              = g.icon;
  if (g.color !== undefined)           row.color             = g.color;
  return row;
}

function loanToRow(l: Loan, householdId: string) {
  return {
    id: l.id, household_id: householdId, name: l.name, lender: l.lender,
    principal: l.principal, outstanding: l.outstanding, emi: l.emi,
    interest_rate: l.interestRate, start_date: l.startDate,
    tenure_months: l.tenureMonths, payment_day: l.paymentDay,
  };
}

function loanFieldsToRow(l: Partial<Loan>) {
  const row: Record<string, unknown> = {};
  if (l.name !== undefined)         row.name          = l.name;
  if (l.lender !== undefined)       row.lender        = l.lender;
  if (l.principal !== undefined)    row.principal     = l.principal;
  if (l.outstanding !== undefined)  row.outstanding   = l.outstanding;
  if (l.emi !== undefined)          row.emi           = l.emi;
  if (l.interestRate !== undefined) row.interest_rate = l.interestRate;
  if (l.startDate !== undefined)    row.start_date    = l.startDate;
  if (l.tenureMonths !== undefined) row.tenure_months = l.tenureMonths;
  if (l.paymentDay !== undefined)   row.payment_day   = l.paymentDay;
  return row;
}

// ---------------------------------------------------------------------------
// Tiny utilities used internally
// ---------------------------------------------------------------------------
function todayMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
