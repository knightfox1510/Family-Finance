// ─── app/page.tsx ─────────────────────────────────────────────────────────────
// Root shell. Handles:
//   • Auth gate
//   • Loading state
//   • First-time setup wizard
//   • Layout (sidebar / mobile bottom nav)
//   • View routing
//
// All data logic is in useActions.ts, all DB calls in supabaseHelpers.ts.
// All types are in types/index.ts. Design tokens are in constants/index.ts.

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';

import { supabase } from '@/lib/supabaseClient';
import Auth from './Auth';

import { loadData } from '@/lib/supabaseHelpers';
import { SetupWizard } from '@/components/SetupWizard';
import { useActions } from '@/hooks/useActions';
import { ToastContainer, useToast } from '@/components/ui';

import { C, navForMode } from '@/constants';
import type { AppData, ViewId, HouseholdMode } from '@/types';

// ─── View imports ─────────────────────────────────────────────────────────────
// Each of these was previously inlined in the 5900-line file.
// Move them to their own files, e.g. components/Dashboard.tsx, etc.
// The import paths below are the target structure.
import { Dashboard }        from '@/components/Dashboard';
import { AddExpense }       from '@/components/AddExpense';
import { IncomeTracker }    from '@/components/IncomeTracker';
import { ExpenseList }      from '@/components/ExpenseList';
import { SettleDashboard }  from '@/components/SettleDashboard';
import { Contributions }    from '@/components/Contributions';
import { Goals }            from '@/components/Goals';
import { LoanTracker }      from '@/components/LoanTracker';
import { AIInsights }       from '@/components/AIInsights';
import { Settings }         from '@/components/Settings';

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
  XLSX.writeFile(wb, `FamilyFinance_${today()}.xlsx`);
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
  const [duplicateData, setDuplicateData] = useState<any>(null);

  const { toasts, addToast, dismiss } = useToast();

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
      if (t.settled || t.account === 'Joint' || t.settleTrack !== 'partner') return;
      const amount = Number(t.amount);
      const aShare = Number(t.partnerAShare);
      const bShare = Number(t.partnerBShare);

      // 'fixed' mode: shares are absolute amounts (e.g. ₹4698)
      // 'percentage' mode: shares are 0–100, convert to fraction
      // 'equal' mode: always 50/50
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

      // addedBy is a display name after toUI() mapping,
      // so check both display name and system key to be safe
      const paidByA = t.addedBy === names.a || t.addedBy === 'Partner A';
      const paidByB = t.addedBy === names.b || t.addedBy === 'Partner B';

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

  // ── First-time setup wizard ────────────────────────────────────────────────
  // Show when household mode is unset or user is newly onboarded
  const needsSetup = data && !data.settings.householdMode;

  const handleSetupComplete = async (mode: HouseholdMode, nameA: string, nameB: string) => {
    if (!data) return;
    const updatedSettings = { ...data.settings, householdMode: mode, partnerAName: nameA, partnerBName: nameB };
    await actions.saveSettings(updatedSettings);
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!session) return <Auth />;

  if (loading || !data) {
    return (
      <div style={{
        background: C.bg, minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontSize: 40 }}>💰</div>
        <div style={{ color: C.amber, fontSize: 17, fontWeight: 700 }}>Loading FamilyFinance…</div>
      </div>
    );
  }

  if (needsSetup) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  // ── Derive nav based on mode ───────────────────────────────────────────────
  const mode = data.settings.householdMode ?? 'joint';
  const nav  = navForMode(mode);

  const fmt$ = (n: number) => fmt(n, data.settings.currency, privacyMode);

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: C.bg, minHeight: '100vh',
        fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif",
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
                <span style={{ fontSize: 26 }}>💰</span>
                <span style={{ color: C.amber, fontWeight: 900, fontSize: 18, letterSpacing: -0.5 }}>
                  FamilyFinance
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
                <span style={{ fontSize: 18 }}>{n.icon}</span>
                {sidebarOpen && <span style={{ whiteSpace: 'nowrap' }}>{n.label}</span>}
              </button>
            ))}
          </div>

          {/* Footer: email + privacy + logout */}
          <div style={{ padding: '0 20px 6px', fontSize: 11, color: C.text2, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sidebarOpen ? `👤 ${session.user.email}` : ''}
          </div>
          <div style={{ padding: '12px 20px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', flexDirection: sidebarOpen ? 'row' : 'column' }}>
            <button
              onClick={() => setPrivacyMode((p) => !p)}
              title={privacyMode ? 'Reveal data' : 'Mask data'}
              style={{ background: 'transparent', border: `1px solid ${C.border}`, color: privacyMode ? C.amber : C.text2, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 16 }}
            >
              {privacyMode ? '🙈' : '👁️'}
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{ flex: 1, width: '100%', background: 'transparent', border: sidebarOpen ? `1px solid ${C.border}` : 'none', color: C.text2, borderRadius: 8, padding: '10px', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
            >
              {sidebarOpen ? 'Log Out' : '🚪'}
            </button>
          </div>
        </aside>
      )}

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, position: 'relative', height: isMobile ? 'calc(100vh - 70px)' : '100vh', overflowY: 'auto' }}>

        {/* Mobile top header */}
        {isMobile && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
            background: C.surface, position: 'sticky', top: 0, zIndex: 50,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>💰</span>
              <span style={{ color: C.amber, fontWeight: 900, fontSize: 16 }}>FamilyFinance</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setPrivacyMode((p) => !p)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}>
                {privacyMode ? '🙈' : '👁️'}
              </button>
              <button onClick={() => supabase.auth.signOut()} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text2, borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>
                Log Out
              </button>
            </div>
          </div>
        )}

        {/* Page content */}
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: isMobile ? '20px 20px 100px' : '40px 40px 100px' }}>

          {/* Header row */}
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
                {isRefreshing ? '⏳ Syncing…' : '🔄 Refresh'}
              </button>
            )}
          </div>

          {/* View router */}
          {view === 'dashboard' && (
            <Dashboard data={data} onAddExpense={actions.addExpense} fmt={fmt$} />
          )}
          {view === 'add' && (
            <AddExpense
              data={data}
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
              onToggleToSettle={actions.toggleToSettle}
              onDelete={actions.deleteExpense}
              onUpdate={actions.updateExpense}
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
            <SettleDashboard data={data} onBulkSettle={actions.bulkSettle} partnerCalculations={partnerCalculations} actions={actions} />
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
              onExport={() => exportToExcel(data)}
              onImport={actions.importData}
              onJoinHousehold={(id: string) => actions.joinHousehold(id, setLoading)}
            />
          )}
        </div>

        {/* FAB */}
        {view !== 'add' && (
          <button
            onClick={() => { setPrevView(view); setView('add'); }}
            style={{
              position: 'fixed',
              bottom: isMobile ? 90 : 40,
              right: isMobile ? 20 : 40,
              width: 64, height: 64, borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.amber}, #d97706)`,
              color: C.bg, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32,
              boxShadow: '0 8px 24px rgba(245,158,11,0.4)',
              zIndex: 1000,
            }}
          >
            +
          </button>
        )}
      </div>

      {/* MOBILE BOTTOM NAV */}
      {isMobile && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: 70,
          background: C.surface, borderTop: `1px solid ${C.border}`,
          display: 'flex', overflowX: 'auto', padding: '0 10px',
          alignItems: 'center', gap: 10, zIndex: 900,
        }}>
          {nav.filter((n) => n.id !== 'add').map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              style={{
                background: view === n.id ? C.amber + '11' : 'transparent',
                border: 'none', color: view === n.id ? C.amber : C.text2,
                borderRadius: 10, padding: '8px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 64,
              }}
            >
              <span style={{ fontSize: 20 }}>{n.icon}</span>
              <span style={{ fontSize: 10, fontWeight: view === n.id ? 700 : 500, whiteSpace: 'nowrap' }}>{n.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Toast notifications (replaces all alert() calls) */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}