'use client';
// ─── components/SetupWizard.tsx ───────────────────────────────────────────────
// First-time setup wizard. Five steps:
//   1. Pick household mode (with expandable info panels)
//   2. Enter names
//   3. Telegram bot setup instructions
//   4. Quick feature overview
//   5. All done

import React, { useState } from 'react';
import type { HouseholdMode } from '@/types';
import { C, HOUSEHOLD_MODE_META } from '@/constants';

interface Props {
  onComplete: (mode: HouseholdMode, nameA: string, nameB: string) => void;
}

type Step = 'mode' | 'names' | 'telegram' | 'features' | 'done';

// ─── Shared primitives ────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: C.bg, border: `1px solid ${C.border}`, color: C.textW,
  borderRadius: 8, padding: '10px 14px', fontSize: 14,
  width: '100%', outline: 'none', boxSizing: 'border-box',
};

const primaryBtn = (disabled = false): React.CSSProperties => ({
  background: disabled ? C.muted : C.amber, color: C.bg,
  fontWeight: 700, fontSize: 15, border: 'none', borderRadius: 10,
  padding: '13px 36px', cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'background 0.2s',
});

const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${C.border}`,
  color: C.text2, borderRadius: 10, padding: '12px 24px',
  cursor: 'pointer', fontWeight: 600,
};

const shell: React.CSSProperties = {
  minHeight: '100vh', background: C.bg, display: 'flex',
  flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: '32px 20px',
};

// Progress bar
const STEPS: Step[] = ['mode', 'names', 'telegram', 'features', 'done'];

function ProgressBar({ step }: { step: Step }) {
  const idx = STEPS.indexOf(step);
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 36 }}>
      {STEPS.map((_, i) => (
        <div key={i} style={{
          height: 3, flex: 1, borderRadius: 2,
          background: i <= idx ? C.amber : `${C.border}60`,
          transition: 'background 0.3s',
        }} />
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SetupWizard({ onComplete }: Props) {
  const [step, setStep]   = useState<Step>('mode');
  const [mode, setMode]   = useState<HouseholdMode>('joint');
  const [nameA, setNameA] = useState('');
  const [nameB, setNameB] = useState('');
  const [expanded, setExpanded] = useState<HouseholdMode | null>(null);

  const modes: HouseholdMode[] = ['joint', 'separate', 'solo'];
  const isSolo = mode === 'solo';

  // ── Step 1: Household mode ─────────────────────────────────────────────────
  if (step === 'mode') {
    return (
      <div style={shell}>
        <div style={{ width: '100%', maxWidth: 460 }}>
          <ProgressBar step="mode" />

          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>💰</div>
            <h1 style={{ color: C.textW, fontSize: 26, fontWeight: 800, margin: 0 }}>
              Welcome to FamilyFinance
            </h1>
            <p style={{ color: C.text2, marginTop: 8, fontSize: 14 }}>
              How does your household manage money?
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {modes.map((m) => {
              const meta     = HOUSEHOLD_MODE_META[m];
              const selected = mode === m;
              const isOpen   = expanded === m;
              return (
                <div key={m}>
                  <button
                    onClick={() => setMode(m)}
                    style={{
                      background: selected ? C.amber + '22' : C.surface,
                      border: `2px solid ${selected ? C.amber : C.border}`,
                      borderRadius: isOpen ? '14px 14px 0 0' : 14,
                      padding: '14px 16px', cursor: 'pointer',
                      textAlign: 'left', width: '100%',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 20 }}>{meta.icon}</span>
                          <span style={{ color: C.textW, fontWeight: 700, fontSize: 15 }}>{meta.label}</span>
                        </div>
                        <div style={{ color: C.text2, fontSize: 13, lineHeight: 1.5 }}>{meta.description}</div>
                        <div style={{ color: C.muted, fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>
                          Best for: {meta.bestFor}
                        </div>
                      </div>
                      {/* Info toggle */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(isOpen ? null : m); }}
                        title={isOpen ? 'Hide details' : 'Show details'}
                        style={{
                          background: isOpen ? C.amber + '22' : `${C.border}44`,
                          border: 'none', borderRadius: 6, width: 24, height: 24,
                          cursor: 'pointer', fontSize: 12, color: isOpen ? C.amber : C.muted,
                          flexShrink: 0, marginLeft: 10, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                        }}
                      >
                        ℹ
                      </button>
                    </div>
                  </button>

                  {/* Expandable detail panel */}
                  {isOpen && (
                    <div style={{
                      background: `${C.amber}08`, border: `2px solid ${selected ? C.amber : C.border}`,
                      borderTop: 'none', borderRadius: '0 0 14px 14px',
                      padding: '12px 16px',
                    }}>
                      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                        What you get with {meta.label}:
                      </div>
                      {meta.detail.map((line, i) => (
                        <div key={i} style={{ fontSize: 13, color: C.text2, marginBottom: 7, lineHeight: 1.5 }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={() => setStep('names')} style={primaryBtn()}>
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Names ──────────────────────────────────────────────────────────
  if (step === 'names') {
    return (
      <div style={shell}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <ProgressBar step="names" />

          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>{HOUSEHOLD_MODE_META[mode].icon}</div>
            <h2 style={{ color: C.textW, fontSize: 22, fontWeight: 800, margin: 0 }}>
              {isSolo ? 'What should we call you?' : 'What are your names?'}
            </h2>
            <p style={{ color: C.text2, marginTop: 8, fontSize: 14 }}>
              These appear throughout the app — on cards, charts, and the Telegram bot.
              You can change them later in Settings.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
            <div>
              <label style={{ color: C.text2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                {isSolo ? 'Your name' : 'Partner A name (you)'}
              </label>
              <input
                value={nameA}
                onChange={(e) => setNameA(e.target.value)}
                placeholder={isSolo ? 'e.g. Alex' : 'e.g. Rahul'}
                autoFocus
                style={inputStyle}
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
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('mode')} style={ghostBtn}>← Back</button>
            <button
              onClick={() => { if (nameA.trim()) setStep('telegram'); }}
              disabled={!nameA.trim()}
              style={{ ...primaryBtn(!nameA.trim()), flex: 1 }}
            >
              Continue →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Telegram bot setup ─────────────────────────────────────────────
  if (step === 'telegram') {
    const firstName = nameA.trim();
    return (
      <div style={shell}>
        <div style={{ width: '100%', maxWidth: 460 }}>
          <ProgressBar step="telegram" />

          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🤖</div>
            <h2 style={{ color: C.textW, fontSize: 22, fontWeight: 800, margin: 0 }}>
              Log expenses from Telegram
            </h2>
            <p style={{ color: C.text2, marginTop: 8, fontSize: 14 }}>
              Connect our Telegram bot and log expenses in seconds — just send a message.
            </p>
          </div>

          {/* How it works */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              How it works
            </div>
            {[
              { emoji: '1️⃣', text: 'Open Telegram and search for your bot (your developer will share the link)' },
              { emoji: '2️⃣', text: 'Send /start to activate it' },
              { emoji: '3️⃣', text: 'Go to Settings → Telegram Bot Integration and enter your Telegram username (without @)' },
              { emoji: '4️⃣', text: 'Start logging! Send a message like: 450 Zomato' },
            ].map(({ emoji, text }) => (
              <div key={emoji} style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{emoji}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* Logging syntax examples */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Logging syntax — what to send
            </div>
            {[
              { msg: '450 Zomato', result: 'Personal expense, no settlement' },
              { msg: `450 Zomato ${!isSolo ? nameA : firstName}`, result: `Logged under ${firstName}'s account` },
              ...(mode === 'joint' ? [{ msg: '450 Zomato to settle', result: 'Joint pool reimburses you' }] : []),
              ...(!isSolo ? [{ msg: `450 Zomato settle with ${nameB || 'Partner'}`, result: 'Direct partner split' }] : []),
              { msg: '500', result: 'Opens interactive wizard for category + account' },
            ].map(({ msg, result }) => (
              <div key={msg} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' as const }}>
                <code style={{ background: `${C.border}40`, padding: '3px 8px', borderRadius: 4, fontSize: 12, color: C.teal, flexShrink: 0 }}>
                  {msg}
                </code>
                <span style={{ fontSize: 12, color: C.muted }}>{result}</span>
              </div>
            ))}
          </div>

          <div style={{ background: `${C.teal}12`, border: `1px solid ${C.teal}33`, borderRadius: 8, padding: '10px 14px', marginBottom: 24, fontSize: 12, color: C.teal, lineHeight: 1.6 }}>
            💡 You can skip this for now and set it up later in <strong>Settings → Telegram Bot Integration</strong>.
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('names')} style={ghostBtn}>← Back</button>
            <button onClick={() => setStep('features')} style={{ ...primaryBtn(), flex: 1 }}>
              Continue →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 4: Feature overview ───────────────────────────────────────────────
  if (step === 'features') {
    const features = [
      { icon: '📊', title: 'Dashboard', desc: 'Income, lifestyle, investments and retention velocity — household and per-partner' },
      { icon: '➕', title: 'Add Expense', desc: 'Log expenses with category, account, note, and settlement track. Quick presets for frequent items' },
      { icon: '🔄', title: 'Settlements', desc: mode === 'joint' ? 'Joint reimbursement queue and direct partner splits with a two-step settle wizard' : mode === 'separate' ? 'Direct partner splits — who owes whom and how much' : 'No settlements needed in solo mode' },
      { icon: '🎯', title: 'Goals', desc: 'Set savings milestones with target dates, monthly velocity, and per-partner progress' },
      { icon: '🏧', title: 'EMI Tracker', desc: 'Track loan repayments with interest, tenure, and remaining balance' },
      { icon: '✨', title: 'AI Insights', desc: 'Spending pattern analysis and personalised suggestions powered by AI' },
      { icon: '⚙️', title: 'Settings', desc: 'Manage categories, budgets, notifications, and export your data any time' },
    ].filter((f) => !(isSolo && f.title === 'Settlements'));

    return (
      <div style={shell}>
        <div style={{ width: '100%', maxWidth: 460 }}>
          <ProgressBar step="features" />

          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗺️</div>
            <h2 style={{ color: C.textW, fontSize: 22, fontWeight: 800, margin: 0 }}>
              What's included
            </h2>
            <p style={{ color: C.text2, marginTop: 8, fontSize: 14 }}>
              A quick look at what you'll find inside.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
            {features.map(({ icon, title, desc }) => (
              <div key={title} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                <div>
                  <div style={{ color: C.textW, fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{title}</div>
                  <div style={{ color: C.text2, fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('telegram')} style={ghostBtn}>← Back</button>
            <button onClick={() => setStep('done')} style={{ ...primaryBtn(), flex: 1 }}>
              Let's go! 🚀
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 5: Done ───────────────────────────────────────────────────────────
  return (
    <div style={{ ...shell, gap: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <ProgressBar step="done" />

        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h2 style={{ color: C.textW, fontSize: 26, fontWeight: 800, margin: '0 0 12px' }}>
          You're all set{nameA ? `, ${nameA}` : ''}!
        </h2>
        <p style={{ color: C.text2, fontSize: 14, marginBottom: 28, lineHeight: 1.7 }}>
          Your <strong style={{ color: C.amber }}>{HOUSEHOLD_MODE_META[mode].label}</strong> household
          is ready to go. Start by logging your first expense or exploring the dashboard.
        </p>

        {/* Quick tips */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', marginBottom: 28, textAlign: 'left' }}>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Quick tips to get started
          </div>
          {[
            'Set up your expense categories in Settings to match how you actually spend',
            'Add category budgets so the dashboard can flag overages',
            mode !== 'solo' ? `Enter ${!isSolo ? nameB || 'Partner B' : ''}'s Telegram username in Settings so they can log too` : 'Link your Telegram username in Settings for quick mobile logging',
            mode === 'joint' ? 'Log your first monthly contribution to set your joint pool balance' : null,
            'Use AI Insights after a few weeks of data for personalised tips',
          ].filter(Boolean).map((tip, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
              <span style={{ color: C.amber, flexShrink: 0, fontWeight: 700 }}>{i + 1}.</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => onComplete(mode, nameA.trim(), isSolo ? '' : nameB.trim() || 'Partner B')}
          style={{ ...primaryBtn(), width: '100%', padding: '15px 36px', fontSize: 16 }}
        >
          Open FamilyFinance →
        </button>
      </div>
    </div>
  );
}
