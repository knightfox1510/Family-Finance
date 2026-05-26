'use client';
// ─── components/SetupWizard.tsx ───────────────────────────────────────────────
// ChillarFlow NeoPOP first-run setup wizard.
// 5 steps: Mode → Names → Telegram/WhatsApp → Features+Pricing → Done

import React, { useState } from 'react';
import type { HouseholdMode } from '@/types';
import { HOUSEHOLD_MODE_META } from '@/constants';

const accent = 'var(--accent, #f59e0b)';
const bg     = 'var(--bg, #09090b)';
const bg2    = 'var(--bg2, #0c0c0f)';
const surface  = 'var(--surface, #18181b)';
const surface2 = 'var(--surface2, #27272a)';
const border   = 'var(--border, #3f3f46)';
const border2  = 'var(--border2, #52525b)';
const textW  = 'var(--textW, #fafafa)';
const text1  = 'var(--text1, #d4d4d8)';
const text2  = 'var(--text2, #a1a1aa)';
const text3  = 'var(--text3, #71717a)';
const teal   = 'var(--teal, #14b8a6)';
const green  = 'var(--green, #22c55e)';

type Step = 'mode' | 'names' | 'connect' | 'features' | 'done';
const STEPS: Step[] = ['mode', 'names', 'connect', 'features', 'done'];

interface Props {
  onComplete: (mode: HouseholdMode, nameA: string, nameB: string, telegramUsername?: string) => void;
}

// ── Progress dots ──────────────────────────────────────────────────────────────
function ProgressDots({ step }: { step: Step }) {
  const idx = STEPS.indexOf(step);
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 32 }}>
      {STEPS.map((_, i) => (
        <div key={i} style={{ width: i === idx ? 20 : 6, height: 6, background: i <= idx ? accent : border, transition: 'all 0.3s' }} />
      ))}
    </div>
  );
}

// ── Input ──────────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: text3, marginBottom: 8 }}>{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: bg2, border: `1px solid ${border2}`, boxShadow: '2px 2px 0px #000', color: textW, padding: '13px 14px', fontSize: 16, fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none' }}
        onFocus={(e) => e.target.style.borderColor = accent}
        onBlur={(e) => e.target.style.borderColor = border2}
      />
    </div>
  );
}

// ── Primary button ─────────────────────────────────────────────────────────────
function PrimaryBtn({ onClick, disabled, children, fullWidth }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: fullWidth ? '100%' : undefined, background: disabled ? '#52525b' : accent, color: '#09090b', border: '1px solid #000', boxShadow: disabled ? 'none' : '3px 3px 0px #000', padding: '13px 24px', fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', WebkitAppearance: 'none', transition: 'transform 0.08s, box-shadow 0.08s' }}
      onMouseDown={(e) => { if (!disabled) { (e.target as HTMLElement).style.transform = 'translate(3px,3px)'; (e.target as HTMLElement).style.boxShadow = 'none'; } }}
      onMouseUp={(e) => { (e.target as HTMLElement).style.transform = ''; (e.target as HTMLElement).style.boxShadow = '3px 3px 0px #000'; }}
    >{children}</button>
  );
}

function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{ background: 'transparent', border: `1px solid ${border2}`, color: text1, padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', WebkitAppearance: 'none' }}>
      {children}
    </button>
  );
}

export function SetupWizard({ onComplete }: Props) {
  const [step, setStep]   = useState<Step>('mode');
  const [mode, setMode]   = useState<HouseholdMode>('joint');
  const [nameA, setNameA] = useState('');
  const [nameB, setNameB] = useState('');
  const [expandedMode, setExpandedMode] = useState<HouseholdMode | null>(null);
  const [wantsTelegram, setWantsTelegram] = useState<boolean | null>(null);
  const [telegramUsername, setTelegramUsername] = useState('');
  const [whatsappNumber, setWhatsappNumber]     = useState('');

  const isSolo  = mode === 'solo';
  const modes: HouseholdMode[] = ['joint', 'separate', 'solo'];

  const shell: React.CSSProperties = { minHeight: '100vh', background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', fontFamily: "'Inter', -apple-system, sans-serif" };
  const card: React.CSSProperties  = { width: '100%', maxWidth: 440, background: surface, border: `1px solid ${border}`, boxShadow: '4px 4px 0px #000', padding: '28px 24px' };

  // ── Step 1: Mode ─────────────────────────────────────────────────────────────
  if (step === 'mode') return (
    <div style={shell}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <ProgressDots step="mode" />
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: text3, marginBottom: 8 }}>Step 1 of 5</div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', color: textW, marginBottom: 8 }}>How do you manage money?</div>
          <div style={{ fontSize: 14, color: text2 }}>Choose a mode that fits your household setup.</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 24, border: `1px solid ${border}`, boxShadow: '3px 3px 0px #000' }}>
          {modes.map((m, i) => {
            const meta   = HOUSEHOLD_MODE_META[m];
            const active = mode === m;
            const isOpen = expandedMode === m;
            return (
              <div key={m}>
                <div onClick={() => setMode(m)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', cursor: 'pointer', background: active ? `rgba(245,158,11,0.08)` : 'transparent', borderTop: i > 0 ? `1px solid ${border}` : 'none', transition: 'background 0.15s' }}>
                  {/* Radio */}
                  <div style={{ width: 18, height: 18, border: `2px solid ${active ? accent : border2}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? accent : 'transparent', transition: 'all 0.15s' }}>
                    {active && <div style={{ width: 6, height: 6, background: '#09090b' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: active ? accent : textW }}>{meta.icon} {meta.label}</div>
                    <div style={{ fontSize: 12, color: text3, marginTop: 2 }}>{meta.description}</div>
                  </div>
                  {/* Info chevron */}
                  <button onClick={(e) => { e.stopPropagation(); setExpandedMode(isOpen ? null : m); }}
                    style={{ background: 'transparent', border: `1px solid ${isOpen ? accent : border2}`, color: isOpen ? accent : text3, width: 24, height: 24, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, transition: 'all 0.15s' }}>
                    ℹ
                  </button>
                </div>
                {isOpen && (
                  <div style={{ background: `rgba(245,158,11,0.04)`, borderTop: `1px solid ${border}`, padding: '12px 18px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: text3, marginBottom: 10 }}>What you get:</div>
                    {(meta.detail as string[]).map((line, i) => (
                      <div key={i} style={{ fontSize: 12, color: text2, marginBottom: 6, lineHeight: 1.5 }}>{line}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <PrimaryBtn onClick={() => setStep('names')}>Continue →</PrimaryBtn>
        </div>
      </div>
    </div>
  );

  // ── Step 2: Names ─────────────────────────────────────────────────────────────
  if (step === 'names') return (
    <div style={shell}>
      <div style={card}>
        <ProgressDots step="names" />
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: text3, marginBottom: 8 }}>Step 2 of 5</div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: textW, marginBottom: 6 }}>{isSolo ? 'What should we call you?' : 'What are your names?'}</div>
        <div style={{ fontSize: 13, color: text2, marginBottom: 24, lineHeight: 1.6 }}>Used in the dashboard, bot messages, and settlement flows.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          <Field label={isSolo ? 'Your name' : 'Partner A — your name'} value={nameA} onChange={setNameA} placeholder={isSolo ? 'e.g. Alex' : 'e.g. Rahul'} />
          {!isSolo && <Field label="Partner B — their name" value={nameB} onChange={setNameB} placeholder="e.g. Priya" />}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <GhostBtn onClick={() => setStep('mode')}>← Back</GhostBtn>
          <div style={{ flex: 1 }} />
          <PrimaryBtn onClick={() => nameA.trim() && setStep('connect')} disabled={!nameA.trim()}>Continue →</PrimaryBtn>
        </div>
      </div>
    </div>
  );

  // ── Step 3: Connect channels ───────────────────────────────────────────────
  if (step === 'connect') return (
    <div style={shell}>
      <div style={card}>
        <ProgressDots step="connect" />
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: text3, marginBottom: 8 }}>Step 3 of 5</div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: textW, marginBottom: 6 }}>Log expenses from your phone</div>
        <div style={{ fontSize: 13, color: text2, marginBottom: 20, lineHeight: 1.6 }}>Connect WhatsApp or Telegram to log expenses by just sending a message. Optional — you can do this later in Settings.</div>

        {/* WhatsApp */}
        <div style={{ border: `1px solid ${border}`, marginBottom: 12 }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💬</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: textW }}>WhatsApp</div>
              <div style={{ fontSize: 11, color: text3 }}>Send a message to log instantly</div>
            </div>
          </div>
          <div style={{ padding: '14px 16px' }}>
            <Field label="WhatsApp number (with country code)" value={whatsappNumber} onChange={(v) => setWhatsappNumber(v.replace(/\D/g, ''))} placeholder="e.g. 919876543210" type="tel" />
          </div>
        </div>

        {/* Telegram */}
        <div style={{ border: `1px solid ${border}`, marginBottom: 24 }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: '#229ED9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>✈️</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: textW }}>Telegram</div>
              <div style={{ fontSize: 11, color: text3 }}>Works with the ChillarFlow bot</div>
            </div>
          </div>
          <div style={{ padding: '14px 16px' }}>
            <Field label="Telegram username (without @)" value={telegramUsername} onChange={setTelegramUsername} placeholder="e.g. yourhandle" />
          </div>
        </div>

        {/* Logging examples */}
        <div style={{ background: surface2, border: `1px solid ${border}`, padding: '12px 14px', marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: text3, marginBottom: 10 }}>Logging syntax</div>
          {['450 Zomato → Personal expense', '1200 grocery to settle → Joint pool reimburses', '500 → Interactive wizard (always free)'].map((ex) => (
            <div key={ex} style={{ fontSize: 12, color: text2, marginBottom: 6 }}>▪ {ex}</div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <GhostBtn onClick={() => setStep('names')}>← Back</GhostBtn>
          <div style={{ flex: 1 }} />
          <PrimaryBtn onClick={() => setStep('features')}>Continue →</PrimaryBtn>
        </div>
      </div>
    </div>
  );

  // ── Step 4: Features + Pricing ────────────────────────────────────────────
  if (step === 'features') return (
    <div style={shell}>
      <div style={card}>
        <ProgressDots step="features" />
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: text3, marginBottom: 8 }}>Step 4 of 5</div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: textW, marginBottom: 20 }}>What's included</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: `1px solid ${border}`, marginBottom: 20 }}>
          {[
            { icon: '📊', title: 'Dashboard', desc: 'Income, spending, investments and retention velocity' },
            { icon: '💬', title: 'Bot logging', desc: 'WhatsApp and Telegram expense logging with AI parsing' },
            { icon: '🔄', title: 'Settlements', desc: mode !== 'solo' ? 'Joint pool and partner split tracking' : 'Not needed in solo mode' },
            { icon: '🎯', title: 'Goals & EMI', desc: 'Savings milestones and loan tracking' },
          ].map((f, i) => (
            <div key={f.title} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderTop: i > 0 ? `1px solid ${border}` : 'none' }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{f.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: textW, marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: text3 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
          <div style={{ border: `1px solid ${border}`, padding: '14px', boxShadow: '2px 2px 0px #000' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: text3, marginBottom: 8 }}>Free</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: textW, marginBottom: 10 }}>₹0</div>
            <div style={{ fontSize: 11, color: text3, lineHeight: 1.6 }}>30 AI parses/month · Number wizard always free · Full dashboard</div>
          </div>
          <div style={{ border: `1px solid ${accent}`, padding: '14px', boxShadow: `2px 2px 0px #000` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent, marginBottom: 8 }}>✦ Pro</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: accent, marginBottom: 10 }}>₹299</div>
            <div style={{ fontSize: 11, color: text2, lineHeight: 1.6 }}>Unlimited AI parses · Priority support · Early features</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <GhostBtn onClick={() => setStep('connect')}>← Back</GhostBtn>
          <div style={{ flex: 1 }} />
          <PrimaryBtn onClick={() => setStep('done')}>Let's go →</PrimaryBtn>
        </div>
      </div>
    </div>
  );

  // ── Step 5: Done ──────────────────────────────────────────────────────────────
  return (
    <div style={shell}>
      <div style={card}>
        <ProgressDots step="done" />
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✦</div>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', color: accent, marginBottom: 8 }}>You're in{nameA ? `, ${nameA}` : ''}.</div>
          <div style={{ fontSize: 14, color: text2, lineHeight: 1.7 }}>
            <strong style={{ color: textW }}>{HOUSEHOLD_MODE_META[mode].label}</strong> is ready. Start by logging your first expense.
          </div>
        </div>

        {/* Quick tips */}
        <div style={{ border: `1px solid ${border}`, marginBottom: 24 }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: text3 }}>Quick start</div>
          </div>
          {[
            'Set up your expense categories in Settings',
            'Add category budgets to see dashboard alerts',
            !isSolo ? `Ask ${nameB || 'your partner'} to join using your Household ID in Settings` : 'Link your bot in Settings for quick logging',
            mode === 'joint' ? 'Log your first monthly contribution to the joint pool' : null,
          ].filter(Boolean).map((tip, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 16px', borderTop: i > 0 ? `1px solid ${border}` : 'none', fontSize: 13, color: text2, lineHeight: 1.5 }}>
              <span style={{ color: accent, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>

        <PrimaryBtn fullWidth onClick={() => onComplete(mode, nameA.trim(), isSolo ? '' : nameB.trim() || 'Partner B', telegramUsername.trim() || undefined)}>
          Open ChillarFlow →
        </PrimaryBtn>
      </div>
    </div>
  );
}
