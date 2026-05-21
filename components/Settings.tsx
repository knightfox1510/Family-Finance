'use client';
// ─── components/Settings.tsx ──────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import type { AppData, Settings as SettingsType, HouseholdMode } from '@/types';
import { Card, Btn, Inp, Label, SectionTitle, Toggle } from '@/components/ui';
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
}

// ─── Downgrade config ─────────────────────────────────────────────────────────

interface DowngradeInfo {
  title: string;
  hidden: string[];
  suggestion: string;
  offerNewHousehold: boolean;
}

const DOWNGRADE_INFO: Record<string, Record<string, DowngradeInfo>> = {
  joint: {
    separate: {
      title: 'Switching Joint → Separate',
      hidden: [
        'Joint account transactions (stored safely, just hidden)',
        'Contributions / joint pool history',
        'Joint reimbursement settlements',
      ],
      suggestion: 'Your data is safe — switch back to Joint any time and everything reappears instantly.',
      offerNewHousehold: false,
    },
    solo: {
      title: 'Switching Joint → Solo',
      hidden: [
        'All joint account transactions',
        'Partner B transactions and activity',
        'Contributions / joint pool history',
        'All settlement data (joint and partner)',
      ],
      suggestion: 'If you genuinely want a fresh solo experience, we recommend creating a new household so your existing data stays clean and accessible in its original form.',
      offerNewHousehold: true,
    },
  },
  separate: {
    solo: {
      title: 'Switching Separate → Solo',
      hidden: [
        'Partner B transactions',
        'Partner split settlements',
      ],
      suggestion: 'If you want a clean solo start, consider creating a new household. Your current data stays safe and you can export it first.',
      offerNewHousehold: true,
    },
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Settings({ data, householdId, onSave, onExport, onImport, onJoinHousehold }: Props) {

  const [s, setS]                 = useState<SettingsType>(() => JSON.parse(JSON.stringify(data.settings)));
  const [flash, setFlash]         = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newExpCat, setNewExpCat] = useState('');
  const [newIncCat, setNewIncCat] = useState('');
  const [joinId, setJoinId]       = useState('');
  const [downgradeModal, setDowngradeModal]   = useState<DowngradeInfo | null>(null);
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
      const info = DOWNGRADE_INFO[currentMode]?.[newMode];
      if (info) {
        setPendingSettings(s);
        setDowngradeModal(info);
        return;
      }
    }
    commitSave(s);
  };

  const commitSave = (settings: SettingsType) => {
    onSave(settings);
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

  const removeExpCat = (c: string) =>
    setS((x) => ({ ...x, expenseCategories: x.expenseCategories.filter((e) => e !== c) }));

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

      {/* ── Downgrade modal ────────────────────────────────────────────────── */}
      {downgradeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, maxWidth: 460, width: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.amber, marginBottom: 10 }}>
              ⚠️ {downgradeModal.title}
            </div>
            <p style={{ color: C.text2, fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}>
              The following will be <strong style={{ color: C.textW }}>hidden in the UI</strong> but never deleted from the database:
            </p>
            <ul style={{ margin: '0 0 14px 16px', padding: 0, color: C.text1, fontSize: 13, lineHeight: 2 }}>
              {downgradeModal.hidden.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <div style={{ background: `${C.teal}15`, border: `1px solid ${C.teal}33`, borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: C.teal, lineHeight: 1.6 }}>
              💡 {downgradeModal.suggestion}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {downgradeModal.offerNewHousehold && (
                <Btn variant="primary" onClick={handleModalNewHousehold} style={{ width: '100%' }}>
                  📦 Export my data &amp; learn how to start fresh
                </Btn>
              )}
              <Btn variant="ghost" onClick={handleModalProceed} style={{ width: '100%' }}>
                {downgradeModal.offerNewHousehold ? 'Switch anyway (keep current household)' : 'Yes, switch mode'}
              </Btn>
              <Btn variant="danger" onClick={handleModalCancel} style={{ width: '100%' }}>
                Cancel — keep current mode
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Household Mode ────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Household Mode</SectionTitle>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 14px' }}>
          Adjusts which features are available. No data is ever deleted when switching modes.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {modes.map((m) => {
            const meta   = HOUSEHOLD_MODE_META[m];
            const active = s.householdMode === m;
            return (
              <button key={m} onClick={() => setS((x) => ({ ...x, householdMode: m }))}
                style={{ flex: '1 1 180px', textAlign: 'left', cursor: 'pointer',
                  background: active ? C.amber + '22' : C.bg,
                  border: `2px solid ${active ? C.amber : C.border}`,
                  borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{meta.icon}</div>
                <div style={{ color: C.textW, fontWeight: 700, fontSize: 13 }}>{meta.label}</div>
                <div style={{ color: C.text2, fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>{meta.description}</div>
              </button>
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
            ? 'Your account is connected. Send a message to the bot to log expenses on the go.'
            : 'Link your Telegram username (without @) to enable conversational expense logging.'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" disabled={telegramLinked}
            placeholder={telegramLinked ? `@${telegramHandle}` : 'e.g. yourhandle'}
            value={telegramLinked ? `@${telegramHandle}` : (s.telegramUsername ?? '')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setS((x) => ({ ...x, telegramUsername: e.target.value.replace(/@/g, '').trim() }))}
            style={{ background: telegramLinked ? `${C.bg}80` : C.bg,
              border: `1px solid ${telegramLinked ? C.border : C.teal}`,
              color: telegramLinked ? C.text2 : C.textW,
              borderRadius: 8, padding: '10px 14px', flex: 1,
              boxSizing: 'border-box' as const, outline: 'none',
              opacity: telegramLinked ? 0.7 : 1,
              cursor: telegramLinked ? 'not-allowed' : 'text' }} />
          {telegramLinked && (
            <Btn variant="danger" onClick={() => setS((x) => ({ ...x, telegramUsername: '' }))}>Unlink</Btn>
          )}
        </div>
      </Card>

      {/* ── Expense Categories ────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Expense Categories</SectionTitle>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
          {s.expenseCategories.map((c) => (
            <span key={c} style={catPillStyle}>
              {c}
              <span onClick={() => removeExpCat(c)} style={{ color: C.red, cursor: 'pointer', fontWeight: 700, fontSize: 15, lineHeight: 1 }}>×</span>
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
        <SectionTitle>Category Budgets (Monthly)</SectionTitle>
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