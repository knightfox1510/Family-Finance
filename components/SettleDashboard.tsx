'use client';
import React, { useState } from 'react';
import type { AppData, PartnerCalculations } from '@/types';
import { Card, Btn, SectionTitle, StatCard, Badge } from '@/components/ui';
import { C } from '@/constants';

// fmt is received as a prop from page.tsx so privacy mode is respected globally

interface Props {
  fmt: (n: number) => string;
  data: AppData;
  onBulkSettle: (ids: string[]) => void;
  partnerCalculations: PartnerCalculations;
  actions: any;
}

export function SettleDashboard({ fmt, data, onBulkSettle, partnerCalculations, actions }: Props) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pending  = data.expenses.filter((e) => e.toSettle && !e.settled && e.account !== 'Joint');
  const pendingA = pending.filter((e) => e.account.includes(names.a) || e.account.includes('Partner A'));
  const pendingB = pending.filter((e) => e.account.includes(names.b) || e.account.includes('Partner B'));
  const totalA = pendingA.reduce((s, e) => s + e.amount, 0);
  const totalB = pendingB.reduce((s, e) => s + e.amount, 0);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = (arr: any[]) => setSelected((s) => { const n = new Set(s); arr.forEach((e) => n.add(e.id)); return n; });
  const clearGroup = (arr: any[]) => setSelected((s) => { const n = new Set(s); arr.forEach((e) => n.delete(e.id)); return n; });
  const settleSelected = () => { onBulkSettle([...selected]); setSelected(new Set()); };

  const SettleTable = ({ items, partner, color }: { items: any[]; partner: string; color: string }) => (
    <Card style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <SectionTitle style={{ margin: 0 }}>{partner}</SectionTitle>
          <div style={{ color, fontWeight: 800, fontSize: 18, marginTop: 2 }}>{fmt(items.reduce((s, e) => s + e.amount, 0))} pending</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => selectAll(items)}>Select All</Btn>
          <Btn variant="ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => clearGroup(items)}>Clear</Btn>
        </div>
      </div>
      {items.length === 0 ? <p style={{ color: C.muted, fontSize: 13 }}>🎉 All settled!</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: C.bg }}>{['', 'Date', 'Category', 'Amount', 'Note'].map((h) => <th key={h} style={{ padding: '9px 12px', color: C.muted, fontWeight: 600, textAlign: 'left' }}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} style={{ borderTop: `1px solid ${C.border}`, background: selected.has(e.id) ? color + '11' : 'transparent' }}>
                <td style={{ padding: '9px 12px' }}><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} style={{ cursor: 'pointer', accentColor: color }} /></td>
                <td style={{ padding: '9px 12px', color: C.text2 }}>{e.date}</td>
                <td style={{ padding: '9px 12px', color: C.text1 }}>{e.category}</td>
                <td style={{ padding: '9px 12px', color: C.textW, fontWeight: 700 }}>{fmt(e.amount)}</td>
                <td style={{ padding: '9px 12px', color: C.muted }}>{e.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <StatCard label={`${names.a} — Pending`} value={fmt(totalA)} accent={C.purple} icon="👤" sub={`${pendingA.length} transactions`} />
        <StatCard label={`${names.b} — Pending`} value={fmt(totalB)} accent={C.blue} icon="👤" sub={`${pendingB.length} transactions`} />
      </div>

      {/* Partner-to-partner track */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <SectionTitle style={{ margin: 0 }}>🤝 Direct Partner Track Balance</SectionTitle>
          <div style={{ padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, background: partnerCalculations.p2pNetBalance === 0 ? `${C.border}40` : `${C.amber}22`, color: partnerCalculations.p2pNetBalance === 0 ? C.muted : C.amber, border: `1px solid ${partnerCalculations.p2pNetBalance === 0 ? C.border : C.amber}44` }}>
            {partnerCalculations.p2pNetBalance === 0 && '🏆 Fully Settled'}
            {partnerCalculations.p2pNetBalance > 0 && `${names.b} owes ${names.a} ${fmt(Math.abs(partnerCalculations.p2pNetBalance))}`}
            {partnerCalculations.p2pNetBalance < 0 && `${names.a} owes ${names.b} ${fmt(Math.abs(partnerCalculations.p2pNetBalance))}`}
          </div>
        </div>
        {partnerCalculations.pendingPartnerItems.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: C.muted, fontSize: 13, background: `${C.bg}40`, borderRadius: 8, border: `1px dashed ${C.border}` }}>Everything is clear!</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
            {partnerCalculations.pendingPartnerItems.map((item: any) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${C.bg}60`, padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}44` }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{item.category}</span>
                    <span style={{ fontSize: 11, background: `${C.border}60`, color: C.text2, padding: '2px 6px', borderRadius: 4 }}>{item.breakdownText}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.date} • {item.account}{item.note ? ` — "${item.note}"` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{fmt(Number(item.amountOwed))}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{item.debtorName} owes</div>
                  </div>
                  <button type="button" onClick={() => { if (confirm('Split this entry into individual logs?')) actions.settleAndSplitPartnerTransaction(item); }} style={{ background: `${C.amber}15`, border: `1px solid ${C.amber}44`, color: C.amber, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Settle ⚡</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selected.size > 0 && (
        <Card style={{ background: C.green + '11', border: `1px solid ${C.green}44`, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: C.green, fontWeight: 700, fontSize: 15 }}>{selected.size} selected</span>
              <span style={{ color: C.text1, fontSize: 13, marginLeft: 10 }}>Total: {fmt(data.expenses.reduce((s, e) => selected.has(e.id) ? s + (e.amount || 0) : s, 0))}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setSelected(new Set())} style={{ fontSize: 12 }}>Deselect All</Btn>
              <Btn variant="success" onClick={settleSelected} style={{ fontSize: 13 }}>✓ Settle Selected</Btn>
            </div>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', width: '100%' }}>
        <div style={{ flex: '1 1 340px', minWidth: 300 }}><SettleTable items={pendingA} partner={`${names.a}'s Expenses`} color={C.purple} /></div>
        <div style={{ flex: '1 1 340px', minWidth: 300 }}><SettleTable items={pendingB} partner={`${names.b}'s Expenses`} color={C.blue} /></div>
      </div>

      <Card>
        <SectionTitle>Recently Settled</SectionTitle>
        {(() => {
          const recent = data.expenses.filter((e) => e.settled).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
          if (!recent.length) return <p style={{ color: C.muted, fontSize: 13 }}>No settlements yet.</p>;
          return recent.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <span style={{ color: C.text1, fontSize: 13 }}>{e.category}</span>
                <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>{e.date}</span>
                {e.settledFor && <Badge color={C.teal} style={{ marginLeft: 8 }}>↩ {e.settledFor === 'Partner A' ? names.a : names.b}</Badge>}
              </div>
              <span style={{ color: C.green, fontWeight: 700 }}>{fmt(e.amount)}</span>
            </div>
          ));
        })()}
      </Card>
    </div>
  );
}