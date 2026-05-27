'use client';
import React, { useState, useEffect } from 'react';
import type { AppData } from '@/types';
import { C } from '@/constants';

function today(): string { return new Date().toISOString().slice(0, 10); }
function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string): string {
  if (!key || key === 'All') return 'All Months';
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

interface Props {
  data: AppData;
  onUpdate: (month: string, partnerA: number, partnerB: number) => void;
  fmt: (n: number) => string;
}

export function Contributions({ data, onUpdate, fmt }: Props) {
  const mode       = data.settings.householdMode ?? 'joint';
  const isJoint    = mode === 'joint';
  const isSolo     = mode === 'solo';
  const hasPartner = mode !== 'solo';
  const names      = { a: data.settings.partnerAName, b: data.settings.partnerBName };

  const poolLabel   = isJoint ? 'Joint Pool this month' : isSolo ? 'Your income this month' : 'Combined household income';

  const currentMonth = monthKey(today());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const monthOptions = Array.from({ length: 18 }).map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const existing = data.contributions.find((c) => c.month === selectedMonth) ?? { partnerA: 0, partnerB: 0 };
  const [vals, setVals] = useState({ partnerA: existing.partnerA, partnerB: existing.partnerB });
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setVals({ partnerA: existing.partnerA, partnerB: existing.partnerB });
  }, [selectedMonth, data.contributions]);

  const save = () => {
    onUpdate(selectedMonth, Number(vals.partnerA), hasPartner ? Number(vals.partnerB) : 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };

  const pool = (Number(vals.partnerA) || 0) + (hasPartner ? (Number(vals.partnerB) || 0) : 0);
  const history = [...data.contributions].sort((a, b) => b.month.localeCompare(a.month));

  const inpStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', outline: 'none', color: C.textW,
    fontFamily: 'inherit', fontSize: 22, fontWeight: 800, width: '100%',
    minWidth: 0, letterSpacing: '-0.02em',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Month picker */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>Editing</span>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
          style={{ background: C.surface2, border: 'none', color: C.accent, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 99, outline: 'none', cursor: 'pointer' }}>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}{m === currentMonth ? ' (Current)' : ''}</option>
          ))}
        </select>
      </div>

      {/* Entry hero */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isSolo ? '1fr' : '1fr 1fr', gap: 12 }}>
          {/* Partner A */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.purple, color: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                {names.a.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.purple }}>{names.a}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, background: C.surface2, borderRadius: 14, padding: '14px 16px' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.text3 }}>₹</span>
              <input
                type="number"
                value={vals.partnerA}
                onChange={(e) => setVals((v) => ({ ...v, partnerA: Number(e.target.value) }))}
                style={inpStyle}
              />
            </div>
          </div>

          {/* Partner B */}
          {hasPartner && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.blue, color: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                  {names.b.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>{names.b}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, background: C.surface2, borderRadius: 14, padding: '14px 16px' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.text3 }}>₹</span>
                <input
                  type="number"
                  value={vals.partnerB}
                  onChange={(e) => setVals((v) => ({ ...v, partnerB: Number(e.target.value) }))}
                  style={inpStyle}
                />
              </div>
            </div>
          )}
        </div>

        {/* Pool total */}
        <div style={{ marginTop: 16, padding: '16px 18px', background: C.surface2, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>{poolLabel}</div>
            <div style={{ fontSize: 10, color: C.text3, marginTop: 2 }}>{monthLabel(selectedMonth)}</div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: C.green }}>{fmt(pool)}</div>
        </div>

        <button onClick={save}
          style={{ marginTop: 14, width: '100%', minHeight: 48, borderRadius: 999, border: 'none',
            background: flash ? C.green : C.accent, color: flash ? '#fff' : '#0a0a0a',
            fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
          {flash ? '✓ Saved!' : `Save ${isJoint ? 'Contributions' : 'Income'}`}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 20, padding: '14px 8px 8px', boxShadow: C.shadowSm }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, padding: '0 10px 12px' }}>
            {isJoint ? 'Contribution History' : 'Income History'}
          </div>
          {history.map((c) => {
            const total = c.partnerA + (hasPartner ? c.partnerB : 0);
            const isCurrent = c.month === currentMonth;
            return (
              <div key={c.month} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                background: isCurrent ? C.accentBg : 'transparent', borderRadius: 10,
                border: isCurrent ? `1px solid ${C.accent}` : '1px solid transparent',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isCurrent ? C.accent : C.textW }}>{monthLabel(c.month)}</div>
                  {isCurrent && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.accent, marginTop: 2 }}>Current</div>}
                </div>
                <div style={{ minWidth: 70, textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.purple }}>{fmt(c.partnerA)}</div>
                  <div style={{ fontSize: 9, color: C.text3 }}>{names.a}</div>
                </div>
                {hasPartner && (
                  <div style={{ minWidth: 70, textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>{fmt(c.partnerB)}</div>
                    <div style={{ fontSize: 9, color: C.text3 }}>{names.b}</div>
                  </div>
                )}
                <div style={{ minWidth: 80, textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.green }}>{fmt(total)}</div>
                  <div style={{ fontSize: 9, color: C.text3 }}>{isJoint ? 'Pool' : 'Total'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
