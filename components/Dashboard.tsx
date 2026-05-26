'use client';
import React, { useState, useMemo } from 'react';
import type { AppData } from '@/types';
import { Card, SectionTitle, StatCard, ProgressBar, Metric } from '@/components/ui';
import { C, INVESTMENT_CATS } from '@/constants';

// ─── Utilities ────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }
function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string) {
  if (!key || key === 'All') return 'All Months';
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

interface Props {
  data: AppData;
  onAddExpense: (e: any) => void;
  fmt: (n: number) => string;
}

export function Dashboard({ data, onAddExpense, fmt }: Props) {
  const [showAudit, setShowAudit] = useState(false);
  const [rangeMode, setRangeMode] = useState<'month' | 'year' | 'custom'>('month');
  const d = new Date();
  const currentMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const defaultStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const [customDates, setCustomDates] = useState({ start: defaultStart, end: today() });
  const [accountFilter, setAccountFilter] = useState('All');
  const [trendMonths, setTrendMonths]     = useState(6);

  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const mode  = data.settings.householdMode ?? 'joint';
  const isJoint    = mode === 'joint';
  const isSolo     = mode === 'solo';
  const hasPartner = mode !== 'solo';

  const allAvailableMonths = [...new Set(data.expenses.map((e) => monthKey(e.date)))].sort().reverse();

  const uniqueContributions = Array.from(new Map(data.contributions.map((c) => [c.month, c])).values());
  const allTimePool = uniqueContributions.reduce((s, c) => s + Number(c.partnerA ?? 0) + Number(c.partnerB ?? 0), 0);
  const allTimeJointIncome = data.expenses.filter((e) => e.account === 'Joint' && e.type === 'income').reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const allTimeJointSpent = data.expenses.filter((e) => e.account === 'Joint' && e.type !== 'income').reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const currentJointBalance = allTimePool + allTimeJointIncome - allTimeJointSpent;

  const currentYear = String(d.getFullYear());
  const inRange = (e: any) => {
    if (rangeMode === 'month') return monthKey(e.date) === selectedMonth;
    if (rangeMode === 'year')  return e.date.startsWith(currentYear);
    return e.date >= customDates.start && e.date <= customDates.end;
  };

  const periodJointSpent = data.expenses.filter((e) => inRange(e) && e.account === 'Joint' && e.type !== 'income').reduce((s, e) => s + Number(e.amount ?? 0), 0);

  let contribA = 0, contribB = 0;
  if (rangeMode === 'month') {
    const pc = uniqueContributions.find((c) => c.month === selectedMonth);
    if (pc) { contribA = Number(pc.partnerA ?? 0); contribB = Number(pc.partnerB ?? 0); }
  } else if (rangeMode === 'year') {
    const yearContribs = uniqueContributions.filter((c) => c.month.startsWith(currentYear));
    contribA = yearContribs.reduce((s, c) => s + Number(c.partnerA ?? 0), 0);
    contribB = yearContribs.reduce((s, c) => s + Number(c.partnerB ?? 0), 0);
  } else {
    const startM = customDates.start.slice(0, 7), endM = customDates.end.slice(0, 7);
    const overlap = uniqueContributions.filter((c) => c.month >= startM && c.month <= endM);
    contribA = overlap.reduce((s, c) => s + Number(c.partnerA ?? 0), 0);
    contribB = overlap.reduce((s, c) => s + Number(c.partnerB ?? 0), 0);
  }

  const trendMonthKeys = Array.from({ length: trendMonths }).map((_, i) => {
    const t = new Date(); t.setMonth(t.getMonth() - i);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  }).reverse();
  // Keep last6Months alias for backward compat with other computed values
  const last6Months = trendMonthKeys;

  // Partner activity trend — lifestyle, invested, retained per partner per month
  const partnerTrendData = last6Months.map((mKey) => {
    const mExpenses = data.expenses.filter((e) => monthKey(e.date) === mKey && e.type !== 'income');
    const mIncome   = data.expenses.filter((e) => monthKey(e.date) === mKey && e.type === 'income');
    const mContribs = uniqueContributions.find((c) => c.month === mKey);
    const lA = mExpenses.filter((e) => (e.account === names.a || e.account === 'Partner A') && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount), 0);
    const lB = mExpenses.filter((e) => (e.account === names.b || e.account === 'Partner B') && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount), 0);
    const iA = mExpenses.filter((e) => (e.account === names.a || e.account === 'Partner A') && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount), 0);
    const iB = mExpenses.filter((e) => (e.account === names.b || e.account === 'Partner B') && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount), 0);
    const incA = mIncome.filter((e) => e.account === names.a || e.account === 'Partner A').reduce((s, e) => s + Number(e.amount), 0);
    const incB = mIncome.filter((e) => e.account === names.b || e.account === 'Partner B').reduce((s, e) => s + Number(e.amount), 0);
    const cA = Number(mContribs?.partnerA ?? 0);
    const cB = Number(mContribs?.partnerB ?? 0);
    return {
      month: monthLabel(mKey),
      [`${names.a} Lifestyle`]: lA,
      [`${names.a} Invested`]:  iA,
      [`${names.a} Income`]:    incA,
      [`${names.b} Lifestyle`]: lB,
      [`${names.b} Invested`]:  iB,
      [`${names.b} Income`]:    incB,
      contribA: cA,
      contribB: cB,
    };
  });
  const maxPartnerTrend = Math.max(1, ...partnerTrendData.map((m) =>
    Math.max(
      m[`${names.a} Income`] as number, m[`${names.b} Income`] as number,
      (m[`${names.a} Lifestyle`] as number) + (m[`${names.a} Invested`] as number) + m.contribA,
      (m[`${names.b} Lifestyle`] as number) + (m[`${names.b} Invested`] as number) + m.contribB,
    )
  ));

  const lifestyleTrendData = last6Months.map((mKey) => ({
    monthLabel: monthLabel(mKey),
    total: data.expenses.filter((e) => monthKey(e.date) === mKey && e.type !== 'income' && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0),
  }));
  const maxLifestyleTrend = Math.max(1, ...lifestyleTrendData.map((m) => m.total));

  const investmentTrendData = last6Months.map((mKey) => ({
    monthLabel: monthLabel(mKey),
    total: data.expenses.filter((e) => monthKey(e.date) === mKey && e.type !== 'income' && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0),
  }));
  const maxInvestmentTrend = Math.max(1, ...investmentTrendData.map((m) => m.total));

  const filteredExp = data.expenses.filter((e) => {
    if (!inRange(e)) return false;
    if (accountFilter === 'PersonalOnly' && e.account === 'Joint') return false;
    if (accountFilter !== 'All' && accountFilter !== 'PersonalOnly' && e.account !== accountFilter) return false;
    return e.type !== 'income';
  });

  const periodIncome = data.expenses.filter((e) => inRange(e) && e.type === 'income').reduce((s, e) => s + Number(e.amount ?? 0), 0);

  // ── Spending split into three buckets — personal A, personal B, joint ──────
  const personalLifestyleA = filteredExp.filter((e) => e.account === names.a && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalLifestyleB = filteredExp.filter((e) => e.account === names.b && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const jointLifestyle      = filteredExp.filter((e) => e.account === 'Joint' && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalInvestedA  = filteredExp.filter((e) => e.account === names.a && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalInvestedB  = filteredExp.filter((e) => e.account === names.b && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const jointInvested       = filteredExp.filter((e) => e.account === 'Joint' && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  // Household totals — all three buckets combined
  const trueLifestyleExpenses = personalLifestyleA + personalLifestyleB + jointLifestyle;
  const periodInvested        = personalInvestedA  + personalInvestedB  + jointInvested;

  // Retained = Income − Personal Lifestyle − Joint Lifestyle − Personal Invested − Joint Invested
  const capitalRetained  = periodIncome - trueLifestyleExpenses - periodInvested;

  // Per-partner income for the period (income transactions on their account)
  const incomeA = data.expenses.filter((e) => inRange(e) && e.type === 'income' && (e.account === names.a || e.account === 'Partner A')).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const incomeB = data.expenses.filter((e) => inRange(e) && e.type === 'income' && (e.account === names.b || e.account === 'Partner B')).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  // Per-partner retention = income − personal lifestyle − personal invested − joint contrib
  const capitalRetainedA = incomeA - personalLifestyleA - personalInvestedA - contribA;
  const capitalRetainedB = incomeB - personalLifestyleB - personalInvestedB - contribB;

  const catMap: Record<string, number> = {};
  filteredExp.filter((e) => !INVESTMENT_CATS.has(e.category)).forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount); });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const maxCat = topCats[0]?.[1] || 1;

  // Asset allocation — investment categories broken down by type
  const assetMap: Record<string, number> = {};
  filteredExp.filter((e) => INVESTMENT_CATS.has(e.category)).forEach((e) => {
    assetMap[e.category] = (assetMap[e.category] || 0) + Number(e.amount);
  });
  // Also count by note keyword for richer breakdown (MF, SIP, Insurance etc.)
  const assetDetail: Record<string, number> = {};
  filteredExp.filter((e) => INVESTMENT_CATS.has(e.category)).forEach((e) => {
    const note = (e.note || '').toLowerCase();
    const key =
      note.includes('sip') || note.includes('mutual') || note.includes('mf') ? 'Mutual Funds / SIP' :
      note.includes('gold') ? 'Gold' :
      note.includes('ppf') || note.includes('epf') || note.includes('nps') ? 'PPF / EPF / NPS' :
      note.includes('stock') || note.includes('equity') || note.includes('zerodha') || note.includes('smallcase') ? 'Stocks / Equity' :
      note.includes('fd') || note.includes('fixed deposit') ? 'Fixed Deposits' :
      e.category === 'Insurance' ? 'Insurance' : 'Other Investments';
    assetDetail[key] = (assetDetail[key] || 0) + Number(e.amount);
  });
  const assetDetailEntries = Object.entries(assetDetail).sort((a, b) => b[1] - a[1]);
  const maxAsset = assetDetailEntries[0]?.[1] || 1;
  const ASSET_COLORS = [C.teal, C.green, C.purple, C.blue, C.amber, '#ec4899'];

  const monthlyAuditList = useMemo(() => {
    const map: Record<string, { in: number; out: number }> = {};
    data.expenses.filter((e) => e.account === 'Joint').forEach((e) => {
      const mk = monthKey(e.date);
      if (!map[mk]) map[mk] = { in: 0, out: 0 };
      if (e.type === 'income') map[mk].in += Number(e.amount ?? 0);
      else map[mk].out += Number(e.amount ?? 0);
    });
    uniqueContributions.forEach((c) => {
      if (!map[c.month]) map[c.month] = { in: 0, out: 0 };
      map[c.month].in += Number(c.partnerA ?? 0) + Number(c.partnerB ?? 0);
    });
    return Object.entries(map)
      .map(([month, v]) => ({ month, in: v.in, out: v.out, net: v.in - v.out }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [data.expenses, data.contributions]);

  // ── Helper styles (NeoPOP) ───────────────────────────────────────────────
  const fmt2 = (n: number) => fmt ? fmt(n) : '₹' + Math.round(n).toLocaleString('en-IN');

  // Quick metric items — CRED wealth-strip style
  const quickItems = [
    { label: 'Income',    value: fmt2(periodIncome),                    color: C.green,  sub: 'Combined' },
    { label: 'Lifestyle', value: fmt2(trueLifestyleExpenses),            color: C.accent, sub: 'Total spend' },
    { label: 'Invested',  value: fmt2(periodInvested),                   color: C.teal,   sub: 'This period' },
    { label: 'Retained',  value: fmt2(Math.max(0, capitalRetained)),     color: capitalRetained >= 0 ? C.green : C.red, sub: capitalRetained >= 0 ? 'Saved' : 'Over budget' },
    ...(isJoint ? [{ label: 'Joint Bal', value: fmt2(currentJointBalance), color: currentJointBalance < 5000 ? C.red : C.teal, sub: 'Pool balance' }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── CRED-style wealth strip ───────────────────────────────────────── */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '20px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        {/* Main number — retained */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>
            Household Retained
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: capitalRetained >= 0 ? C.green : C.red, lineHeight: 1 }}>
            {fmt2(Math.max(0, capitalRetained))}
          </div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
            {periodIncome > 0 ? `${((Math.max(0, capitalRetained) / periodIncome) * 100).toFixed(0)}% of income retained` : 'No income logged yet'}
          </div>
        </div>
        {/* 4-metric strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 1, background: C.border, borderRadius: 14, overflow: 'hidden' }}>
          {quickItems.slice(0, 4).map((item, i) => (
            <div key={item.label} style={{ background: C.surface2, padding: '14px 16px' }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', color: item.color, lineHeight: 1, marginBottom: 2 }}>{item.value}</div>
              <div style={{ fontSize: 10, color: C.text3 }}>{item.sub}</div>
            </div>
          ))}
        </div>
        {isJoint && (
          <div style={{ marginTop: 1, background: C.surface2, borderRadius: '0 0 14px 14px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>Joint Pool Balance</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: currentJointBalance < 5000 ? C.red : C.teal }}>{fmt2(currentJointBalance)}</div>
            </div>
            <button onClick={() => setShowAudit(true)}
              style={{ background: C.accentBg, border: 'none', color: C.accent, borderRadius: 99, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Audit →
            </button>
          </div>
        )}
        {/* Allocation bar */}
        {periodIncome > 0 && (() => {
          const inv = (periodInvested / periodIncome) * 100;
          const jl  = isJoint ? (jointLifestyle / periodIncome) * 100 : 0;
          const pl  = ((personalLifestyleA + personalLifestyleB) / periodIncome) * 100;
          const ret = Math.max(0, 100 - inv - jl - pl);
          return (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', gap: 2 }}>
                {inv > 0 && <div style={{ width: `${inv}%`, background: C.teal, borderRadius: 99 }} />}
                {jl  > 0 && <div style={{ width: `${jl}%`,  background: C.orange, borderRadius: 99 }} />}
                {ret > 0 && <div style={{ width: `${ret}%`, background: C.green,  borderRadius: 99 }} />}
                {pl  > 0 && <div style={{ flex: 1,          background: C.accent, borderRadius: 99 }} />}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                {[{l:'Invested',c:C.teal,p:inv,s:inv>0},{l:'Joint',c:C.orange,p:jl,s:isJoint&&jl>0},{l:'Retained',c:C.green,p:ret,s:ret>0},{l:'Lifestyle',c:C.accent,p:pl,s:pl>0}].filter(x=>x.s).map(x=>(
                  <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: x.c }} />
                    <span style={{ color: C.text3 }}>{x.l}</span>
                    <span style={{ color: C.textW, fontWeight: 700 }}>{x.p.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Filters — stacked rows for mobile clarity ─────────────────────── */}
      <div style={{ background: C.surface, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 8px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Row 1: period selector */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: C.surface2, borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
            {(['month','year','custom'] as const).map((m, i) => (
              <button key={m} onClick={() => setRangeMode(m)}
                style={{ padding: '6px 14px', fontSize: 12, fontWeight: rangeMode === m ? 700 : 500,
                  background: rangeMode === m ? C.accent : 'transparent',
                  color: rangeMode === m ? '#0a0a0a' : C.text3,
                  border: 'none', cursor: 'pointer', borderRadius: 99, transition: 'all 0.15s',
                  textTransform: 'capitalize' }}>
                {m}
              </button>
            ))}
          </div>
          {rangeMode === 'month' && (
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ background: C.surface2, border: 'none', color: C.textW, borderRadius: 99, padding: '6px 12px', fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer' }}>
              {allAvailableMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}
          {rangeMode === 'year' && (
            <span style={{ fontSize: 12, color: C.text2, fontWeight: 600, padding: '6px 12px', background: C.surface2, borderRadius: 99 }}>{currentYear}</span>
          )}
          {rangeMode === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={customDates.start} onChange={(e) => setCustomDates({ ...customDates, start: e.target.value })}
                style={{ background: C.surface2, border: 'none', color: C.textW, borderRadius: 8, padding: '6px 8px', fontSize: 12, outline: 'none' }} />
              <span style={{ color: C.text3, fontSize: 11 }}>→</span>
              <input type="date" value={customDates.end} onChange={(e) => setCustomDates({ ...customDates, end: e.target.value })}
                style={{ background: C.surface2, border: 'none', color: C.textW, borderRadius: 8, padding: '6px 8px', fontSize: 12, outline: 'none' }} />
            </div>
          )}
        </div>
        {/* Row 2: account filter */}
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
          style={{ background: C.surface2, border: 'none', color: C.textW, borderRadius: 99, padding: '8px 14px', fontSize: 12, fontWeight: 500, outline: 'none', cursor: 'pointer', width: '100%' }}>
          <option value="All">All accounts</option>
          {isJoint && <option value="Joint">Joint only</option>}
          {hasPartner && <option value="PersonalOnly">Personal only</option>}
          <option value={names.a}>{names.a}</option>
          {hasPartner && <option value={names.b}>{names.b}</option>}
        </select>
      </div>

      {/* ── Household Wealth Retention ────────────────────────────────────── */}
      {(() => {
        const hPersonalLife = personalLifestyleA + personalLifestyleB;
        const hJointLife    = isJoint ? jointLifestyle : 0;
        const hInvested     = periodInvested;
        const hTotalOut     = hPersonalLife + hJointLife + hInvested;
        const hOverBudget   = periodIncome > 0 && hTotalOut > periodIncome;
        const hRaw = (n: number) => periodIncome > 0 ? (n / periodIncome) * 100 : 0;
        const hiRaw = hRaw(hInvested); const hjlRaw = hRaw(hJointLife); const hPlRaw = hRaw(hPersonalLife);
        const hRetained = Math.max(0, 100 - Math.min(hiRaw + hjlRaw, 100) - hPlRaw);
        return (
          <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Household Wealth Retention</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: hOverBudget ? C.red : C.green }}>
                {hOverBudget ? `▲ ${(hRaw(hTotalOut) - 100).toFixed(0)}% over` : `${hRetained.toFixed(0)}% retained`}
              </div>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Income', value: fmt2(periodIncome), color: C.green },
                  { label: 'Personal Lifestyle', value: fmt2(hPersonalLife), color: C.accent },
                  ...(isJoint && hJointLife > 0 ? [{ label: 'Joint Lifestyle', value: fmt2(hJointLife), color: C.orange }] : []),
                  { label: 'Invested', value: fmt2(hInvested), color: C.teal },
                  { label: 'Retained', value: fmt2(Math.max(0, capitalRetained)), color: capitalRetained >= 0 ? C.green : C.red },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: C.surface2, borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', color }}>{value}</div>
                  </div>
                ))}
              </div>
              {periodIncome > 0 && (
                <div>
                  <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', gap: 2, marginBottom: 8 }}>
                    {hiRaw > 0 && <div style={{ width: `${Math.min(hiRaw,100)}%`, background: C.teal, borderRadius: 99 }} />}
                    {isJoint && hjlRaw > 0 && <div style={{ width: `${Math.min(hjlRaw,100-Math.min(hiRaw,100))}%`, background: C.orange, borderRadius: 99 }} />}
                    {hRetained > 0 && <div style={{ width: `${hRetained}%`, background: C.green, borderRadius: 99 }} />}
                    {hPlRaw > 0 && <div style={{ flex: 1, background: hOverBudget ? C.red : C.accent, borderRadius: 99 }} />}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[{l:'Invested',c:C.teal,p:hiRaw,s:hiRaw>0},{l:'Joint',c:C.orange,p:hjlRaw,s:isJoint&&hjlRaw>0},{l:'Retained',c:C.green,p:hRetained,s:hRetained>0},{l:'Lifestyle',c:hOverBudget?C.red:C.accent,p:hPlRaw,s:hPlRaw>0}].filter(x=>x.s).map(x=>(
                      <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: x.c }} /><span style={{ color: C.text3 }}>{x.l}</span><span style={{ color: C.textW, fontWeight: 700 }}>{x.p.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Partner activity cards ─────────────────────────────────────────── */}
      {hasPartner && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
          {([
            { name: names.a, lifestyle: personalLifestyleA, invested: personalInvestedA, contrib: contribA, income: incomeA, retained: capitalRetainedA, show: true },
            { name: names.b, lifestyle: personalLifestyleB, invested: personalInvestedB, contrib: contribB, income: incomeB, retained: capitalRetainedB, show: hasPartner },
          ] as any[]).filter(p => p.show).map((p) => {
            const totalOut = p.lifestyle + p.invested + (isJoint ? p.contrib : 0);
            const isOver   = p.income > 0 && totalOut > p.income;
            const pRaw = (n: number) => p.income > 0 ? (n / p.income) * 100 : 0;
            const iRaw = pRaw(p.invested), cRaw = isJoint ? pRaw(p.contrib) : 0;
            const lRaw = pRaw(p.lifestyle);
            const retained = Math.max(0, 100 - Math.min(iRaw + cRaw, 100) - lRaw);
            return (
              <div key={p.name} style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: isOver ? `0 0 0 2px ${C.red}, 0 4px 20px rgba(0,0,0,0.3)` : '0 4px 20px rgba(0,0,0,0.3)' }}>
                <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.textW }}>{p.name}</div>
                  {p.income > 0 && <div style={{ fontSize: 11, color: isOver ? C.red : C.text3 }}>{fmt2(totalOut)} of {fmt2(p.income)}</div>}
                </div>
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 12 }}>
                    {[
                      { label: 'Income', value: fmt2(p.income), color: C.green },
                      { label: 'Lifestyle', value: fmt2(p.lifestyle), color: C.accent },
                      { label: 'Invested', value: fmt2(p.invested), color: C.teal },
                      ...(isJoint ? [{ label: 'Joint Pool', value: fmt2(p.contrib), color: C.orange }] : []),
                      { label: 'Retained', value: fmt2(p.retained), color: p.retained >= 0 ? C.green : C.red },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: C.surface2, borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {p.income > 0 && (
                    <div style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', gap: 2 }}>
                      {iRaw > 0 && <div style={{ width: `${Math.min(iRaw,100)}%`, background: C.teal, borderRadius: 99 }} />}
                      {cRaw > 0 && <div style={{ width: `${Math.min(cRaw,100-Math.min(iRaw,100))}%`, background: C.orange, borderRadius: 99 }} />}
                      {retained > 0 && <div style={{ width: `${retained}%`, background: C.green, borderRadius: 99 }} />}
                      {lRaw > 0 && <div style={{ flex: 1, background: isOver ? C.red : C.accent, borderRadius: 99 }} />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Trend controls ────────────────────────────────────────────────── */}
      {(lifestyleTrendData.some((m) => m.total > 0) || investmentTrendData.some((m: any) => m.total > 0)) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
          <div style={{ fontSize: 11, color: C.text3, fontWeight: 500 }}>Trend window</div>
          <div style={{ display: 'flex', background: C.surface, borderRadius: 99, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {[3, 6, 12].map((n) => (
              <button key={n} onClick={() => setTrendMonths(n)}
                style={{ padding: '5px 12px', fontSize: 11, fontWeight: trendMonths === n ? 700 : 400,
                  background: trendMonths === n ? C.accent : 'transparent',
                  color: trendMonths === n ? '#0a0a0a' : C.text3,
                  border: 'none', cursor: 'pointer', borderRadius: 99, transition: 'all 0.15s' }}>
                {n}M
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Monthly Lifestyle Trend ────────────────────────────────────────── */}
      {lifestyleTrendData.some((m) => m.total > 0) && (
        <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Monthly Lifestyle Trend</div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
              {lifestyleTrendData.map((m, i) => {
                const heightPct = maxLifestyleTrend > 0 ? (m.total / maxLifestyleTrend) * 100 : 0;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
                    {m.total > 0 && (
                      <div style={{ fontSize: 8, color: C.text3, fontWeight: 600, textAlign: 'center', lineHeight: 1, marginBottom: 2, whiteSpace: 'nowrap' }}>
                        {fmt2(m.total).replace('₹','')}
                      </div>
                    )}
                    <div style={{ width: '80%', background: C.accent, borderRadius: '6px 6px 0 0', height: `${heightPct}%`, minHeight: m.total > 0 ? 8 : 0, transition: 'height 0.5s', opacity: 0.85 }} />
                    <div style={{ fontSize: 9, color: C.text3, textAlign: 'center', fontWeight: 500, lineHeight: 1, paddingTop: 4, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.monthLabel.slice(0, 3)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Partner Activity Trend — line chart + data table ──────────────── */}
      {hasPartner && partnerTrendData.length > 0 && (() => {
        const svgH = 160; const svgW = 320; const pad = 10;
        const chartH = svgH - pad * 2; const chartW = svgW - pad * 2;
        const n = partnerTrendData.length;
        const xPos = (i: number) => pad + (i / Math.max(n - 1, 1)) * chartW;
        const yPos = (val: number) => pad + chartH - (val / maxPartnerTrend) * chartH;

        const lines = [
          { key: `${names.a} Lifestyle`, color: C.purple,  dash: false  },
          { key: `${names.a} Income`,    color: C.green,   dash: true   },
          { key: `${names.b} Lifestyle`, color: C.blue,    dash: false  },
          { key: `${names.b} Income`,    color: C.teal,    dash: true   },
        ];
        return (
          <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Partner Activity Trend — Last {trendMonths} Months</div>
              <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>Lifestyle spending and income per partner</div>
            </div>
            <div style={{ padding: '16px 18px', overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', minWidth: n * 60, height: svgH }}>
                {[0.25, 0.5, 0.75, 1].map((r) => (
                  <line key={r} x1={pad} y1={pad + chartH * (1 - r)} x2={svgW - pad} y2={pad + chartH * (1 - r)}
                    stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                ))}
                {lines.map(({ key, color, dash }) => {
                  const pts = partnerTrendData.map((m: any, i: number) => `${xPos(i)},${yPos(m[key] as number || 0)}`).join(' ');
                  return (
                    <g key={key}>
                      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
                        strokeDasharray={dash ? '5 3' : 'none'} strokeLinecap="round" strokeLinejoin="round" />
                      {partnerTrendData.map((m: any, i: number) => {
                        const val = m[key] as number || 0;
                        const x = xPos(i); const y = yPos(val);
                        return (
                          <g key={i}>
                            <circle cx={x} cy={y} r={3} fill={color} />
                            {val > 0 && i === partnerTrendData.length - 1 && (
                              <text x={x - 2} y={y - 7} fontSize="7" fill={color} textAnchor="end" fontWeight="600">
                                {fmt2(val).replace('₹','')}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
                {partnerTrendData.map((m: any, i: number) => (
                  <text key={i} x={xPos(i)} y={svgH - 2} fontSize="8" fill="rgba(255,255,255,0.4)" textAnchor="middle">{m.month.slice(0, 3)}</text>
                ))}
              </svg>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                {lines.map(({ key, color, dash }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                    <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash ? '4 2' : 'none'} /></svg>
                    <span style={{ color: C.text3 }}>{key}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['Month', `${names.a} Income`, `${names.a} Lifestyle`, `${names.a} Invested`, `${names.b} Income`, `${names.b} Lifestyle`, `${names.b} Invested`].map((h) => (
                        <th key={h} style={{ padding: '6px 10px', color: C.text3, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...partnerTrendData].reverse().map((m: any, i: number) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: '7px 10px', color: C.textW, fontWeight: 600 }}>{m.month}</td>
                        <td style={{ padding: '7px 10px', color: C.green, fontWeight: 600 }}>{fmt2(m[`${names.a} Income`])}</td>
                        <td style={{ padding: '7px 10px', color: C.accent }}>{fmt2(m[`${names.a} Lifestyle`])}</td>
                        <td style={{ padding: '7px 10px', color: C.teal }}>{fmt2(m[`${names.a} Invested`])}</td>
                        <td style={{ padding: '7px 10px', color: C.green, fontWeight: 600 }}>{fmt2(m[`${names.b} Income`])}</td>
                        <td style={{ padding: '7px 10px', color: C.blue }}>{fmt2(m[`${names.b} Lifestyle`])}</td>
                        <td style={{ padding: '7px 10px', color: C.purple }}>{fmt2(m[`${names.b} Invested`])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Monthly Investment Trend ───────────────────────────────────────── */}
      {investmentTrendData.some((m: any) => m.total > 0) && (
        <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Monthly Investment Trend</div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
              {investmentTrendData.map((m: any, i: number) => {
                const heightPct = maxInvestmentTrend > 0 ? (m.total / maxInvestmentTrend) * 100 : 0;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
                    {m.total > 0 && (
                      <div style={{ fontSize: 8, color: C.teal, fontWeight: 600, textAlign: 'center', lineHeight: 1, marginBottom: 2, whiteSpace: 'nowrap' }}>
                        {fmt2(m.total).replace('₹','')}
                      </div>
                    )}
                    <div style={{ width: '80%', background: C.teal, borderRadius: '6px 6px 0 0', height: `${heightPct}%`, minHeight: m.total > 0 ? 8 : 0, transition: 'height 0.5s', opacity: 0.85 }} />
                    <div style={{ fontSize: 9, color: C.text3, textAlign: 'center', fontWeight: 500, lineHeight: 1, paddingTop: 4, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.monthLabel.slice(0, 3)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Spending by Category ──────────────────────────────────────────── */}
      {filteredExp.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Spending by Category</div>
          </div>
          <div style={{ padding: '12px 18px' }}>
            {topCats.map(([cat, amt]) => (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 13, color: C.text1, fontWeight: 500 }}>{cat}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.textW }}>{fmt2(amt)}</span>
                </div>
                <div style={{ height: 4, background: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${(amt / maxCat) * 100}%`, height: '100%', background: C.accent, borderRadius: 99, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Asset Allocation — investment breakdown by type ────────────────── */}
      {assetDetailEntries.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Investment Allocation</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>How your investments are distributed across asset types</div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', gap: 2, marginBottom: 16 }}>
              {assetDetailEntries.map(([key, val], i) => (
                <div key={key} style={{ width: `${(val / maxAsset) * 100}%`, background: ASSET_COLORS[i % ASSET_COLORS.length], borderRadius: 99, minWidth: 4 }} />
              ))}
            </div>
            {assetDetailEntries.map(([key, val], i) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: ASSET_COLORS[i % ASSET_COLORS.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.text2 }}>{key}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.textW }}>{fmt2(val)}</span>
                  <span style={{ fontSize: 11, color: C.text3, width: 36, textAlign: 'right' }}>
                    {((val / assetDetailEntries.reduce((s, [, v]) => s + v, 0)) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Joint balance audit modal ─────────────────────────────────────── */}
      {showAudit && isJoint && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowAudit(false)}>
          <div style={{ background: C.surface, borderRadius: 20, padding: '24px', maxWidth: 400, width: '100%', boxShadow: '0 16px 60px rgba(0,0,0,0.7)' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 16 }}>Joint Account Audit</div>
            {[
              { label: 'Total Contributions', value: allTimePool, color: C.green },
              { label: 'Joint Income', value: allTimeJointIncome, color: C.teal },
              { label: 'Total Joint Spent', value: allTimeJointSpent, color: C.red },
              { label: 'Current Balance', value: currentJointBalance, color: currentJointBalance >= 0 ? C.green : C.red },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, color: C.text2 }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color }}>{fmt2(value)}</span>
              </div>
            ))}
            <button onClick={() => setShowAudit(false)}
              style={{ marginTop: 16, width: '100%', background: C.accent, color: '#0a0a0a', border: 'none', borderRadius: 99, padding: '13px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
