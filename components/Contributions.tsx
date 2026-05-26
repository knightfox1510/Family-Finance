'use client';
// ─── components/Contributions.tsx ─────────────────────────────────────────────
// Monthly income / contribution tracker.
// Joint mode  : tracks both partners' contributions to the shared pool.
// Separate    : tracks each partner's personal income for the month.
// Solo        : tracks the user's own monthly income.

import React, { useState, useEffect } from 'react';
import type { AppData } from '@/types';
import { Card, Btn, Inp, Label, SectionTitle } from '@/components/ui';
import { C } from '@/constants';

// ─── Utilities ────────────────────────────────────────────────────────────────
function today(): string { return new Date().toISOString().slice(0, 10); }
function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string): string {
  if (!key || key === 'All') return 'All Months';
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-IN', {
    month: 'short', year: 'numeric',
  });
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

  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };

  // Labels adapt per mode
  const tabTitle    = isJoint ? 'Monthly Contributions' : 'Monthly Income';
  const poolLabel   = isJoint ? 'Joint Pool this month' : isSolo ? 'Your income this month' : 'Combined household income';
  const fieldLabelA = isJoint ? `${names.a} (₹)` : isSolo ? 'Your Income (₹)' : `${names.a} Income (₹)`;
  const fieldLabelB = isJoint ? `${names.b} (₹)` : `${names.b} Income (₹)`;
  const colLabelA   = isJoint ? names.a : `${names.a} Income`;
  const colLabelB   = isJoint ? names.b : `${names.b} Income`;
  const colLabelTotal = isJoint ? 'Total Pool' : 'Combined';

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
    // For solo, always save 0 for partnerB
    onUpdate(selectedMonth, Number(vals.partnerA), hasPartner ? Number(vals.partnerB) : 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };

  const pool = (Number(vals.partnerA) || 0) + (hasPartner ? (Number(vals.partnerB) || 0) : 0);
  const history = [...data.contributions].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Entry card ──────────────────────────────────────────────────────── */}
      <Card style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <SectionTitle style={{ margin: 0 }}>{tabTitle}</SectionTitle>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text1, padding: '6px 12px', borderRadius: 0, fontSize: 13, cursor: 'pointer', outline: 'none' }}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}{m === currentMonth ? ' (Current)' : ''}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isSolo ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <Label>{fieldLabelA}</Label>
            <Inp type="number" value={vals.partnerA}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVals((v) => ({ ...v, partnerA: Number(e.target.value) }))} />
          </div>
          {hasPartner && (
            <div>
              <Label>{fieldLabelB}</Label>
              <Inp type="number" value={vals.partnerB}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVals((v) => ({ ...v, partnerB: Number(e.target.value) }))} />
            </div>
          )}
        </div>

        <div style={{ background: C.bg, borderRadius: 0, padding: '11px 14px', marginBottom: 14 }}>
          <span style={{ color: C.text2, fontSize: 13 }}>{poolLabel}: </span>
          <span style={{ color: C.green, fontWeight: 800, fontSize: 18 }}>{fmt(pool)}</span>
        </div>

        <Btn variant={flash ? 'success' : 'primary'} onClick={save} style={{ width: '100%', padding: 12 }}>
          {flash ? '✓ Saved!' : `Save ${isJoint ? 'Contributions' : 'Income'}`}
        </Btn>
      </Card>

      {/* ── History table ────────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <Card>
          <SectionTitle>{isJoint ? 'Contribution History' : 'Income History'}</SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {['Month', colLabelA, ...(hasPartner ? [colLabelB] : []), colLabelTotal].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', color: C.muted, fontWeight: 600, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((c, i) => (
                  <tr key={c.month} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.bg + '80' }}>
                    <td style={{ padding: '10px 14px', color: c.month === currentMonth ? C.amber : C.text1, fontWeight: 600 }}>
                      {monthLabel(c.month)}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.purple, fontWeight: 600 }}>{fmt(c.partnerA)}</td>
                    {hasPartner && (
                      <td style={{ padding: '10px 14px', color: C.blue, fontWeight: 600 }}>{fmt(c.partnerB)}</td>
                    )}
                    <td style={{ padding: '10px 14px', color: C.green, fontWeight: 800 }}>
                      {fmt(c.partnerA + (hasPartner ? c.partnerB : 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
