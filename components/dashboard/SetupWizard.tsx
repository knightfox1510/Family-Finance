'use client';
import React, { useState } from 'react';
import type { HouseholdMode } from '@/types';
import { HOUSEHOLD_MODE_META, C } from '@/constants';
import { Icon } from '@/components/ui/Icon';

type Step = 'mode' | 'names' | 'connect' | 'features' | 'done';
const STEPS: Step[] = ['mode', 'names', 'connect', 'features', 'done'];
const DOT_STEPS: Step[] = ['mode', 'names', 'connect', 'features'];
const MODE_ICONS: Record<string, string> = { joint: 'users', separate: 'user', solo: 'user' };
const CHANNEL_ICONS: Record<string, string> = { whatsapp: 'messageCircle', telegram: 'send' };
const FEATURE_ICONS: Record<string, string> = { Dashboard: 'barChart', 'Bot logging': 'messageCircle', Settlements: 'refresh', 'Goals & EMI': 'target' };

interface Props {
  onComplete: (mode: HouseholdMode, nameA: string, nameB: string, telegramUsername?: string) => void;
}

function StepDots({ step }: { step: Step }) {
  const idx = DOT_STEPS.indexOf(step);
  const active = idx < 0 ? DOT_STEPS.length - 1 : idx;
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {DOT_STEPS.map((_, i) => (
        <div key={i} style={{
          width: i === active ? 24 : 6, height: 6, borderRadius: 99,
          background: i <= active ? C.accent : C.border,
          transition: 'all .25s cubic-bezier(0.4,0,0.2,1)',
        }} />
      ))}
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 40, height: 40, borderRadius: '50%',
      background: C.surface2, border: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', color: C.textW, flexShrink: 0,
    }}>
      <Icon name="arrowLeft" size={18} strokeWidth={2.5} />
    </button>
  );
}

function PrimaryBtn({ onClick, disabled, children, fullWidth }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: fullWidth ? '100%' : undefined,
      background: C.accent, color: '#0a0a0a',
      border: 'none', borderRadius: 99,
      padding: '14px 28px', fontSize: 14, fontWeight: 800,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit', opacity: disabled ? 0.4 : 1,
      transition: 'opacity .15s',
    }}>{children}</button>
  );
}

function OnbHeader({ step, onBack }: { step: Step; onBack?: () => void }) {
  const idx = DOT_STEPS.indexOf(step);
  const display = idx < 0 ? STEPS.length : idx + 1;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
      {onBack ? <BackBtn onClick={onBack} /> : <div style={{ width: 40 }} />}
      <StepDots step={step} />
      <div style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>{display} / {STEPS.length}</div>
    </div>
  );
}

export function SetupWizard({ onComplete }: Props) {
  const [step, setStep]       = useState<Step>('mode');
  const [mode, setMode]       = useState<HouseholdMode>('joint');
  const [nameA, setNameA]     = useState('');
  const [nameB, setNameB]     = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'telegram' | ''>('whatsapp');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [whatsappNumber, setWhatsappNumber]     = useState('');

  const isSolo  = mode === 'solo';
  const modes: HouseholdMode[] = ['joint', 'separate', 'solo'];

  const shell: React.CSSProperties = {
    minHeight: '100vh', background: C.bg,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '32px 20px', fontFamily: 'inherit',
  };
  const wrap: React.CSSProperties = {
    width: '100%', maxWidth: 480,
    padding: '20px 24px 32px',
    animation: 'cf-fade-up .35s ease-out',
  };
  const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
    flex: 1, height: 56, background: C.surface2,
    border: '1.5px solid transparent', borderRadius: 14,
    color: C.textW, fontFamily: 'inherit',
    fontSize: 16, fontWeight: 600,
    padding: '0 18px', outline: 'none',
    transition: 'border-color .15s', boxSizing: 'border-box' as const,
    ...extra,
  });

  if (step === 'mode') return (
    <div style={shell}>
      <div style={wrap}>
        <OnbHeader step="mode" />
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: C.textW, lineHeight: 1.15, marginBottom: 8 }}>
            How does your household work?
          </div>
          <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.55 }}>
            You can switch this later — it just changes which dashboard you see.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {modes.map((m) => {
            const meta = HOUSEHOLD_MODE_META[m];
            const active = mode === m;
            return (
              <button key={m} onClick={() => setMode(m)} style={{
                textAlign: 'left', fontFamily: 'inherit',
                background: active ? C.accentBg : C.surface,
                border: `1.5px solid ${active ? C.accent : 'transparent'}`,
                borderRadius: 16, padding: '16px 18px',
                display: 'flex', alignItems: 'flex-start', gap: 14,
                cursor: 'pointer', transition: 'all .15s',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: active ? C.accent : C.surface2,
                  color: active ? '#0a0a0a' : C.text2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}><Icon name={MODE_ICONS[m] ?? 'user'} size={20} color={active ? '#0a0a0a' : C.text2} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.textW, marginBottom: 4 }}>{meta.label}</div>
                  <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>{meta.description}</div>
                </div>
                {active && (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.accent, color: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={14} strokeWidth={3} color="#0a0a0a" /></div>
                )}
              </button>
            );
          })}
        </div>
        <PrimaryBtn fullWidth onClick={() => setStep('names')}>Continue →</PrimaryBtn>
      </div>
    </div>
  );

  if (step === 'names') return (
    <div style={shell}>
      <div style={wrap}>
        <OnbHeader step="names" onBack={() => setStep('mode')} />
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: C.textW, lineHeight: 1.15, marginBottom: 8 }}>
            {isSolo ? "What's your name?" : "Who's in?"}
          </div>
          <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.55 }}>
            {isSolo ? "We'll use this on your dashboard." : "We'll show each of you separately on the dashboard."}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.accent, color: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, flexShrink: 0 }}>
              {(nameA || '?').charAt(0).toUpperCase()}
            </div>
            <input value={nameA} onChange={(e) => setNameA(e.target.value)}
              placeholder={isSolo ? 'Your name' : "First partner's name"}
              autoFocus style={inp()}
              onFocus={(e) => (e.target.style.borderColor = C.accent)}
              onBlur={(e) => (e.target.style.borderColor = 'transparent')}
            />
          </div>
          {!isSolo && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.purpleBg, color: C.purple, border: `1.5px solid ${C.purple}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, flexShrink: 0 }}>
                {(nameB || '?').charAt(0).toUpperCase()}
              </div>
              <input value={nameB} onChange={(e) => setNameB(e.target.value)}
                placeholder="Second partner's name"
                style={inp()}
                onFocus={(e) => (e.target.style.borderColor = C.purple)}
                onBlur={(e) => (e.target.style.borderColor = 'transparent')}
              />
            </div>
          )}
        </div>
        <PrimaryBtn fullWidth onClick={() => nameA.trim() && setStep('connect')} disabled={!nameA.trim()}>
          Continue →
        </PrimaryBtn>
      </div>
    </div>
  );

  if (step === 'connect') return (
    <div style={shell}>
      <div style={wrap}>
        <OnbHeader step="connect" onBack={() => setStep('names')} />
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: C.textW, lineHeight: 1.15, marginBottom: 8 }}>
            Where do you want to log?
          </div>
          <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.55 }}>
            Send <span style={{ color: C.textW, fontWeight: 600 }}>"450 Zomato"</span> to log instantly. You can change this later.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {([
            { id: 'whatsapp' as const, label: 'WhatsApp', sub: 'Most popular · used by 92% of households', icon: '💬' },
            { id: 'telegram' as const, label: 'Telegram', sub: 'Faster · better for groups', icon: '✈️' },
          ]).map((c) => {
            const active = channel === c.id;
            return (
              <button key={c.id} onClick={() => setChannel(c.id)} style={{
                textAlign: 'left', fontFamily: 'inherit',
                background: active ? C.accentBg : C.surface,
                border: `1.5px solid ${active ? C.accent : 'transparent'}`,
                borderRadius: 16, padding: '16px 18px',
                display: 'flex', alignItems: 'center', gap: 14,
                cursor: 'pointer', transition: 'all .15s',
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: active ? C.accent : C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={CHANNEL_ICONS[c.id]} size={22} color={active ? '#0a0a0a' : C.text2} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.textW }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: C.text2, marginTop: 3 }}>{c.sub}</div>
                </div>
                {active && (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={14} strokeWidth={3} color="#0a0a0a" /></div>
                )}
              </button>
            );
          })}
        </div>
        {channel === 'whatsapp' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3, marginBottom: 8 }}>WhatsApp number (with country code)</div>
            <input type="tel" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 919876543210"
              style={inp({ width: '100%' })}
              onFocus={(e) => (e.target.style.borderColor = C.accent)}
              onBlur={(e) => (e.target.style.borderColor = 'transparent')}
            />
          </div>
        )}
        {channel === 'telegram' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3, marginBottom: 8 }}>Telegram username (without @)</div>
            <input type="text" value={telegramUsername} onChange={(e) => setTelegramUsername(e.target.value.replace(/@/g, '').trim())}
              placeholder="e.g. yourhandle"
              style={inp({ width: '100%' })}
              onFocus={(e) => (e.target.style.borderColor = C.accent)}
              onBlur={(e) => (e.target.style.borderColor = 'transparent')}
            />
          </div>
        )}
        <PrimaryBtn fullWidth onClick={() => setStep('features')}>Continue →</PrimaryBtn>
        <button onClick={() => setStep('features')} style={{ background: 'transparent', border: 'none', color: C.text3, fontSize: 13, fontWeight: 500, padding: '14px', fontFamily: 'inherit', cursor: 'pointer', marginTop: 4, width: '100%' }}>
          Skip for now
        </button>
      </div>
    </div>
  );

  if (step === 'features') return (
    <div style={shell}>
      <div style={wrap}>
        <OnbHeader step="features" onBack={() => setStep('connect')} />
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: C.textW, lineHeight: 1.15, marginBottom: 8 }}>
            What's included
          </div>
          <div style={{ fontSize: 14, color: C.text2 }}>All features are included from day one.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {[
            { title: 'Dashboard', desc: 'Income, spending, investments and retention velocity' },
            { title: 'Bot logging', desc: 'WhatsApp and Telegram expense logging with AI parsing' },
            { title: 'Settlements', desc: mode !== 'solo' ? 'Joint pool and partner split tracking' : 'Not needed in solo mode' },
            { title: 'Goals & EMI', desc: 'Savings milestones and loan tracking' },
          ].map((f) => (
            <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.surface, borderRadius: 16, padding: '14px 18px' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: C.text2 }}>
                <Icon name={FEATURE_ICONS[f.title] ?? 'star'} size={22} color={C.text2} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.textW, marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: C.text2 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          <div style={{ background: C.surface, borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3, marginBottom: 8 }}>Free</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.textW, marginBottom: 6 }}>₹0</div>
            <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6 }}>30 AI parses/month · Full dashboard</div>
          </div>
          <div style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.accent, marginBottom: 8 }}>✦ Pro</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.accent, marginBottom: 6 }}>₹299</div>
            <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6 }}>Unlimited AI · Priority support</div>
          </div>
        </div>
        <PrimaryBtn fullWidth onClick={() => setStep('done')}>Let's go →</PrimaryBtn>
      </div>
    </div>
  );

  return (
    <div style={shell}>
      <div style={{ ...wrap, animation: 'cf-fade-up .4s ease-out' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 24, paddingTop: 32 }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', background: C.accent, color: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 40px rgba(240,180,41,0.35)', animation: 'cf-pulse 2s ease-in-out infinite' }}>
            <Icon name="check" size={44} strokeWidth={3.5} color="#0a0a0a" />
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1, color: C.textW, marginBottom: 10 }}>
              You're all set{nameA ? `, ${nameA}` : ''}
            </div>
            <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, maxWidth: 280, margin: '0 auto' }}>
              Your ChillarFlow dashboard is ready. Start logging by sending a message any time.
            </div>
          </div>
          <div style={{ background: C.surface, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 320, width: '100%', textAlign: 'left' as const }}>
            <Icon name="messageCircle" size={20} color={C.text2} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3, marginBottom: 2 }}>Try sending</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.textW, fontStyle: 'italic' }}>"450 Zomato to settle"</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 32 }}>
          <PrimaryBtn fullWidth onClick={() => onComplete(mode, nameA.trim(), isSolo ? '' : nameB.trim() || 'Partner B', telegramUsername.trim() || undefined)}>
            Open ChillarFlow →
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
