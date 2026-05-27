'use client';
import React, { useState, useMemo } from 'react';
import type { AppData } from '@/types';
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

// ─── Shared card header ───────────────────────────────────────────────────────
function CardHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: C.text3, marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ─── Metric tile used inside cards ───────────────────────────────────────────
function MetricTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: C.surface2, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.03em', color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

// ─── Allocation pill-bar ──────────────────────────────────────────────────────
function AllocBar({ segments }: { segments: { color: string; pct: number; fill?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', gap: 2 }}>
      {segments.map((s, i) =>
        s.fill
          ? <div key={i} style={{ flex: 1, background: s.color, borderRadius: 99 }} />
          : s.pct > 0
            ? <div key={i} style={{ width: `${s.pct}%`, background: s.color, borderRadius: 99 }} />
            : null
      )}
    </div>
  );
}

// ─── Legend for allocation bars ───────────────────────────────────────────────
function AllocLegend({ items }: { items: { label: string; color: string; pct: number }[] }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
      {items.filter(x => x.pct > 0).map(x => (
        <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: x.color }} />
          <span style={{ color: C.text3 }}>{x.label}</span>
          <span style={{ color: C.textW, fontWeight: 700 }}>{x.pct.toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}

// ─── Partner avatar circle ────────────────────────────────────────────────────
const PARTNER_COLORS = ['var(--purple)', 'var(--blue)'] as const;

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%', background: color, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#0a0a0a', fontWeight: 900, fontSize: 13,
    }}>
      {name[0].toUpperCase()}
    </div>
  );
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
  const [trendMonths, setTrendMonths] = useState(6);

  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const mode  = data.settings.householdMode ?? 'joint';
  const isJoint    = mode === 'joint';
  const hasPartner = mode !== 'solo';

  const allAvailableMonths = [...new Set(data.expenses.map((e) => monthKey(e.date)))].sort().reverse();

  const uniqueContributions = Array.from(new Map(data.contributions.map((c) => [c.month, c])).values());
  const allTimePool         = uniqueContributions.reduce((s, c) => s + Number(c.partnerA ?? 0) + Number(c.partnerB ?? 0), 0);
  const allTimeJointIncome  = data.expenses.filter((e) => e.account === 'Joint' && e.type === 'income').reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const allTimeJointSpent   = data.expenses.filter((e) => e.account === 'Joint' && e.type !== 'income').reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const currentJointBalance = allTimePool + allTimeJointIncome - allTimeJointSpent;

  const currentYear = String(d.getFullYear());
  const inRange = (e: any) => {
    if (rangeMode === 'month') return monthKey(e.date) === selectedMonth;
    if (rangeMode === 'year')  return e.date.startsWith(currentYear);
    return e.date >= customDates.start && e.date <= customDates.end;
  };

  let contribA = 0, contribB = 0;
  if (rangeMode === 'month') {
    const pc = uniqueContributions.find((c) => c.month === selectedMonth);
    if (pc) { contribA = Number(pc.partnerA ?? 0); contribB = Number(pc.partnerB ?? 0); }
  } else if (rangeMode === 'year') {
    const yc = uniqueContributions.filter((c) => c.month.startsWith(currentYear));
    contribA = yc.reduce((s, c) => s + Number(c.partnerA ?? 0), 0);
    contribB = yc.reduce((s, c) => s + Number(c.partnerB ?? 0), 0);
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
  const last6Months = trendMonthKeys;

  const partnerTrendData = last6Months.map((mKey) => {
    const mExp    = data.expenses.filter((e) => monthKey(e.date) === mKey && e.type !== 'income');
    const mInc    = data.expenses.filter((e) => monthKey(e.date) === mKey && e.type === 'income');
    const mContrib = uniqueContributions.find((c) => c.month === mKey);
    const lA  = mExp.filter((e) => (e.account === names.a || e.account === 'Partner A') && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount), 0);
    const lB  = mExp.filter((e) => (e.account === names.b || e.account === 'Partner B') && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount), 0);
    const iA  = mExp.filter((e) => (e.account === names.a || e.account === 'Partner A') && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount), 0);
    const iB  = mExp.filter((e) => (e.account === names.b || e.account === 'Partner B') && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount), 0);
    const incA = mInc.filter((e) => e.account === names.a || e.account === 'Partner A').reduce((s, e) => s + Number(e.amount), 0);
    const incB = mInc.filter((e) => e.account === names.b || e.account === 'Partner B').reduce((s, e) => s + Number(e.amount), 0);
    return {
      month: monthLabel(mKey),
      [`${names.a} Lifestyle`]: lA, [`${names.a} Invested`]: iA, [`${names.a} Income`]: incA,
      [`${names.b} Lifestyle`]: lB, [`${names.b} Invested`]: iB, [`${names.b} Income`]: incB,
      contribA: Number(mContrib?.partnerA ?? 0), contribB: Number(mContrib?.partnerB ?? 0),
    };
  });
  const maxPartnerTrend = Math.max(1, ...partnerTrendData.map((m) =>
    Math.max(
      m[`${names.a} Income`] as number, m[`${names.b} Income`] as number,
      (m[`${names.a} Lifestyle`] as number) + (m[`${names.a} Invested`] as number) + m.contribA,
      (m[`${names.b} Lifestyle`] as number) + (m[`${names.b} Invested`] as number) + m.contribB,
    )
  ));

  const lifestyleTrendData  = last6Months.map((mKey) => ({
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

  const personalLifestyleA = filteredExp.filter((e) => e.account === names.a && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalLifestyleB = filteredExp.filter((e) => e.account === names.b && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const jointLifestyle      = filteredExp.filter((e) => e.account === 'Joint' && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalInvestedA  = filteredExp.filter((e) => e.account === names.a && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalInvestedB  = filteredExp.filter((e) => e.account === names.b && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const jointInvested       = filteredExp.filter((e) => e.account === 'Joint' && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  const trueLifestyleExpenses = personalLifestyleA + personalLifestyleB + jointLifestyle;
  const periodInvested        = personalInvestedA  + personalInvestedB  + jointInvested;
  const capitalRetained       = periodIncome - trueLifestyleExpenses - periodInvested;

  const incomeA = data.expenses.filter((e) => inRange(e) && e.type === 'income' && (e.account === names.a || e.account === 'Partner A')).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const incomeB = data.expenses.filter((e) => inRange(e) && e.type === 'income' && (e.account === names.b || e.account === 'Partner B')).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  const capitalRetainedA = incomeA - personalLifestyleA - personalInvestedA - contribA;
  const capitalRetainedB = incomeB - personalLifestyleB - personalInvestedB - contribB;

  const catMap: Record<string, number> = {};
  filteredExp.filter((e) => !INVESTMENT_CATS.has(e.category)).forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount); });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const maxCat  = topCats[0]?.[1] || 1;

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
  const totalInvested = assetDetailEntries.reduce((s, [, v]) => s + v, 0);
  const ASSET_COLORS  = [C.teal, C.green, C.purple, C.blue, C.amber, '#ec4899'];

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

  const fmt2 = (n: number) => fmt ? fmt(n) : '₹' + Math.round(n).toLocaleString('en-IN');

  // Allocation percentages for the hero bar
  const inv  = periodIncome > 0 ? (periodInvested / periodIncome) * 100 : 0;
  const jl   = isJoint && periodIncome > 0 ? (jointLifestyle / periodIncome) * 100 : 0;
  const pl   = periodIncome > 0 ? ((personalLifestyleA + personalLifestyleB) / periodIncome) * 100 : 0;
  const ret  = Math.max(0, 100 - Math.min(inv + jl, 100) - pl);

  const periodLabel = rangeMode === 'month' ? monthLabel(selectedMonth)
    : rangeMode === 'year' ? currentYear
    : `${customDates.start} → ${customDates.end}`;

  const hasLifestyleTrend  = lifestyleTrendData.some((m) => m.total > 0);
  const hasInvestmentTrend = investmentTrendData.some((m: any) => m.total > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Period filter ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Pill group */}
          <div style={{ display: 'flex', background: C.surface, borderRadius: 99, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {(['month', 'year', 'custom'] as const).map((m) => (
              <button key={m} onClick={() => setRangeMode(m)} style={{
                padding: '7px 16px', fontSize: 12, border: 'none', cursor: 'pointer', borderRadius: 99, transition: 'all 0.15s',
                fontWeight: rangeMode === m ? 700 : 500, textTransform: 'capitalize',
                background: rangeMode === m ? C.accent : 'transparent',
                color: rangeMode === m ? '#0a0a0a' : C.text3,
              }}>{m}</button>
            ))}
          </div>
          {rangeMode === 'month' && (
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 99, padding: '7px 14px', fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer' }}>
              {allAvailableMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}
          {rangeMode === 'year' && (
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text2, padding: '7px 14px', background: C.surface, borderRadius: 99, border: `1px solid ${C.border}` }}>{currentYear}</span>
          )}
          {rangeMode === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={customDates.start} onChange={(e) => setCustomDates({ ...customDates, start: e.target.value })}
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 10, padding: '7px 10px', fontSize: 12, outline: 'none' }} />
              <span style={{ color: C.text3, fontSize: 11, fontWeight: 700 }}>→</span>
              <input type="date" value={customDates.end} onChange={(e) => setCustomDates({ ...customDates, end: e.target.value })}
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 10, padding: '7px 10px', fontSize: 12, outline: 'none' }} />
            </div>
          )}
        </div>
        {/* Account filter */}
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: accountFilter === 'All' ? C.text2 : C.textW, borderRadius: 99, padding: '8px 16px', fontSize: 12, fontWeight: 500, outline: 'none', cursor: 'pointer', width: '100%' }}>
          <option value="All">All accounts</option>
          {isJoint    && <option value="Joint">Joint only</option>}
          {hasPartner && <option value="PersonalOnly">Personal only</option>}
          <option value={names.a}>{names.a}</option>
          {hasPartner && <option value={names.b}>{names.b}</option>}
        </select>
      </div>

      {/* ── Hero Wealth Strip ─────────────────────────────────────────────── */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '22px 18px 18px', boxShadow: 'var(--shadow-md)' }}>
        {/* Big retained number */}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>
            Household Retained
          </div>
          <div style={{
            fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            color: capitalRetained >= 0 ? C.green : C.red,
          }}>
            {fmt2(Math.max(0, capitalRetained))}
          </div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 6 }}>
            {periodIncome > 0
              ? `${((Math.max(0, capitalRetained) / periodIncome) * 100).toFixed(0)}% of income retained · ${periodLabel}`
              : `No income logged · ${periodLabel}`}
          </div>
        </div>

        {/* 4-metric 2×2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 1, background: C.border, borderRadius: 16, overflow: 'hidden' }}>
          {[
            { label: 'Income',    value: fmt2(periodIncome),                                color: C.green,                                          sub: 'Combined' },
            { label: 'Lifestyle', value: fmt2(trueLifestyleExpenses),                       color: C.accent,                                         sub: 'Total spend' },
            { label: 'Invested',  value: fmt2(periodInvested),                              color: C.teal,                                           sub: 'This period' },
            { label: 'Retained',  value: fmt2(Math.max(0, capitalRetained)),                color: capitalRetained >= 0 ? C.green : C.red,           sub: capitalRetained >= 0 ? 'Saved' : 'Over budget' },
          ].map((item) => (
            <div key={item.label} style={{ background: C.surface2, padding: '15px 17px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.text3, marginBottom: 7 }}>{item.label}</div>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: item.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
              <div style={{ fontSize: 10, color: C.text3, marginTop: 3 }}>{item.sub}</div>
            </div>
          ))}
        </div>

        {/* Joint pool balance — full-width strip */}
        {isJoint && (
          <div style={{ marginTop: 1, background: C.surface2, borderRadius: '0 0 16px 16px', padding: '12px 17px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>Joint Pool Balance</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: currentJointBalance < 5000 ? C.red : C.teal }}>{fmt2(currentJointBalance)}</div>
            </div>
            <button onClick={() => setShowAudit(true)}
              style={{ background: C.accentBg, border: 'none', color: C.accent, borderRadius: 99, padding: '9px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s' }}>
              Audit →
            </button>
          </div>
        )}

        {/* Allocation bar */}
        {periodIncome > 0 && (
          <div style={{ marginTop: 16 }}>
            <AllocBar segments={[
              { color: C.teal,   pct: inv },
              { color: C.orange, pct: jl,  fill: false },
              { color: C.green,  pct: ret },
              { color: capitalRetained < 0 ? C.red : C.accent, pct: pl, fill: true },
            ]} />
            <AllocLegend items={[
              { label: 'Invested',  color: C.teal,   pct: inv },
              { label: 'Joint',     color: C.orange, pct: isJoint ? jl : 0 },
              { label: 'Retained',  color: C.green,  pct: ret },
              { label: 'Lifestyle', color: capitalRetained < 0 ? C.red : C.accent, pct: pl },
            ]} />
          </div>
        )}
      </div>

      {/* ── Partner Cards ─────────────────────────────────────────────────── */}
      {hasPartner && (() => {
        const partners = [
          { name: names.a, income: incomeA, lifestyle: personalLifestyleA, invested: personalInvestedA, contrib: contribA, retained: capitalRetainedA, color: PARTNER_COLORS[0] },
          { name: names.b, income: incomeB, lifestyle: personalLifestyleB, invested: personalInvestedB, contrib: contribB, retained: capitalRetainedB, color: PARTNER_COLORS[1] },
        ];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
            {partners.map((p) => {
              const totalOut = p.lifestyle + p.invested + (isJoint ? p.contrib : 0);
              const isOver   = p.income > 0 && totalOut > p.income;
              const pRaw = (n: number) => p.income > 0 ? (n / p.income) * 100 : 0;
              const iRaw = pRaw(p.invested), cRaw = isJoint ? pRaw(p.contrib) : 0, lRaw = pRaw(p.lifestyle);
              const retPct = Math.max(0, 100 - Math.min(iRaw + cRaw, 100) - lRaw);
              return (
                <div key={p.name} style={{
                  background: C.surface, borderRadius: 20, overflow: 'hidden',
                  boxShadow: isOver ? `0 0 0 2px ${C.red}, var(--shadow-md)` : 'var(--shadow-md)',
                }}>
                  {/* Header with avatar */}
                  <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={p.name} color={p.color} />
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.textW }}>{p.name}</div>
                    </div>
                    {p.income > 0 && (
                      <div style={{ fontSize: 11, color: isOver ? C.red : C.text3, fontVariantNumeric: 'tabular-nums' }}>
                        {fmt2(totalOut)} of {fmt2(p.income)}
                      </div>
                    )}
                  </div>
                  {/* Metrics + bar */}
                  <div style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 12 }}>
                      <MetricTile label="Income"    value={fmt2(p.income)}                     color={C.green}  />
                      <MetricTile label="Lifestyle" value={fmt2(p.lifestyle)}                  color={C.accent} />
                      <MetricTile label="Invested"  value={fmt2(p.invested)}                   color={C.teal}   />
                      {isJoint && <MetricTile label="Joint Pool" value={fmt2(p.contrib)}        color={C.orange} />}
                      <MetricTile label="Retained"  value={fmt2(Math.max(0, p.retained))}      color={p.retained >= 0 ? C.green : C.red} />
                    </div>
                    {p.income > 0 && (
                      <AllocBar segments={[
                        { color: C.teal,   pct: Math.min(iRaw, 100) },
                        { color: C.orange, pct: Math.min(cRaw, 100 - Math.min(iRaw, 100)) },
                        { color: C.green,  pct: retPct },
                        { color: isOver ? C.red : C.accent, pct: lRaw, fill: true },
                      ]} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Household Wealth Retention Breakdown ──────────────────────────── */}
      {periodIncome > 0 && (() => {
        const hPersonalLife = personalLifestyleA + personalLifestyleB;
        const hJointLife    = isJoint ? jointLifestyle : 0;
        const hInvested     = periodInvested;
        const hTotalOut     = hPersonalLife + hJointLife + hInvested;
        const hOverBudget   = hTotalOut > periodIncome;
        const hRaw = (n: number) => (n / periodIncome) * 100;
        const hiRaw = hRaw(hInvested), hjlRaw = hRaw(hJointLife), hPlRaw = hRaw(hPersonalLife);
        const hRetained = Math.max(0, 100 - Math.min(hiRaw + hjlRaw, 100) - hPlRaw);
        return (
          <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
            <CardHeader
              title="Wealth Retention Breakdown"
              right={
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: hOverBudget ? C.red : C.green,
                  background: hOverBudget ? C.redBg : C.greenBg,
                  padding: '4px 12px', borderRadius: 99,
                }}>
                  {hOverBudget ? `▲ ${(hRaw(hTotalOut) - 100).toFixed(0)}% over` : `${hRetained.toFixed(0)}% retained`}
                </span>
              }
            />
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 14 }}>
                {([
                  { label: 'Income',             value: fmt2(periodIncome),                         color: C.green  },
                  { label: 'Personal Lifestyle',  value: fmt2(hPersonalLife),                        color: C.accent },
                  ...(isJoint && hJointLife > 0 ? [{ label: 'Joint Lifestyle', value: fmt2(hJointLife), color: C.orange }] : []),
                  { label: 'Total Invested',      value: fmt2(hInvested),                            color: C.teal   },
                  { label: 'Retained',            value: fmt2(Math.max(0, capitalRetained)),         color: capitalRetained >= 0 ? C.green : C.red },
                ] as { label: string; value: string; color: string }[]).map(({ label, value, color }) => (
                  <div key={label} style={{ background: C.surface2, borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', gap: 2, marginBottom: 8 }}>
                {hiRaw  > 0 && <div style={{ width: `${Math.min(hiRaw, 100)}%`,                       background: C.teal,                        borderRadius: 99 }} />}
                {isJoint && hjlRaw > 0 && <div style={{ width: `${Math.min(hjlRaw, 100 - Math.min(hiRaw, 100))}%`, background: C.orange, borderRadius: 99 }} />}
                {hRetained > 0 && <div style={{ width: `${hRetained}%`,                               background: C.green,                       borderRadius: 99 }} />}
                {hPlRaw > 0 && <div style={{ flex: 1, background: hOverBudget ? C.red : C.accent,    borderRadius: 99 }} />}
              </div>
              <AllocLegend items={[
                { label: 'Invested',  color: C.teal,                            pct: hiRaw },
                { label: 'Joint',     color: C.orange,                          pct: isJoint ? hjlRaw : 0 },
                { label: 'Retained',  color: C.green,                           pct: hRetained },
                { label: 'Lifestyle', color: hOverBudget ? C.red : C.accent,    pct: hPlRaw },
              ]} />
            </div>
          </div>
        );
      })()}

      {/* ── Trend window selector ─────────────────────────────────────────── */}
      {(hasLifestyleTrend || hasInvestmentTrend) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Trend Window</div>
          <div style={{ display: 'flex', background: C.surface, borderRadius: 99, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {[3, 6, 12].map((n) => (
              <button key={n} onClick={() => setTrendMonths(n)} style={{
                padding: '6px 14px', fontSize: 11, border: 'none', cursor: 'pointer', borderRadius: 99, transition: 'all 0.15s',
                fontWeight: trendMonths === n ? 700 : 400,
                background: trendMonths === n ? C.accent : 'transparent',
                color: trendMonths === n ? '#0a0a0a' : C.text3,
              }}>{n}M</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Monthly Lifestyle Trend ────────────────────────────────────────── */}
      {hasLifestyleTrend && (
        <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
          <CardHeader title="Monthly Lifestyle Trend" />
          <div style={{ padding: '18px 18px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
              {lifestyleTrendData.map((m, i) => {
                const heightPct = (m.total / maxLifestyleTrend) * 100;
                const isLatest  = i === lifestyleTrendData.length - 1;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
                    {m.total > 0 && (
                      <div style={{ fontSize: 8, color: isLatest ? C.accent : C.text3, fontWeight: 600, textAlign: 'center', lineHeight: 1, marginBottom: 2, whiteSpace: 'nowrap' }}>
                        {fmt2(m.total).replace('₹', '')}
                      </div>
                    )}
                    <div style={{
                      width: '75%', borderRadius: '6px 6px 0 0',
                      height: `${heightPct}%`, minHeight: m.total > 0 ? 6 : 0,
                      background: C.accent, opacity: isLatest ? 1 : 0.45,
                      transition: 'height 0.5s cubic-bezier(0.4,0,0.2,1)',
                    }} />
                    <div style={{ fontSize: 9, fontWeight: isLatest ? 700 : 500, color: isLatest ? C.textW : C.text3, textAlign: 'center', lineHeight: 1, paddingTop: 4, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.monthLabel.slice(0, 3)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Partner Activity Trend ────────────────────────────────────────── */}
      {hasPartner && partnerTrendData.length > 0 && (() => {
        const svgH = 160, svgW = 320, pad = 10;
        const chartH = svgH - pad * 2, chartW = svgW - pad * 2;
        const n = partnerTrendData.length;
        const xPos = (i: number) => pad + (i / Math.max(n - 1, 1)) * chartW;
        const yPos = (val: number) => pad + chartH - (val / maxPartnerTrend) * chartH;
        const lines = [
          { key: `${names.a} Lifestyle`, color: C.purple, dash: false },
          { key: `${names.a} Income`,    color: C.green,  dash: true  },
          { key: `${names.b} Lifestyle`, color: C.blue,   dash: false },
          { key: `${names.b} Income`,    color: C.teal,   dash: true  },
        ];
        return (
          <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
            <CardHeader title={`Partner Activity · Last ${trendMonths}M`} sub="Lifestyle spend and income per partner" />
            <div style={{ padding: '16px 18px', overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', minWidth: n * 60, height: svgH }}>
                {[0.25, 0.5, 0.75, 1].map((r) => (
                  <line key={r} x1={pad} y1={pad + chartH * (1 - r)} x2={svgW - pad} y2={pad + chartH * (1 - r)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                ))}
                {lines.map(({ key, color, dash }) => {
                  const pts = partnerTrendData.map((m: any, i: number) => `${xPos(i)},${yPos(m[key] as number || 0)}`).join(' ');
                  return (
                    <g key={key}>
                      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
                        strokeDasharray={dash ? '5 3' : 'none'} strokeLinecap="round" strokeLinejoin="round" />
                      {partnerTrendData.map((m: any, i: number) => {
                        const val = m[key] as number || 0;
                        const x = xPos(i), y = yPos(val);
                        return (
                          <g key={i}>
                            <circle cx={x} cy={y} r={3} fill={color} />
                            {val > 0 && i === partnerTrendData.length - 1 && (
                              <text x={x - 2} y={y - 7} fontSize="7" fill={color} textAnchor="end" fontWeight="600">
                                {fmt2(val).replace('₹', '')}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
                {partnerTrendData.map((m: any, i: number) => (
                  <text key={i} x={xPos(i)} y={svgH - 2} fontSize="8" fill="rgba(255,255,255,0.35)" textAnchor="middle">{m.month.slice(0, 3)}</text>
                ))}
              </svg>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
                {lines.map(({ key, color, dash }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                    <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash ? '4 2' : 'none'} /></svg>
                    <span style={{ color: C.text3 }}>{key}</span>
                  </div>
                ))}
              </div>
              {/* Data table */}
              <div style={{ marginTop: 16, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['Month', `${names.a} Inc`, `${names.a} Life`, `${names.a} Inv`, `${names.b} Inc`, `${names.b} Life`, `${names.b} Inv`].map((h) => (
                        <th key={h} style={{ padding: '6px 8px', color: C.text3, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...partnerTrendData].reverse().map((m: any, i: number) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: '7px 8px', color: C.textW, fontWeight: 600 }}>{m.month}</td>
                        <td style={{ padding: '7px 8px', color: C.green,  fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt2(m[`${names.a} Income`])}</td>
                        <td style={{ padding: '7px 8px', color: C.accent, fontVariantNumeric: 'tabular-nums' }}>{fmt2(m[`${names.a} Lifestyle`])}</td>
                        <td style={{ padding: '7px 8px', color: C.teal,   fontVariantNumeric: 'tabular-nums' }}>{fmt2(m[`${names.a} Invested`])}</td>
                        <td style={{ padding: '7px 8px', color: C.green,  fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt2(m[`${names.b} Income`])}</td>
                        <td style={{ padding: '7px 8px', color: C.blue,   fontVariantNumeric: 'tabular-nums' }}>{fmt2(m[`${names.b} Lifestyle`])}</td>
                        <td style={{ padding: '7px 8px', color: C.purple, fontVariantNumeric: 'tabular-nums' }}>{fmt2(m[`${names.b} Invested`])}</td>
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
      {hasInvestmentTrend && (
        <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
          <CardHeader title="Monthly Investment Trend" />
          <div style={{ padding: '18px 18px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
              {investmentTrendData.map((m: any, i: number) => {
                const heightPct = (m.total / maxInvestmentTrend) * 100;
                const isLatest  = i === investmentTrendData.length - 1;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
                    {m.total > 0 && (
                      <div style={{ fontSize: 8, color: isLatest ? C.teal : C.text3, fontWeight: 600, textAlign: 'center', lineHeight: 1, marginBottom: 2, whiteSpace: 'nowrap' }}>
                        {fmt2(m.total).replace('₹', '')}
                      </div>
                    )}
                    <div style={{
                      width: '75%', borderRadius: '6px 6px 0 0',
                      height: `${heightPct}%`, minHeight: m.total > 0 ? 6 : 0,
                      background: C.teal, opacity: isLatest ? 1 : 0.45,
                      transition: 'height 0.5s cubic-bezier(0.4,0,0.2,1)',
                    }} />
                    <div style={{ fontSize: 9, fontWeight: isLatest ? 700 : 500, color: isLatest ? C.textW : C.text3, textAlign: 'center', lineHeight: 1, paddingTop: 4, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      {filteredExp.length > 0 && topCats.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
          <CardHeader title="Spending by Category" />
          <div style={{ padding: '14px 18px' }}>
            {topCats.map(([cat, amt]) => (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: C.text1, fontWeight: 500 }}>{cat}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.textW, fontVariantNumeric: 'tabular-nums' }}>{fmt2(amt)}</span>
                </div>
                <div style={{ height: 4, background: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${(amt / maxCat) * 100}%`, height: '100%', background: C.accent, borderRadius: 99, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Investment Allocation ─────────────────────────────────────────── */}
      {assetDetailEntries.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
          <CardHeader title="Investment Allocation" sub="Distribution across asset types" />
          <div style={{ padding: '16px 18px' }}>
            {/* Segmented bar */}
            <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', gap: 2, marginBottom: 18 }}>
              {assetDetailEntries.map(([key, val], i) => (
                <div key={key} style={{
                  width: `${(val / totalInvested) * 100}%`,
                  background: ASSET_COLORS[i % ASSET_COLORS.length],
                  borderRadius: 99, minWidth: 4,
                }} />
              ))}
            </div>
            {/* List */}
            {assetDetailEntries.map(([key, val], i) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: ASSET_COLORS[i % ASSET_COLORS.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.text2 }}>{key}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.textW, fontVariantNumeric: 'tabular-nums' }}>{fmt2(val)}</span>
                  <span style={{ fontSize: 11, color: C.text3, width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {((val / totalInvested) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Joint Audit bottom sheet ──────────────────────────────────────── */}
      {showAudit && isJoint && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setShowAudit(false)}
        >
          <div
            style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '20px 24px 44px', maxWidth: 480, width: '100%', boxShadow: '0 -16px 60px rgba(0,0,0,0.7)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 22px' }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 20 }}>Joint Account Audit</div>
            {[
              { label: 'Total Contributions', value: allTimePool,           color: C.green },
              { label: 'Joint Income',         value: allTimeJointIncome,   color: C.teal  },
              { label: 'Total Joint Spent',    value: allTimeJointSpent,    color: C.red   },
              { label: 'Current Balance',      value: currentJointBalance,  color: currentJointBalance >= 0 ? C.green : C.red },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, color: C.text2 }}>{label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{fmt2(value)}</span>
              </div>
            ))}
            <button
              onClick={() => setShowAudit(false)}
              style={{ marginTop: 20, width: '100%', background: C.accent, color: '#0a0a0a', border: 'none', borderRadius: 99, padding: '14px', fontSize: 14, fontWeight: 800, cursor: 'pointer', transition: 'opacity 0.15s' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
