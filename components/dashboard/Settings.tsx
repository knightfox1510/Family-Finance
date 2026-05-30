'use client';
// ─── components/Settings.tsx ──────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import type { AppData, Settings as SettingsType, HouseholdMode } from '@/types';
import { ThemePicker } from '@/components/ui/ui';
import { Icon } from '@/components/ui/Icon';
import { C, HOUSEHOLD_MODE_META } from '@/constants';
import { hasPartnerB } from '@/lib/householdModes';
import { supabase } from '@/lib/supabaseClient';
import { parseImport } from '@/lib/parseImport';
import { AvatarUpload } from '@/components/ui/Avatar';
import { usePushNotifications } from '@/hooks/usePushNotifications';

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
  session?: any;
}

// ─── Downgrade config ─────────────────────────────────────────────────────────

interface SwitchInfo {
  type: 'upgrade' | 'downgrade';
  title: string;
  subtitle: string;
  changes: string[];
  note: string;
  offerNewHousehold: boolean;
}

const SWITCH_INFO: Record<string, Record<string, SwitchInfo>> = {
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

const MODE_ICONS: Record<string, string> = { joint: 'users', separate: 'user', solo: 'user' };

// ─── Inline Toggle ────────────────────────────────────────────────────────────

function InlineToggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      onClick={() => !disabled && onChange(!on)}
      style={{
        width: 44, height: 26, borderRadius: 99,
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
        background: on ? C.accent : C.surface2,
        position: 'relative', transition: 'background 0.2s',
        border: `1px solid ${on ? C.accent : C.border2}`,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: on ? 'calc(100% - 22px)' : 3,
        width: 18, height: 18, borderRadius: '50%', background: on ? '#0a0a0a' : C.text3,
        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </div>
  );
}

// ─── Push status badge ────────────────────────────────────────────────────────

function PushStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    subscribed:   { label: 'Active',       color: C.green,  bg: C.greenBg  },
    unsubscribed: { label: 'Off',          color: C.text3,  bg: C.surface2 },
    denied:       { label: 'Blocked',      color: C.red,    bg: C.redBg    },
    unsupported:  { label: 'Unsupported',  color: C.text3,  bg: C.surface2 },
    loading:      { label: 'Checking…',    color: C.text3,  bg: C.surface2 },
  };
  const s = map[status] ?? map.unsubscribed;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', padding: '3px 8px', borderRadius: 99,
      color: s.color, background: s.bg, border: `1px solid ${s.color}33`,
    }}>
      {s.label}
    </span>
  );
}

// ─── Inline sub-components ────────────────────────────────────────────────────

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
        <input readOnly value={link} style={{
          flex: 1, background: C.surface2, border: '1.5px solid transparent',
          borderRadius: 12, padding: '10px 13px', color: C.textW,
          fontFamily: 'inherit', fontSize: 14, outline: 'none', boxSizing: 'border-box',
        }} />
        <button onClick={copy} style={{
          background: copied ? C.green : C.accent, color: '#0a0a0a', border: 'none',
          borderRadius: 999, padding: '10px 18px', fontWeight: 800, fontSize: 14,
          cursor: 'pointer', flexShrink: 0,
        }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p style={{ color: C.text3, fontSize: 12, marginTop: 8 }}>Link expires in 7 days. Generate a new one anytime.</p>
    </div>
  );

  return (
    <button onClick={generate} disabled={loading} style={{
      background: C.accent, color: '#0a0a0a', border: 'none', borderRadius: 999,
      padding: '14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', width: '100%',
    }}>
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

  if (!data) return <div style={{ color: C.text3, fontSize: 13 }}>Loading...</div>;

  const copy = () => {
    navigator.clipboard.writeText(data.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input readOnly value={data.shareUrl} style={{
          flex: 1, background: C.surface2, border: '1.5px solid transparent',
          borderRadius: 12, padding: '10px 13px', color: C.textW,
          fontFamily: 'inherit', fontSize: 14, outline: 'none', boxSizing: 'border-box',
        }} />
        <button onClick={copy} style={{
          background: copied ? C.green : C.accent, color: '#0a0a0a', border: 'none',
          borderRadius: 999, padding: '10px 18px', fontWeight: 800, fontSize: 14,
          cursor: 'pointer', flexShrink: 0,
        }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
        <div style={{ background: C.surface2, borderRadius: 12, padding: '10px 16px', textAlign: 'center', flex: 1 }}>
          <div style={{ color: C.textW, fontWeight: 800, fontSize: 20 }}>{data.referredCount}</div>
          <div style={{ color: C.text3, fontSize: 11, marginTop: 2 }}>friends referred</div>
        </div>
        <div style={{ background: C.surface2, borderRadius: 12, padding: '10px 16px', textAlign: 'center', flex: 1 }}>
          <div style={{ color: C.amber, fontWeight: 800, fontSize: 20 }}>+{data.bonusParses}</div>
          <div style={{ color: C.text3, fontSize: 11, marginTop: 2 }}>bonus parses earned</div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared style constants ───────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: C.surface, borderRadius: 20, padding: '18px', boxShadow: C.shadowSm,
};

const inputStyle: React.CSSProperties = {
  background: C.surface2, border: '1.5px solid transparent', borderRadius: 12,
  padding: '10px 13px', color: C.textW, fontFamily: 'inherit', fontSize: 14,
  outline: 'none', boxSizing: 'border-box', width: '100%',
};

const primaryBtnStyle: React.CSSProperties = {
  background: C.accent, color: '#0a0a0a', border: 'none', borderRadius: 999,
  padding: '14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', width: '100%',
};

const ghostBtnStyle: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2,
  borderRadius: 999, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Settings({ data, householdId, onSave, onExport, onImport, onJoinHousehold, theme = 'obsidian', onThemeChange, planInfo, session }: Props) {

  const [s, setS]                 = useState<SettingsType>(() => JSON.parse(JSON.stringify(data.settings)));
  const [flash, setFlash]         = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newExpCat, setNewExpCat] = useState('');
  const [newIncCat, setNewIncCat] = useState('');
  const [joinId, setJoinId]       = useState('');
  const [expandedMode, setExpandedMode] = useState<string | null>(null);
  const [expandedTg, setExpandedTg]     = useState(false);
  const [avatarUrl, setAvatarUrl]       = useState<string>(
    (data as any)?.profile?.avatar_url ?? ''
  );
  const [pushActionMsg, setPushActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Collapsed section state
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggleSection = (id: string) => setOpenSection((prev) => prev === id ? null : id);

  const [downgradeModal, setDowngradeModal]   = useState<SwitchInfo | null>(null);
  const [pendingSettings, setPendingSettings] = useState<SettingsType | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Push notification hook ─────────────────────────────────────────────────
  // Pass householdId so the hook can persist the subscription to the right household
  const push = usePushNotifications(householdId);

  useEffect(() => {
    if (data?.settings) setS(JSON.parse(JSON.stringify(data.settings)));
  }, [data.settings]);

  const modes: HouseholdMode[] = ['joint', 'separate', 'solo'];
  const partnerB        = hasPartnerB(s.householdMode ?? 'solo');
  const currentCloudRole = data.currentUserRole ?? 'Partner A';
  const telegramHandle   = (s.telegramUsername ?? '').trim();
  const telegramLinked   = telegramHandle.length > 0;
  const waNumber = (s.whatsappNumber ?? '').replace(/\D/g, '');
  const waLinked = waNumber.length >= 12;

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
    const guarded = {
      ...settings,
      expenseCategories: settings.expenseCategories.includes('Miscellaneous')
        ? settings.expenseCategories
        : [...settings.expenseCategories, 'Miscellaneous'],
      whatsappNumber: settings.whatsappNumber ?? '',
    };
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

  const PROTECTED_CATS = ['Miscellaneous'];

  const removeExpCat = (c: string) => {
    if (PROTECTED_CATS.includes(c)) return;
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

  // ── Push notification handlers ─────────────────────────────────────────────

  const handlePushToggle = async (wantEnabled: boolean) => {
    setPushActionMsg(null);

    if (wantEnabled) {
      if (push.status === 'denied') {
        setPushActionMsg({
          type: 'error',
          text: 'Notifications are blocked by your browser. Open site settings and allow notifications, then try again.',
        });
        return;
      }
      if (push.status === 'unsupported') {
        setPushActionMsg({ type: 'error', text: 'Push notifications are not supported in this browser.' });
        return;
      }
      const ok = await push.subscribe();
      if (ok) {
        // Sync the settings toggle so it persists on Save
        setS((x) => ({ ...x, notifications: { ...x.notifications, enabled: true } }));
        setPushActionMsg({ type: 'success', text: 'Push notifications enabled! You will receive budget and settlement alerts.' });
      } else {
        // push.status hasn't re-rendered yet (it's async state), so read the
        // OS permission directly from the browser to pick the right message.
        const permissionNow = typeof Notification !== 'undefined' ? Notification.permission : 'default';
        setPushActionMsg({
          type: 'error',
          text: permissionNow === 'denied'
            ? 'Permission denied. Allow notifications in your browser settings and try again.'
            : 'Could not enable notifications. Please try again.',
        });
      }
    } else {
      await push.unsubscribe();
      setS((x) => ({ ...x, notifications: { ...x.notifications, enabled: false } }));
      setPushActionMsg({ type: 'success', text: 'Push notifications disabled.' });
    }

    // Auto-clear the message after 4 seconds
    setTimeout(() => setPushActionMsg(null), 4000);
  };

  // Whether the main push toggle should appear "on"
  // Combines the settings flag with the live subscription status
  const pushIsOn = push.status === 'subscribed';

  // ── Collapsible section header builder ────────────────────────────────────

  const SectionHeader = ({ id, title, badge }: { id: string; title: string; badge?: string }) => {
    const isOpen = openSection === id;
    return (
      <button
        onClick={() => toggleSection(id)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left' as const, borderRadius: isOpen ? '20px 20px 0 0' : 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: C.textW, fontWeight: 700, fontSize: 14 }}>{title}</span>
          {badge && !isOpen && (
            <span style={{ fontSize: 11, color: C.text3, fontWeight: 400 }}>{badge}</span>
          )}
        </div>
        <div style={{
          transition: 'transform 0.2s', display: 'inline-flex',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>
          <Icon name="chevronDown" size={16} color={C.text3} />
        </div>
      </button>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>

      {/* ── Mode switch confirmation modal ─────────────────────────────────── */}
      {downgradeModal && (() => {
        const isUpgrade   = downgradeModal.type === 'upgrade';
        const accentColor = isUpgrade ? C.green : C.amber;
        const icon        = isUpgrade ? '🚀' : '⚠️';
        const changesLabel = isUpgrade ? 'What gets unlocked:' : 'What becomes hidden in the UI (never deleted):';
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: C.surface, border: `1px solid ${accentColor}44`, borderRadius: 20, padding: 28, maxWidth: 480, width: '100%', boxShadow: C.shadowMd }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: accentColor, marginBottom: 4 }}>
                {icon} {downgradeModal.title}
              </div>
              <p style={{ color: C.text2, fontSize: 13, margin: '0 0 14px', lineHeight: 1.6 }}>
                {downgradeModal.subtitle}
              </p>
              <div style={{ fontSize: 12, color: C.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                {changesLabel}
              </div>
              <ul style={{ margin: '0 0 14px 18px', padding: 0, lineHeight: 2 }}>
                {downgradeModal.changes.map((item) => (
                  <li key={item} style={{ color: C.text1, fontSize: 13 }}>{item}</li>
                ))}
              </ul>
              <div style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}33`, borderRadius: 12, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: accentColor, lineHeight: 1.6 }}>
                💡 {downgradeModal.note}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!isUpgrade && downgradeModal.offerNewHousehold && (
                  <button onClick={handleModalNewHousehold} style={{ ...primaryBtnStyle, background: C.accent }}>
                    📦 Export my data &amp; start a fresh household
                  </button>
                )}
                <button
                  onClick={handleModalProceed}
                  style={{
                    ...primaryBtnStyle,
                    background: isUpgrade ? C.accent : 'transparent',
                    border: isUpgrade ? 'none' : `1px solid ${C.border2}`,
                    color: isUpgrade ? '#0a0a0a' : C.text2,
                  }}
                >
                  {isUpgrade
                    ? `✓ Yes, upgrade to ${downgradeModal.title.split('to ')[1]}`
                    : downgradeModal.offerNewHousehold
                      ? 'Switch anyway (keep this household)'
                      : 'Yes, switch mode'}
                </button>
                <button
                  onClick={handleModalCancel}
                  style={{ ...ghostBtnStyle, border: `1px solid ${C.red}44`, color: C.red, width: '100%' }}
                >
                  Cancel — stay on current mode
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 1. Profile hero card ─────────────────────────────────────────── */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 14 }}>
        <AvatarUpload
          profile={{
            id:           session?.user?.id ?? '',
            display_name: s.partnerAName,
            avatar_url:   avatarUrl || null,
          }}
          onUploaded={(url) => setAvatarUrl(url)}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.textW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.partnerAName || 'You'}{partnerB && s.partnerBName ? ` & ${s.partnerBName}` : ''}
          </div>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
            {HOUSEHOLD_MODE_META[s.householdMode ?? 'solo']?.label ?? 'Household'} · {householdId.slice(0, 8)}…
          </div>
          <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>Tap photo to change</div>
        </div>
        {planInfo?.plan === 'pro' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: C.accent, border: `1px solid ${C.accent}`, flexShrink: 0 }}>✦ PRO</span>
        )}
      </div>

      {/* ── 3. Plan & Usage ──────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, border: planInfo?.plan === 'pro' ? `1px solid ${C.amber}44` : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ color: C.textW, fontWeight: 700, fontSize: 14 }}>Your Plan</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '4px 12px',
            borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
            background: planInfo?.plan === 'pro' ? `${C.amber}22` : C.surface2,
            color: planInfo?.plan === 'pro' ? C.amber : C.text3,
            border: `1px solid ${planInfo?.plan === 'pro' ? C.amber + '66' : C.border}`,
          }}>
            {planInfo?.plan === 'pro' ? '✦ PRO' : 'FREE'}
          </span>
        </div>
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
          <div style={{ background: C.surface2, borderRadius: 99, height: 6, overflow: 'hidden' }}>
            <div style={{
              width: planInfo ? (planInfo.plan === 'pro' ? '100%' : `${planInfo.pct}%`) : '0%',
              height: '100%',
              background: planInfo?.plan === 'pro' ? C.teal : !planInfo || planInfo.pct < 70 ? C.green : planInfo.pct < 90 ? C.amber : C.red,
              borderRadius: 99, transition: 'width 0.4s',
            }} />
          </div>
          {planInfo?.plan === 'pro' && (
            <div style={{ fontSize: 11, color: C.teal, marginTop: 5 }}>∞ Unlimited — Pro plan active</div>
          )}
          {planInfo && planInfo.plan === 'free' && planInfo.pct >= 70 && (
            <div style={{ fontSize: 11, color: planInfo.pct >= 90 ? C.red : C.amber, marginTop: 5 }}>
              {planInfo.pct >= 100 ? '🚫 Limit reached' : `⚠️ ${30 - planInfo.count} parses remaining`}
            </div>
          )}
          {!planInfo && <div style={{ fontSize: 11, color: C.text3, marginTop: 5 }}>Loading usage data…</div>}
        </div>
        {(!planInfo || planInfo.plan === 'free') && (
          <div style={{ padding: '12px 14px', background: `${C.amber}10`, border: `1px solid ${C.amber}33`, borderRadius: 12 }}>
            <div style={{ color: C.textW, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>✦ Upgrade to Pro</div>
            <div style={{ color: C.text2, fontSize: 12, marginBottom: 10, lineHeight: 1.6 }}>
              Free plan: 30 AI parses/month · Pro plan: unlimited. The number wizard is always free.
            </div>
            <button style={{ ...primaryBtnStyle }} onClick={() => { window.open('mailto:team@chillarflow.com?subject=Pro%20Upgrade&body=Household%20ID:%20' + householdId, '_blank'); }}>
              ✦ Upgrade to Pro — Unlimited AI logging
            </button>
          </div>
        )}
        {planInfo?.plan === 'pro' && (
          <div style={{ padding: '10px 14px', background: `${C.teal}10`, border: `1px solid ${C.teal}33`, borderRadius: 12, textAlign: 'center' }}>
            <div className="pro-badge" style={{ fontSize: 15, marginBottom: 4 }}>✦ PRO PLAN ACTIVE</div>
            <div style={{ color: C.text2, fontSize: 12 }}>Thank you for supporting ChillarFlow!</div>
          </div>
        )}
      </div>

      {/* ── 4. Household Mode ────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <SectionHeader id="mode" title="Household Mode" badge={HOUSEHOLD_MODE_META[s.householdMode ?? 'solo']?.label ?? ''} />
        {openSection === 'mode' && (
          <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
            <p style={{ color: C.text3, fontSize: 13, margin: '14px 0', lineHeight: 1.5 }}>
              Adjusts which features are available. No data is ever deleted when switching modes.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {modes.map((m) => {
                const meta   = HOUSEHOLD_MODE_META[m];
                const active = s.householdMode === m;
                const isOpen = expandedMode === m;
                return (
                  <div key={m}>
                    <div
                      onClick={() => setS((x) => ({ ...x, householdMode: m }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                        background: active ? `${C.accent}18` : C.surface2,
                        border: `2px solid ${active ? C.accent : C.border}`,
                        borderRadius: isOpen ? '12px 12px 0 0' : 12,
                        padding: '12px 14px', transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? C.accent : C.border}`, background: active ? C.accent : 'transparent', transition: 'all 0.2s' }} />
                      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: active ? `${C.accent}22` : C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={MODE_ICONS[m] ?? 'user'} size={16} color={active ? C.accent : C.text3} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: C.textW, fontWeight: 700, fontSize: 14 }}>{meta.label}</div>
                        <div style={{ color: C.text2, fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>{meta.description}</div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedMode(isOpen ? null : m); }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, padding: '4px 6px', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                      >
                        <Icon name="chevronDown" size={16} color={isOpen ? C.accent : C.text3} />
                      </button>
                    </div>
                    {isOpen && (
                      <div style={{ background: `${C.accent}08`, border: `2px solid ${active ? C.accent : C.border}`, borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, color: C.text3, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 10 }}>
                          What you get with {meta.label}:
                        </div>
                        {((meta as any).detail as string[]).map((line: string, i: number) => (
                          <div key={i} style={{ fontSize: 13, color: C.text2, marginBottom: 8, lineHeight: 1.5, display: 'flex', gap: 8 }}>
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
          </div>
        )}
      </div>

      {/* ── 5. Partner Names ─────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <SectionHeader id="partnerNames" title="Partner Names" />
        {openSection === 'partnerNames' && (
          <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ paddingTop: 14, display: 'grid', gridTemplateColumns: partnerB ? '1fr 1fr' : '1fr', gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: C.text3, fontWeight: 600, marginBottom: 6 }}>{partnerB ? 'Partner A Name' : 'Your Name'}</div>
                <input value={s.partnerAName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setS((x) => ({ ...x, partnerAName: e.target.value }))} style={inputStyle} />
              </div>
              {partnerB && (
                <div>
                  <div style={{ fontSize: 12, color: C.text3, fontWeight: 600, marginBottom: 6 }}>Partner B Name</div>
                  <input value={s.partnerBName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setS((x) => ({ ...x, partnerBName: e.target.value }))} style={inputStyle} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 6. Active Device Profile ─────────────────────────────────────── */}
      {partnerB && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', border: `1px solid ${C.purple}44` }}>
          <SectionHeader id="deviceProfile" title="Active Device Profile" />
          {openSection === 'deviceProfile' && (
            <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
              <p style={{ color: C.text3, fontSize: 13, margin: '14px 0 6px' }}>
                Select which partner is using this device. This auto-tags new expenses.
              </p>
              <p style={{ color: C.text3, fontSize: 12, margin: '0 0 14px' }}>
                Currently registered as{' '}
                <strong style={{ color: C.textW }}>{currentCloudRole === 'Partner A' ? s.partnerAName : s.partnerBName}</strong>{' '}({currentCloudRole}).
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['Partner A', 'Partner B'] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => switchRole(role)}
                    style={{
                      flex: 1,
                      ...(currentCloudRole === role ? { ...primaryBtnStyle, width: 'auto' } : { ...ghostBtnStyle }),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Icon name="user" size={14} color={currentCloudRole === role ? '#0a0a0a' : C.text2} />
                    {role === 'Partner A' ? s.partnerAName : s.partnerBName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 7. Telegram Integration ──────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', border: `1px solid ${C.teal}44` }}>
        <SectionHeader id="telegram" title="Telegram Bot Integration" />
        {openSection === 'telegram' && (
          <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
            <p style={{ color: C.text1, fontSize: 13, margin: '14px 0', lineHeight: 1.5 }}>
              {telegramLinked ? 'Your Telegram account is connected. Send a message to log expenses instantly.' : 'Link your Telegram username to log expenses from your phone in seconds.'}
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                disabled={telegramLinked}
                placeholder={telegramLinked ? `@${telegramHandle}` : 'e.g. yourhandle (without @)'}
                value={telegramLinked ? `@${telegramHandle}` : (s.telegramUsername ?? '')}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setS((x) => ({ ...x, telegramUsername: e.target.value.replace(/@/g, '').trim() }))}
                style={{ ...inputStyle, opacity: telegramLinked ? 0.7 : 1, cursor: telegramLinked ? 'not-allowed' : 'text', flex: 1, width: 'auto' }}
              />
              {telegramLinked && (
                <button onClick={() => setS((x) => ({ ...x, telegramUsername: '' }))} style={{ background: 'transparent', border: `1px solid ${C.red}44`, color: C.red, borderRadius: 999, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>
                  Unlink
                </button>
              )}
            </div>
            <div style={{ background: C.surface2, borderRadius: 12, overflow: 'hidden' }}>
              <button onClick={() => setExpandedTg((v) => !v)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <span style={{ fontSize: 12, color: C.text3, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                  {expandedTg ? 'Hide setup guide' : 'How to set up & logging syntax'}
                </span>
                <div style={{ transform: expandedTg ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-flex' }}>
                  <Icon name="chevronDown" size={14} color={C.text3} />
                </div>
              </button>
              {expandedTg && (
                <div style={{ padding: '0 16px 14px' }}>
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
                    <div style={{ fontSize: 12, color: C.text3, fontWeight: 600, marginBottom: 8 }}>Logging syntax</div>
                    {[
                      { code: '450 Zomato',           desc: 'Personal expense' },
                      { code: '450 Zomato to settle', desc: 'Joint pool reimburses you' },
                      { code: '500',                  desc: 'Interactive wizard' },
                      { code: '/recent',              desc: 'View & edit last 3 transactions' },
                      { code: '/summary',             desc: "This month's snapshot" },
                      { code: '/usage',               desc: 'Check AI parse usage' },
                    ].map(({ code, desc }) => (
                      <div key={code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' as const, gap: 6 }}>
                        <code style={{ background: `${C.border}40`, padding: '2px 8px', borderRadius: 6, fontSize: 11, color: C.teal }}>{code}</code>
                        <span style={{ fontSize: 11, color: C.text3 }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 8. WhatsApp Integration ──────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', border: '1px solid #25D36644' }}>
        <SectionHeader id="whatsapp" title="WhatsApp Integration" />
        {openSection === 'whatsapp' && (
          <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
            <p style={{ color: C.text1, fontSize: 13, margin: '14px 0', lineHeight: 1.5 }}>
              {waLinked ? 'Your WhatsApp is connected. Send a message to log expenses instantly.' : 'Link your WhatsApp number to log expenses from WhatsApp.'}
            </p>

            {waLinked ? (
              // Linked State — Shows the full number with a plus sign
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  readOnly
                  value={`+${waNumber}`}
                  style={{ ...inputStyle, opacity: 0.7, cursor: 'not-allowed', flex: 1, width: 'auto' }}
                />
                <button 
                  onClick={() => setS((x) => ({ ...x, whatsappNumber: '' }))} 
                  style={{ background: 'transparent', border: `1px solid ${C.red}44`, color: C.red, borderRadius: 999, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}
                >
                  Unlink
                </button>
              </div>
            ) : (
              // Unlinked State — Split inputs (Country Code + Local)
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  
                  {/* Country Code Pill */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(0,0,0,0.03)', border: `1px solid ${C.border}`, borderRadius: 12,
                    padding: '0 12px', fontSize: 14, flexShrink: 0, whiteSpace: 'nowrap',
                  }}>
                    <span style={{ color: C.text3 }}>+</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="91"
                      maxLength={4}
                      id="wa-cc"
                      // Intelligently load existing CC if available, otherwise default to 91
                      defaultValue={
                        (s.whatsappNumber ?? '').replace(/\D/g, '').length >= 11
                          ? (s.whatsappNumber ?? '').replace(/\D/g, '').slice(0, -10)
                          : '91'
                      }
                      style={{
                        background: 'transparent', border: 'none', outline: 'none',
                        width: 36, color: C.text1, fontFamily: 'inherit', fontSize: 14,
                      }}
                      onChange={(e) => {
                         // Update global state immediately if they edit the country code
                         const newCc = e.target.value.replace(/\D/g, '');
                         const full = (s.whatsappNumber ?? '').replace(/\D/g, '');
                         const currentLocal = full.length >= 11 ? full.slice(-10) : full;
                         setS((x) => ({ ...x, whatsappNumber: newCc + currentLocal }));
                      }}
                    />
                  </div>

                  {/* Local Number Input */}
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="9876543****"
                    maxLength={15} // Allows room for scaling
                    style={{ ...inputStyle, flex: 1, width: 'auto' }}
                    value={
                      (() => {
                        const full = (s.whatsappNumber ?? '').replace(/\D/g, '');
                        const ccEl = typeof document !== 'undefined'
                          ? (document.getElementById('wa-cc') as HTMLInputElement)
                          : null;
                        const cc = ccEl ? ccEl.value.replace(/\D/g, '') : '91';
                        return full.startsWith(cc) ? full.slice(cc.length) : full;
                      })()
                    }
                    onChange={(e) => {
                      const local = e.target.value.replace(/\D/g, '');
                      const ccEl = document.getElementById('wa-cc') as HTMLInputElement;
                      const cc = ccEl ? ccEl.value.replace(/\D/g, '') : '91';
                      setS((x) => ({ ...x, whatsappNumber: cc + local }));
                    }}
                  />
                </div>
                
                <div style={{ fontSize: 11, color: C.text3, marginTop: 8, lineHeight: 1.6 }}>
                  Country code + number without spaces. <br/>
                  India example: <code style={{ background: `${C.border}40`, padding: '1px 5px', borderRadius: 6, fontSize: 11 }}>91</code>{' '}
                  <code style={{ background: `${C.border}40`, padding: '1px 5px', borderRadius: 6, fontSize: 11 }}>9876543210</code>
                </div>
              </div>
            )}

            {!waLinked && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#25D36610', border: '1px solid #25D36633', borderRadius: 12, fontSize: 12, color: '#25D366', lineHeight: 1.6 }}>
                After linking, open WhatsApp and send <strong>hi</strong> to the ChillarFlow number to activate your account.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 9. Expense Categories ────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <SectionHeader id="expCats" title="Expense Categories" badge={`${s.expenseCategories.length} categories`} />
        {openSection === 'expCats' && (
          <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ paddingTop: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                {s.expenseCategories.map((c) => (
                  <span key={c} style={{ background: c === 'Miscellaneous' ? `${C.teal}0a` : C.surface2, border: `1px solid ${c === 'Miscellaneous' ? C.teal + '44' : C.border}`, borderRadius: 99, padding: '4px 10px', fontSize: 13, color: C.text1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c}
                    {c === 'Miscellaneous'
                      ? <span title="Required — cannot be removed" style={{ color: C.teal, fontSize: 11, cursor: 'default', lineHeight: 1 }}>🔒</span>
                      : <span onClick={() => removeExpCat(c)} style={{ color: C.red, cursor: 'pointer', fontWeight: 700, fontSize: 15, lineHeight: 1 }}>×</span>
                    }
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newExpCat} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewExpCat(e.target.value)} placeholder="Add category…" onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && addExpCat()} style={{ ...inputStyle, flex: 1, width: 'auto' }} />
                <button onClick={addExpCat} style={ghostBtnStyle}>Add</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 10. Income Categories ────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <SectionHeader id="incCats" title="Income Categories" badge={`${s.incomeCategories.length} categories`} />
        {openSection === 'incCats' && (
          <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ paddingTop: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                {s.incomeCategories.map((c) => (
                  <span key={c} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 99, padding: '4px 10px', fontSize: 13, color: C.text1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c}
                    <span onClick={() => removeIncCat(c)} style={{ color: C.red, cursor: 'pointer', fontWeight: 700, fontSize: 15, lineHeight: 1 }}>×</span>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newIncCat} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewIncCat(e.target.value)} placeholder="Add income category…" onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && addIncCat()} style={{ ...inputStyle, flex: 1, width: 'auto' }} />
                <button onClick={addIncCat} style={ghostBtnStyle}>Add</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 11. Category Budgets ─────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <SectionHeader id="budgets" title="Category Budgets" badge={`${Object.values(s.budgets).filter(Boolean).length} limits set`} />
        {openSection === 'budgets' && (
          <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: C.text3 }}>Monthly limit per category. Overages flagged on dashboard.</span>
                {Object.keys(s.budgets).some((k) => s.budgets[k] !== undefined) && (
                  <button onClick={() => { if (window.confirm('Remove all budget limits? This cannot be undone.')) { setS((x) => ({ ...x, budgets: {} })); } }} style={{ background: 'transparent', border: `1px solid ${C.red}44`, color: C.red, borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                    Reset All
                  </button>
                )}
              </div>
              <p style={{ color: C.text3, fontSize: 13, margin: '0 0 14px' }}>
                Set a monthly spending limit per category. Overages are flagged on the dashboard.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {s.expenseCategories.map((c) => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ color: C.text1, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c}</span>
                    <input
                      type="number"
                      placeholder="No limit"
                      value={s.budgets[c] ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const v = e.target.value;
                        setS((x) => ({ ...x, budgets: { ...x.budgets, [c]: v ? Number(v) : undefined } }));
                      }}
                      style={{ width: 88, flexShrink: 0, padding: '6px 8px', fontSize: 13, background: C.surface2, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 12, outline: 'none', WebkitAppearance: 'none' as any, fontFamily: 'inherit' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 12. Notifications ────────────────────────────────────────────── */}
      {/* This section is now wired to the real Web Push API via usePushNotifications. */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.text3 }}>Notifications</div>
          <PushStatusBadge status={push.status} />
        </div>

        {/* ── Row 1: Push notifications master toggle ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="bell" size={18} color={pushIsOn ? C.accent : C.text2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textW }}>Push notifications</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>
              {push.status === 'unsupported' && 'Not supported in this browser'}
              {push.status === 'denied'      && 'Blocked — allow in browser site settings'}
              {push.status === 'loading'     && 'Checking permission…'}
              {push.status === 'subscribed'  && 'Active — receiving budget & settlement alerts'}
              {push.status === 'unsubscribed' && 'Enable to receive budget & settlement alerts'}
            </div>
          </div>
          <InlineToggle
            on={pushIsOn}
            onChange={handlePushToggle}
            disabled={push.isLoading || push.status === 'loading' || push.status === 'unsupported'}
          />
        </div>

        {/* Push action feedback message */}
        {pushActionMsg && (
          <div style={{ margin: '0 18px 14px', padding: '10px 14px', borderRadius: 12, fontSize: 13, background: pushActionMsg.type === 'success' ? `${C.green}18` : `${C.red}18`, border: `1px solid ${pushActionMsg.type === 'success' ? C.green : C.red}44`, color: pushActionMsg.type === 'success' ? C.green : C.red, lineHeight: 1.5 }}>
            {pushActionMsg.text}
          </div>
        )}

        {/* "Blocked" helper — shown when permission is denied */}
        {push.status === 'denied' && (
          <div style={{ margin: '0 18px 14px', padding: '12px 14px', background: `${C.amber}10`, border: `1px solid ${C.amber}33`, borderRadius: 12, fontSize: 12, color: C.amber, lineHeight: 1.6 }}>
            <strong>Blocked by browser.</strong> To re-enable: tap the lock icon in your address bar → Site settings → Notifications → Allow. Then toggle on above.
          </div>
        )}

        <div style={{ height: 1, background: C.border, margin: '0 18px' }} />

        {/* ── Row 2: Budget alerts sub-toggle ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="alert" size={18} color={C.text2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: pushIsOn ? C.textW : C.text3 }}>Budget alerts</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>
              When a category hits your spending threshold
            </div>
          </div>
          <InlineToggle
            on={s.notifications.budgetAlert && pushIsOn}
            onChange={(v) => setS((x) => ({ ...x, notifications: { ...x.notifications, budgetAlert: v } }))}
            disabled={!pushIsOn}
          />
        </div>

        {/* Budget threshold input — shown only when both push and budgetAlert are on */}
        {pushIsOn && s.notifications.budgetAlert && (
          <div style={{ padding: '0 18px 14px 68px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: C.text2 }}>Alert at</span>
            <input
              type="number"
              min={50} max={100}
              value={s.notifications.budgetThreshold}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setS((x) => ({ ...x, notifications: { ...x.notifications, budgetThreshold: Number(e.target.value) } }))}
              style={{ width: 70, background: C.surface2, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
            />
            <span style={{ fontSize: 13, color: C.text2 }}>% of budget used</span>
          </div>
        )}

        <div style={{ height: 1, background: C.border, margin: '0 18px' }} />

        {/* ── Row 3: Settlement reminders sub-toggle ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="refresh" size={18} color={C.text2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: pushIsOn ? C.textW : C.text3 }}>Settlement reminders</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>
              Partner splits unsettled for 3+ days
            </div>
          </div>
          <InlineToggle
            on={s.notifications.settlement && pushIsOn}
            onChange={(v) => setS((x) => ({ ...x, notifications: { ...x.notifications, settlement: v } }))}
            disabled={!pushIsOn}
          />
        </div>

        <div style={{ height: 1, background: C.border, margin: '0 18px' }} />

        {/* ── Row 4: Partner expense alerts sub-toggle ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="wallet" size={18} color={C.text2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: pushIsOn ? C.textW : C.text3 }}>Partner expense alerts</div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>
              Notify when partner logs an expense
            </div>
          </div>
          <InlineToggle
            on={s.notifications.newExpense && pushIsOn}
            onChange={(v) => setS((x) => ({ ...x, notifications: { ...x.notifications, newExpense: v } }))}
            disabled={!pushIsOn}
          />
        </div>

        {/* Test notification button — only shown when push is active */}
        {pushIsOn && (
          <div style={{ padding: '0 18px 14px', borderTop: `1px solid ${C.border}` }}>
            <button
              style={{ marginTop: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.text2, borderRadius: 99, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              onClick={() => {
                if (!('Notification' in window) || Notification.permission !== 'granted') return;
                new Notification('ChillarFlow ✓', { body: 'Push notifications are working!', icon: '/icons/icon-192.png' });
              }}
            >
              Send test notification
            </button>
          </div>
        )}
      </div>

      {/* ── 13. Data Management ──────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <SectionHeader id="dataMgmt" title="Data Management" />
        {openSection === 'dataMgmt' && (
          <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ color: C.text1, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Export to Excel</div>
                <div style={{ color: C.text3, fontSize: 13, marginBottom: 10 }}>Download all data as an .xlsx file with sheets for expenses, contributions, goals, and loans.</div>
                <button onClick={onExport} style={{ ...ghostBtnStyle, display: 'flex', alignItems: 'center', gap: 6 }}>⬇ Export to Excel</button>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                <div style={{ color: C.text1, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Import from Excel</div>
                <div style={{ color: C.text3, fontSize: 13, marginBottom: 10 }}>Import from a matching .xlsx or .csv file. Existing data is merged, not replaced.</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} style={{ display: 'none' }} />
                <button onClick={() => fileRef.current?.click()} style={{ ...ghostBtnStyle, display: 'flex', alignItems: 'center', gap: 6 }}>⬆ Import File</button>
                {importMsg && (
                  <div style={{ marginTop: 10, padding: '9px 14px', borderRadius: 12, fontSize: 13, background: importMsg.type === 'success' ? `${C.green}22` : `${C.red}22`, border: `1px solid ${importMsg.type === 'success' ? C.green : C.red}44`, color: importMsg.type === 'success' ? C.green : C.red }}>
                    {importMsg.text}
                  </div>
                )}
                <div style={{ marginTop: 10, padding: '10px 14px', background: C.surface2, borderRadius: 12, fontSize: 12, color: C.text3 }}>
                  <strong style={{ color: C.text1 }}>Expected Expenses sheet columns:</strong><br />
                  ID, Date (YYYY-MM-DD), Type (expense/income), Category, Amount, Account, Added By, Note, To Settle (Yes/No), Settled (Yes/No), Settled For
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 14. App Theme ────────────────────────────────────────────────── */}
      {onThemeChange && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <SectionHeader id="theme" title="App Theme" badge={theme === 'pearl' ? 'Pearl' : theme === 'slate' ? 'Slate' : theme === 'indigo' ? 'Indigo' : theme === 'mono' ? 'Mono' : 'Obsidian'} />
          {openSection === 'theme' && (
            <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
              <div style={{ paddingTop: 14 }}>
                <ThemePicker current={theme} onChange={onThemeChange} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 15. Invite & Join Partner ────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <SectionHeader id="invite" title="Invite & Join Partner" />
        {openSection === 'invite' && (
          <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ paddingTop: 14 }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: C.text1, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Invite Partner</div>
                <p style={{ color: C.text3, fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>Generate a one-click invite link your partner can use to join without copy-pasting your household ID.</p>
                <InviteLinkButton householdId={householdId} />
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginBottom: 20 }}>
                <div style={{ color: C.text1, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Share Invite Link</div>
                <p style={{ color: C.text3, fontSize: 13, margin: '0 0 12px' }}>Share this link with your partner — they click it, sign up, and join your household automatically.</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <code style={{ background: C.surface2, borderRadius: 12, padding: '10px 13px', flex: 1, fontSize: 11, color: C.teal, wordBreak: 'break-all' as const, lineHeight: 1.6 }}>
                    {'chillarflow.com/join?code=' + householdId}
                  </code>
                  <button onClick={() => navigator.clipboard.writeText('https://chillarflow.com/join?code=' + householdId)} style={ghostBtnStyle}>Copy</button>
                </div>
                <button style={primaryBtnStyle} onClick={() => { const link = 'https://chillarflow.com/join?code=' + householdId; if (typeof navigator !== 'undefined' && navigator.share) { navigator.share({ title: 'Join my ChillarFlow household', text: 'Track finances together on ChillarFlow', url: link }); } else { navigator.clipboard.writeText(link); } }}>
                  🔗 Share invite link via WhatsApp / SMS
                </button>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                <div style={{ color: C.text1, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Join Partner's Household</div>
                <p style={{ color: C.text3, fontSize: 13, margin: '0 0 12px' }}>Enter your partner's Household ID to share the same data pool.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={joinId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJoinId(e.target.value)} placeholder="Household UUID…" onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleJoinHousehold()} style={{ ...inputStyle, flex: 1, width: 'auto' }} />
                  <button onClick={handleJoinHousehold} style={ghostBtnStyle}>Join</button>
                </div>
                <p style={{ color: C.text3, fontSize: 12, marginTop: 10 }}>
                  Your household ID: <code style={{ color: C.teal, fontSize: 11, userSelect: 'all' as const }}>{householdId}</code>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 16. Referral Program ─────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <SectionHeader id="referral" title="Referral Program" />
        {openSection === 'referral' && (
          <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
            <p style={{ color: C.text3, fontSize: 13, margin: '14px 0', lineHeight: 1.5 }}>
              Share ChillarFlow and you both get 30 extra AI parses when they sign up.
            </p>
            <ReferralCard householdId={householdId} />
          </div>
        )}
      </div>

      {/* ── 17. Save Settings button ─────────────────────────────────────── */}
      <button
        onClick={save}
        style={{
          ...primaryBtnStyle,
          background: flash ? C.green : C.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'background 0.3s',
        }}
      >
        <Icon name="check" size={16} color="#0a0a0a" />
        {flash ? 'Settings Saved!' : 'Save All Settings'}
      </button>

      {/* ── 18. Logout button ─────────────────────────────────────────────── */}
      <button
        onClick={async () => {
          const confirmed = window.confirm('Log out of ChillarFlow?');
          if (!confirmed) return;
          await supabase.auth.signOut();
          window.location.href = '/';
        }}
        style={{
          background: 'transparent',
          border: `1px solid ${C.border2}`,
          color: C.text3,
          borderRadius: 999,
          padding: '12px 18px',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontFamily: 'inherit',
          width: '100%',
        }}
      >
        <Icon name="arrowRight" size={16} color={C.text3} />
        Log Out
      </button>

    </div>
  );
}
