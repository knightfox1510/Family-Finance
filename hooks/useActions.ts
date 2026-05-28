// ─── hooks/useActions.ts ──────────────────────────────────────────────────────
// All data mutations, now with TARGETED state updates.
//
// Before:  write to DB → call loadData() → replace entire state tree
// After:   write to DB → surgical setData() update of only what changed
//
// This eliminates the round-trip and makes every action feel instant.
// loadData() is only called on mount and after joinHousehold.

import { useCallback } from 'react';
import type { AppData, Expense, Contribution, Goal, Loan, Settings } from '@/types';
import {
  dbAddExpense, dbUpdateExpense, dbDeleteExpense,
  dbBulkDelete, dbBulkUpdate,
  dbUpsertContribution,
  dbSaveSettings,
  dbAddGoal, dbUpdateGoal, dbDeleteGoal,
  dbAddLoan, dbUpdateLoan, dbDeleteLoan,
  loadData,
  toSystemKey,
} from '@/lib/supabaseHelpers';
import { supabase } from '@/lib/supabaseClient';
import type { ToastType } from '@/components/ui/ui';

// ---------------------------------------------------------------------------
// Utility: stable uid using Web Crypto API
// ---------------------------------------------------------------------------
function uid(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// ---------------------------------------------------------------------------
// Utility: compute a Goal's derived fields from its raw numbers
// ---------------------------------------------------------------------------
function deriveGoalFields(g: Partial<Goal>): Partial<Goal> {
  const target   = Number(g.target ?? 0);
  const pACur    = Number(g.partnerACurrent ?? 0);
  const pBCur    = Number(g.partnerBCurrent ?? 0);
  const current  = pACur + pBCur;
  const shortfall = Math.max(0, target - current);
  return { ...g, current, shortfall };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
interface UseActionsParams {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  session: any;  // Supabase session
  addToast: (text: string, type?: ToastType) => void;
}

export function useActions({ data, setData, session, addToast }: UseActionsParams) {

  // ── Expenses ─────────────────────────────────────────────────────────────

  const addExpense = useCallback(async (e: Expense) => {
    // 1. Optimistic update — prepend to list instantly
    setData((prev) => ({
      ...prev,
      expenses: [e, ...prev.expenses],
    }));

    // 2. Persist to DB
    const { error } = await dbAddExpense(e, data.householdId, data.settings);
    if (error) {
      // Rollback
      setData((prev) => ({ ...prev, expenses: prev.expenses.filter((x) => x.id !== e.id) }));
      addToast('Failed to save expense: ' + error.message, 'error');
    } else {
      // Fire browser notification if enabled
      notifyIfAllowed('New Expense', `Added ${e.category} — ${e.amount}`, data.settings);
    }
  }, [data, setData, addToast]);

  const updateExpense = useCallback(async (id: string, updated: Partial<Expense>) => {
    // 1. Snapshot for rollback
    const previous = data.expenses.find((e) => e.id === id);

    // 2. Optimistic update
    setData((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => e.id === id ? { ...e, ...updated } : e),
    }));

    // 3. Persist
    const { error } = await dbUpdateExpense(id, updated, data.settings);
    if (error) {
      // Rollback to snapshot
      setData((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => e.id === id && previous ? previous : e),
      }));
      addToast('Failed to update expense: ' + error.message, 'error');
    }
  }, [data, setData, addToast]);

  const deleteExpense = useCallback(async (id: string) => {
    const previous = data.expenses.find((e) => e.id === id);
    setData((prev) => ({ ...prev, expenses: prev.expenses.filter((e) => e.id !== id) }));
    const { error } = await dbDeleteExpense(id);
    if (error) {
      if (previous) setData((prev) => ({ ...prev, expenses: [previous, ...prev.expenses] }));
      addToast('Failed to delete: ' + error.message, 'error');
    }
  }, [data, setData, addToast]);

  // Reverse a settled transaction back to its pending state.
  // Useful when a settlement was recorded by mistake, or when a partner-track
  // item was incorrectly marked settled via the old joint-settle flow.
  const unsettle = useCallback(async (id: string) => {
    // Optimistic update
    setData((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) =>
        e.id === id
          ? { ...e, settled: false, settledFor: null }
          : e
      ),
    }));
    const { error } = await dbUpdateExpense(id, { settled: false, settledFor: null }, data.settings);
    if (error) {
      // Rollback
      setData((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => {
          const original = data.expenses.find((x) => x.id === id);
          return e.id === id && original ? original : e;
        }),
      }));
      addToast('Failed to unsettle: ' + error.message, 'error');
    } else {
      addToast('Marked as unsettled ✓', 'success');
    }
  }, [data, setData, addToast]);

  const toggleToSettle = useCallback(async (id: string) => {
    const expense = data.expenses.find((e) => e.id === id);
    if (!expense) return;
    const newValue = !expense.toSettle;
    setData((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => e.id === id ? { ...e, toSettle: newValue } : e),
    }));
    const { error } = await dbUpdateExpense(id, { toSettle: newValue, settleTrack: newValue ? 'joint' : 'none' }, data.settings);
    if (error) {
      setData((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => e.id === id ? { ...e, toSettle: !newValue } : e),
      }));
      addToast('Failed to update: ' + error.message, 'error');
    }
  }, [data, setData, addToast]);

  // ── Bulk actions (targeted, no reload) ────────────────────────────────────

  const bulkDeleteExpense = useCallback(async (ids: string[]) => {
    if (!confirm(`Permanently delete ${ids.length} entries?`)) return;
    const idSet = new Set(ids);
    const removed = data.expenses.filter((e) => idSet.has(e.id));
    setData((prev) => ({ ...prev, expenses: prev.expenses.filter((e) => !idSet.has(e.id)) }));
    const { error } = await dbBulkDelete(ids);
    if (error) {
      setData((prev) => ({ ...prev, expenses: [...removed, ...prev.expenses] }));
      addToast('Delete failed: ' + error.message, 'error');
    }
  }, [data, setData, addToast]);

  const bulkFlagToSettle = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setData((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) =>
        idSet.has(e.id) ? { ...e, toSettle: true, settleTrack: 'joint' as const } : e
      ),
    }));
    const { error } = await dbBulkUpdate(ids, { to_settle: true, settle_track: 'joint' });
    if (error) addToast('Bulk flag failed: ' + error.message, 'error');
  }, [data, setData, addToast]);

  const bulkMarkAsSettled = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setData((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => idSet.has(e.id) ? { ...e, settled: true } : e),
    }));
    const { error } = await dbBulkUpdate(ids, { settled: true });
    if (error) addToast('Bulk settle failed: ' + error.message, 'error');
  }, [data, setData, addToast]);

  const bulkAssignToAccount = useCallback(async (ids: string[], targetAccount: string) => {
    if (!ids.length || !targetAccount) return;
    const idSet = new Set(ids);
    setData((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => idSet.has(e.id) ? { ...e, account: targetAccount } : e),
    }));
    const { error } = await dbBulkUpdate(ids, { account_used: toSystemKey(targetAccount, data.settings) });
    if (error) addToast('Bulk assign failed: ' + error.message, 'error');
  }, [data, setData, addToast]);

  const bulkSettle = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
    setData((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => {
        if (!idSet.has(e.id)) return e;
        const partner =
          e.account.includes(names.a) || e.account.includes('Partner A') ? 'Partner A' : 'Partner B';
        return { ...e, settled: true, settledFor: partner, account: 'Joint' };
      }),
    }));

    try {
      const results = await Promise.all(
        ids.map((id) => {
          const e = data.expenses.find((x) => x.id === id);
          const partner =
            e?.account.includes(names.a) || e?.account.includes('Partner A') ? 'Partner A' : 'Partner B';
          return supabase
            .from('transactions')
            .update({ settled: true, settled_with: partner, account_used: 'Joint' })
            .eq('id', id);
        })
      );
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
      notifyIfAllowed('Settled!', `${ids.length} items settled`, data.settings);
      addToast(`${ids.length} items settled ✓`, 'success');
    } catch (err: any) {
      addToast('Settlement DB error: ' + err.message, 'error');
    }
  }, [data, setData, addToast]);

  // Split a partner expense into two rows
  const settleAndSplitPartnerTransaction = useCallback(async (item: Expense) => {
    const total = Number(item.amount);
    const aShare = Number(item.partnerAShare);
    const bShare = Number(item.partnerBShare);
    let shareA: number;
    let shareB: number;
    if (item.splitMode === 'equal') {
      shareA = total * 0.5;
      shareB = total * 0.5;
    } else if (item.splitMode === 'fixed') {
      shareA = aShare;
      shareB = bShare;
    } else if (item.splitMode === 'percentage') {
      shareA = total * (aShare / 100);
      shareB = total * (bShare / 100);
    } else {
      shareA = total * aShare;
      shareB = total * bShare;
    }
    // Use item.account (who actually paid) not item.addedBy (who logged it).
    // These differ when one partner logs a transaction on behalf of the other.
    const payer    = item.account;
    const payerIsA = payer === data.settings.partnerAName || payer === 'Partner A';
    const updatedAmount = payerIsA ? shareA : shareB;
    const counterAmount = payerIsA ? shareB : shareA;
    const counterParty  = payerIsA ? 'Partner B' : 'Partner A';
    const clonedId = uid();

    const cloned: Expense = {
      ...item,
      id: clonedId,
      amount: counterAmount,
      account: counterParty === 'Partner A' ? data.settings.partnerAName : data.settings.partnerBName,
      addedBy: counterParty,
      settleTrack: 'none',
      splitMode: 'equal',
      partnerAShare: 0.5,
      partnerBShare: 0.5,
      settled: true,
      toSettle: false,
      settledFor: counterParty,
      note: `${item.note ?? ''} (Settlement Split)`.trim(),
    };

    // Optimistic
    setData((prev) => ({
      ...prev,
      expenses: [
        cloned,
        ...prev.expenses.map((e) =>
          e.id === item.id
            ? { ...e, amount: updatedAmount, settleTrack: 'none' as const, settled: true, toSettle: false }
            : e
        ),
      ],
    }));

    const [updateRes, insertRes] = await Promise.all([
      dbUpdateExpense(item.id, { amount: updatedAmount, settleTrack: 'none', settled: true, toSettle: false }, data.settings),
      dbAddExpense(cloned, data.householdId, data.settings),
    ]);

    if (updateRes.error || insertRes.error) {
      addToast('Split sync failed — please refresh', 'error');
    }
  }, [data, setData, addToast]);

  // ── Contributions ─────────────────────────────────────────────────────────

  const updateContrib = useCallback(async (month: string, pA: number, pB: number) => {
    const existing = data.contributions.find((c) => c.month === month);
    const isUUID = existing?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existing.id);
    const id = isUUID ? existing!.id : uid();
    const contrib: Contribution = { id, month, partnerA: pA, partnerB: pB };

    setData((prev) => ({
      ...prev,
      contributions: [
        ...prev.contributions.filter((c) => c.month !== month),
        contrib,
      ],
    }));

    const { error } = await dbUpsertContribution(contrib, data.householdId);
    if (error) addToast('Contribution sync failed: ' + error.message, 'error');
  }, [data, setData, addToast]);

  // ── Goals ─────────────────────────────────────────────────────────────────

  const addGoal = useCallback(async (g: Omit<Goal, 'id' | 'current' | 'shortfall' | 'monthsRemaining' | 'velocityA' | 'velocityB' | 'paceStatus'>) => {
    const full = deriveGoalFields({ ...g, id: uid() } as Goal) as Goal;
    setData((prev) => ({ ...prev, goals: [...prev.goals, full] }));
    const { error } = await dbAddGoal(full, data.householdId);
    if (error) {
      setData((prev) => ({ ...prev, goals: prev.goals.filter((x) => x.id !== full.id) }));
      addToast('Failed to save goal: ' + error.message, 'error');
    }
  }, [data, setData, addToast]);

  const updateGoal = useCallback(async (id: string, updated: Partial<Goal>) => {
    const derived = deriveGoalFields(updated);
    setData((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => g.id === id ? { ...g, ...derived } : g),
    }));
    const { error } = await dbUpdateGoal(id, derived);
    if (error) addToast('Failed to update goal: ' + error.message, 'error');
  }, [data, setData, addToast]);

  const deleteGoal = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id) }));
    const { error } = await dbDeleteGoal(id);
    if (error) addToast('Failed to delete goal: ' + error.message, 'error');
  }, [data, setData, addToast]);

  // ── Loans ─────────────────────────────────────────────────────────────────

  const addLoan = useCallback(async (l: Loan) => {
    setData((prev) => ({ ...prev, loans: [...prev.loans, l] }));
    const { error } = await dbAddLoan(l, data.householdId);
    if (error) {
      setData((prev) => ({ ...prev, loans: prev.loans.filter((x) => x.id !== l.id) }));
      addToast('Failed to save loan: ' + error.message, 'error');
    }
  }, [data, setData, addToast]);

  const updateLoan = useCallback(async (id: string, updated: Partial<Loan>) => {
    setData((prev) => ({
      ...prev,
      loans: prev.loans.map((l) => l.id === id ? { ...l, ...updated } : l),
    }));
    const { error } = await dbUpdateLoan(id, updated);
    if (error) addToast('Failed to update loan: ' + error.message, 'error');
  }, [data, setData, addToast]);

  const deleteLoan = useCallback(async (id: string) => {
    setData((prev) => ({ ...prev, loans: prev.loans.filter((l) => l.id !== id) }));
    const { error } = await dbDeleteLoan(id);
    if (error) addToast('Failed to delete loan: ' + error.message, 'error');
  }, [data, setData, addToast]);

  // ── Settings ──────────────────────────────────────────────────────────────

  const saveSettings = useCallback(async (s: Settings) => {
    setData((prev) => ({ ...prev, settings: s }));
    const error = await dbSaveSettings(s, data.householdId, session.user.id);
    if (error) addToast('Settings DB sync failed: ' + error.message, 'error');
    else addToast('Settings saved ✓', 'success');
  }, [data, session, setData, addToast]);

  // ── Household ─────────────────────────────────────────────────────────────

  const joinHousehold = useCallback(async (
    newHouseholdId: string,
    setLoading: (v: boolean) => void,
  ) => {
    const { error } = await supabase
      .from('profiles')
      .update({ household_id: newHouseholdId })
      .eq('id', session.user.id);

    if (error) {
      addToast('Failed to join household: ' + error.message, 'error');
      return;
    }
    // Only time we do a full reload — household context completely changed
    setLoading(true);
    const freshData = await loadData(session.user.id);
    setData(freshData);
    setLoading(false);
    addToast("Joined household successfully!", 'success');
  }, [session, setData, addToast]);

  // ── Import ────────────────────────────────────────────────────────────────

  const importData = useCallback(async ({
    expenses: importedExp,
    contributions: importedContribs,
  }: { expenses: Partial<Expense>[]; contributions: Partial<Contribution>[] | null }) => {
    const sanitizedExp = (importedExp ?? [])
      .filter((e) => e.date && e.amount)
      .map((e) => {
        const isUUID = e.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.id);
        return { ...e, id: isUUID ? e.id! : uid() } as Expense;
      });

    const existingIds = new Set(data.expenses.map((e) => e.id));
    const newExp = sanitizedExp.filter((e) => !existingIds.has(e.id));

    const sanitizedContribs = (importedContribs ?? [])
      .filter((c) => c.month && String(c.month).trim())
      .map((c) => {
        const existing = data.contributions.find((x) => x.month === c.month);
        return {
          id: existing?.id ?? uid(),
          month: String(c.month).trim(),
          partnerA: c.partnerA ?? 0,
          partnerB: c.partnerB ?? 0,
        } as Contribution;
      });

    const mergedContribs = importedContribs
      ? [
          ...data.contributions.filter((c) => !sanitizedContribs.find((nc) => nc.month === c.month)),
          ...sanitizedContribs,
        ]
      : data.contributions;

    setData((prev) => ({ ...prev, expenses: [...prev.expenses, ...newExp], contributions: mergedContribs }));

    let txError = null;
    if (newExp.length > 0) {
      const rows = newExp.map((e) => ({
        id: e.id, household_id: data.householdId, date: e.date, amount: e.amount,
        category: e.category, type: e.type, account_used: e.account, added_by: e.addedBy,
        note: e.note, to_settle: e.toSettle, settled: e.settled, settled_with: e.settledFor,
      }));
      const res = await supabase.from('transactions').insert(rows);
      txError = res.error;
    }

    if (sanitizedContribs.length > 0) {
      const rows = sanitizedContribs.map((c) => ({
        id: c.id, household_id: data.householdId, month: c.month,
        partner_a_amount: c.partnerA, partner_b_amount: c.partnerB,
      }));
      await supabase.from('contributions').upsert(rows, { onConflict: 'household_id,month' });
    }

    if (txError) {
      addToast('Import DB error: ' + txError.message, 'error');
    } else {
      addToast(`Imported ${newExp.length} transactions ✓`, 'success');
    }
  }, [data, setData, addToast]);

  return {
    addExpense,
    updateExpense,
    deleteExpense,
    unsettle,
    toggleToSettle,
    bulkDeleteExpense,
    bulkFlagToSettle,
    bulkMarkAsSettled,
    bulkAssignToAccount,
    bulkSettle,
    settleAndSplitPartnerTransaction,
    updateContrib,
    addGoal,
    updateGoal,
    deleteGoal,
    addLoan,
    updateLoan,
    deleteLoan,
    saveSettings,
    joinHousehold,
    importData,
  };
}

// ---------------------------------------------------------------------------
// Browser notification helper
// ---------------------------------------------------------------------------
function notifyIfAllowed(title: string, body: string, settings: Settings) {
  if (
    settings.notifications.enabled &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    new Notification(title, { body });
  }
}
