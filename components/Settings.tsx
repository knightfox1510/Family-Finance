'use client';
// ─── components/Settings.tsx ──────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import type { AppData, Settings as SettingsType, HouseholdMode } from '@/types';
import { Card, Btn, Inp, Label, SectionTitle, Toggle, PlanBadge, UsageMeter, ThemePicker, Collapsible } from '@/components/ui';
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

// ─── Inline sub-components ───────────────────────────────────────────────────

function InviteLinkButton({ householdId }: { householdId: string }) {
  const [link, setLink] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: householdId }),
      });
      const d = await r.json();
      if (d.inviteUrl) setLink(d.inviteUrl);
    } finally { setLoading(false); }
  };

  const copy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (link) return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input readOnly value={link} style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, color: C.text2, borderRadius: 0, padding: '10px 12px', fontSize: 13, outline: 'none' }} />
        <button onClick={copy} style={{ background: copied ? C.green : C.amber, color: C.bg, border: 'none', borderRadius: 0, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: 44, flexShrink: 0 }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Link expires in 7 days. Generate a new one anytime.</p>
    </div>
  );

  return (
    <button onClick={generate} disabled={loading} style={{ background: C.teal, color: C.bg, border: 'none', borderRadius: 0, padding: '11px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', minHeight: 44 }}>
      {loading ? 'Generating...' : 'Generate invite link'}
    </button>
  );
}

function ReferralCard({ householdId }: { householdId: string }) {
  const [data, setData] = React.useState<{ code: string; shareUrl: string; referredCount: number; bonusParses: number } | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!householdId) return;
    fetch(`/api/referral?userId=${householdId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [householdId]);

  if (!data) return <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>;

  const copy = () => {
    navigator.clipboard.writeText(data.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input readOnly value={data.shareUrl} style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, color: C.text2, borderRadius: 0, padding: '10px 12px', fontSize: 13, outline: 'none' }} />
        <button onClick={copy} style={{ background: copied ? C.green : C.amber, color: C.bg, border: 'none', borderRadius: 0, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0, minHeight: 44 }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0, padding: '10px 16px', textAlign: 'center', flex: 1 }}>
          <div style={{ color: C.textW, fontWeight: 800, fontSize: 20 }}>{data.referredCount}</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>friends referred</div>
        </div>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0, padding: '10px 16px', textAlign: 'center', flex: 1 }}>
          <div style={{ color: C.amber, fontWeight: 800, fontSize: 20 }}>+{data.bonusParses}</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>bonus parses earned</div>
        </div>
      </div>
    </div>
  );
}

export function Settings({ data, householdId, onSave, onExport, onImport, onJoinHousehold, theme = 'dark-navy', onThemeChange, planInfo }: Props) {

  const [s, setS]                 = useState<SettingsType>(() => JSON.parse(JSON.stringify(data.settings)));
  const [flash, setFlash]         = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newExpCat, setNewExpCat] = useState('');
  const [newIncCat, setNewIncCat] = useState('');
  const [joinId, setJoinId]       = useState('');
  const [expandedMode, setExpandedMode] = useState<string | null>(null);
  const [expandedTg, setExpandedTg]     = useState(false);

  // Collapsed section state — all start collapsed for a clean initial view
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggleSection = (id: string) => setOpenSection((s) => s === id ? null : id);

  // Helper: collapsible card wrapper
  const CollapsibleCard = ({
    id, title, badge, children, defaultOpen = false,
  }: { id: string; title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean }) => {
    const isOpen = openSection === id || (defaultOpen && openSection === null);
    return (
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <button
          onClick={() => toggleSection(id)}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
            textAlign: 'left' as const }}
        >
          <div>
            <span style={{ color: C.textW, fontWeight: 700, fontSize: 14 }}>{title}</span>
            {badge && !isOpen && (
              <span style={{ marginLeft: 10, fontSize: 11, color: C.muted, fontWeight: 400 }}>{badge}</span>
            )}
          </div>
          <span style={{ color: C.muted, fontSize: 13, transition: 'transform 0.2s', display: 'inline-block',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
        </button>
        {isOpen && (
          <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${C.border}` }}>
            {children}
          </div>
        )}
      </Card>
    );
  };
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
  const waNumber                = (s.whatsappNumber ?? '').replace(/\D/g, '');
  const waLinked                = waNumber.length >= 10;

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
      whatsappNumber: settings.whatsappNumber ?? '',
    };
    // Also save whatsapp_number to profiles table
    if ('whatsappNumber' in guarded) {
      import('@/lib/supabaseClient').then(({ supabase }) => {
        supabase.from('profiles')
          .update({ whatsapp_number: guarded.whatsappNumber || null })
          .eq('household_id', householdId)
          .then(() => {});
      });
    }
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
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0,
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
            <div style={{ background: C.surface, border: `1px solid ${accentColor}44`, borderRadius: 0, padding: 28, maxWidth: 480, width: '100%' }}>

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
              <div style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}33`, borderRadius: 0, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: accentColor, lineHeight: 1.6 }}>
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
          <div style={{ background: C.border, borderRadius: 0, height: 6, overflow: 'hidden' }}>
            <div style={{
              width: planInfo
                ? planInfo.plan === 'pro' ? '100%' : `${planInfo.pct}%`
                : '0%',
              height: '100%',
              background: planInfo?.plan === 'pro'
                ? C.teal
                : !planInfo || planInfo.pct < 70 ? C.green
                : planInfo.pct < 90 ? C.amber : C.red,
              borderRadius: 0,
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
          <div style={{ padding: '12px 14px', background: `${C.amber}10`, border: `1px solid ${C.amber}33`, borderRadius: 0, marginBottom: 0 }}>
            <div style={{ color: C.textW, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
              ✦ Upgrade to Pro
            </div>
            <div style={{ color: C.text2, fontSize: 12, marginBottom: 10, lineHeight: 1.6 }}>
              Free plan: 30 AI parses/month · Pro plan: unlimited. The number wizard is always free.
            </div>
            <Btn variant="primary" style={{ width: '100%' }} onClick={() => {
              window.open('mailto:team@chillarflow.com?subject=Pro%20Upgrade&body=Household%20ID:%20' + householdId, '_blank');
            }}>
              ✦ Upgrade to Pro — Unlimited AI logging
            </Btn>
          </div>
        )}

        {/* Pro active state */}
        {planInfo?.plan === 'pro' && (
          <div style={{ padding: '10px 14px', background: `${C.teal}10`, border: `1px solid ${C.teal}33`, borderRadius: 0, textAlign: 'center' }}>
            <div className="pro-badge" style={{ fontSize: 15, marginBottom: 4 }}>✦ PRO PLAN ACTIVE</div>
            <div style={{ color: C.text2, fontSize: 12 }}>Thank you for supporting ChillarFlow!</div>
          </div>
        )}
      </Card>

      {/* ── Household Mode ──────────────────────────────────────────── */}
      <CollapsibleCard id="mode" title="Household Mode" badge={HOUSEHOLD_MODE_META[s.householdMode]?.label ?? ''}>
        <p style={{ color: C.muted, fontSize: 13, margin: '14px 0', lineHeight: 1.5 }}>
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
                    borderRadius: 0, padding: '12px 16px' }}>
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
      </CollapsibleCard>

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
              borderRadius: 0, padding: '10px 14px', flex: 1,
              boxSizing: 'border-box' as const, outline: 'none', fontSize: 16,
              opacity: telegramLinked ? 0.7 : 1,
              cursor: telegramLinked ? 'not-allowed' : 'text' }} />
          {telegramLinked && (
            <Btn variant="danger" onClick={() => setS((x) => ({ ...x, telegramUsername: '' }))}>Unlink</Btn>
          )}
        </div>

        {/* Setup guide — collapsible */}
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0, overflow: 'hidden' }}>
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
                <code style={{ background: `${C.border}40`, padding: '2px 8px', borderRadius: 0, fontSize: 11, color: C.teal }}>{code}</code>
                <span style={{ fontSize: 11, color: C.muted }}>{desc}</span>
              </div>
            ))}
          </div>
          </div>}
        </div>
      </Card>

      {/* ── WhatsApp Integration ─────────────────────────────────────────────── */}
      <Card style={{ border: `1px solid #25D36644` }}>
        <SectionTitle>WhatsApp Integration</SectionTitle>
        <p style={{ color: C.text1, fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
          {waLinked
            ? 'Your WhatsApp is connected. Send a message to log expenses instantly.'
            : 'Link your WhatsApp number to log expenses from WhatsApp.'}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="tel"
            disabled={waLinked}
            placeholder="Country code + number, e.g. 919876543210"
            value={waLinked ? waNumber : (s.whatsappNumber ?? '')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setS((x) => ({ ...x, whatsappNumber: e.target.value.replace(/\D/g, '') }))
            }
            style={{
              background: waLinked ? `${C.bg}80` : C.bg,
              border: `1px solid ${waLinked ? C.border : '#25D366'}`,
              color: waLinked ? C.text2 : C.textW,
              borderRadius: 0, padding: '10px 14px', flex: 1,
              boxSizing: 'border-box' as const, outline: 'none', fontSize: 16,
              opacity: waLinked ? 0.7 : 1,
              cursor: waLinked ? 'not-allowed' : 'text',
            }}
          />
          {waLinked && (
            <Btn variant="danger" onClick={() => setS((x) => ({ ...x, whatsappNumber: '' }))}>Unlink</Btn>
          )}
        </div>

        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          <strong style={{ color: C.text1 }}>Format:</strong> Country code + number without spaces or +<br />
          India example: <code style={{ background: `${C.border}40`, padding: '1px 6px', borderRadius: 0 }}>919876543210</code>
        </div>

        {!waLinked && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#25D36610', border: '1px solid #25D36633', borderRadius: 0, fontSize: 12, color: '#25D366', lineHeight: 1.6 }}>
            After linking, open WhatsApp and send <strong>hi</strong> to the ChillarFlow number to activate your account.
          </div>
        )}
      </Card>

      {/* ── Expense Categories ────────────────────────────────────────────── */}
      <CollapsibleCard id="expCats" title="Expense Categories" badge={`${s.expenseCategories.length} categories`}>
        <div style={{ paddingTop: 14 }}>
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
        </div>
      </CollapsibleCard>

      {/* ── Income Categories ─────────────────────────────────────────────── */}
      <CollapsibleCard id="incCats" title="Income Categories" badge={`${s.incomeCategories.length} categories`}>
        <div style={{ paddingTop: 14 }}>
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
        </div>
      </CollapsibleCard>

      {/* ── Category Budgets ──────────────────────────────────────────────── */}
      <CollapsibleCard id="budgets" title="Category Budgets" badge={`${Object.values(s.budgets).filter(Boolean).length} limits set`}>
        <div style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: C.muted }}>Monthly limit per category. Overages flagged on dashboard.</span>
          {Object.keys(s.budgets).some((k) => s.budgets[k] !== undefined) && (
            <button
              onClick={() => {
                if (window.confirm('Remove all budget limits? This cannot be undone.')) {
                  setS((x) => ({ ...x, budgets: {} }));
                }
              }}
              style={{ background: 'transparent', border: `1px solid ${C.red}44`, color: C.red, borderRadius: 0, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
            >
              Reset All
            </button>
          )}
        </div>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 14px' }}>
          Set a monthly spending limit per category. Overages are flagged on the dashboard.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {s.expenseCategories.map((c) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ color: C.text1, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {c}
              </span>
              <input
                type="number"
                placeholder="No limit"
                value={s.budgets[c] ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value;
                  setS((x) => ({ ...x, budgets: { ...x.budgets, [c]: v ? Number(v) : undefined } }));
                }}
                style={{ width: 88, flexShrink: 0, padding: '6px 8px', fontSize: 13,
                  background: C.bg, border: `1px solid ${C.border}`, color: C.textW,
                  borderRadius: 0, outline: 'none', WebkitAppearance: 'none' as any }}
              />
            </div>
          ))}
        </div>
        </div>
      </CollapsibleCard>

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
                    new Notification('ChillarFlow', { body: 'Notifications working! ✓' });
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
      <CollapsibleCard id="dataMgmt" title="Data Management">
        <div style={{ paddingTop: 14 }}>
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
              <div style={{ marginTop: 10, padding: '9px 14px', borderRadius: 0, fontSize: 13,
                background: importMsg.type === 'success' ? C.green + '22' : C.red + '22',
                border: `1px solid ${importMsg.type === 'success' ? C.green : C.red}44`,
                color: importMsg.type === 'success' ? C.green : C.red }}>
                {importMsg.text}
              </div>
            )}
            <div style={{ marginTop: 10, padding: '10px 14px', background: C.bg, borderRadius: 0, fontSize: 12, color: C.muted }}>
              <strong style={{ color: C.text1 }}>Expected Expenses sheet columns:</strong><br />
              ID, Date (YYYY-MM-DD), Type (expense/income), Category, Amount, Account, Added By, Note, To Settle (Yes/No), Settled (Yes/No), Settled For
            </div>
          </div>
        </div>
        </div>
      </CollapsibleCard>

      {/* ── App Theme ───────────────────────────────────────────── */}
      {onThemeChange && (
        <CollapsibleCard id="theme" title="App Theme" badge={theme === 'light' ? 'Light' : theme === 'dark-green' ? 'Emerald' : theme === 'dark-slate' ? 'Slate' : 'Navy'}>
          <div style={{ paddingTop: 14 }}>
            <ThemePicker current={theme} onChange={onThemeChange} />
          </div>
        </CollapsibleCard>
      )}

      {/* ── Invite Partner via link ─────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Invite Partner</SectionTitle>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
          Generate a one-click invite link your partner can use to join without copy-pasting your household ID.
        </p>
        <InviteLinkButton householdId={householdId} />
      </Card>

      {/* ── Referral program ─────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Refer a Friend</SectionTitle>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
          Share ChillarFlow and you both get 30 extra AI parses when they sign up.
        </p>
        <ReferralCard householdId={householdId} />
      </Card>

      {/* ── Join Partner's Household ────────────────────────────────── */}
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

      {/* ── Invite link ───────────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Share Invite Link</SectionTitle>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 14px' }}>
          Share this link with your partner — they click it, sign up, and join your household automatically. No code copy-pasting needed.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <code style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.teal, borderRadius: 0, padding: '10px 14px', flex: 1, fontSize: 11, wordBreak: 'break-all' as const, lineHeight: 1.6 }}>
            {'chillarflow.com/join?code=' + householdId}
          </code>
          <Btn variant="ghost" onClick={() => navigator.clipboard.writeText('https://chillarflow.com/join?code=' + householdId)}>
            Copy
          </Btn>
        </div>
        <Btn variant="primary" style={{ width: '100%' }} onClick={() => {
          const link = 'https://chillarflow.com/join?code=' + householdId;
          if (typeof navigator !== 'undefined' && navigator.share) {
            navigator.share({ title: 'Join my ChillarFlow household', text: 'Track finances together on ChillarFlow', url: link });
          } else {
            navigator.clipboard.writeText(link);
          }
        }}>
          🔗 Share invite link via WhatsApp / SMS
        </Btn>
      </Card>

      {/* ── Save ──────────────────────────────────────────────────────────── */}
      <Btn variant={flash ? 'success' : 'primary'} onClick={save}
        style={{ alignSelf: 'flex-start', padding: '12px 28px', fontSize: 15 }}>
        {flash ? '✓ Settings Saved!' : 'Save All Settings'}
      </Btn>
    </div>
  );
}
