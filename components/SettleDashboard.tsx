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

// ─── Settle wizard state ──────────────────────────────────────────────────────
interface WizardState {
  items: any[];       // items being settled (1 for single, all for bulk)
  step: 1 | 2;
  note: string;
}

export function SettleDashboard({ fmt, data, onBulkSettle, partnerCalculations, actions }: Props) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };

  // ── Joint settle state (existing) ─────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pending  = data.expenses.filter((e) => e.toSettle && !e.settled && e.account !== 'Joint');
  const pendingA = pending.filter((e) => e.account.includes(names.a) || e.account.includes('Partner A'));
  const pendingB = pending.filter((e) => e.account.includes(names.b) || e.account.includes('Partner B'));
  const totalA   = pendingA.reduce((s, e) => s + e.amount, 0);
  const totalB   = pendingB.reduce((s, e) => s + e.amount, 0);

  const toggle     = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll  = (arr: any[]) => setSelected((s) => { const n = new Set(s); arr.forEach((e) => n.add(e.id)); return n; });
  const clearGroup = (arr: any[]) => setSelected((s) => { const n = new Set(s); arr.forEach((e) => n.delete(e.id)); return n; });
  const settleSelected = () => { onBulkSettle([...selected]); setSelected(new Set()); };

  // ── Partner settle wizard state (new) ─────────────────────────────────────
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [settling, setSettling] = useState(false);

  const openWizard = (items: any[]) => setWizard({ items, step: 1, note: '' });
  const closeWizard = () => { setWizard(null); setSettling(false); };

  const confirmSettle = async () => {
    if (!wizard) return;
    setSettling(true);
    for (const item of wizard.items) {
      await actions.settleAndSplitPartnerTransaction(
        wizard.note ? { ...item, note: `${item.note ?? ''} ${wizard.note}`.trim() } : item
      );
    }
    setSettling(false);
    closeWizard();
  };

  // ── Wizard derived values ──────────────────────────────────────────────────
  const wizardNetBalance = wizard
    ? wizard.items.reduce((net, item) => {
        const paidByA = item.account === names.a || item.account === 'Partner A';
        return paidByA ? net + Number(item.amountOwed) : net - Number(item.amountOwed);
      }, 0)
    : 0;

  const { pendingPartnerItems, p2pNetBalance } = partnerCalculations;

  // ─── Joint settle table (unchanged) ────────────────────────────────────────
  const SettleTable = ({ items, partner, color }: { items: any[]; partner: string; color: string }) => (
    <Card style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <SectionTitle style={{ margin: 0 }}>{partner}</SectionTitle>
          <div style={{ color, fontWeight: 800, fontSize: 18, marginTop: 2 }}>
            {fmt(items.reduce((s, e) => s + e.amount, 0))} pending
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => selectAll(items)}>Select All</Btn>
          <Btn variant="ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => clearGroup(items)}>Clear</Btn>
        </div>
      </div>
      {items.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13 }}>🎉 All settled!</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              {['', 'Date', 'Category', 'Amount', 'Note'].map((h) => (
                <th key={h} style={{ padding: '9px 12px', color: C.muted, fontWeight: 600, textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} style={{ borderTop: `1px solid ${C.border}`, background: selected.has(e.id) ? color + '11' : 'transparent' }}>
                <td style={{ padding: '9px 12px' }}>
                  <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} style={{ cursor: 'pointer', accentColor: color }} />
                </td>
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

      {/* ── Settle wizard modal ──────────────────────────────────────────────── */}
      {wizard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: 28, maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.textW }}>
                  {wizard.items.length === 1 ? '⚡ Settle Transaction' : `⚡ Settle All (${wizard.items.length} items)`}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                  Step {wizard.step} of 2 — {wizard.step === 1 ? 'Review' : 'Confirm'}
                </div>
              </div>
              <button onClick={closeWizard} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {([1, 2] as const).map((s) => (
                <div key={s} style={{ flex: 1, height: 3, borderRadius: 0, background: wizard.step >= s ? C.amber : `${C.border}60`, transition: 'background 0.3s' }} />
              ))}
            </div>

            {/* ── Step 1: Review ──────────────────────────────────────────────── */}
            {wizard.step === 1 && (
              <>
                {/* Net balance summary */}
                <div style={{ background: wizardNetBalance === 0 ? `${C.border}30` : `${C.amber}15`, border: `1px solid ${wizardNetBalance === 0 ? C.border : C.amber}44`, borderRadius: 0, padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Net settlement direction</div>
                  {wizardNetBalance === 0 && (
                    <div style={{ color: C.green, fontWeight: 700, fontSize: 15 }}>🏆 These cancel out — net zero</div>
                  )}
                  {wizardNetBalance > 0 && (
                    <div style={{ color: C.amber, fontWeight: 700, fontSize: 15 }}>
                      {names.b} pays {names.a} <span style={{ fontSize: 20 }}>{fmt(Math.abs(wizardNetBalance))}</span>
                    </div>
                  )}
                  {wizardNetBalance < 0 && (
                    <div style={{ color: C.amber, fontWeight: 700, fontSize: 15 }}>
                      {names.a} pays {names.b} <span style={{ fontSize: 20 }}>{fmt(Math.abs(wizardNetBalance))}</span>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                    Each transaction will be split into individual entries and marked settled.
                  </div>
                </div>

                {/* Item list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: 300, overflowY: 'auto' }}>
                  {wizard.items.map((item) => {
                    const paidByA = item.account === names.a || item.account === 'Partner A';
                    const debtor  = paidByA ? names.b : names.a;
                    return (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${C.bg}80`, padding: '10px 14px', borderRadius: 0, border: `1px solid ${C.border}33` }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>
                            {item.category}
                            {item.note ? <span style={{ color: C.muted, fontWeight: 400 }}> — {item.note}</span> : null}
                          </div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                            {item.date} • paid by {paidByA ? names.a : names.b} • {item.breakdownText}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{fmt(Number(item.amountOwed))}</div>
                          <div style={{ fontSize: 10, color: C.muted }}>{debtor} owes</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="ghost" onClick={closeWizard} style={{ flex: 1 }}>Cancel</Btn>
                  <Btn variant="primary" onClick={() => setWizard((w) => w ? { ...w, step: 2 } : w)} style={{ flex: 2 }}>
                    Continue to Confirm →
                  </Btn>
                </div>
              </>
            )}

            {/* ── Step 2: Confirm ─────────────────────────────────────────────── */}
            {wizard.step === 2 && (
              <>
                {/* Summary recap */}
                <div style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}33`, borderRadius: 0, padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: C.text2, marginBottom: 6 }}>
                    You are about to settle <strong style={{ color: C.textW }}>{wizard.items.length} transaction{wizard.items.length > 1 ? 's' : ''}</strong>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: wizardNetBalance === 0 ? C.green : C.amber }}>
                    {wizardNetBalance === 0
                      ? '🏆 Net zero — no payment needed'
                      : wizardNetBalance > 0
                      ? `${names.b} → ${names.a}: ${fmt(Math.abs(wizardNetBalance))}`
                      : `${names.a} → ${names.b}: ${fmt(Math.abs(wizardNetBalance))}`
                    }
                  </div>
                </div>

                {/* Optional note */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Add a settlement note (optional)
                  </label>
                  <input
                    value={wizard.note}
                    onChange={(e) => setWizard((w) => w ? { ...w, note: e.target.value } : w)}
                    placeholder="e.g. Settled via GPay, May 2026"
                    style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 0, padding: '10px 14px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
                  />
                </div>

                {/* What happens explanation */}
                <div style={{ background: `${C.teal}10`, border: `1px solid ${C.teal}30`, borderRadius: 0, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: C.teal, lineHeight: 1.6 }}>
                  💡 Each transaction will be split into two entries — one per partner for their share — and marked as settled. The originals will be updated in place.
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="ghost" onClick={() => setWizard((w) => w ? { ...w, step: 1 } : w)} style={{ flex: 1 }}>
                    ← Back
                  </Btn>
                  <Btn
                    variant="success"
                    onClick={confirmSettle}
                    style={{ flex: 2, opacity: settling ? 0.6 : 1 }}
                  >
                    {settling ? '⏳ Settling…' : `✓ Confirm & Settle${wizard.items.length > 1 ? ' All' : ''}`}
                  </Btn>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Joint settle stat cards ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <StatCard label={`${names.a} — Pending`} value={fmt(totalA)} accent={C.purple} icon="👤" sub={`${pendingA.length} transactions`} />
        <StatCard label={`${names.b} — Pending`} value={fmt(totalB)} accent={C.blue}   icon="👤" sub={`${pendingB.length} transactions`} />
      </div>

      {/* ── Partner-to-partner track ─────────────────────────────────────────── */}
      <Card>
        {/* Card header with Settle All button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <SectionTitle style={{ margin: 0 }}>🤝 Direct Partner Track Balance</SectionTitle>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              Transactions where one partner owes the other directly
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Net balance pill */}
            <div style={{ padding: '6px 12px', borderRadius: 0, fontSize: 13, fontWeight: 700, background: p2pNetBalance === 0 ? `${C.border}40` : `${C.amber}22`, color: p2pNetBalance === 0 ? C.muted : C.amber, border: `1px solid ${p2pNetBalance === 0 ? C.border : C.amber}44` }}>
              {p2pNetBalance === 0 && '🏆 Fully Settled'}
              {p2pNetBalance > 0 && `${names.b} owes ${names.a} ${fmt(Math.abs(p2pNetBalance))}`}
              {p2pNetBalance < 0 && `${names.a} owes ${names.b} ${fmt(Math.abs(p2pNetBalance))}`}
            </div>
            {/* Settle All button — only when there are items to settle */}
            {pendingPartnerItems.length > 0 && (
              <Btn
                variant="primary"
                style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' as const }}
                onClick={() => openWizard(pendingPartnerItems)}
              >
                ⚡ Settle All ({pendingPartnerItems.length})
              </Btn>
            )}
          </div>
        </div>

        {/* Item list */}
        {pendingPartnerItems.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: C.muted, fontSize: 13, background: `${C.bg}40`, borderRadius: 0, border: `1px dashed ${C.border}` }}>
            Everything is clear! 🏆
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingPartnerItems.map((item: any) => {
              const paidByA = item.account === names.a || item.account === 'Partner A';
              return (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${C.bg}60`, padding: '10px 14px', borderRadius: 0, border: `1px solid ${C.border}44` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{item.category}</span>
                      <span style={{ fontSize: 11, background: `${C.border}60`, color: C.text2, padding: '2px 6px', borderRadius: 0 }}>{item.breakdownText}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {item.date} • paid by {paidByA ? names.a : names.b}
                      {item.note ? ` — "${item.note}"` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{fmt(Number(item.amountOwed))}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{item.debtorName} owes</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openWizard([item])}
                      style={{ background: `${C.amber}15`, border: `1px solid ${C.amber}44`, color: C.amber, padding: '6px 10px', borderRadius: 0, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const }}
                    >
                      Settle ⚡
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Joint bulk settle bar ────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <Card style={{ background: C.green + '11', border: `1px solid ${C.green}44`, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: C.green, fontWeight: 700, fontSize: 15 }}>{selected.size} selected</span>
              <span style={{ color: C.text1, fontSize: 13, marginLeft: 10 }}>
                Total: {fmt(data.expenses.reduce((s, e) => selected.has(e.id) ? s + (e.amount || 0) : s, 0))}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setSelected(new Set())} style={{ fontSize: 12 }}>Deselect All</Btn>
              <Btn variant="success" onClick={settleSelected} style={{ fontSize: 13 }}>✓ Settle Selected</Btn>
            </div>
          </div>
        </Card>
      )}

      {/* ── Joint settle tables ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', width: '100%' }}>
        <div style={{ flex: '1 1 340px', minWidth: 300 }}>
          <SettleTable items={pendingA} partner={`${names.a}'s Expenses`} color={C.purple} />
        </div>
        <div style={{ flex: '1 1 340px', minWidth: 300 }}>
          <SettleTable items={pendingB} partner={`${names.b}'s Expenses`} color={C.blue} />
        </div>
      </div>

      {/* ── Recently settled ─────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Recently Settled</SectionTitle>
        {(() => {
          const recent = data.expenses
            .filter((e) => e.settled)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
          if (!recent.length) return <p style={{ color: C.muted, fontSize: 13 }}>No settlements yet.</p>;
          return recent.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <span style={{ color: C.text1, fontSize: 13 }}>{e.category}</span>
                <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>{e.date}</span>
                {e.settledFor && (
                  <Badge color={C.teal} style={{ marginLeft: 8 }}>
                    ↩ {e.settledFor === 'Partner A' ? names.a : e.settledFor === 'Partner B' ? names.b : e.settledFor}
                  </Badge>
                )}
              </div>
              <span style={{ color: C.green, fontWeight: 700 }}>{fmt(e.amount)}</span>
            </div>
          ));
        })()}
      </Card>
    </div>
  );
}
