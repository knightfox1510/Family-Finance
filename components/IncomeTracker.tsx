'use client';
import React, { useState } from 'react';
import type { AppData } from '@/types';
import { Card, SectionTitle, StatCard, ProgressBar } from '@/components/ui';
import { C } from '@/constants';

function monthKey(d: string) { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; }
function monthLabel(key: string) { if (!key || key === 'All') return 'All Months'; const [y,m]=key.split('-'); return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-IN',{month:'short',year:'numeric'}); }

interface Props { data: AppData; fmt: (n: number) => string; }

export function IncomeTracker({ data, fmt }: Props) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const [timeFilter, setTimeFilter] = useState('CurrentYear');
  const [earnerFilter, setEarnerFilter] = useState('All');
  const currentYearStr = String(new Date().getFullYear());

  const allMonths = [...new Set(data.expenses.map((e) => monthKey(e.date)))].sort().reverse();

  const periodInflows = data.expenses.filter((e) => {
    if (e.type !== 'income') return false;
    if (timeFilter === 'CurrentYear' && !e.date.startsWith(currentYearStr)) return false;
    if (timeFilter !== 'CurrentYear' && timeFilter !== 'All' && monthKey(e.date) !== timeFilter) return false;
    if (earnerFilter === 'PartnerA' && e.addedBy !== 'Partner A' && e.account !== names.a) return false;
    if (earnerFilter === 'PartnerB' && e.addedBy !== 'Partner B' && e.account !== names.b) return false;
    return true;
  });

  const totalIncome = periodInflows.reduce((s, e) => s + (e.amount || 0), 0);
  const incomeA = periodInflows.filter((e) => e.addedBy === 'Partner A' || e.account === names.a).reduce((s, e) => s + (e.amount || 0), 0);
  const incomeB = periodInflows.filter((e) => e.addedBy === 'Partner B' || e.account === names.b).reduce((s, e) => s + (e.amount || 0), 0);

  const catMap: Record<string, number> = {};
  periodInflows.forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
  const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const maxCat = sortedCats[0]?.[1] || 1;

  const showTrend = timeFilter === 'CurrentYear' || timeFilter === 'All';
  const trendData = [...allMonths].reverse().filter((mk) => timeFilter === 'CurrentYear' ? mk.startsWith(currentYearStr) : true).map((mk) => ({
    label: monthLabel(mk),
    total: data.expenses.filter((e) => e.type === 'income' && monthKey(e.date) === mk && (earnerFilter === 'All' || (earnerFilter === 'PartnerA' && (e.addedBy === 'Partner A' || e.account === names.a)) || (earnerFilter === 'PartnerB' && (e.addedBy === 'Partner B' || e.account === names.b)))).reduce((s, e) => s + (e.amount || 0), 0),
  }));
  const maxTrend = Math.max(1, ...trendData.map((m) => m.total));

  const selStyle: React.CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, color: C.text1, padding: '6px 12px', borderRadius: 0, fontSize: 13, cursor: 'pointer', outline: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Filter header */}
      <Card style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionTitle style={{ margin: 0 }}>💰 Income & Inflow Dashboard</SectionTitle>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={earnerFilter} onChange={(e) => setEarnerFilter(e.target.value)} style={selStyle}>
            <option value="All">Both Partners</option>
            <option value="PartnerA">{names.a} Only</option>
            <option value="PartnerB">{names.b} Only</option>
          </select>
          <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={selStyle}>
            <option value="CurrentYear">Current Year ({currentYearStr})</option>
            <option value="All">All History</option>
            {allMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      </Card>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <StatCard label="Total Net Inflow" value={fmt(totalIncome)} color={C.green} sub="Accumulated for selection" />
        <StatCard label={`${names.a}'s Income`} value={fmt(incomeA)} color={C.purple} sub={`${totalIncome > 0 ? ((incomeA/totalIncome)*100).toFixed(0) : 0}% of total`} />
        <StatCard label={`${names.b}'s Income`} value={fmt(incomeB)} color={C.blue} sub={`${totalIncome > 0 ? ((incomeB/totalIncome)*100).toFixed(0) : 0}% of total`} />
      </div>

      {/* Trend chart */}
      {showTrend && trendData.length > 0 && (
        <Card>
          <SectionTitle>Monthly Inflow Trend</SectionTitle>
          <div style={{ overflowX: 'auto', paddingBottom: 6, marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 140, gap: 12, minWidth: trendData.length * 55 }}>
              {trendData.map((m) => {
                const pct = (m.total / maxTrend) * 100;
                return (
                  <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: m.total > 0 ? C.textW : C.muted }}>{m.total > 0 ? fmt(m.total) : '₹0'}</div>
                    <div style={{ height: 85, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${Math.max(6, pct)}%`, background: `linear-gradient(to top, ${C.surface}, ${C.green})`, border: `1px solid ${C.border}`, borderRadius: 0, transition: 'height 0.3s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: C.text2, fontWeight: 600, whiteSpace: 'nowrap' }}>{m.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Category breakdown + audit ledger */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Card>
          <SectionTitle>Income Streams</SectionTitle>
          {sortedCats.length === 0 ? <p style={{ color: C.muted, fontSize: 13, marginTop: 10 }}>No income matching criteria.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
              {sortedCats.map(([cat, amt]) => (
                <div key={cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}><span style={{ color: C.text1 }}>{cat}</span><span style={{ fontWeight: 700, color: C.textW }}>{fmt(amt)}</span></div>
                  <ProgressBar value={(amt / maxCat) * 100} color={C.green} height={6} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <SectionTitle>Inflow Audit Ledger</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
            {periodInflows.length === 0 ? <p style={{ color: C.muted, fontSize: 13 }}>No transactions match.</p> : periodInflows.map((e) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${C.bg}80`, padding: '10px 12px', borderRadius: 0, border: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ color: C.textW, fontSize: 13, fontWeight: 600 }}>{e.note || 'Income Deposit'}</div>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{e.date} • {e.account === 'Joint' ? 'Joint' : e.account} • <span style={{ color: C.text2 }}>{e.category}</span></div>
                </div>
                <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>+{fmt(e.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
