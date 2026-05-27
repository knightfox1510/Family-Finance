'use client';
import React, { useState } from 'react';
import type { AppData } from '@/types';
import { Card, SectionTitle, ProgressBar } from '@/components/ui/ui';
import { C } from '@/constants';

function monthKey(d: string) { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; }
function monthLabel(key: string) { if (!key || key === 'All') return 'All Months'; const [y,m]=key.split('-'); return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-IN',{month:'short',year:'numeric'}); }

interface Props { data: AppData; fmt: (n: number) => string; }

const CAT_EMOJI: Record<string, string> = {
  'Salary': '💼',
  'Freelance': '💻',
  'Rental Income': '🏠',
  'Investment Returns': '📈',
  'Bonus': '🎁',
  'Gift': '🎀',
  'Other Income': '💰',
};

export function IncomeTracker({ data, fmt }: Props) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const [timeFilter, setTimeFilter] = useState('CurrentYear');
  const [earnerFilter, setEarnerFilter] = useState('All');
  const currentYearStr = String(new Date().getFullYear());
  const mode = data.settings.householdMode ?? 'joint';

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
    shortLabel: monthLabel(mk).slice(0, 3),
    total: data.expenses.filter((e) => e.type === 'income' && monthKey(e.date) === mk && (earnerFilter === 'All' || (earnerFilter === 'PartnerA' && (e.addedBy === 'Partner A' || e.account === names.a)) || (earnerFilter === 'PartnerB' && (e.addedBy === 'Partner B' || e.account === names.b)))).reduce((s, e) => s + (e.amount || 0), 0),
  }));
  const last6 = trendData.slice(-6);
  const maxTrend = Math.max(1, ...last6.map((m) => m.total));
  const avgTrend = last6.length > 0 ? last6.reduce((s, m) => s + m.total, 0) / last6.length : 0;
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;

  const selStyle: React.CSSProperties = {
    background: C.surface2, border: 'none', color: C.textW, borderRadius: 99,
    padding: '6px 14px', fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer',
  };

  // Pill chip helper
  const chipStyle = (active: boolean): React.CSSProperties => active
    ? { background: C.accentBg, borderRadius: 999, padding: '8px 16px', border: `1px solid ${C.accent}`, color: C.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }
    : { background: C.surface2, borderRadius: 999, padding: '8px 16px', border: `1px solid ${C.border2}`, color: C.textW, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const };

  const topMonths = allMonths.slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Filter chips row */}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 'max-content' }}>
          {/* Time filter chips */}
          <button style={chipStyle(timeFilter === 'CurrentYear')} onClick={() => setTimeFilter('CurrentYear')}>Current Year</button>
          <button style={chipStyle(timeFilter === 'All')} onClick={() => setTimeFilter('All')}>All History</button>
          {topMonths.map((m) => (
            <button key={m} style={chipStyle(timeFilter === m)} onClick={() => setTimeFilter(m)}>{monthLabel(m)}</button>
          ))}
          {/* Earner filter chips */}
          <div style={{ width: 1, height: 24, background: C.border, margin: '0 4px' }} />
          <button style={chipStyle(earnerFilter === 'All')} onClick={() => setEarnerFilter('All')}>Both</button>
          <button style={chipStyle(earnerFilter === 'PartnerA')} onClick={() => setEarnerFilter('PartnerA')}>{names.a}</button>
          {mode !== 'solo' && (
            <button style={chipStyle(earnerFilter === 'PartnerB')} onClick={() => setEarnerFilter('PartnerB')}>{names.b}</button>
          )}
        </div>
      </div>

      {/* Hero card */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '20px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>
          Total Net Inflow
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: C.green, lineHeight: 1 }}>
          {fmt(totalIncome)}
        </div>
        <div style={{ fontSize: 12, color: C.text2, marginTop: 6 }}>
          {timeFilter === 'CurrentYear' ? currentYearStr : timeFilter === 'All' ? 'All Time' : monthLabel(timeFilter)}
          {earnerFilter !== 'All' ? ` · ${earnerFilter === 'PartnerA' ? names.a : names.b}` : ''}
        </div>
      </div>

      {/* Partner split section */}
      {totalIncome > 0 && mode !== 'solo' && (
        <div style={{ background: C.surface, borderRadius: 20, padding: '18px 18px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 12 }}>
            By Earner
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Partner A */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: C.purpleBg, color: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                    {names.a.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.textW }}>{names.a}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>{fmt(incomeA)}</span>
              </div>
              <div style={{ height: 4, background: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalIncome > 0 ? (incomeA/totalIncome)*100 : 0}%`, background: C.purple, borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 10, color: C.text3, marginTop: 4 }}>
                {totalIncome > 0 ? ((incomeA/totalIncome)*100).toFixed(0) : 0}% of household
              </div>
            </div>
            {/* Partner B */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: C.blueBg, color: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                    {names.b.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.textW }}>{names.b}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>{fmt(incomeB)}</span>
              </div>
              <div style={{ height: 4, background: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalIncome > 0 ? (incomeB/totalIncome)*100 : 0}%`, background: C.blue, borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 10, color: C.text3, marginTop: 4 }}>
                {totalIncome > 0 ? ((incomeB/totalIncome)*100).toFixed(0) : 0}% of household
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monthly trend bars card */}
      {showTrend && last6.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 20, padding: '18px 18px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>
              Monthly Inflow · 6mo
            </div>
            <div style={{ fontSize: 11, color: C.text2 }}>avg {fmt(Math.round(avgTrend))}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 100 }}>
            {last6.map((m) => {
              const pct = (m.total / maxTrend) * 100;
              const isCurrentMonth = trendData.indexOf(m) === trendData.findLastIndex((x) => x.label === m.label) &&
                m.label === monthLabel(currentMonthKey);
              return (
                <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: m.total > 0 ? C.text2 : C.muted, marginBottom: 2 }}>
                    {m.total > 0 ? fmt(m.total) : '—'}
                  </div>
                  <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', flex: 1 }}>
                    <div style={{
                      width: '100%',
                      height: `${Math.max(8, pct)}%`,
                      background: isCurrentMonth ? C.green : C.greenBg,
                      borderRadius: 6,
                      transition: 'height 0.3s ease',
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: C.text3, fontWeight: 600 }}>{m.shortLabel}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Income streams card */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '18px 18px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 12 }}>
          Income Streams
        </div>
        {sortedCats.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>No income matching criteria.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sortedCats.map(([cat, amt], idx) => (
              <div key={cat}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                  {/* Icon container */}
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: C.greenBg, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    {CAT_EMOJI[cat] || '💰'}
                  </div>
                  {/* Name + sub */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.textW }}>{cat}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <div style={{ height: 3, flex: 1, background: C.surface2, borderRadius: 99, overflow: 'hidden', maxWidth: 80 }}>
                        <div style={{ height: '100%', width: `${(amt/maxCat)*100}%`, background: C.green, borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 10, color: C.text3 }}>{totalIncome > 0 ? ((amt/totalIncome)*100).toFixed(0) : 0}%</span>
                    </div>
                  </div>
                  {/* Amount */}
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.green, flexShrink: 0 }}>{fmt(amt)}</div>
                </div>
                {idx < sortedCats.length - 1 && (
                  <div style={{ height: 1, background: C.border, marginLeft: 48 }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
