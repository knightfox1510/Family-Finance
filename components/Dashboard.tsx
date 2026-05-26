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
  // This ensures Household totals = sum of partner cards + joint, with no gaps.
  const personalLifestyleA = filteredExp.filter((e) => e.account === names.a && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalLifestyleB = filteredExp.filter((e) => e.account === names.b && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const jointLifestyle      = filteredExp.filter((e) => e.account === 'Joint' && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalInvestedA  = filteredExp.filter((e) => e.account === names.a && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalInvestedB  = filteredExp.filter((e) => e.account === names.b && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const jointInvested       = filteredExp.filter((e) => e.account === 'Joint' && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  // Household totals — all three buckets combined
  const trueLifestyleExpenses = personalLifestyleA + personalLifestyleB + jointLifestyle;
  const periodInvested        = personalInvestedA  + personalInvestedB  + jointInvested;
  const periodContrib         = contribA + contribB; // kept for partner card display only

  // Retained = Income − Personal Lifestyle − Joint Lifestyle − Personal Invested − Joint Invested
  // Contribution is NOT subtracted — it's how money enters the pool, not how it leaves.
  // Actual joint pool spending is already captured in jointLifestyle and jointInvested.
  const capitalRetained  = periodIncome - trueLifestyleExpenses - periodInvested;
  const mkPct = (n: number) => periodIncome > 0 ? Math.max(0, Math.min(100, (n / periodIncome) * 100)) : 0;
  const lifestyleRate    = mkPct(trueLifestyleExpenses);
  const investmentRate   = mkPct(periodInvested);
  const retentionRate    = mkPct(Math.max(0, capitalRetained));

  // Per-partner income for the period (income transactions on their account)
  const incomeA = data.expenses.filter((e) => inRange(e) && e.type === 'income' && (e.account === names.a || e.account === 'Partner A')).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const incomeB = data.expenses.filter((e) => inRange(e) && e.type === 'income' && (e.account === names.b || e.account === 'Partner B')).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  // Per-partner retention = income − personal lifestyle − personal invested − joint contrib
  const capitalRetainedA = incomeA - personalLifestyleA - personalInvestedA - contribA;
  const capitalRetainedB = incomeB - personalLifestyleB - personalInvestedB - contribB;
  const mkRate = (num: number, denom: number) => denom > 0 ? Math.max(0, Math.min(100, (num / denom) * 100)) : 0;

  const catMap: Record<string, number> = {};
  filteredExp.filter((e) => !INVESTMENT_CATS.has(e.category)).forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount); });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]); // no limit — show all categories
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
  const neo = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 12, fontWeight: active ? 800 : 500,
    background: active ? C.accent : 'transparent',
    color: active ? '#09090b' : C.text3,
    border: 'none', cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: 'inherit',
  });

  const fmt2 = (n: number) => fmt ? fmt(n) : '₹' + Math.round(n).toLocaleString('en-IN');

  // Quick tray items for top of dashboard
  const quickItems = [
    { icon: '📥', label: 'Income', value: fmt2(periodIncome), color: C.green },
    { icon: '🛒', label: 'Lifestyle', value: fmt2(trueLifestyleExpenses), color: C.accent },
    { icon: '📈', label: 'Invested', value: fmt2(periodInvested), color: C.teal },
    { icon: '💰', label: 'Retained', value: fmt2(Math.max(0, capitalRetained)), color: capitalRetained >= 0 ? C.green : C.red },
    ...(isJoint ? [{ icon: '🏦', label: 'Joint Bal', value: fmt2(currentJointBalance), color: currentJointBalance < 5000 ? C.red : C.teal }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Quick metric tray ─────────────────────────────────────────────── */}
      <div className="neo-tray" style={{ padding: '4px 0 8px' }}>
        {quickItems.map((item) => (
          <div key={item.label} className="neo-tray-card" style={{ minWidth: 100 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', color: item.color, lineHeight: 1 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: '0 1px 8px rgba(0,0,0,0.2)', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          <button onClick={() => setRangeMode('month')}  style={neo(rangeMode === 'month')}>Month</button>
          <button onClick={() => setRangeMode('year')}   style={{ ...neo(rangeMode === 'year'),  borderLeft: `1px solid ${C.border}` }}>Year</button>
          <button onClick={() => setRangeMode('custom')} style={{ ...neo(rangeMode === 'custom'), borderLeft: `1px solid ${C.border}` }}>Custom</button>
        </div>
        {rangeMode === 'month' ? (
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
            className="neo-input" style={{ padding: '6px 10px', fontSize: 12, width: 'auto', minHeight: 'auto' }}>
            {allAvailableMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        ) : rangeMode === 'year' ? (
          <span style={{ fontSize: 12, color: C.text2, fontWeight: 600 }}>{currentYear}</span>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={customDates.start} onChange={(e) => setCustomDates({ ...customDates, start: e.target.value })}
              className="neo-input" style={{ padding: '6px 8px', fontSize: 12, width: 130, minHeight: 'auto' }} />
            <span style={{ color: C.text3, fontSize: 11 }}>to</span>
            <input type="date" value={customDates.end} onChange={(e) => setCustomDates({ ...customDates, end: e.target.value })}
              className="neo-input" style={{ padding: '6px 8px', fontSize: 12, width: 130, minHeight: 'auto' }} />
          </div>
        )}
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
          className="neo-input" style={{ padding: '6px 10px', fontSize: 12, width: 'auto', minHeight: 'auto', marginLeft: 'auto' }}>
          <option value="All">All accounts</option>
          {isJoint && <option value="Joint">Joint only</option>}
          {hasPartner && <option value="PersonalOnly">Personal only</option>}
          <option value={names.a}>{names.a}</option>
          {hasPartner && <option value={names.b}>{names.b}</option>}
        </select>
      </div>

      {/* ── Retention velocity ─────────────────────────────────────────────── */}
      {(() => {
        const hPersonalLife = personalLifestyleA + personalLifestyleB;
        const hJointLife    = isJoint ? jointLifestyle : 0;
        const hInvested     = periodInvested;
        const hTotalOut     = hPersonalLife + hJointLife + hInvested;
        const hOverBudget   = periodIncome > 0 && hTotalOut > periodIncome;
        const hRaw = (n: number) => periodIncome > 0 ? (n / periodIncome) * 100 : 0;
        const hiRaw  = hRaw(hInvested);
        const hjlRaw = hRaw(hJointLife);
        const hPlRaw = hRaw(hPersonalLife);
        const hRetained = Math.max(0, 100 - Math.min(hiRaw + hjlRaw, 100) - hPlRaw);
        return (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: C.neoShadow }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Household Wealth Retention</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: hOverBudget ? C.red : C.green }}>
                {hOverBudget ? `▲ ${(hRaw(hTotalOut) - 100).toFixed(0)}% over` : `${hRetained.toFixed(0)}% retained`}
              </div>
            </div>
            <div style={{ padding: '14px 16px' }}>
              {/* Metric grid */}
              <div className="grid-3" style={{ marginBottom: 14 }}>
                {[
                  { label: 'Income', value: fmt2(periodIncome), color: C.green },
                  { label: 'Personal Lifestyle', value: fmt2(hPersonalLife), color: C.accent },
                  ...(isJoint && hJointLife > 0 ? [{ label: 'Joint Lifestyle', value: fmt2(hJointLife), color: C.orange }] : []),
                  { label: 'Invested', value: fmt2(hInvested), color: C.teal },
                  { label: 'Retained', value: fmt2(Math.max(0, capitalRetained)), color: capitalRetained >= 0 ? C.green : C.red },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: C.surface2, border: `1px solid ${C.border}`, padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.03em', color }}>{value}</div>
                  </div>
                ))}
              </div>
              {/* Stacked bar */}
              {periodIncome > 0 && (
                <div>
                  <div style={{ display: 'flex', height: 8, overflow: 'hidden', gap: 1, marginBottom: 8 }}>
                    {hiRaw > 0 && <div title={`Invested: ${hiRaw.toFixed(0)}%`} style={{ width: `${Math.min(hiRaw, 100)}%`, background: C.teal, transition: 'width 0.5s' }} />}
                    {isJoint && hjlRaw > 0 && <div title={`Joint Lifestyle: ${hjlRaw.toFixed(0)}%`} style={{ width: `${Math.min(hjlRaw, 100 - Math.min(hiRaw, 100))}%`, background: C.orange, transition: 'width 0.5s' }} />}
                    {hRetained > 0 && <div title={`Retained: ${hRetained.toFixed(0)}%`} style={{ width: `${hRetained}%`, background: C.green, transition: 'width 0.5s' }} />}
                    {hPlRaw > 0 && <div title={`Lifestyle: ${hPlRaw.toFixed(0)}%`} style={{ flex: 1, background: hOverBudget ? C.red : C.accent, transition: 'width 0.5s' }} />}
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Invested', color: C.teal, pct: hiRaw, show: hiRaw > 0 },
                      { label: 'Joint Lifestyle', color: C.orange, pct: hjlRaw, show: isJoint && hjlRaw > 0 },
                      { label: 'Retained', color: C.green, pct: hRetained, show: hRetained > 0 },
                      { label: 'Personal Lifestyle', color: hOverBudget ? C.red : C.accent, pct: hPlRaw, show: hPlRaw > 0 },
                    ].filter((s) => s.show).map(({ label, color, pct }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                        <div style={{ width: 8, height: 8, background: color }} />
                        <span style={{ color: C.text3 }}>{label}</span>
                        <span style={{ color: C.textW, fontWeight: 700 }}>{pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Partner Activity cards ─────────────────────────────────────────── */}
      {hasPartner && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
          {([
            { name: names.a, lifestyle: personalLifestyleA, invested: personalInvestedA, contrib: contribA, income: incomeA, retained: capitalRetainedA, show: true },
            { name: names.b, lifestyle: personalLifestyleB, invested: personalInvestedB, contrib: contribB, income: incomeB, retained: capitalRetainedB, show: hasPartner },
          ] as any[]).filter((p) => p.show).map((p) => {
            const totalOut     = p.lifestyle + p.invested + (isJoint ? p.contrib : 0);
            const isOver       = p.income > 0 && totalOut > p.income;
            const pRaw = (n: number) => p.income > 0 ? (n / p.income) * 100 : 0;
            const iRaw = pRaw(p.invested), cRaw = isJoint ? pRaw(p.contrib) : 0;
            const nonLife = Math.min(iRaw + cRaw, 100);
            const lRaw = pRaw(p.lifestyle);
            const retained = Math.max(0, 100 - nonLife - lRaw);
            return (
              <div key={p.name} style={{ background: C.surface, border: `1px solid ${isOver ? C.red : C.border}`, boxShadow: C.neoShadow }}>
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.02em', color: C.textW }}>{p.name}</div>
                  {p.income > 0 && <div style={{ fontSize: 11, color: isOver ? C.red : C.text3 }}>
                    {fmt2(totalOut)} of {fmt2(p.income)}
                  </div>}
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div className="grid-3" style={{ gap: 6, marginBottom: 12 }}>
                    {[
                      { label: 'Income', value: fmt2(p.income), color: C.green },
                      { label: 'Lifestyle', value: fmt2(p.lifestyle), color: C.accent },
                      { label: 'Invested', value: fmt2(p.invested), color: C.teal },
                      ...(isJoint ? [{ label: 'Joint Pool', value: fmt2(p.contrib), color: C.orange }] : []),
                      { label: 'Retained', value: fmt2(p.retained), color: p.retained >= 0 ? C.green : C.red },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: C.surface2, border: `1px solid ${C.border}`, padding: '8px 10px' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {p.income > 0 && (
                    <div style={{ display: 'flex', height: 6, overflow: 'hidden', gap: 1 }}>
                      {iRaw > 0 && <div style={{ width: `${Math.min(iRaw, 100)}%`, background: C.teal }} />}
                      {cRaw > 0 && <div style={{ width: `${Math.min(cRaw, 100 - Math.min(iRaw, 100))}%`, background: C.orange }} />}
                      {retained > 0 && <div style={{ width: `${retained}%`, background: C.green }} />}
                      {lRaw > 0 && <div style={{ flex: 1, background: isOver ? C.red : C.accent }} />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Category breakdown ─────────────────────────────────────────────── */}
      {filteredExp.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: C.neoShadow }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Spending by Category</div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {(() => {
              const byCat: Record<string, number> = {};
              filteredExp.filter((e) => !INVESTMENT_CATS.has(e.category)).forEach((e) => {
                byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount ?? 0);
              });
              const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
              const maxCat = sorted[0]?.[1] || 1;
              return sorted.map(([cat, amt]) => (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: C.text1, fontWeight: 600 }}>{cat}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.textW }}>{fmt2(amt)}</span>
                  </div>
                  <div style={{ height: 4, background: C.surface2, border: `1px solid ${C.border}` }}>
                    <div style={{ width: `${(amt / maxCat) * 100}%`, height: '100%', background: C.accent, transition: 'width 0.5s' }} />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ── Trend chart (bar) ──────────────────────────────────────────────── */}
      {lifestyleTrendData.some((m) => m.total > 0) && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: C.neoShadow }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Monthly Lifestyle Trend</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[6, 12].map((n) => (
                <button key={n} onClick={() => setTrendMonths(n)}
                  style={{ padding: '3px 10px', fontSize: 11, fontWeight: trendMonths === n ? 800 : 400, background: trendMonths === n ? C.accent : 'transparent', color: trendMonths === n ? '#09090b' : C.text3, border: `1px solid ${trendMonths === n ? C.accent : C.border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {n}M
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: '16px', display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
            {lifestyleTrendData.map((m, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', background: C.accent, height: `${(m.total / maxLifestyleTrend) * 100}%`, minHeight: m.total > 0 ? 4 : 0, transition: 'height 0.5s' }} />
                <div style={{ fontSize: 8, color: C.text3, textAlign: 'center', transform: 'rotate(-45deg)', transformOrigin: 'center', whiteSpace: 'nowrap' }}>{m.monthLabel}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Partner Activity Trend ──────────────────────────────────────────── */}
      {hasPartner && partnerTrendData.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Partner Activity Trend</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: C.purple }} />{names.a}</span>
              {hasPartner && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: C.blue }} />{names.b}</span>}
            </div>
          </div>
          <div style={{ padding: '16px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, minWidth: partnerTrendData.length * 60 }}>
              {partnerTrendData.map((m: any, i: number) => {
                const aVal = (m[names.a + ' Lifestyle'] as number || 0) + (m[names.a + ' Invested'] as number || 0);
                const bVal = (m[names.b + ' Lifestyle'] as number || 0) + (m[names.b + ' Invested'] as number || 0);
                const maxVal = Math.max(1, maxPartnerTrend);
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end', minWidth: 50 }}>
                    <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: '80%' }}>
                      <div style={{ flex: 1, background: C.purple, borderRadius: '4px 4px 0 0', height: `${(aVal / maxVal) * 100}%`, minHeight: aVal > 0 ? 4 : 0, transition: 'height 0.5s', opacity: 0.85 }} />
                      {hasPartner && <div style={{ flex: 1, background: C.blue, borderRadius: '4px 4px 0 0', height: `${(bVal / maxVal) * 100}%`, minHeight: bVal > 0 ? 4 : 0, transition: 'height 0.5s', opacity: 0.85 }} />}
                    </div>
                    <div style={{ fontSize: 8, color: C.text3, textAlign: 'center', whiteSpace: 'nowrap' }}>{m.month.slice(0, 3)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Monthly Investment Trend ──────────────────────────────────────────── */}
      {investmentTrendData.some((m: any) => m.total > 0) && (
        <div style={{ background: C.surface, borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Monthly Investment Trend</div>
          </div>
          <div style={{ padding: '16px', display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
            {investmentTrendData.map((m: any, i: number) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', background: C.teal, borderRadius: '4px 4px 0 0', height: `${(m.total / maxInvestmentTrend) * 100}%`, minHeight: m.total > 0 ? 4 : 0, transition: 'height 0.5s' }} />
                <div style={{ fontSize: 8, color: C.text3, textAlign: 'center', whiteSpace: 'nowrap' }}>{m.monthLabel.slice(0, 3)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Asset Allocation ──────────────────────────────────────────────────── */}
      {periodIncome > 0 && (
        <div style={{ background: C.surface, borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Asset Allocation Breakdown</div>
          </div>
          <div style={{ padding: '16px' }}>
            {(() => {
              const items = [
                { label: 'Personal Lifestyle', value: personalLifestyleA + personalLifestyleB, color: C.accent, icon: '🛒' },
                ...(isJoint ? [{ label: 'Joint Expenses', value: jointLifestyle, color: C.orange, icon: '🏠' }] : []),
                { label: 'Investments', value: periodInvested, color: C.teal, icon: '📈' },
                { label: 'Retained', value: Math.max(0, capitalRetained), color: C.green, icon: '💰' },
              ].filter((i) => i.value > 0);
              const total = items.reduce((s, i) => s + i.value, 0) || 1;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Donut-style allocation bar */}
                  <div style={{ height: 10, borderRadius: 99, overflow: 'hidden', display: 'flex', gap: 2 }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ width: `${(item.value / total) * 100}%`, background: item.color, borderRadius: i === 0 ? '99px 0 0 99px' : i === items.length - 1 ? '0 99px 99px 0' : 0 }} />
                    ))}
                  </div>
                  {/* Legend */}
                  {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: C.text2 }}>{item.icon} {item.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.textW }}>{fmt2(item.value)}</span>
                        <span style={{ fontSize: 11, color: C.text3, width: 36, textAlign: 'right' }}>{((item.value / total) * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Joint balance audit modal ─────────────────────────────────────── */}
      {showAudit && isJoint && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowAudit(false)}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: '6px 6px 0px #000', padding: '24px', maxWidth: 400, width: '100%' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 16 }}>Joint Account Audit</div>
            {[
              { label: 'Total Contributions', value: allTimePool, color: C.green },
              { label: 'Joint Income', value: allTimeJointIncome, color: C.teal },
              { label: 'Total Joint Spent', value: allTimeJointSpent, color: C.red },
              { label: 'Current Balance', value: currentJointBalance, color: currentJointBalance >= 0 ? C.green : C.red },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, color: C.text2 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color }}>{fmt2(value)}</span>
              </div>
            ))}
            <button onClick={() => setShowAudit(false)}
              style={{ marginTop: 16, width: '100%', background: C.accent, color: '#09090b', border: '1px solid #000', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', padding: '12px', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', WebkitAppearance: 'none' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
