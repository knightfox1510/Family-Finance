'use client';
// ─── components/Contributions.tsx ─────────────────────────────────────────────
// Tracks each partner's monthly cash contribution into the joint pool.
// Only rendered when householdMode === 'joint' (enforced in page.tsx).

import React, { useState, useEffect } from 'react';
import type { AppData } from '@/types';
import { Card, Btn, Inp, Label, SectionTitle } from '@/components/ui';
import { C } from '@/constants';

// ─── Utilities (local to this file) ──────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  if (!key || key === 'All') return 'All Months';
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  data: AppData;
  onUpdate: (month: string, partnerA: number, partnerB: number) => void;
  fmt: (n: number) => string;
}

export function Contributions({ data, onUpdate, fmt }: Props) {
  const currentMonth = monthKey(today());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };

  // Last 18 months for the dropdown
  const monthOptions = Array.from({ length: 18 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const existing = data.contributions.find((c) => c.month === selectedMonth) ?? {
    partnerA: 0,
    partnerB: 0,
  };

  const [vals, setVals] = useState({
    partnerA: existing.partnerA,
    partnerB: existing.partnerB,
  });
  const [flash, setFlash] = useState(false);

  // Re-populate inputs whenever the selected month or contribution data changes
  useEffect(() => {
    setVals({ partnerA: existing.partnerA, partnerB: existing.partnerB });
  }, [selectedMonth, data.contributions]);

  const save = () => {
    onUpdate(selectedMonth, Number(vals.partnerA), Number(vals.partnerB));
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };

  const pool = (Number(vals.partnerA) || 0) + (Number(vals.partnerB) || 0);
  const history = [...data.contributions].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Entry card ─────────────────────────────────────────────────────── */}
      <Card style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <SectionTitle style={{ margin: 0 }}>Monthly Contributions</SectionTitle>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              background: C.bg, border: `1px solid ${C.border}`, color: C.text1,
              padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', outline: 'none',
            }}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}{m === currentMonth ? ' (Current)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <Label>{names.a} (₹)</Label>
            <Inp
              type="number"
              value={vals.partnerA}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setVals((v) => ({ ...v, partnerA: Number(e.target.value) }))
              }
            />
          </div>
          <div>
            <Label>{names.b} (₹)</Label>
            <Inp
              type="number"
              value={vals.partnerB}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setVals((v) => ({ ...v, partnerB: Number(e.target.value) }))
              }
            />
          </div>
        </div>

        <div style={{ background: C.bg, borderRadius: 10, padding: '11px 14px', marginBottom: 14 }}>
          <span style={{ color: C.text2, fontSize: 13 }}>Joint Pool this month: </span>
          <span style={{ color: C.green, fontWeight: 800, fontSize: 18 }}>{fmt(pool)}</span>
        </div>

        <Btn
          variant={flash ? 'success' : 'primary'}
          onClick={save}
          style={{ width: '100%', padding: 12 }}
        >
          {flash ? '✓ Saved!' : 'Save Contributions'}
        </Btn>
      </Card>

      {/* ── History table ──────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <Card>
          <SectionTitle>Contribution History</SectionTitle>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {['Month', names.a, names.b, 'Total Pool'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', color: C.muted, fontWeight: 600, textAlign: 'left' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((c, i) => (
                  <tr
                    key={c.month}
                    style={{
                      borderTop: `1px solid ${C.border}`,
                      background: i % 2 === 0 ? 'transparent' : C.bg + '80',
                    }}
                  >
                    <td style={{
                      padding: '10px 14px',
                      color: c.month === currentMonth ? C.amber : C.text1,
                      fontWeight: 600,
                    }}>
                      {monthLabel(c.month)}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.purple, fontWeight: 600 }}>
                      {fmt(c.partnerA)}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.blue, fontWeight: 600 }}>
                      {fmt(c.partnerB)}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.green, fontWeight: 800 }}>
                      {fmt(c.partnerA + c.partnerB)}
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
