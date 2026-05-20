'use client';
// ─── components/SetupWizard.tsx ───────────────────────────────────────────────
// First-time setup screen shown when a new user has no householdMode set.
// Walks through two steps: pick a mode, then enter partner names.
// Must be .tsx (not .ts) because it contains JSX.

import React, { useState } from 'react';
import type { HouseholdMode } from '@/types';
import { C, HOUSEHOLD_MODE_META } from '@/constants';

interface Props {
  onComplete: (mode: HouseholdMode, nameA: string, nameB: string) => void;
}

export function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState<'mode' | 'names'>('mode');
  const [mode, setMode] = useState<HouseholdMode>('joint');
  const [nameA, setNameA] = useState('');
  const [nameB, setNameB] = useState('');

  const modes: HouseholdMode[] = ['joint', 'separate', 'solo'];

  // ── Step 1: choose household mode ─────────────────────────────────────────
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
            const meta = HOUSEHOLD_MODE_META[m];
            const selected = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  background: selected ? C.amber + '22' : C.surface,
                  border: `2px solid ${selected ? C.amber : C.border}`,
                  borderRadius: 14, padding: '18px 20px', cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.2s', width: '100%',
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

  // ── Step 2: enter names ───────────────────────────────────────────────────
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
              width: '100%', outline: 'none', boxSizing: 'border-box' as const,
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
                width: '100%', outline: 'none', boxSizing: 'border-box' as const,
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
