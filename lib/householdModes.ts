// ─── lib/householdModes.ts ────────────────────────────────────────────────────
// Pure logic only — no React, no JSX.
// The SetupWizard component lives in components/SetupWizard.tsx

import type { HouseholdMode, Settings, Expense } from '@/types';

// ---------------------------------------------------------------------------
// Mode-aware labels
// ---------------------------------------------------------------------------

/** Label for the "account" field shown in the Add form */
export function accountLabel(mode: HouseholdMode): string {
  switch (mode) {
    case 'joint':    return 'Account';
    case 'separate': return 'Who paid?';
    case 'solo':     return 'Category account';
    default:         return 'Account';
  }
}

/** Available account options for the Add form dropdown */
export function accountOptions(mode: HouseholdMode, settings: Settings): string[] {
  switch (mode) {
    case 'joint':
      return ['Joint', settings.partnerAName, settings.partnerBName];
    case 'separate':
      return [settings.partnerAName, settings.partnerBName];
    case 'solo':
      return ['Personal'];
    default:
      return ['Joint', settings.partnerAName, settings.partnerBName];
  }
}

/** Whether the "settle / split" controls should be shown at all */
export function canSettle(mode: HouseholdMode): boolean {
  return mode !== 'solo';
}

/** Whether joint pool contributions are tracked */
export function hasJointPool(mode: HouseholdMode): boolean {
  return mode === 'joint';
}

/** Whether a second partner name field should appear in Settings */
export function hasPartnerB(mode: HouseholdMode): boolean {
  return mode !== 'solo';
}

// ---------------------------------------------------------------------------
// Mode-aware filtering for the Dashboard
// ---------------------------------------------------------------------------

export function balanceExpenses(expenses: Expense[], mode: HouseholdMode): Expense[] {
  if (mode === 'joint') {
    return expenses.filter((e) => e.account === 'Joint' && e.type !== 'income');
  }
  return expenses.filter((e) => e.type !== 'income');
}

export function balanceCardLabel(mode: HouseholdMode): string {
  switch (mode) {
    case 'joint':    return 'Joint Balance';
    case 'separate': return 'Total Household Spend';
    case 'solo':     return 'Total Spend';
    default:         return 'Total Spend';
  }
}

// ---------------------------------------------------------------------------
// Settlement calculations (only called when mode !== 'solo')
// ---------------------------------------------------------------------------

export function calcPartnerBalance(
  expenses: Expense[],
  partnerAName: string,
  partnerBName: string,
): { net: number; summary: string } {
  let net = 0;
  expenses.forEach((t) => {
    if (t.settled || t.settleTrack !== 'partner') return;
    const amount = Number(t.amount);
    const shareA = t.splitMode === 'equal' ? amount * 0.5 : amount * t.partnerAShare;
    const shareB = t.splitMode === 'equal' ? amount * 0.5 : amount * t.partnerBShare;
    if (t.addedBy === 'Partner A') net += shareB;
    else if (t.addedBy === 'Partner B') net -= shareA;
  });

  if (Math.abs(net) < 1) return { net: 0, summary: 'All settled up! 🎉' };
  const owes = net > 0 ? partnerBName : partnerAName;
  const owed = net > 0 ? partnerAName : partnerBName;
  return { net, summary: `${owes} owes ${owed}` };
}