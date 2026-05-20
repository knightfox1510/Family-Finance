// ─── lib/householdModes.ts ────────────────────────────────────────────────────
// Everything that changes behaviour based on householdMode lives here.
//
// Rule: components should never branch on `mode` directly.
//       They call helpers from this file instead, so adding a new mode
//       only requires changes here.

import type { HouseholdMode, Settings, Expense } from '@/types';
import { HOUSEHOLD_MODE_META } from '@/constants';

// ---------------------------------------------------------------------------
// Mode-aware labels
// ---------------------------------------------------------------------------

/** Label for the "account" field shown in the Add form */
export function accountLabel(mode: HouseholdMode): string {
  switch (mode) {
    case 'joint':    return 'Account';
    case 'separate': return 'Who paid?';
    case 'solo':     return 'Category account';
  }
}

/** Available account options for the Add form dropdown */
export function accountOptions(mode: HouseholdMode, settings: Settings): string[] {
  switch (mode) {
    case 'joint':
      return ['Joint', settings.partnerAName, settings.partnerBName];
    case 'separate':
      // No shared joint pool, but partners still track who paid
      return [settings.partnerAName, settings.partnerBName];
    case 'solo':
      // Single user — no partner concept. Keep one sensible option.
      return ['Personal'];
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

/**
 * Returns expenses relevant to the "main balance" card for each mode.
 * - joint:    only Joint-account expenses
 * - separate: all expenses (each partner sees their own total)
 * - solo:     all expenses
 */
export function balanceExpenses(expenses: Expense[], mode: HouseholdMode): Expense[] {
  if (mode === 'joint') {
    return expenses.filter((e) => e.account === 'Joint' && e.type !== 'income');
  }
  return expenses.filter((e) => e.type !== 'income');
}

/**
 * Dashboard headline label for the balance card.
 */
export function balanceCardLabel(mode: HouseholdMode): string {
  switch (mode) {
    case 'joint':    return 'Joint Balance';
    case 'separate': return 'Total Household Spend';
    case 'solo':     return 'Total Spend';
  }
}

// ---------------------------------------------------------------------------
// Settlement calculations (only called when mode !== 'solo')
// ---------------------------------------------------------------------------

/**
 * In 'separate' mode, who owes whom is calculated purely from
 * partner-flagged expenses (settleTrack === 'partner'), same as 'joint'.
 * The function is identical — it lives here so mode logic stays centralised.
 */
export function calcPartnerBalance(
  expenses: Expense[],
  partnerAName: string,
  partnerBName: string,
): { net: number; summary: string } {
  let net = 0; // positive = B owes A, negative = A owes B
  expenses.forEach((t) => {
    if (t.settled || t.settleTrack !== 'partner') return;
    const amount = Number(t.amount);
    const shareA = t.splitMode === 'equal' ? amount * 0.5 : amount * t.partnerAShare;
    const shareB = t.splitMode === 'equal' ? amount * 0.5 : amount * t.partnerBShare;
    if (t.addedBy === 'Partner A') net += shareB;
    else if (t.addedBy === 'Partner B') net -= shareA;
  });

  if (Math.abs(net) < 1) return { net: 0, summary: 'All settled up! 🎉' };
  const owes   = net > 0 ? partnerBName : partnerAName;
  const owed   = net > 0 ? partnerAName : partnerBName;
  return { net, summary: `${owes} owes ${owed}` };
}

// ---------------------------------------------------------------------------
// Setup wizard component (inline — small enough to not need its own file)
// ---------------------------------------------------------------------------
import React from 'react';
import { C, HOUSEHOLD_MODE_META as META } from '@/constants';

interface SetupWizardProps {
  onComplete: (mode: HouseholdMode, nameA: string, nameB: string) => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = React.useState<'mode' | 'names'>('mode');
  const [mode, setMode] = React.useState<HouseholdMode>('joint');
  const [nameA, setNameA] = React.useState('');
  const [nameB, setNameB] = React.useState('');

  const modes: HouseholdMode[] = ['joint', 'separate', 'solo'];

  if (step === 'mode') {
    return (
      <div style={{
        minHeight: '100vh', background: C.bg, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px', gap: 32,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
          <h1 style={{ color: C.textW, fontSize: 28, fontWeight: 800, margin: 0 }}>
            Welcome to FamilyFinance
          </h1>
          <p style={{ color: C.text2, marginTop: 8 }}>
            How does your household manage money?
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 420 }}>
          {modes.map((m) => {
            const meta = META[m];
            const selected = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  background: selected ? C.amber + '22' : C.surface,
                  border: `2px solid ${selected ? C.amber : C.border}`,
                  borderRadius: 14, padding: '18px 20px', cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.2s',
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 6 }}>{meta.icon}</div>
                <div style={{ color: C.textW, fontWeight: 700, fontSize: 15 }}>
                  {meta.label}
                </div>
                <div style={{ color: C.text2, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                  {meta.description}
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setStep('names')}
          style={{
            background: C.amber, color: C.bg, fontWeight: 700,
            fontSize: 15, border: 'none', borderRadius: 10,
            padding: '14px 36px', cursor: 'pointer',
          }}
        >
          Continue →
        </button>
      </div>
    );
  }

  // Step: names
  const isSolo = mode === 'solo';
  return (
    <div style={{
      minHeight: '100vh', background: C.bg, display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', gap: 28,
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ color: C.textW, fontSize: 22, fontWeight: 800, margin: 0 }}>
          {isSolo ? 'What should we call you?' : 'What are your names?'}
        </h2>
        <p style={{ color: C.text2, marginTop: 8, fontSize: 14 }}>
          These appear throughout the app. You can change them later in Settings.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 360 }}>
        <div>
          <label style={{ color: C.text2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            {isSolo ? 'Your name' : 'Partner A name'}
          </label>
          <input
            value={nameA}
            onChange={(e) => setNameA(e.target.value)}
            placeholder={isSolo ? 'e.g. Alex' : 'e.g. Rahul'}
            style={{
              background: C.bg, border: `1px solid ${C.border}`, color: C.textW,
              borderRadius: 8, padding: '10px 14px', fontSize: 14,
              width: '100%', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {!isSolo && (
          <div>
            <label style={{ color: C.text2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Partner B name
            </label>
            <input
              value={nameB}
              onChange={(e) => setNameB(e.target.value)}
              placeholder="e.g. Priya"
              style={{
                background: C.bg, border: `1px solid ${C.border}`, color: C.textW,
                borderRadius: 8, padding: '10px 14px', fontSize: 14,
                width: '100%', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => setStep('mode')}
          style={{
            background: 'transparent', border: `1px solid ${C.border}`,
            color: C.text2, borderRadius: 10, padding: '12px 24px',
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          ← Back
        </button>
        <button
          onClick={() => {
            if (!nameA.trim()) return;
            onComplete(mode, nameA.trim(), isSolo ? '' : nameB.trim() || 'Partner B');
          }}
          disabled={!nameA.trim()}
          style={{
            background: nameA.trim() ? C.amber : C.muted,
            color: C.bg, fontWeight: 700, fontSize: 15,
            border: 'none', borderRadius: 10, padding: '12px 32px',
            cursor: nameA.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          Let's go! 🚀
        </button>
      </div>
    </div>
  );
}
