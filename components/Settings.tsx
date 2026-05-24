'use client';
// ─── components/Settings.tsx ──────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import type { AppData, Settings as SettingsType, HouseholdMode } from '@/types';
import { Card, Btn, Inp, Label, SectionTitle, Toggle, PlanBadge, UsageMeter, ThemePicker } from '@/components/ui';
import { C, HOUSEHOLD_MODE_META } from '@/constants';
import { hasPartnerB } from '@/lib/householdModes';
import { supabase } from '@/lib/supabaseClient';
import { parseImport } from '@/lib/parseImport';

interface Props {
  data: AppData;
  householdId: string;
  onSave: (s: SettingsType) => void;
  onExport: () => void;
  onImport: (payload: any) => void;
  onJoinHousehold: (id: string) => void;
  theme?: string;
  onThemeChange?: (t: string) => void;
  planInfo?: { plan: 'free' | 'pro'; count: number; limit: number; pct: number; month: string };
}

// ─── Downgrade config ─────────────────────────────────────────────────────────

interface SwitchInfo {
  type: 'upgrade' | 'downgrade';
  title: string;
  subtitle: string;
  // What becomes visible (upgrades) or hidden (downgrades)
  changes: string[];
  note: string;
  offerNewHousehold: boolean;
}

const SWITCH_INFO: Record<string, Record<string, SwitchInfo>> = {

  // ── Upgrades (adding capability) ─────────────────────────────────────────
  solo: {
    separate: {
      type: 'upgrade',
      title: 'Upgrading to Separate Finance',
      subtitle: 'You are adding a second partner to this household.',
      changes: [
        'Partner B name field and account appear throughout the app',
        'Expense list gains partner account filters',
        'Settlement tab unlocks for direct partner-to-partner splits',
        'Both partners can be assigned to transactions',
      ],
      note: 'Your existing solo transactions are preserved and will show as Partner A activity.',
      offerNewHousehold: false,
    },
    joint: {
      type: 'upgrade',
      title: 'Upgrading to Joint Finance',
      subtitle: 'You are enabling the full shared-pool experience.',
      changes: [
        'Joint account option appears in all account pickers',
        'Contributions tab unlocks for tracking monthly pool deposits',
        'Joint reimbursement settlement track becomes available',
        'Joint Balance card appears on the Dashboard',
        'Joint presets appear in the Add Expense form',
      ],
      note: 'Your existing solo transactions are preserved and will show as Partner A personal activity.',
      offerNewHousehold: false,
    },
  },
  separate: {
    joint: {
      type: 'upgrade',
      title: 'Upgrading to Joint Finance',
      subtitle: 'You are adding a shared pool on top of your existing separate tracking.',
      changes: [
        'Joint account option appears in all account pickers',
        'Contributions tab unlocks for tracking monthly pool deposits',
        'Joint reimbursement settlement track becomes available',
        'Joint Balance card and audit tool appear on the Dashboard',
        'Joint presets appear in the Add Expense form',
      ],
      note: 'All existing separate transactions are preserved. Nothing is reclassified automatically.',
      offerNewHousehold: false,
    },

    // ── Downgrade ───────────────────────────────────────────────────────────
    solo: {
      type: 'downgrade',
      title: 'Downgrading to Solo',
      subtitle: 'This will hide all Partner B activity in the UI.',
      changes: [
        'Partner B transactions become invisible (safely stored)',
        'Partner split settlements become invisible (safely stored)',
        'Partner B account options removed from all pickers and filters',
      ],
      note: 'Nothing is deleted. Switch back to Separate at any time and everything reappears instantly.',
      offerNewHousehold: true,
    },
  },
  joint: {
    separate: {
      type: 'downgrade',
      title: 'Downgrading to Separate Finance',
      subtitle: 'This will hide your shared joint pool in the UI.',
      changes: [
        'Joint account transactions become invisible (safely stored)',
        'Contributions / joint pool history becomes invisible (safely stored)',
        'Joint reimbursement settlements become invisible (safely stored)',
        'Contributions tab hidden from nav',
      ],
      note: 'Nothing is deleted. Switch back to Joint at any time and everything reappears instantly.',
      offerNewHousehold: false,
    },
    solo: {
      type: 'downgrade',
      title: 'Downgrading to Solo',
      subtitle: 'This will hide all partner and joint activity in the UI.',
      changes: [
        'All joint account transactions become invisible (safely stored)',
        'Partner B transactions and activity become invisible (safely stored)',
        'Contributions / joint pool history becomes invisible (safely stored)',
        'All settlement data — joint and partner — becomes invisible (safely stored)',
      ],
      note: 'Nothing is deleted. If you want a genuinely fresh solo start, use the option below to export your data first and create a new household.',
      offerNewHousehold: true,
    },
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Settings({ data, householdId, onSave, onExport, onImport, onJoinHousehold, theme = 'dark-navy', onThemeChange, planInfo }: Props) {

  const [s, setS]                 = useState<SettingsType>(() => JSON.parse(JSON.stringify(data.settings)));
  const [flash, setFlash]         = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newExpCat, setNewExpCat] = useState('');
  const [newIncCat, setNewIncCat] = useState('');
  const [joinId, setJoinId]       = useState('');
  const [expandedMode, setExpandedMode] = useState<string | null>(null);
  const [expandedTg, setExpandedTg]     = useState(false);
  const [downgradeModal, setDowngradeModal]   = useState<SwitchInfo | null>(null);
  const [pendingSettings, setPendingSettings] = useState<SettingsType | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data?.settings) setS(JSON.parse(JSON.stringify(data.settings)));
  }, [data.settings]);

  const modes: HouseholdMode[]  = ['joint', 'separate', 'solo'];
  const partnerB                = hasPartnerB(s.householdMode);
  const currentCloudRole        = data.currentUserRole ?? 'Partner A';
  const telegramHandle          = (s.telegramUsername ?? '').trim();
  const telegramLinked          = telegramHandle.length > 0;

  // ── Save with downgrade protection ────────────────────────────────────────

  const save = () => {
    const currentMode = data.settings.householdMode ?? 'joint';
    const newMode     = s.householdMode ?? 'joint';

    if (currentMode !== newMode) {
      const info = SWITCH_INFO[currentMode]?.[newMode];
      if (info) {
        setPendingSettings(s);
        setDowngradeModal(info);
        return;
      }
    }
    commitSave(s);
  };

  const commitSave = (settings: SettingsType) => {
    // Guarantee Miscellaneous is always present before persisting
    const guarded = {
      ...settings,
      expenseCategories: settings.expenseCategories.includes('Miscellaneous')
        ? settings.expenseCategories
        : [...settings.expenseCategories, 'Miscellaneous'],
    };
    onSave(guarded);
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };

  const handleModalProceed = () => {
    if (pendingSettings) commitSave(pendingSettings);
    setDowngradeModal(null);
    setPendingSettings(null);
  };

  const handleModalCancel = () => {
    setS((x) => ({ ...x, householdMode: data.settings.householdMode }));
    setDowngradeModal(null);
    setPendingSettings(null);
  };

  const handleModalNewHousehold = () => {
    setDowngradeModal(null);
    setPendingSettings(null);
    setS((x) => ({ ...x, householdMode: data.settings.householdMode }));
    onExport();
    alert(
      'Your data has been exported.\n\n' +
      'To start a fresh solo household:\n' +
      '1. Log out\n' +
      '2. Sign up with a new account (or different email)\n' +
      '3. The setup wizard will let you choose Solo mode\n\n' +
      'Your current household data remains exactly as it is.'
    );
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const addExpCat = () => {
    if (!newExpCat.trim()) return;
    setS((x) => ({ ...x, expenseCategories: [...x.expenseCategories, newExpCat.trim()] }));
    setNewExpCat('');
  };

  const addIncCat = () => {
    if (!newIncCat.trim()) return;
    setS((x) => ({ ...x, incomeCategories: [...x.incomeCategories, newIncCat.trim()] }));
    setNewIncCat('');
  };

  const PROTECTED_CATS = ['Miscellaneous']; // cannot be removed by any user

  const removeExpCat = (c: string) => {
    if (PROTECTED_CATS.includes(c)) return; // silently blocked
    setS((x) => ({ ...x, expenseCategories: x.expenseCategories.filter((e) => e !== c) }));
  };

  const removeIncCat = (c: string) =>
    setS((x) => ({ ...x, incomeCategories: x.incomeCategories.filter((e) => e !== c) }));

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseImport(file, (result: any, err?: string) => {
      if (err) { setImportMsg({ type: 'error', text: err }); return; }
      onImport(result);
      setImportMsg({ type: 'success', text: `Imported ${result.expenses.length} transactions!` });
      setTimeout(() => setImportMsg(null), 4000);
    });
    e.target.value = '';
  };

  const handleJoinHousehold = () => {
    if (!joinId.trim()) return;
    onJoinHousehold(joinId.trim());
    setJoinId('');
  };

  const switchRole = async (role: 'Partner A' | 'Partner B') => {
    if (currentCloudRole === role) return;
    const name = role === 'Partner A' ? s.partnerAName : s.partnerBName;
    if (!confirm(`Switch device profile to ${name} (${role})?`)) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('profiles').update({ display_name: role }).eq('id', userData.user?.id);
    if (error) { alert(error.message); return; }
    if (typeof window !== 'undefined') localStorage.setItem('active_partner_role', role);
    window.location.reload();
  };

  const catPillStyle: React.CSSProperties = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7,
    padding: '4px 10px', fontSize: 13, color: C.text1,
    display: 'flex', alignItems: 'center', gap: 6,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>

      {/* ── Mode switch confirmation modal ─────────────────────────────────── */}
      {downgradeModal && (() => {
        const isUpgrade  = downgradeModal.type === 'upgrade';
        const accentColor = isUpgrade ? C.green : C.amber;
        const icon        = isUpgrade ? '🚀' : '⚠️';
        const changesLabel = isUpgrade ? 'What gets unlocked:' : 'What becomes hidden in the UI (never deleted):';
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: C.surface, border: `1px solid ${accentColor}44`, borderRadius: 14, padding: 28, maxWidth: 480, width: '100%' }}>

              {/* Header */}
              <div style={{ fontSize: 17, fontWeight: 800, color: accentColor, marginBottom: 4 }}>
                {icon} {downgradeModal.title}
              </div>
              <p style={{ color: C.text2, fontSize: 13, margin: '0 0 14px', lineHeight: 1.6 }}>
                {downgradeModal.subtitle}
              </p>

              {/* Changes list */}
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                {changesLabel}
              </div>
              <ul style={{ margin: '0 0 14px 18px', padding: 0, lineHeight: 2 }}>
                {downgradeModal.changes.map((item) => (
                  <li key={item} style={{ color: C.text1, fontSize: 13 }}>{item}</li>
                ))}
              </ul>

              {/* Note */}
              <div style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}33`, borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: accentColor, lineHeight: 1.6 }}>
                💡 {downgradeModal.note}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!isUpgrade && downgradeModal.offerNewHousehold && (
                  <Btn variant="primary" onClick={handleModalNewHousehold} style={{ width: '100%' }}>
                    📦 Export my data &amp; start a fresh household
                  </Btn>
                )}
                <Btn
                  variant={isUpgrade ? 'primary' : 'ghost'}
                  onClick={handleModalProceed}
                  style={{ width: '100%' }}
                >
                  {isUpgrade ? `✓ Yes, upgrade to ${downgradeModal.title.split('to ')[1]}` : downgradeModal.offerNewHousehold ? 'Switch anyway (keep this household)' : 'Yes, switch mode'}
                </Btn>
                <Btn variant={isUpgrade ? 'ghost' : 'danger'} onClick={handleModalCancel} style={{ width: '100%' }}>
                  Cancel — stay on current mode
                </Btn>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Plan & Usage ──────────────────────────────────────────────────── */}
      <Card style={{ border: planInfo?.plan === 'pro' ? '1px solid rgba(245,158,11,0.4)' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <SectionTitle style={{ margin: 0 }}>Your Plan</SectionTitle>
          <PlanBadge plan={planInfo?.plan ?? 'free'} />
        </div>
        {/* AI parse usage — always shown, even at 0, even while loading */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: C.text2 }}>AI parses used this month</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: planInfo?.plan === 'pro' ? C.teal : C.textW }}>
              {planInfo
                ? planInfo.plan === 'pro'
                  ? `${planInfo.count} (unlimited)`
                  : `${planInfo.count} / ${planInfo.limit}`
                : '— / 30'}
            </span>
          </div>
          {/* Progress bar — always rendered, 0% width when no data yet */}
          <div style={{ background: C.border, borderRadius: 99, height: 6, overflow: 'hidden' }}>
            <div style={{
              width: planInfo
                ? planInfo.plan === 'pro' ? '100%' : `${planInfo.pct}%`
                : '0%',
              height: '100%',
              background: planInfo?.plan === 'pro'
                ? C.teal
                : !planInfo || planInfo.pct < 70 ? C.green
                : planInfo.pct < 90 ? C.amber : C.red,
              borderRadius: 99,
              transition: 'width 0.4s',
            }} />
          </div>
          {planInfo?.plan === 'pro' && (
            <div style={{ fontSize: 11, color: C.teal, marginTop: 5 }}>
              ∞ Unlimited — Pro plan active
            </div>
          )}
          {planInfo && planInfo.plan === 'free' && planInfo.pct >= 70 && (
            <div style={{ fontSize: 11, color: planInfo.pct >= 90 ? C.red : C.amber, marginTop: 5 }}>
              {planInfo.pct >= 100 ? '🚫 Limit reached' : `⚠️ ${30 - planInfo.count} parses remaining`}
            </div>
          )}
          {!planInfo && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
              Loading usage data…
            </div>
          )}
        </div>

        {/* Upgrade CTA — shown for free plan OR while loading (assume free until known) */}
        {(!planInfo || planInfo.plan === 'free') && (
          <div style={{ padding: '12px 14px', background: `${C.amber}10`, border: `1px solid ${C.amber}33`, borderRadius: 10, marginBottom: 0 }}>
            <div style={{ color: C.textW, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
              ✦ Upgrade to Pro
            </div>
            <div style={{ color: C.text2, fontSize: 12, marginBottom: 10, lineHeight: 1.6 }}>
              Free plan: 30 AI parses/month · Pro plan: unlimited. The number wizard is always free.
            </div>
            <Btn variant="primary" style={{ width: '100%' }} onClick={() => {
              window.open('mailto:support@familyfinance.app?subject=Pro%20Upgrade&body=Household%20ID:%20' + householdId, '_blank');
            }}>
              ✦ Upgrade to Pro — Unlimited AI logging
            </Btn>
          </div>
        )}

        {/* Pro active state */}
        {planInfo?.plan === 'pro' && (
          <div style={{ padding: '10px 14px', background: `${C.teal}10`, border: `1px solid ${C.teal}33`, borderRadius: 10, textAlign: 'center' }}>
            <div className="pro-badge" style={{ fontSize: 15, marginBottom: 4 }}>✦ PRO PLAN ACTIVE</div>
            <div style={{ color: C.text2, fontSize: 12 }}>Thank you for supporting FamilyFinance!</div>
          </div>
        )}
      </Card>

      {/* ── Theme ──────────────────────────────────────────────── */}
      {onThemeChange && (
        <Card>
          <SectionTitle>App Theme</SectionTitle>
          <p style={{ color: C.muted, fontSize: 13, margin: '0 0 14px' }}>Changes take effect immediately.</p>
          <ThemePicker current={theme} onChange={onThemeChange} />
        </Card>
      )}

      {/* ── Household Mode ──────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Household Mode</SectionTitle>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 14px' }}>
          Adjusts which features are available. No data is ever deleted when switching modes.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {modes.map((m) => {
            const meta   = HOUSEHOLD_MODE_META[m];
            const active = s.householdMode === m;
            const isOpen = expandedMode === m;
            return (
              <div key={m}>
                {/* Mode row — click to select, chevron to expand */}
                <div
                  onClick={() => setS((x) => ({ ...x, householdMode: m }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                    background: active ? C.amber + '18' : C.bg,
                    border: `2px solid ${active ? C.amber : C.border}`,
                    borderRadius: isOpen ? '10px 10px 0 0' : 10,
                    padding: '12px 14px', transition: 'all 0.2s' }}
                >
                  {/* Active indicator dot */}
                  <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${active ? C.amber : C.border}`,
                    background: active ? C.amber : 'transparent',
                    transition: 'all 0.2s' }} />
                  <span style={{ fontSize: 18 }}>{meta.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.textW, fontWeight: 700, fontSize: 14 }}>{meta.label}</div>
                    <div style={{ color: C.text2, fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>{meta.description}</div>
                  </div>
                  {/* Chevron toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedMode(isOpen ? null : m); }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                      color: isOpen ? C.amber : C.muted, fontSize: 14, padding: '4px 6px',
                      display: 'flex', alignItems: 'center', flexShrink: 0,
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s, color 0.2s' }}
                  >
                    ▾
                  </button>
                </div>

                {/* Expandable detail panel — full width, below the row */}
                {isOpen && (
                  <div style={{ background: `${C.amber}08`,
                    border: `2px solid ${active ? C.amber : C.border}`, borderTop: 'none',
                    borderRadius: '0 0 10px 10px', padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 600,
                      textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 10 }}>
                      What you get with {meta.label}:
                    </div>
                    {((meta as any).detail as string[]).map((line: string, i: number) => (
                      <div key={i} style={{ fontSize: 13, color: C.text2, marginBottom: 8,
                        lineHeight: 1.5, display: 'flex', gap: 8 }}>
                        <span style={{ flexShrink: 0 }}>{line.slice(0, 2)}</span>
                        <span>{line.slice(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Partner Names ─────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Partner Names</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: partnerB ? '1fr 1fr' : '1fr', gap: 14 }}>
          <div>
            <Label>{partnerB ? 'Partner A Name' : 'Your Name'}</Label>
            <Inp value={s.partnerAName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setS((x) => ({ ...x, partnerAName: e.target.value }))} />
          </div>
          {partnerB && (
            <div>
              <Label>Partner B Name</Label>
              <Inp value={s.partnerBName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setS((x) => ({ ...x, partnerBName: e.target.value }))} />
            </div>
          )}
        </div>
      </Card>

      {/* ── Active Device Profile ─────────────────────────────────────────── */}
      {partnerB && (
        <Card style={{ border: `1px solid ${C.purple}44` }}>
          <SectionTitle>Active Device Profile</SectionTitle>
          <p style={{ color: C.muted, fontSize: 13, margin: '0 0 6px' }}>
            Select which partner is using this device. This auto-tags new expenses.
          </p>
          <p style={{ color: C.muted, fontSize: 12, margin: '0 0 12px' }}>
            Currently registered as{' '}
            <strong style={{ color: C.textW }}>
              {currentCloudRole === 'Partner A' ? s.partnerAName : s.partnerBName}
            </strong>{' '}({currentCloudRole}).
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['Partner A', 'Partner B'] as const).map((role) => (
              <Btn key={role} variant={currentCloudRole === role ? 'primary' : 'ghost'}
                style={{ flex: 1 }} onClick={() => switchRole(role)}>
                👤 {role === 'Partner A' ? s.partnerAName : s.partnerBName}
              </Btn>
            ))}
          </div>
        </Card>
      )}

      {/* ── Telegram Integration ──────────────────────────────────────────── */}
      <Card style={{ border: `1px solid ${C.teal}44` }}>
        <SectionTitle>Telegram Bot Integration</SectionTitle>
        <p style={{ color: C.text1, fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
          {telegramLinked
            ? 'Your Telegram account is connected. Send a message to log expenses instantly.'
            : 'Link your Telegram username to log expenses from your phone in seconds.'}
        </p>

        {/* Username input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input type="text" disabled={telegramLinked}
            placeholder={telegramLinked ? `@${telegramHandle}` : 'e.g. yourhandle (without @)'}
            value={telegramLinked ? `@${telegramHandle}` : (s.telegramUsername ?? '')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setS((x) => ({ ...x, telegramUsername: e.target.value.replace(/@/g, '').trim() }))}
            style={{ background: telegramLinked ? `${C.bg}80` : C.bg,
              border: `1px solid ${telegramLinked ? C.border : C.teal}`,
              color: telegramLinked ? C.text2 : C.textW,
              borderRadius: 8, padding: '10px 14px', flex: 1,
              boxSizing: 'border-box' as const, outline: 'none', fontSize: 16,
              opacity: telegramLinked ? 0.7 : 1,
              cursor: telegramLinked ? 'not-allowed' : 'text' }} />
          {telegramLinked && (
            <Btn variant="danger" onClick={() => setS((x) => ({ ...x, telegramUsername: '' }))}>Unlink</Btn>
          )}
        </div>

        {/* Setup guide — collapsible */}
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <button
            onClick={() => setExpandedTg((v) => !v)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 600,
              textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
              {expandedTg ? 'Hide setup guide' : 'How to set up & logging syntax'}
            </span>
            <span style={{ color: C.muted, fontSize: 14,
              transform: expandedTg ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
          </button>
          {expandedTg && <div style={{ padding: '0 16px 14px' }}>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>
            How to set up
          </div>
          {[
            { step: '1', text: 'Open Telegram and start a chat with your bot (link provided by the admin)' },
            { step: '2', text: 'Send /start to activate it' },
            { step: '3', text: 'Enter your Telegram username above (without @) and save Settings' },
            { step: '4', text: 'Start logging! Try: 450 Zomato' },
          ].map(({ step, text }) => (
            <div key={step} style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
              <span style={{ background: `${C.teal}22`, color: C.teal, borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{step}</span>
              <span>{text}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 8 }}>Logging syntax</div>
            {[
              { code: '450 Zomato',            desc: 'Personal expense' },
              { code: '450 Zomato to settle',  desc: 'Joint pool reimburses you' },
              { code: '500',                   desc: 'Interactive wizard' },
              { code: '/recent',               desc: 'View & edit last 3 transactions' },
              { code: '/summary',              desc: 'This month\'s snapshot' },
              { code: '/usage',                desc: 'Check AI parse usage' },
            ].map(({ code, desc }) => (
              <div key={code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' as const, gap: 6 }}>
                <code style={{ background: `${C.border}40`, padding: '2px 8px', borderRadius: 4, fontSize: 11, color: C.teal }}>{code}</code>
                <span style={{ fontSize: 11, color: C.muted }}>{desc}</span>
              </div>
            ))}
          </div>
          </div>}
        </div>
      </Card>

      {/* ── Expense Categories ────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Expense Categories</SectionTitle>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
          {s.expenseCategories.map((c) => (
            <span key={c} style={{
              ...catPillStyle,
              ...(c === 'Miscellaneous' ? { border: `1px solid ${C.teal}44`, background: `${C.teal}0a` } : {}),
            }}>
              {c}
              {c === 'Miscellaneous' ? (
                <span title="Required — cannot be removed" style={{ color: C.teal, fontSize: 11, cursor: 'default', lineHeight: 1 }}>🔒</span>
              ) : (
                <span onClick={() => removeExpCat(c)} style={{ color: C.red, cursor: 'pointer', fontWeight: 700, fontSize: 15, lineHeight: 1 }}>×</span>
              )}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Inp value={newExpCat} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewExpCat(e.target.value)}
            placeholder="Add category…" onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && addExpCat()}
            style={{ flex: 1 }} />
          <Btn variant="ghost" onClick={addExpCat}>Add</Btn>
        </div>
      </Card>

      {/* ── Income Categories ─────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Income Categories</SectionTitle>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
          {s.incomeCategories.map((c) => (
            <span key={c} style={catPillStyle}>
              {c}
              <span onClick={() => removeIncCat(c)} style={{ color: C.red, cursor: 'pointer', fontWeight: 700, fontSize: 15, lineHeight: 1 }}>×</span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Inp value={newIncCat} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewIncCat(e.target.value)}
            placeholder="Add income category…" onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && addIncCat()}
            style={{ flex: 1 }} />
          <Btn variant="ghost" onClick={addIncCat}>Add</Btn>
        </div>
      </Card>

      {/* ── Category Budgets ──────────────────────────────────────────────── */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <SectionTitle style={{ margin: 0 }}>Category Budgets (Monthly)</SectionTitle>
          {Object.keys(s.budgets).some((k) => s.budgets[k] !== undefined) && (
            <button
              onClick={() => {
                if (window.confirm('Remove all budget limits? This cannot be undone.')) {
                  setS((x) => ({ ...x, budgets: {} }));
                }
              }}
              style={{ background: 'transparent', border: `1px solid ${C.red}44`, color: C.red, borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
            >
              Reset All
            </button>
          )}
        </div>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 14px' }}>
          Set a monthly spending limit per category. Overages are flagged on the dashboard.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {s.expenseCategories.map((c) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.text1, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
              <Inp type="number" placeholder="No limit" value={s.budgets[c] ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value;
                  setS((x) => ({ ...x, budgets: { ...x.budgets, [c]: v ? Number(v) : undefined } }));
                }}
                style={{ width: 100, padding: '6px 10px', fontSize: 12 }} />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Push Notifications ────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Push Notifications</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Toggle checked={s.notifications.enabled}
            onChange={(v) => setS((x) => ({ ...x, notifications: { ...x.notifications, enabled: v } }))}
            label="Enable push notifications (browser permission required)" />
          {s.notifications.enabled && (
            <>
              <Toggle checked={s.notifications.newExpense}
                onChange={(v) => setS((x) => ({ ...x, notifications: { ...x.notifications, newExpense: v } }))}
                label="Notify when partner adds an expense" />
              <Toggle checked={s.notifications.settlement}
                onChange={(v) => setS((x) => ({ ...x, notifications: { ...x.notifications, settlement: v } }))}
                label="Notify on settlement actions" />
              <Toggle checked={s.notifications.budgetAlert}
                onChange={(v) => setS((x) => ({ ...x, notifications: { ...x.notifications, budgetAlert: v } }))}
                label="Alert when approaching a budget limit" />
              {s.notifications.budgetAlert && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Label>Alert at</Label>
                  <Inp type="number" value={s.notifications.budgetThreshold}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setS((x) => ({ ...x, notifications: { ...x.notifications, budgetThreshold: Number(e.target.value) } }))}
                    style={{ width: 70 }} />
                  <span style={{ color: C.text1, fontSize: 13 }}>% of budget used</span>
                </div>
              )}
              <Btn variant="ghost" style={{ alignSelf: 'flex-start' }}
                onClick={async () => {
                  if (!('Notification' in window)) return;
                  const permission = await Notification.requestPermission();
                  if (permission === 'granted') {
                    new Notification('FamilyFinance', { body: 'Notifications working! ✓' });
                  } else {
                    alert('Please allow notifications in your browser settings.');
                  }
                }}>
                Test Notification
              </Btn>
            </>
          )}
        </div>
      </Card>

      {/* ── Data Management ───────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Data Management</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ color: C.text1, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Export to Excel</div>
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>
              Download all data as an .xlsx file with sheets for expenses, contributions, goals, and loans.
            </div>
            <Btn variant="success" onClick={onExport}>⬇ Export to Excel</Btn>
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <div style={{ color: C.text1, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Import from Excel</div>
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>
              Import from a matching .xlsx or .csv file. Existing data is merged, not replaced.
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} style={{ display: 'none' }} />
            <Btn variant="purple" onClick={() => fileRef.current?.click()}>⬆ Import File</Btn>
            {importMsg && (
              <div style={{ marginTop: 10, padding: '9px 14px', borderRadius: 8, fontSize: 13,
                background: importMsg.type === 'success' ? C.green + '22' : C.red + '22',
                border: `1px solid ${importMsg.type === 'success' ? C.green : C.red}44`,
                color: importMsg.type === 'success' ? C.green : C.red }}>
                {importMsg.text}
              </div>
            )}
            <div style={{ marginTop: 10, padding: '10px 14px', background: C.bg, borderRadius: 8, fontSize: 12, color: C.muted }}>
              <strong style={{ color: C.text1 }}>Expected Expenses sheet columns:</strong><br />
              ID, Date (YYYY-MM-DD), Type (expense/income), Category, Amount, Account, Added By, Note, To Settle (Yes/No), Settled (Yes/No), Settled For
            </div>
          </div>
        </div>
      </Card>

      {/* ── Join Partner's Household ──────────────────────────────────────── */}
      <Card>
        <SectionTitle>Join Partner's Household</SectionTitle>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 12px' }}>
          Enter your partner's Household ID to share the same data pool.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Inp value={joinId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJoinId(e.target.value)}
            placeholder="Household UUID…"
            onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleJoinHousehold()}
            style={{ flex: 1 }} />
          <Btn variant="ghost" onClick={handleJoinHousehold}>Join</Btn>
        </div>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>
          Your household ID:{' '}
          <code style={{ color: C.teal, fontSize: 11, userSelect: 'all' as const }}>{householdId}</code>
        </p>
      </Card>

      {/* ── Save ──────────────────────────────────────────────────────────── */}
      <Btn variant={flash ? 'success' : 'primary'} onClick={save}
        style={{ alignSelf: 'flex-start', padding: '12px 28px', fontSize: 15 }}>
        {flash ? '✓ Settings Saved!' : 'Save All Settings'}
      </Btn>
    </div>
  );
}
