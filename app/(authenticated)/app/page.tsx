// ─── app/app/page.tsx ─────────────────────────────────────────────────────────────
// Root shell. Handles:
//    • Auth gate (Cleanly decoupled native redirect)
//    • Loading state
//    • First-time setup wizard
//    • Layout (sidebar / mobile bottom nav)
//    • View routing
//
// All data logic is in useActions.ts, all DB calls in supabaseHelpers.ts.
// All types are in types/index.ts. Design tokens are in constants/index.ts.

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';

import { supabase } from '@/lib/supabaseClient';
import { redirect } from 'next/navigation'; // ⚡ Next.js native navigation redirect routing hook

import { loadData } from '@/lib/supabaseHelpers';
import { SetupWizard } from '@/components/dashboard/SetupWizard';
import { useActions } from '@/hooks/useActions';
import { ToastContainer, BottomNav, QuickTray, addToast } from '@/components/ui/ui';

import { C, navForMode } from '@/constants';
import { Icon } from '@/components/ui/Icon';
import type { AppData, ViewId, HouseholdMode } from '@/types';

// ─── View imports ─────────────────────────────────────────────────────────────
// Each of these was previously inlined in the 5900-line file.
// Move them to their own files, e.g. components/Dashboard.tsx, etc.
// The import paths below are the target structure.
import { Dashboard }        from '@/components/dashboard/Dashboard';
import { AddExpense }       from '@/components/dashboard/AddExpense';
import { IncomeTracker }    from '@/components/dashboard/IncomeTracker';
import { ExpenseList }      from '@/components/dashboard/ExpenseList';
import { SettleDashboard }  from '@/components/dashboard/SettleDashboard';
import { Contributions }    from '@/components/dashboard/Contributions';
import { Goals }            from '@/components/dashboard/Goals';
import { LoanTracker }      from '@/components/dashboard/LoanTracker';
import { AIInsights }       from '@/components/dashboard/AIInsights';
import { Settings }         from '@/components/dashboard/Settings';

// ─── Utility ─────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n: number, currency = 'INR', privacy = false) {
  if (privacy) return currency === 'INR' ? '₹ ••••' : '••••';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n ?? 0);
}

function exportToExcel(data: AppData) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.expenses.map((e) => ({
      ID: e.id, Date: e.date, Type: e.type, Category: e.category,
      Amount: e.amount, Account: e.account, 'Added By': e.addedBy,
      Note: e.note, 'To Settle': e.toSettle ? 'Yes' : 'No',
      Settled: e.settled ? 'Yes' : 'No', 'Settled For': e.settledFor ?? '',
    }))
  ), 'Expenses');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.contributions.map((c) => ({
      Month: c.month, 'Partner A': c.partnerA, 'Partner B': c.partnerB,
      Total: c.partnerA + c.partnerB,
    }))
  ), 'Contributions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.goals.map((g) => ({
      Name: g.name, Target: g.target, Current: g.current,
      'Progress %': g.target > 0 ? ((g.current / g.target) * 100).toFixed(1) : 0,
    }))
  ), 'Goals');
  XLSX.writeFile(wb, `ChillarFlow_${today()}.xlsx`);
}

// ─── App root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession]         = useState<any>(null);
  const [data, setData]               = useState<AppData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [view, setView]               = useState<ViewId>('dashboard');
  const [prevView, setPrevView]       = useState<ViewId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile]       = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [showMore, setShowMore]       = useState(false);
  const [planInfo, setPlanInfo] = useState<{ plan: 'free' | 'pro'; count: number; limit: number; pct: number; month: string } | undefined>(undefined);
  // Theme — start with server-safe default, then read localStorage client-side
  const [theme, setTheme] = useState('obsidian');

  React.useEffect(() => {
    // Read persisted theme on mount and apply
    const saved = localStorage.getItem('cf_theme') || 'obsidian';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  const handleThemeChange = (t: string) => {
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('cf_theme', t);
  };
  const [duplicateData, setDuplicateData] = useState<any>(null);

  // addToast is imported as a standalone function from ui.tsx (ToastContainer handles display)

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      loadData(session.user.id).then((d) => { setData(d); setLoading(false); });
    }
  }, [session]);

  // ── Mobile detection ──────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const actions = useActions({ data: data!, setData: setData as any, session, addToast });

  // ── Offline queue + online/offline detection ──────────────────────────────
  const [offlineQueue, setOfflineQueue] = React.useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('cf_offline_queue') || '[]'); } catch { return []; }
  });
  const [isOnline, setIsOnline] = React.useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  React.useEffect(() => {
    const goOnline = async () => {
      setIsOnline(true);
      const q: any[] = (() => { try { return JSON.parse(localStorage.getItem('cf_offline_queue') || '[]'); } catch { return []; } })();
      if (q.length > 0) {
        for (const item of q) { try { await actions.addExpense(item); } catch {} }
        localStorage.setItem('cf_offline_queue', '[]');
        setOfflineQueue([]);
        addToast(`✅ ${q.length} offline expense${q.length > 1 ? 's' : ''} synced`, 'success');
      }
    };
    const goOffline = () => { setIsOnline(false); addToast('⚠️ You are offline. Expenses will sync when reconnected.', 'info'); };
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, [actions, addToast]);

  // ── Manual refresh (escape hatch for edge cases) ──────────────────────────
  const handleManualRefresh = async () => {
    if (!session || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const fresh = await loadData(session.user.id);
      setData(fresh);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // ── Partner calculations ───────────────────────────────────────────────────
  const partnerCalculations = useMemo(() => {
    if (!data) return { p2pNetBalance: 0, pendingPartnerItems: [] };
    const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
    let p2pNetBalance = 0;
    const pendingPartnerItems: any[] = [];

    data.expenses.forEach((t) => {
      if (t.settleTrack !== 'partner') return;
      if (t.settled) return;
      if (t.account === 'Joint') return;
      const amount = Number(t.amount);
      const aShare = Number(t.partnerAShare);
      const bShare = Number(t.partnerBShare);

      let shareA: number;
      let shareB: number;
      if (t.splitMode === 'equal') {
        shareA = amount * 0.5;
        shareB = amount * 0.5;
      } else if (t.splitMode === 'fixed') {
        shareA = aShare;
        shareB = bShare;
      } else if (t.splitMode === 'percentage') {
        shareA = amount * (aShare / 100);
        shareB = amount * (bShare / 100);
      } else {
        shareA = amount * aShare;
        shareB = amount * bShare;
      }

      const paidByA = t.account === names.a || t.account === 'Partner A';
      const paidByB = t.account === names.b || t.account === 'Partner B';

      if (paidByA) {
        p2pNetBalance += shareB;
        pendingPartnerItems.push({ ...t, debtorName: names.b, amountOwed: shareB,
          breakdownText: t.splitMode === 'equal' ? '50% Split' : `₹${Math.round(shareB)} share`,
        });
      } else if (paidByB) {
        p2pNetBalance -= shareA;
        pendingPartnerItems.push({ ...t, debtorName: names.a, amountOwed: shareA,
          breakdownText: t.splitMode === 'equal' ? '50% Split' : `₹${Math.round(shareA)} share`,
        });
      }
    });

    return { p2pNetBalance, pendingPartnerItems };
  }, [data?.expenses, data?.settings.partnerAName, data?.settings.partnerBName]);

  // ── Plan info loader (hooks must be above all conditional returns) ──────────
  React.useEffect(() => {
    if (!data?.householdId) return;
    import('@/lib/planUtils').then(({ getUsageSummary }) => {
      getUsageSummary(data.householdId)
        .then(setPlanInfo)
        .catch(() => {
          setPlanInfo({ plan: 'free', count: 0, limit: 30, month: new Date().toISOString().slice(0, 7), pct: 0 });
        });
    }).catch(() => {
      setPlanInfo({ plan: 'free', count: 0, limit: 30, month: new Date().toISOString().slice(0, 7), pct: 0 });
    });
  }, [data?.householdId]);

  // ── First-time setup wizard ────────────────────────────────────────────────
  const needsSetup = data && !data.settings.setupComplete;

  const handleSetupComplete = async (mode: HouseholdMode, nameA: string, nameB: string, telegramUsername?: string) => {
    if (!data) return;
    const updatedSettings = {
      ...data.settings,
      householdMode:   mode,
      partnerAName:    nameA,
      partnerBName:    nameB || 'Partner B',
      setupComplete:   true,
      ...(telegramUsername ? { telegramUsername } : {}),
    };
    await actions.saveSettings(updatedSettings);
    if (telegramUsername && session?.user?.id) {
      const { supabase } = await import('@/lib/supabaseClient');
      await supabase.from('profiles').update({ telegram_username: telegramUsername }).eq('id', session.user.id);
    }
    const fresh = await (await import('@/lib/supabaseHelpers')).loadData(session!.user.id);
    setData(fresh);
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  // ⚡ REDIRECT MUTATION: Cleanly shifts execution straight to your modular /auth route
  if (!session) {
    redirect('/auth');
  }

  if (loading || !data) {
    return (
      <div style={{
        background: C.bg, minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
      }}>
        <Icon name="wallet" size={40} color={C.amber} />
        <div style={{ color: C.amber, fontSize: 17, fontWeight: 700 }}>Loading ChillarFlow…</div>
      </div>
    );
  }

  if (needsSetup) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  // ── Derive nav based on mode ───────────────────────────────────────────────
  const mode        = data.settings.householdMode ?? 'joint';
  const nav         = navForMode(mode);
  const isSolo      = mode === 'solo';
  const isJointMode = mode === 'joint';

  const primaryNavItems = [
    { id: 'dashboard', label: 'Home',      icon: 'home' },
    { id: 'expenses',  label: 'Expenses', icon: 'list' },
    { id: 'add',       label: 'Add',      icon: 'plus' },
    isSolo
      ? { id: 'goals',  label: 'Goals',  icon: 'target' }
      : { id: 'settle', label: 'Settle', icon: 'refresh' },
    { id: 'more', label: 'More', icon: 'more' },
  ];

  const fmt$ = (n: number) => fmt(n, data.settings.currency, privacyMode);

  const activeGoalCount  = data.goals.filter((g: any) => !g.completed).length;
  const goalsSavedTotal  = data.goals.reduce((s: number, g: any) => s + Number(g.current ?? 0), 0);
  const activeLoanCount  = data.loans?.length ?? 0;
  const monthlyEmiTotal  = (data.loans ?? []).reduce((s: number, l: any) => s + Number(l.emi ?? l.monthlyPayment ?? 0), 0);
  const p2pPendingCount  = partnerCalculations.pendingPartnerItems.length;

  const moreNavItems = [
    { id: 'income',    label: 'Income',        icon: 'trendUp',  subtitle: 'Inflow dashboard · partner split' },
    ...(isJointMode ? [{ id: 'contributions', label: 'Contributions', icon: 'wallet', subtitle: 'Monthly joint-pool entry' }] : []),
    ...(isSolo
      ? [{ id: 'settle', label: 'Settle', icon: 'refresh', subtitle: p2pPendingCount > 0 ? `${p2pPendingCount} pending` : 'All settled' }]
      : [{ id: 'goals',  label: 'Goals',  icon: 'target',  subtitle: activeGoalCount > 0 ? `${activeGoalCount} active · ${fmt$(goalsSavedTotal)} saved` : 'No active goals' }]
    ),
    { id: 'loans',    label: 'Loans & EMI',   icon: 'bank',      subtitle: activeLoanCount > 0 ? `${activeLoanCount} active · ${fmt$(monthlyEmiTotal)}/mo` : 'No active EMIs' },
    { id: 'insights', label: 'AI Insights',   icon: 'sparkles', subtitle: 'Personalised analysis · monthly read' },
    { id: 'settings', label: 'Settings',      icon: 'settings', subtitle: 'Household, data, notifications' },
  ];

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: C.bg, minHeight: '100vh',
        fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
        color: C.textW,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
      }}
    >
      {/* DESKTOP SIDEBAR */}
      {!isMobile && (
        <aside
          style={{
            width: sidebarOpen ? 240 : 80,
            transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
            background: C.surface,
            borderRight: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column',
            position: 'sticky', top: 0, height: '100vh', overflowX: 'hidden',
          }}
        >
          {/* Logo + toggle */}
          <div style={{
            padding: sidebarOpen ? '24px 20px' : '24px 0',
            display: 'flex', alignItems: 'center',
            justifyContent: sidebarOpen ? 'space-between' : 'center',
            borderBottom: `1px solid ${C.border}`,
          }}>
            {sidebarOpen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 150 }}>
                <Icon name="wallet" size={26} color={C.amber} />
                <span style={{ color: C.amber, fontWeight: 900, fontSize: 18, letterSpacing: -0.5 }}>
                  ChillarFlow
                </span>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ background: 'transparent', border: 'none', color: C.text1, cursor: 'pointer', fontSize: 20, padding: 4 }}
            >
              {sidebarOpen ? '◀' : '☰'}
            </button>
          </div>

          {/* Nav items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '20px 12px', flex: 1, overflowY: 'auto' }}>
            {nav.map((n) => (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                title={n.label}
                style={{
                  background: view === n.id ? C.amber + '22' : 'transparent',
                  border: 'none',
                  color: view === n.id ? C.amber : C.text2,
                  borderRadius: 10,
                  padding: sidebarOpen ? '12px 16px' : '12px',
                  cursor: 'pointer', fontSize: 14,
                  fontWeight: view === n.id ? 700 : 600,
                  display: 'flex', alignItems: 'center',
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  gap: 12, transition: 'all .2s', textAlign: 'left',
                }}
              >
                <Icon name={n.icon} size={18} color={view === n.id ? C.amber : C.text2} />
                {sidebarOpen && <span style={{ whiteSpace: 'nowrap' }}>{n.label}</span>}
              </button>
            ))}
          </div>

          {/* Offline banner */}
          {!isOnline && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9998, background: '#f59e0b', color: '#0b0f1a', padding: '8px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              ⚠️ You are offline. Expenses will be saved and synced when you reconnect.
              {offlineQueue.length > 0 && <span>({offlineQueue.length} pending)</span>}
            </div>
          )}

          {/* Footer: email + privacy + logout */}
          <div style={{ padding: '0 20px 6px', fontSize: 11, color: C.text2, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sidebarOpen ? session.user.email : ''}
          </div>
          <div style={{ padding: '12px 20px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', flexDirection: sidebarOpen ? 'row' : 'column' }}>
            <button
              onClick={() => setPrivacyMode((p) => !p)}
              title={privacyMode ? 'Reveal data' : 'Mask data'}
              style={{ background: 'transparent', border: `1px solid ${C.border}`, color: privacyMode ? C.amber : C.text2, borderRadius: 8, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name={privacyMode ? 'eyeOff' : 'eye'} size={16} color={privacyMode ? C.amber : C.text2} />
            </button>
            <button
              onClick={() => supabase.auth.signOut().then(() => { window.location.href = '/'; })}
              style={{ flex: 1, width: '100%', background: 'transparent', border: sidebarOpen ? `1px solid ${C.border}` : 'none', color: C.text2, borderRadius: 8, padding: '10px', fontSize: 14, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Icon name="logOut" size={15} color={C.text2} />
              {sidebarOpen && 'Log Out'}
            </button>
          </div>
        </aside>
      )}

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, position: 'relative', height: isMobile ? 'calc(100vh - 70px)' : '100vh', overflowY: 'auto' }}>

        {/* Mobile top header — CRED style */}
        {isMobile && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px',
            paddingTop: 'max(12px, env(safe-area-inset-top))',
            borderBottom: `1px solid ${C.border}`,
            background: C.bg, position: 'sticky', top: 0, zIndex: 50,
          }}>
            <button
              onClick={() => { setView('settings'); setShowMore(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: C.accentBg, border: `2px solid ${C.accent}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 800, color: C.accent, flexShrink: 0,
              }}>
                {(data?.settings?.partnerAName?.[0] ?? 'C').toUpperCase()}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 18, color: C.textW, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {nav.find((n) => n.id === view)?.label ?? 'ChillarFlow'}
                </div>
                <div style={{ fontSize: 10, color: C.text3, fontWeight: 500, lineHeight: 1, marginTop: 3 }}>
                  {data?.settings?.partnerAName ?? ''}{data?.settings?.partnerBName ? ` & ${data.settings.partnerBName}` : ''}
                </div>
              </div>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {view !== 'add' && view !== 'settings' && (
                <button onClick={handleManualRefresh} disabled={isRefreshing}
                  style={{ background: C.surface2, border: 'none', cursor: isRefreshing ? 'not-allowed' : 'pointer',
                    width: 36, height: 36, borderRadius: '50%', opacity: isRefreshing ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={isRefreshing ? 'clock' : 'refresh'} size={16} color={C.text2} />
                </button>
              )}
              <button onClick={() => setPrivacyMode((p) => !p)}
                style={{ background: C.surface2, border: 'none', cursor: 'pointer',
                  width: 36, height: 36, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={privacyMode ? 'eyeOff' : 'eye'} size={16} color={privacyMode ? C.amber : C.text2} />
              </button>
            </div>
          </div>
        )}

        {/* Page content */}
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: isMobile ? '12px 12px 90px' : '40px 40px 100px' }}>

          {/* Header row — desktop only */}
          {!isMobile && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12 }}>
              <h2 style={{ color: C.textW, fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
                {nav.find((n) => n.id === view)?.label ?? ''}
              </h2>
              {view !== 'add' && view !== 'settings' && (
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  style={{
                    background: 'transparent', border: `1px solid ${C.border}`,
                    color: isRefreshing ? C.text2 : C.text1,
                    padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 8,
                    cursor: isRefreshing ? 'not-allowed' : 'pointer',
                    opacity: isRefreshing ? 0.6 : 1,
                  }}
                >
                  <Icon name={isRefreshing ? 'clock' : 'refresh'} size={14} color={isRefreshing ? C.text2 : C.text1} />
                  {isRefreshing ? 'Syncing…' : 'Refresh'}
                </button>
              )}
            </div>
          )}

          {/* View router */}
          {view === 'dashboard' && (
            <Dashboard data={data} onAddExpense={actions.addExpense} fmt={fmt$} />
          )}
          {view === 'add' && (
            <AddExpense
              data={data}
              isOnline={isOnline}
              session={session}
              duplicateData={duplicateData}
              onAdd={actions.addExpense}
              onUpdateSave={actions.updateExpense}
              onClose={() => { setDuplicateData(null); setView(prevView); }}
            />
          )}
          {view === 'income' && <IncomeTracker data={data} fmt={fmt$} />}
          {view === 'expenses' && (
            <ExpenseList
              data={data}
              fmt={fmt$}
              onToggleToSettle={actions.toggleToSettle}
              onDelete={actions.deleteExpense}
              onUpdate={actions.updateExpense}
              onUnsettle={actions.unsettle}
              onBulkDelete={actions.bulkDeleteExpense}
              onBulkFlagToSettle={actions.bulkFlagToSettle}
              onBulkMarkAsSettled={actions.bulkMarkAsSettled}
              onBulkAssignToAccount={actions.bulkAssignToAccount}
              onTriggerEdit={(tx: any) => {
                setDuplicateData({ ...tx, isRecurring: tx.isRecurring ?? false, recurrenceInterval: tx.recurrenceInterval ?? 'monthly' });
                setPrevView(view);
                setView('add');
              }}
              onDuplicate={(e: any) => {
                setDuplicateData({ ...e, date: today(), amount: String(e.amount), id: null });
                setPrevView(view);
                setView('add');
              }}
            />
          )}
          {view === 'settle' && mode !== 'solo' && (
            <SettleDashboard data={data} fmt={fmt$} onBulkSettle={actions.bulkSettle} partnerCalculations={partnerCalculations} actions={actions} />
          )}
          {view === 'contributions' && mode === 'joint' && (
            <Contributions data={data} onUpdate={actions.updateContrib} fmt={fmt$} />
          )}
          {view === 'goals' && (
            <Goals data={data} onUpdate={actions.updateGoal} onAdd={actions.addGoal} onDelete={actions.deleteGoal} fmt={fmt$} />
          )}
          {view === 'loans' && (
            <LoanTracker data={data} onAdd={actions.addLoan} onUpdate={actions.updateLoan} onDelete={actions.deleteLoan} fmt={fmt$} />
          )}
          {view === 'insights' && <AIInsights data={data} fmt={fmt$} />}
          {view === 'settings' && (
            <Settings
              data={data}
              householdId={data.householdId}
              onSave={actions.saveSettings}
              theme={theme}
              onThemeChange={handleThemeChange}
              planInfo={planInfo}
              onExport={() => exportToExcel(data)}
              onImport={actions.importData}
              onJoinHousehold={(id: string) => actions.joinHousehold(id, setLoading)}
            />
          )}
        </div>

        {/* Desktop FAB */}
        {!isMobile && view !== 'add' && (
          <button
            onClick={() => { setPrevView(view); setView('add'); }}
            style={{
              position: 'fixed', bottom: 40, right: 40,
              width: 56, height: 56, borderRadius: '50%',
              background: C.accent,
              color: '#0a0a0a', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 300,
              boxShadow: '0 4px 20px rgba(240,180,41,0.4)',
              zIndex: 1000,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
          >
            +
          </button>
        )}
      </div>

      {/* MOBILE BOTTOM NAV */}
      {isMobile && (
        <>
          {/* More drawer */}
          {showMore && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 950 }}
              onClick={() => setShowMore(false)}>
              <div style={{
                position: 'absolute', bottom: 72, left: 0, right: 0,
                background: C.surface,
                borderTop: `1px solid ${C.border}`,
                borderRadius: '24px 24px 0 0',
                boxShadow: '0 -16px 48px rgba(0,0,0,0.5)',
                maxHeight: '72vh', overflowY: 'auto',
              }} onClick={(e) => e.stopPropagation()}>
                <div style={{ width: 40, height: 4, background: C.border2, borderRadius: 99, margin: '16px auto 8px' }} />
                {(moreNavItems as any[]).map((n: any, i: number) => {
                  const isActive = view === n.id;
                  const isLast   = i === moreNavItems.length - 1;
                  return (
                    <button key={n.id}
                      onClick={() => { setView(n.id as any); setShowMore(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16,
                        width: '100%', background: 'transparent', border: 'none',
                        borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
                        padding: '14px 20px', cursor: 'pointer', textAlign: 'left',
                        WebkitTapHighlightColor: 'transparent',
                      }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: isActive ? C.accentBg : C.surface2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon name={n.icon} size={20} color={isActive ? C.accent : C.text2} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: isActive ? C.accent : C.textW }}>{n.label}</div>
                        <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>{n.subtitle}</div>
                      </div>
                      <Icon name="chevron" size={16} color={C.text3} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <nav style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: C.surface,
            borderTop: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center',
            paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
            paddingTop: 4,
            zIndex: 900,
            boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
          }}>
            {primaryNavItems.map((n) => {
              if (n.id === 'add') {
                return (
                  <button key="add"
                    onClick={() => { setPrevView(view); setView('add'); setShowMore(false); }}
                    style={{
                      flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      padding: '2px 2px 4px',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 16,
                      background: C.accent, color: '#0a0a0a',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 26, fontWeight: 300,
                      marginTop: -14,
                      boxShadow: '0 4px 16px rgba(240,180,41,0.4)',
                    }}>+</div>
                    <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.accent }}>
                      Add
                    </span>
                  </button>
                );
              }
              if (n.id === 'more') {
                return (
                  <button key="more"
                    onClick={() => setShowMore(!showMore)}
                    style={{
                      flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      padding: '8px 2px 4px', WebkitTapHighlightColor: 'transparent',
                    }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 12,
                      background: showMore ? C.accentBg : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s',
                    }}><Icon name="more" size={20} color={showMore ? C.accent : C.text3} /></div>
                    <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: showMore ? C.accent : C.text3 }}>More</span>
                  </button>
                );
              }
              const isActive = view === n.id && !showMore;
              return (
                <button key={n.id}
                  onClick={() => { setView(n.id as any); setShowMore(false); }}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    padding: '8px 2px 4px', WebkitTapHighlightColor: 'transparent',
                  }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 12,
                    background: isActive ? C.accentBg : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s',
                  }}>
                    <Icon name={n.icon} size={20} color={isActive ? C.accent : C.text3} />
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                    color: isActive ? C.accent : C.text3, transition: 'color 0.15s',
                  }}>
                    {n.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </>
      )}

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
