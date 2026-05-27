'use client';
import React, { useState } from 'react';
import type { AppData, PartnerCalculations } from '@/types';
import { C } from '@/constants';
import { Icon } from '@/components/Icon';

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

  // ── Joint settle state ────────────────────────────────────────────────────
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [p2pSelected, setP2pSelected] = useState<Set<string>>(new Set());

  const pending  = data.expenses.filter((e) => e.toSettle && !e.settled && e.account !== 'Joint');
  const pendingA = pending.filter((e) => e.account.includes(names.a) || e.account.includes('Partner A'));
  const pendingB = pending.filter((e) => e.account.includes(names.b) || e.account.includes('Partner B'));
  const totalA   = pendingA.reduce((s, e) => s + e.amount, 0);
  const totalB   = pendingB.reduce((s, e) => s + e.amount, 0);

  const toggle      = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll   = (arr: any[]) => setSelected((s) => { const n = new Set(s); arr.forEach((e) => n.add(e.id)); return n; });
  const clearGroup  = (arr: any[]) => setSelected((s) => { const n = new Set(s); arr.forEach((e) => n.delete(e.id)); return n; });
  const settleSelected = () => { onBulkSettle([...selected]); setSelected(new Set()); };

  // ── Partner settle wizard state ───────────────────────────────────────────
  const [wizard, setWizard]     = useState<WizardState | null>(null);
  const [settling, setSettling] = useState(false);

  const openWizard  = (items: any[]) => setWizard({ items, step: 1, note: '' });
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

  // ── Wizard derived values ─────────────────────────────────────────────────
  const wizardNetBalance = wizard
    ? wizard.items.reduce((net, item) => {
        const paidByA = item.account === names.a || item.account === 'Partner A';
        return paidByA ? net + Number(item.amountOwed) : net - Number(item.amountOwed);
      }, 0)
    : 0;

  const { pendingPartnerItems, p2pNetBalance } = partnerCalculations;

  // Joint pools pending
  const jointPending = data.expenses.filter((e) => e.toSettle && !e.settled && e.account === 'Joint');
  const hasJointPending = pendingA.length > 0 || pendingB.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Settle wizard modal ──────────────────────────────────────────────── */}
      {wizard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.surface, borderRadius: 20, padding: 24, maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: C.textW }}>
                  {wizard.items.length === 1 ? 'Settle Transaction' : `Settle All (${wizard.items.length} items)`}
                </div>
                <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>
                  Step {wizard.step} of 2 — {wizard.step === 1 ? 'Review' : 'Confirm'}
                </div>
              </div>
              <button onClick={closeWizard} style={{ background: 'transparent', border: 'none', color: C.text2, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>✕</button>
            </div>

            {/* Step progress bars */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {([1, 2] as const).map((s) => (
                <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: wizard.step >= s ? C.accent : `${C.border}60`, transition: 'background 0.3s' }} />
              ))}
            </div>

            {/* ── Step 1: Review ────────────────────────────────────────────── */}
            {wizard.step === 1 && (
              <>
                {/* Net balance summary */}
                <div style={{
                  background: wizardNetBalance === 0 ? `${C.greenBg}` : `${C.accentBg}`,
                  border: `1px solid ${wizardNetBalance === 0 ? C.green : C.accent}44`,
                  borderRadius: 14, padding: '14px 16px', marginBottom: 16
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3, marginBottom: 6 }}>Net settlement direction</div>
                  {wizardNetBalance === 0 && (
                    <div style={{ color: C.green, fontWeight: 700, fontSize: 15 }}>These cancel out — net zero</div>
                  )}
                  {wizardNetBalance > 0 && (
                    <div style={{ color: C.accent, fontWeight: 700, fontSize: 15 }}>
                      {names.b} pays {names.a} <span style={{ fontSize: 20 }}>{fmt(Math.abs(wizardNetBalance))}</span>
                    </div>
                  )}
                  {wizardNetBalance < 0 && (
                    <div style={{ color: C.accent, fontWeight: 700, fontSize: 15 }}>
                      {names.a} pays {names.b} <span style={{ fontSize: 20 }}>{fmt(Math.abs(wizardNetBalance))}</span>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>
                    Each transaction will be split into individual entries and marked settled.
                  </div>
                </div>

                {/* Item list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: 300, overflowY: 'auto' }}>
                  {wizard.items.map((item) => {
                    const paidByA = item.account === names.a || item.account === 'Partner A';
                    const debtor  = paidByA ? names.b : names.a;
                    return (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.surface2, padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.border}33` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>
                            {item.category}
                            {item.note ? <span style={{ color: C.text3, fontWeight: 400 }}> — {item.note}</span> : null}
                          </div>
                          <div style={{ fontSize: 11, color: C.text3, marginTop: 3 }}>
                            {item.date} · paid by {paidByA ? names.a : names.b} · {item.breakdownText}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{fmt(Number(item.amountOwed))}</div>
                          <div style={{ fontSize: 10, color: C.text3 }}>{debtor} owes</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={closeWizard} style={{ flex: 1, background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '12px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                  <button onClick={() => setWizard((w) => w ? { ...w, step: 2 } : w)} style={{ flex: 2, background: C.accent, color: '#0a0a0a', border: 'none', borderRadius: 999, padding: '12px 20px', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>
                    Continue to Confirm →
                  </button>
                </div>
              </>
            )}

            {/* ── Step 2: Confirm ───────────────────────────────────────────── */}
            {wizard.step === 2 && (
              <>
                {/* Summary recap */}
                <div style={{ background: wizardNetBalance === 0 ? C.greenBg : C.accentBg, border: `1px solid ${wizardNetBalance === 0 ? C.green : C.accent}33`, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: C.text2, marginBottom: 6 }}>
                    You are about to settle <strong style={{ color: C.textW }}>{wizard.items.length} transaction{wizard.items.length > 1 ? 's' : ''}</strong>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: wizardNetBalance === 0 ? C.green : C.accent }}>
                    {wizardNetBalance === 0
                      ? 'Net zero — no payment needed'
                      : wizardNetBalance > 0
                      ? `${names.b} → ${names.a}: ${fmt(Math.abs(wizardNetBalance))}`
                      : `${names.a} → ${names.b}: ${fmt(Math.abs(wizardNetBalance))}`
                    }
                  </div>
                </div>

                {/* Optional note */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3, display: 'block', marginBottom: 8 }}>
                    Settlement note (optional)
                  </label>
                  <input
                    value={wizard.note}
                    onChange={(e) => setWizard((w) => w ? { ...w, note: e.target.value } : w)}
                    placeholder="e.g. Settled via GPay, May 2026"
                    style={{ width: '100%', background: C.surface2, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 12, padding: '11px 14px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
                  />
                </div>

                {/* Explanation */}
                <div style={{ background: C.tealBg, border: `1px solid ${C.teal}30`, borderRadius: 12, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: C.teal, lineHeight: 1.6 }}>
                  Each transaction will be split into two entries — one per partner for their share — and marked as settled. The originals will be updated in place.
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setWizard((w) => w ? { ...w, step: 1 } : w)} style={{ flex: 1, background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '12px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                    ← Back
                  </button>
                  <button
                    onClick={confirmSettle}
                    disabled={settling}
                    style={{ flex: 2, background: C.green, color: '#0a0a0a', border: 'none', borderRadius: 999, padding: '12px 20px', fontWeight: 800, cursor: settling ? 'not-allowed' : 'pointer', fontSize: 13, opacity: settling ? 0.6 : 1 }}
                  >
                    {settling ? 'Settling…' : `Confirm & Settle${wizard.items.length > 1 ? ' All' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Hero stat card ───────────────────────────────────────────────────── */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '18px', boxShadow: C.shadowSm }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3, marginBottom: 6 }}>
          Pending Settlements
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, color: C.textW, marginBottom: 16 }}>
          {fmt(totalA + totalB)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {/* Tile A */}
          <div style={{ background: C.surface2, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3, marginBottom: 4 }}>{names.a}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.purple }}>{fmt(totalA)}</div>
            <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{pendingA.length} item{pendingA.length !== 1 ? 's' : ''}</div>
          </div>
          {/* Tile B */}
          <div style={{ background: C.surface2, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3, marginBottom: 4 }}>{names.b}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.blue }}>{fmt(totalB)}</div>
            <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{pendingB.length} item{pendingB.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>

      {/* ── Direct Partner Balance ───────────────────────────────────────────── */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '18px', boxShadow: C.shadowSm }}>
        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.textW, marginBottom: 2 }}>Partner Balance</div>
          <div style={{ fontSize: 12, color: C.text3 }}>Transactions where one partner owes the other directly</div>
        </div>

        {/* Net balance pill + action buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' as const, gap: 8 }}>
          <div style={{
            borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 700,
            background: p2pNetBalance === 0 ? `${C.green}18` : `${C.accent}18`,
            color: p2pNetBalance === 0 ? C.green : C.accent,
            border: `1px solid ${p2pNetBalance === 0 ? C.green : C.accent}44`
          }}>
            {p2pNetBalance === 0 && 'Fully Settled'}
            {p2pNetBalance > 0 && `${names.b} owes ${names.a} ${fmt(Math.abs(p2pNetBalance))}`}
            {p2pNetBalance < 0 && `${names.a} owes ${names.b} ${fmt(Math.abs(p2pNetBalance))}`}
          </div>
          {pendingPartnerItems.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              {p2pSelected.size > 0 && (
                <button
                  onClick={() => openWizard(pendingPartnerItems.filter((i: any) => p2pSelected.has(i.id)))}
                  style={{ background: C.accent, color: '#0a0a0a', border: 'none', borderRadius: 999, padding: '8px 16px', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}
                >
                  Settle Selected ({p2pSelected.size})
                </button>
              )}
              <button
                onClick={() => openWizard(pendingPartnerItems)}
                style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
              >
                Settle All ({pendingPartnerItems.length})
              </button>
            </div>
          )}
        </div>

        {/* Transaction rows */}
        {pendingPartnerItems.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '28px 12px', textAlign: 'center' }}>
            <Icon name="check" size={32} color={C.green} />
            <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>All settled!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingPartnerItems.map((item: any) => {
              const paidByA = item.account === names.a || item.account === 'Partner A';
              const isP2pSel = p2pSelected.has(item.id);
              return (
                <div
                  key={item.id}
                  style={{
                    background: isP2pSel ? `${C.accent}10` : C.surface,
                    borderRadius: 14, padding: '14px 16px',
                    border: `1px solid ${isP2pSel ? C.accent + '44' : C.border + '33'}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer', transition: 'all 0.15s'
                  }}
                  onClick={() => setP2pSelected(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; })}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isP2pSel}
                    onChange={() => {}}
                    onClick={(e) => e.stopPropagation()}
                    style={{ cursor: 'pointer', accentColor: C.accent, width: 16, height: 16, flexShrink: 0 }}
                  />
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{item.category}</span>
                      <span style={{ borderRadius: 999, padding: '2px 10px', fontSize: 11, background: `${C.border}60`, color: C.text2 }}>{item.breakdownText}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.text3 }}>
                      {item.date} · paid by {paidByA ? names.a : names.b}
                      {item.note ? ` — "${item.note}"` : ''}
                    </div>
                  </div>
                  {/* Amount + settle button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.accent }}>{fmt(Number(item.amountOwed))}</div>
                      <div style={{ fontSize: 10, color: C.text3 }}>{item.debtorName} owes</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openWizard([item]); }}
                      style={{ background: C.accent, color: '#0a0a0a', border: 'none', borderRadius: 999, padding: '7px 12px', fontWeight: 800, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <Icon name="check" size={15} color="#0a0a0a" />
                      Settle
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Joint Pool Settlements ───────────────────────────────────────────── */}
      {hasJointPending && (
        <div style={{ background: C.surface, borderRadius: 20, padding: '18px', boxShadow: C.shadowSm }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.textW, marginBottom: 4 }}>Joint Pool Settlements</div>
          <div style={{ fontSize: 12, color: C.text3, marginBottom: 16 }}>Select transactions to bulk settle</div>

          {/* Bulk settle bar */}
          {selected.size > 0 && (
            <div style={{ background: `${C.green}11`, border: `1px solid ${C.green}44`, borderRadius: 14, padding: '12px 16px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
              <div>
                <span style={{ color: C.green, fontWeight: 700, fontSize: 14 }}>{selected.size} selected</span>
                <span style={{ color: C.text1, fontSize: 13, marginLeft: 10 }}>
                  Total: {fmt(data.expenses.reduce((s, e) => selected.has(e.id) ? s + (e.amount || 0) : s, 0))}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSelected(new Set())} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '6px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>Deselect All</button>
                <button onClick={settleSelected} style={{ background: C.green, color: '#0a0a0a', border: 'none', borderRadius: 999, padding: '7px 16px', fontWeight: 800, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="check" size={13} color="#0a0a0a" />
                  Settle Selected
                </button>
              </div>
            </div>
          )}

          {/* Partner A group */}
          {pendingA.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3 }}>{names.a}&apos;s Expenses</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.purple, marginTop: 2 }}>{fmt(pendingA.reduce((s, e) => s + e.amount, 0))}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => selectAll(pendingA)} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '5px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 11 }}>Select All</button>
                  <button onClick={() => clearGroup(pendingA)} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '5px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 11 }}>Clear</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pendingA.map((e) => (
                  <div
                    key={e.id}
                    style={{ background: selected.has(e.id) ? `${C.purple}11` : C.surface2, borderRadius: 14, padding: '12px 14px', border: `1px solid ${selected.has(e.id) ? C.purple + '44' : C.border + '33'}`, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'all 0.15s' }}
                    onClick={() => toggle(e.id)}
                  >
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => {}} onClick={(ev) => ev.stopPropagation()} style={{ cursor: 'pointer', accentColor: C.purple, width: 15, height: 15, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{e.category}</div>
                      <div style={{ fontSize: 11, color: C.text3 }}>{e.date}{e.note ? ` — ${e.note}` : ''}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.purple, flexShrink: 0 }}>{fmt(e.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Partner B group */}
          {pendingB.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3 }}>{names.b}&apos;s Expenses</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.blue, marginTop: 2 }}>{fmt(pendingB.reduce((s, e) => s + e.amount, 0))}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => selectAll(pendingB)} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '5px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 11 }}>Select All</button>
                  <button onClick={() => clearGroup(pendingB)} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '5px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 11 }}>Clear</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pendingB.map((e) => (
                  <div
                    key={e.id}
                    style={{ background: selected.has(e.id) ? `${C.blue}11` : C.surface2, borderRadius: 14, padding: '12px 14px', border: `1px solid ${selected.has(e.id) ? C.blue + '44' : C.border + '33'}`, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'all 0.15s' }}
                    onClick={() => toggle(e.id)}
                  >
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => {}} onClick={(ev) => ev.stopPropagation()} style={{ cursor: 'pointer', accentColor: C.blue, width: 15, height: 15, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{e.category}</div>
                      <div style={{ fontSize: 11, color: C.text3 }}>{e.date}{e.note ? ` — ${e.note}` : ''}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.blue, flexShrink: 0 }}>{fmt(e.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Recently Settled ─────────────────────────────────────────────────── */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '18px', boxShadow: C.shadowSm }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.textW, marginBottom: 14 }}>Recently Settled</div>
        {(() => {
          const recent = data.expenses
            .filter((e) => e.settled)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
          if (!recent.length) return (
            <div style={{ fontSize: 13, color: C.text3 }}>No settlements yet.</div>
          );
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recent.map((e) => (
                <div key={e.id} style={{ background: C.surface, borderRadius: 14, padding: '14px 16px', border: `1px solid ${C.border}33`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{e.category}</div>
                    <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                      {e.date}
                      {e.settledFor && (
                        <span style={{ marginLeft: 8, borderRadius: 999, padding: '2px 10px', fontSize: 10, background: `${C.teal}18`, color: C.teal, fontWeight: 700 }}>
                          {e.settledFor === 'Partner A' ? names.a : e.settledFor === 'Partner B' ? names.b : e.settledFor}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.green, flexShrink: 0 }}>{fmt(e.amount)}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
