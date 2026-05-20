'use client';
import React, { useState, useMemo } from 'react';
import type { AppData } from '@/types';
import { Card, SectionTitle, StatCard, ProgressBar } from '@/components/ui';
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
  const [rangeMode, setRangeMode] = useState<'month' | 'custom'>('month');
  const d = new Date();
  const currentMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const defaultStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const [customDates, setCustomDates] = useState({ start: defaultStart, end: today() });
  const [accountFilter, setAccountFilter] = useState('All');

  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };

  const allAvailableMonths = [...new Set(data.expenses.map((e) => monthKey(e.date)))].sort().reverse();

  const uniqueContributions = Array.from(new Map(data.contributions.map((c) => [c.month, c])).values());
  const allTimePool = uniqueContributions.reduce((s, c) => s + Number(c.partnerA ?? 0) + Number(c.partnerB ?? 0), 0);
  const allTimeJointIncome = data.expenses.filter((e) => e.account === 'Joint' && e.type === 'income').reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const allTimeJointSpent = data.expenses.filter((e) => e.account === 'Joint' && e.type !== 'income').reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const currentJointBalance = allTimePool + allTimeJointIncome - allTimeJointSpent;

  const inRange = (e: any) => {
    if (rangeMode === 'month') return monthKey(e.date) === selectedMonth;
    return e.date >= customDates.start && e.date <= customDates.end;
  };

  const periodJointSpent = data.expenses.filter((e) => inRange(e) && e.account === 'Joint' && e.type !== 'income').reduce((s, e) => s + Number(e.amount ?? 0), 0);

  let contribA = 0, contribB = 0;
  if (rangeMode === 'month') {
    const pc = uniqueContributions.find((c) => c.month === selectedMonth);
    if (pc) { contribA = Number(pc.partnerA ?? 0); contribB = Number(pc.partnerB ?? 0); }
  } else {
    const startM = customDates.start.slice(0, 7), endM = customDates.end.slice(0, 7);
    const overlap = uniqueContributions.filter((c) => c.month >= startM && c.month <= endM);
    contribA = overlap.reduce((s, c) => s + Number(c.partnerA ?? 0), 0);
    contribB = overlap.reduce((s, c) => s + Number(c.partnerB ?? 0), 0);
  }

  const last6Months = Array.from({ length: 6 }).map((_, i) => {
    const t = new Date(); t.setMonth(t.getMonth() - i);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  }).reverse();

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
  const periodInvested = filteredExp.filter((e) => INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const totalPeriodRaw = filteredExp.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const trueLifestyleExpenses = totalPeriodRaw - periodInvested;
  // Capital retained = income minus lifestyle only.
  // Investments are retained capital, not outflows, so they don't reduce this figure.
  const capitalRetained  = periodIncome - trueLifestyleExpenses;
  const investmentRate   = periodIncome > 0 ? Math.max(0, Math.min(100, (periodInvested    / periodIncome) * 100)) : 0;
  const lifestyleRate    = periodIncome > 0 ? Math.max(0, Math.min(100, (trueLifestyleExpenses / periodIncome) * 100)) : 0;
  const retentionRate    = periodIncome > 0 ? Math.max(0, Math.min(100, (capitalRetained   / periodIncome) * 100)) : 0;

  const personalLifestyleA = filteredExp.filter((e) => (e.account === names.a || e.addedBy === 'Partner A') && e.account !== 'Joint' && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalLifestyleB = filteredExp.filter((e) => (e.account === names.b || e.addedBy === 'Partner B') && e.account !== 'Joint' && !INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalInvestedA  = filteredExp.filter((e) => (e.account === names.a || e.addedBy === 'Partner A') && e.account !== 'Joint' && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const personalInvestedB  = filteredExp.filter((e) => (e.account === names.b || e.addedBy === 'Partner B') && e.account !== 'Joint' && INVESTMENT_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount ?? 0), 0);

  const catMap: Record<string, number> = {};
  filteredExp.filter((e) => !INVESTMENT_CATS.has(e.category)).forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount); });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
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
        note.includes('sip') || note.includes('mutual') || note.includes('mf') || note.includes('nj') ? 'Mutual Funds / SIP' :
        note.includes('gold') || note.includes('bluestone') || note.includes('sgb') || note.includes('png') || note.includes('waman') ? 'Gold' :
        note.includes('ppf') || note.includes('epf') || note.includes('nps') ? 'PPF / EPF / NPS' :
        note.includes('stock') || note.includes('equity') || note.includes('zerodha') || note.includes('smallcase') || note.includes('share') || note.includes('indmoney') || note.includes('ind money') ? 'Stocks / Equity' :
        note.includes('fd') || note.includes('fixed deposit') ? 'Fixed Deposits' :
        note.includes('crypto') || note.includes('bitcoin') || note.includes('btc') ? 'Crypto' :
        e.category === 'Insurance' || note.includes('insurance') || note.includes('lic') ? 'Insurance' : 
        'Other Investments';
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

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: active ? 700 : 500,
    background: active ? C.amber : 'transparent', color: active ? C.bg : C.text2,
    border: 'none', cursor: 'pointer', transition: 'all 0.2s',
  });
  const labelStyle: React.CSSProperties = { color: C.text2, fontSize: 12, fontWeight: 600 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Filter Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Card style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ background: C.bg, padding: 3, borderRadius: 8, display: 'inline-flex', border: `1px solid ${C.border}` }}>
              <button onClick={() => setRangeMode('month')} style={toggleBtnStyle(rangeMode === 'month')}>Single Month</button>
              <button onClick={() => setRangeMode('custom')} style={toggleBtnStyle(rangeMode === 'custom')}>Custom Range</button>
            </div>
            {rangeMode === 'month' ? (
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text1, padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                {allAvailableMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input type="date" value={customDates.start} onChange={(e) => setCustomDates({ ...customDates, start: e.target.value })} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 8, padding: '4px 8px', width: 130, outline: 'none' }} />
                <span style={{ color: C.muted, fontSize: 12 }}>to</span>
                <input type="date" value={customDates.end} onChange={(e) => setCustomDates({ ...customDates, end: e.target.value })} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 8, padding: '4px 8px', width: 130, outline: 'none' }} />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={labelStyle}>Account:</span>
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text1, padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
              <option value="All">All Accounts</option>
              <option value="Joint">Joint Only</option>
              <option value="PersonalOnly">{names.a} & {names.b} (Personal)</option>
              <option value={names.a}>{names.a} Only</option>
              <option value={names.b}>{names.b} Only</option>
            </select>
          </div>
        </Card>
      </div>

      {/* Core Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        <div onClick={() => setShowAudit(true)} style={{ cursor: 'pointer', transition: 'transform 0.2s' }} onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.02)')} onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
          <StatCard label="Joint Balance (Click to Audit)" value={fmt(currentJointBalance)} accent={currentJointBalance < 5000 ? C.red : C.green} icon="💰" sub={`Spent this period: ${fmt(periodJointSpent)}`} />
        </div>
        <StatCard label="Lifestyle Spending" value={fmt(trueLifestyleExpenses)} accent={C.amber} icon="🛒" sub="Excluding investments" />
      </div>

      {/* Partner Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <SectionTitle>Partner Activity Breakdown</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
              {[
                { name: names.a, color: C.purple, lifestyle: personalLifestyleA, invested: personalInvestedA, contrib: contribA },
                { name: names.b, color: C.blue,   lifestyle: personalLifestyleB, invested: personalInvestedB, contrib: contribB },
              ].map((p) => (
                <div key={p.name} style={{ background: C.bg, padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.border}` }}>
                  <div style={{ color: p.color, fontWeight: 700, fontSize: 13, marginBottom: 8, borderBottom: `1px solid ${C.border}44`, paddingBottom: 4 }}>{p.name}</div>
                  {[['Out of Pocket (Lifestyle):', fmt(p.lifestyle), C.textW], ['Out of Pocket (Invested):', fmt(p.invested), C.teal], ['Joint Pool Contributed:', fmt(p.contrib), C.green]].map(([label, val, col]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                      <span style={{ color: C.text2 }}>{label}</span>
                      <span style={{ fontWeight: 600, color: col as string }}>{val}</span>
                    </div>
                  ))}
                  {/* Total row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                    <span style={{ color: C.text1, fontWeight: 700 }}>Total Financial Outflow:</span>
                    <span style={{ fontWeight: 800, color: p.color }}>{fmt(p.lifestyle + p.invested + p.contrib)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ color: C.muted, fontSize: 11, fontStyle: 'italic', padding: '12px 4px 0' }}>Reflects personal out-of-pocket spending vs joint seed transfers.</div>
        </Card>

      </div>

      {/* Asset Allocation Breakdown */}
      <Card>
        <SectionTitle>Asset Allocation Breakdown</SectionTitle>
        {assetDetailEntries.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 13 }}>
            No investment or insurance transactions in this period. Log investments under the "Investments" or "Insurance" categories to see your allocation.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ color: C.text2, fontSize: 13 }}>Total deployed to assets this period</span>
              <span style={{ color: C.teal, fontWeight: 800, fontSize: 18 }}>{fmt(periodInvested)}</span>
            </div>
            {assetDetailEntries.map(([asset, amt], i) => {
              const pct = (amt / periodInvested) * 100;
              const color = ASSET_COLORS[i % ASSET_COLORS.length];
              return (
                <div key={asset} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: C.text1, fontSize: 13 }}>{asset}</span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ color: C.muted, fontSize: 12 }}>{pct.toFixed(0)}%</span>
                      <span style={{ color, fontSize: 13, fontWeight: 700 }}>{fmt(amt)}</span>
                    </div>
                  </div>
                  <ProgressBar pct={pct} color={color} />
                </div>
              );
            })}
            {trueLifestyleExpenses > 0 && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: C.bg, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ color: C.muted, fontSize: 12 }}>Investment to Lifestyle ratio</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: periodInvested >= trueLifestyleExpenses ? C.teal : C.amber }}>
                  {fmt(periodInvested)} invested : {fmt(trueLifestyleExpenses)} lifestyle
                  {' '}({((periodInvested / trueLifestyleExpenses) * 100).toFixed(0)}%)
                </span>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Wealth Retention Velocity */}
      <Card>
        <SectionTitle>Household Wealth Retention Velocity</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 18 }}>
          <div>
            <span style={{ color: C.text2, fontSize: 12 }}>Income for Period</span>
            <div style={{ color: C.green, fontWeight: 800, fontSize: 18, marginTop: 2 }}>{fmt(periodIncome)}</div>
          </div>
          <div>
            <span style={{ color: C.text2, fontSize: 12 }}>Lifestyle Spent</span>
            <div style={{ color: C.amber, fontWeight: 800, fontSize: 18, marginTop: 2 }}>{fmt(trueLifestyleExpenses)}</div>
          </div>
          <div>
            <span style={{ color: C.text2, fontSize: 12 }}>Deployed to Assets</span>
            <div style={{ color: C.teal, fontWeight: 800, fontSize: 18, marginTop: 2 }}>{fmt(periodInvested)}</div>
          </div>
          <div>
            <span style={{ color: C.text2, fontSize: 12 }}>Capital Retained</span>
            <div style={{ color: capitalRetained >= 0 ? C.green : C.red, fontWeight: 800, fontSize: 18, marginTop: 2 }}>{fmt(capitalRetained)}</div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>Income − lifestyle</div>
          </div>
        </div>
        {periodIncome > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>How your income was allocated</span>
              <span style={{ fontSize: 12, color: C.textW, fontWeight: 700 }}>{retentionRate.toFixed(0)}% retained</span>
            </div>
            <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
              {lifestyleRate > 0 && (
                <div title={`Lifestyle: ${lifestyleRate.toFixed(0)}%`}
                  style={{ width: `${lifestyleRate}%`, background: C.amber, transition: 'width 0.4s' }} />
              )}
              {investmentRate > 0 && (
                <div title={`Invested: ${investmentRate.toFixed(0)}%`}
                  style={{ width: `${investmentRate}%`, background: C.teal, transition: 'width 0.4s' }} />
              )}
              {retentionRate > 0 && (
                <div title={`Retained: ${retentionRate.toFixed(0)}%`}
                  style={{ flex: 1, background: C.green, transition: 'width 0.4s' }} />
              )}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'Lifestyle', pct: lifestyleRate, color: C.amber },
                { label: 'Invested', pct: investmentRate, color: C.teal },
                { label: 'Retained', pct: retentionRate, color: C.green },
              ].map(({ label, pct, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                  <span style={{ color: C.text2 }}>{label}</span>
                  <span style={{ color: C.textW, fontWeight: 700 }}>{pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {periodIncome === 0 && (
          <div style={{ color: C.muted, fontSize: 13, fontStyle: 'italic' }}>
            Log your income for this period to see the allocation breakdown.
          </div>
        )}
      </Card>

      {/* Lifestyle Trend */}
      <Card>
        <SectionTitle>Monthly Lifestyle Expenses — Last 6 Months</SectionTitle>
        <div style={{ overflowX: 'auto', width: '100%', marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 150, paddingTop: 14, gap: 12, minWidth: 500 }}>
            {lifestyleTrendData.map((m) => {
              const pct = (m.total / maxLifestyleTrend) * 100;
              return (
                <div key={m.monthLabel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 65 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: m.total > 0 ? C.textW : C.muted }}>{m.total > 0 ? fmt(m.total) : '₹0'}</div>
                  <div style={{ height: 90, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${Math.max(6, pct)}%`, background: `linear-gradient(to top, ${C.surface}, ${C.amber})`, border: `1px solid ${C.border}`, borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' }} />
                  </div>
                  <div style={{ fontSize: 11, color: C.text2, fontWeight: 600 }}>{m.monthLabel}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Investment Trend */}
      <Card>
        <SectionTitle>Monthly Investments & Policies — Last 6 Months</SectionTitle>
        <div style={{ overflowX: 'auto', width: '100%', marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 150, paddingTop: 14, gap: 12, minWidth: 500 }}>
            {investmentTrendData.map((m) => {
              const pct = (m.total / maxInvestmentTrend) * 100;
              return (
                <div key={m.monthLabel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 65 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: m.total > 0 ? C.textW : C.muted }}>{m.total > 0 ? fmt(m.total) : '₹0'}</div>
                  <div style={{ height: 90, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${Math.max(6, pct)}%`, background: `linear-gradient(to top, ${C.surface}, ${C.teal})`, border: `1px solid ${C.border}`, borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' }} />
                  </div>
                  <div style={{ fontSize: 11, color: C.text2, fontWeight: 600 }}>{m.monthLabel}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Category breakdown */}
      <Card>
        <SectionTitle>Lifestyle Category Allocation</SectionTitle>
        {topCats.length === 0 ? <p style={{ color: C.muted, fontSize: 13 }}>No lifestyle expenses matching current criteria.</p> : topCats.map(([cat, amt]) => {
          const budget = data.settings.budgets[cat];
          const over = budget && amt > budget;
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: C.text1, fontSize: 13 }}>{cat}</span>
                <span style={{ color: over ? C.red : C.textW, fontSize: 13, fontWeight: 700 }}>{fmt(amt)}{over ? ' ⚠️' : ''}</span>
              </div>
              <ProgressBar pct={(amt / maxCat) * 100} color={over ? C.red : C.amber} />
            </div>
          );
        })}
      </Card>

      {/* Audit Modal */}
      {showAudit && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Card style={{ width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}>
            <button onClick={() => setShowAudit(false)} style={{ position: 'absolute', top: 15, right: 15, background: C.surface, border: `1px solid ${C.border}`, color: C.text1, borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            <SectionTitle>Joint Balance Ledger Audit</SectionTitle>
            {[['[+] Total Seeded Contributions', allTimePool, C.green], ['[+] Total Joint Income', allTimeJointIncome, C.green], ['[-] Total Joint Expenses', allTimeJointSpent, C.red]].map(([label, val, color]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: color as string }}>{label}</span>
                <span style={{ fontWeight: 700, color: C.textW }}>{fmt(val as number)}</span>
              </div>
            ))}
            <div style={{ background: C.surface, padding: 12, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: C.text1 }}>Calculated Balance:</span>
              <span style={{ fontWeight: 800, fontSize: 20, color: currentJointBalance < 0 ? C.red : C.teal }}>{fmt(currentJointBalance)}</span>
            </div>
            <SectionTitle>Month-by-Month Breakdown</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, marginBottom: 24 }}>
              {monthlyAuditList.map((m) => (
                <div key={m.month} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '8px 12px', background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
                  <span style={{ fontWeight: 700, color: C.text1 }}>{monthLabel(m.month)}</span>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ color: C.green }}>In: {fmt(m.in)}</span>
                    <span style={{ color: C.red }}>Out: {fmt(m.out)}</span>
                    <span style={{ color: m.net >= 0 ? C.teal : C.amber, fontWeight: 800, minWidth: 80 }}>Net: {fmt(m.net)}</span>
                  </div>
                </div>
              ))}
            </div>
            <SectionTitle>Recent Joint Outflows</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {data.expenses.filter((e) => e.account === 'Joint' && e.type !== 'income').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15).map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${C.border}55` }}>
                  <div><span style={{ color: C.text1 }}>{e.category}</span><span style={{ color: C.muted, fontSize: 11, marginLeft: 8 }}>{e.date} • {e.note || 'No note'}</span></div>
                  <span style={{ color: C.red, fontWeight: 600 }}>{fmt(e.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}