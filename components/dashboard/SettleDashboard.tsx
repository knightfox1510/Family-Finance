'use client';
import React, { useState, useMemo } from 'react';
import type { AppData, PartnerCalculations } from '@/types';
import { C } from '@/constants';
import { Icon } from '@/components/ui/Icon';

interface Props {
  fmt: (n: number) => string;
  data: AppData;
  onBulkSettle: (ids: string[]) => void;
  partnerCalculations: PartnerCalculations;
  actions: any;
}

interface WizardState {
  items: any[];
  step: 1 | 2;
  note: string;
}

function catIcon(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('grocer') || c.includes('bazaar') || c.includes('mart') || c.includes('supermarket')) return 'cart';
  if (c.includes('dining') || c.includes('restaurant') || c.includes('swiggy') || c.includes('zomato') || c.includes('food') || c.includes('lunch') || c.includes('dinner')) return 'utensils';
  if (c.includes('electric') || c.includes('power') || c.includes('utility') || c.includes('bill')) return 'zap';
  if (c.includes('uber') || c.includes('ola') || c.includes('cab') || c.includes('taxi') || c.includes('transport') || c.includes('fuel') || c.includes('petrol')) return 'car';
  if (c.includes('coffee') || c.includes('cafe') || c.includes('snack') || c.includes('tea')) return 'coffee';
  if (c.includes('invest') || c.includes('mutual') || c.includes('stock') || c.includes('fund')) return 'trendUp';
  if (c.includes('rent') || c.includes('mortgage') || c.includes('home') || c.includes('house')) return 'home';
  if (c.includes('send') || c.includes('transfer') || c.includes('upi') || c.includes('neft')) return 'send';
  if (c.includes('medical') || c.includes('health') || c.includes('pharmacy') || c.includes('doctor')) return 'alert';
  return 'card';
}

// ── Section Header with collapse toggle ──────────────────────────────────────
function SectionHeader({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  badge,
  badgeColor,
  collapsed,
  onToggle,
  accentBorder,
}: {
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  badge?: string | null;
  badgeColor?: string;
  collapsed: boolean;
  onToggle: () => void;
  accentBorder?: string;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '16px 18px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        borderBottom: collapsed ? 'none' : `1px solid ${C.border}`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        background: iconBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon name={icon} size={20} color={iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.textW, letterSpacing: '-0.01em' }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{subtitle}</div>
      </div>
      {badge && (
        <div style={{
          padding: '4px 10px',
          borderRadius: 99,
          background: `${badgeColor ?? C.accent}22`,
          border: `1px solid ${badgeColor ?? C.accent}44`,
          fontSize: 12,
          fontWeight: 800,
          color: badgeColor ?? C.accent,
          flexShrink: 0,
        }}>
          {badge}
        </div>
      )}
      <div style={{
        transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
        transition: 'transform 0.2s',
        flexShrink: 0,
      }}>
        <Icon name="chevronDown" size={16} color={C.text3} />
      </div>
    </button>
  );
}

export function SettleDashboard({ fmt, data, onBulkSettle, partnerCalculations, actions }: Props) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };

  // ── Collapse state ────────────────────────────────────────────────────────
  const [partnerCollapsed, setPartnerCollapsed] = useState(false);
  const [jointCollapsed, setJointCollapsed]     = useState(false);

  // ── Joint settle state ────────────────────────────────────────────────────
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [p2pSelected, setP2pSelected] = useState<Set<string>>(new Set());

  const pending  = data.expenses.filter((e) => e.toSettle && !e.settled && e.account !== 'Joint');
  const pendingA = pending.filter((e) => e.account.includes(names.a) || e.account.includes('Partner A'));
  const pendingB = pending.filter((e) => e.account.includes(names.b) || e.account.includes('Partner B'));

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
    setP2pSelected(new Set());
  };

  const wizardNetBalance = wizard
    ? wizard.items.reduce((net, item) => {
        const paidByA = item.account === names.a || item.account === 'Partner A';
        return paidByA ? net + Number(item.amountOwed) : net - Number(item.amountOwed);
      }, 0)
    : 0;

  const { pendingPartnerItems, p2pNetBalance } = partnerCalculations;

  const p2pAmountA  = pendingPartnerItems.filter((i: any) => i.account === names.a || i.account === 'Partner A').reduce((s: number, i: any) => s + Number(i.amountOwed), 0);
  const p2pCountA   = pendingPartnerItems.filter((i: any) => i.account === names.a || i.account === 'Partner A').length;
  const p2pAmountB  = pendingPartnerItems.filter((i: any) => i.account === names.b || i.account === 'Partner B').reduce((s: number, i: any) => s + Number(i.amountOwed), 0);
  const p2pCountB   = pendingPartnerItems.filter((i: any) => i.account === names.b || i.account === 'Partner B').length;

  const p2pDir = p2pNetBalance === 0 ? 'zero' : p2pNetBalance > 0 ? 'b-to-a' : 'a-to-b';
  const p2pSelTotal = pendingPartnerItems.filter((i: any) => p2pSelected.has(i.id)).reduce((s: number, i: any) => s + Number(i.amountOwed), 0);

  // Selected items for wizard
  const p2pSelItems = pendingPartnerItems.filter((i: any) => p2pSelected.has(i.id));

  // Net direction for the current selection — cancels opposing items
  const p2pSelNetBalance = p2pSelItems.reduce((net: number, item: any) => {
    const paidByA = item.account === names.a || item.account === 'Partner A';
    return paidByA ? net + Number(item.amountOwed) : net - Number(item.amountOwed);
  }, 0);
  const p2pSelNetAbs  = Math.abs(p2pSelNetBalance);
  const p2pSelNetFrom = p2pSelNetBalance > 0 ? names.b : names.a;
  const p2pSelNetTo   = p2pSelNetBalance > 0 ? names.a : names.b;
  const p2pSelIsZero  = p2pSelNetAbs < 0.01;

  const hasJointPending = pendingA.length > 0 || pendingB.length > 0;
  const jointTotal = pending.reduce((s, e) => s + Number(e.amount ?? 0), 0);

  // ── Net settlement direction text ─────────────────────────────────────────
  const netDirectionText = useMemo(() => {
    if (p2pDir === 'zero') return null;
    const amount = fmt(Math.abs(p2pNetBalance));
    if (p2pDir === 'b-to-a') return { from: names.b, to: names.a, amount };
    return { from: names.a, to: names.b, amount };
  }, [p2pNetBalance, p2pDir, names, fmt]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 80 }}>

      {/* ── WIZARD MODAL ─────────────────────────────────────────────────────── */}
      {wizard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.surface, borderRadius: 24, padding: 24, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: C.textW }}>
                  {wizard.items.length === 1 ? 'Settle Transaction' : `Settle ${wizard.items.length} Items`}
                </div>
                <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>
                  Step {wizard.step} of 2 — {wizard.step === 1 ? 'Review breakdown' : 'Confirm & record'}
                </div>
              </div>
              <button onClick={closeWizard} style={{ background: C.surface2, border: 'none', color: C.text2, cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>✕</button>
            </div>

            {/* Step progress */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {([1, 2] as const).map((s) => (
                <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: wizard.step >= s ? C.accent : `${C.border}60`, transition: 'background 0.3s' }} />
              ))}
            </div>

            {/* STEP 1: Transaction breakdown */}
            {wizard.step === 1 && (
              <>
                {/* Net direction summary */}
                <div style={{
                  background: wizardNetBalance === 0 ? C.greenBg : C.accentBg,
                  border: `1px solid ${wizardNetBalance === 0 ? C.green : C.accent}44`,
                  borderRadius: 16, padding: '16px 18px', marginBottom: 16,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>Net settlement</div>
                    {wizardNetBalance === 0 && (
                      <div style={{ color: C.green, fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="check" size={16} color={C.green} /> These cancel out — net zero
                      </div>
                    )}
                    {wizardNetBalance !== 0 && (
                      <div style={{ fontSize: 14, color: C.text1, fontWeight: 600 }}>
                        <span style={{ color: C.accent, fontWeight: 800 }}>
                          {wizardNetBalance > 0 ? names.b : names.a}
                        </span>
                        {' pays '}
                        <span style={{ color: C.accent, fontWeight: 800 }}>
                          {wizardNetBalance > 0 ? names.a : names.b}
                        </span>
                      </div>
                    )}
                  </div>
                  {wizardNetBalance !== 0 && (
                    <div style={{ fontSize: 26, fontWeight: 900, color: C.accent, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      {fmt(Math.abs(wizardNetBalance))}
                    </div>
                  )}
                </div>

                {/* Per-transaction breakdown */}
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
                  Transaction Breakdown ({wizard.items.length} items)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: 320, overflowY: 'auto' }}>
                  {wizard.items.map((item) => {
                    const paidByA = item.account === names.a || item.account === 'Partner A';
                    const payer   = paidByA ? names.a : names.b;
                    const debtor  = paidByA ? names.b : names.a;
                    const icon    = catIcon(item.category);
                    return (
                      <div key={item.id} style={{
                        background: C.surface2,
                        borderRadius: 12,
                        padding: '12px 14px',
                        border: `1px solid ${C.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}>
                        {/* Icon */}
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: C.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name={icon} size={16} color={C.accent} />
                        </div>
                        {/* Details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.textW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.category}{item.note ? <span style={{ color: C.text3, fontWeight: 400 }}> · {item.note}</span> : null}
                          </div>
                          <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                            {item.date} · paid by <span style={{ color: C.text2, fontWeight: 600 }}>{payer}</span>
                          </div>
                        </div>
                        {/* Amounts */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: C.accent, fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(Number(item.amountOwed))}
                          </div>
                          <div style={{ fontSize: 10, color: C.text3 }}>
                            {debtor} owes
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total row */}
                {wizard.items.length > 1 && (
                  <div style={{
                    background: C.surface2,
                    borderRadius: 12,
                    padding: '12px 14px',
                    marginBottom: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: `1px solid ${C.accent}33`,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text2 }}>
                      Total across {wizard.items.length} transactions
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: C.accent, fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(wizard.items.reduce((s, i) => s + Number(i.amountOwed), 0))}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={closeWizard} style={{ flex: 1, background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '12px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={() => setWizard((w) => w ? { ...w, step: 2 } : w)} style={{ flex: 2, background: C.accent, color: '#0a0a0a', border: 'none', borderRadius: 999, padding: '12px 20px', fontWeight: 800, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                    Confirm →
                  </button>
                </div>
              </>
            )}

            {/* STEP 2: Confirm */}
            {wizard.step === 2 && (
              <>
                <div style={{ background: wizardNetBalance === 0 ? C.greenBg : C.accentBg, border: `1px solid ${wizardNetBalance === 0 ? C.green : C.accent}33`, borderRadius: 16, padding: '18px', marginBottom: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: C.text2, marginBottom: 8 }}>
                    Settling <strong style={{ color: C.textW }}>{wizard.items.length} transaction{wizard.items.length > 1 ? 's' : ''}</strong>
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: wizardNetBalance === 0 ? C.green : C.accent, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
                    {wizardNetBalance === 0 ? 'Net zero ✓' : fmt(Math.abs(wizardNetBalance))}
                  </div>
                  {wizardNetBalance !== 0 && (
                    <div style={{ fontSize: 13, color: C.text2, marginTop: 6 }}>
                      {wizardNetBalance > 0 ? names.b : names.a} → {wizardNetBalance > 0 ? names.a : names.b}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>
                    Settlement note (optional)
                  </div>
                  <input
                    value={wizard.note}
                    onChange={(e) => setWizard((w) => w ? { ...w, note: e.target.value } : w)}
                    placeholder="e.g. Settled via GPay, May 2026"
                    style={{ width: '100%', background: C.surface2, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 12, padding: '11px 14px', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ background: `${C.teal}15`, border: `1px solid ${C.teal}30`, borderRadius: 12, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: C.teal, lineHeight: 1.6 }}>
                  Each transaction will be split, both shares marked settled.
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setWizard((w) => w ? { ...w, step: 1 } : w)} style={{ flex: 1, background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '12px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>← Back</button>
                  <button onClick={confirmSettle} disabled={settling} style={{ flex: 2, background: C.green, color: '#0a0a0a', border: 'none', borderRadius: 999, padding: '12px 20px', fontWeight: 800, cursor: settling ? 'not-allowed' : 'pointer', fontSize: 13, opacity: settling ? 0.6 : 1, fontFamily: 'inherit' }}>
                    {settling ? 'Recording…' : `Confirm & Settle`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1: DIRECT PARTNER BALANCE
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: C.surface,
        borderRadius: 20,
        border: `1px solid ${C.purple}33`,
        boxShadow: C.shadowSm,
        overflow: 'hidden',
      }}>
        <SectionHeader
          icon="handshake"
          iconColor={C.purple}
          iconBg={`${C.purple}20`}
          title="Direct Partner Balance"
          subtitle="Personal expenses split between partners"
          badge={pendingPartnerItems.length > 0 ? `${pendingPartnerItems.length} pending` : 'All settled'}
          badgeColor={pendingPartnerItems.length > 0 ? C.purple : C.green}
          collapsed={partnerCollapsed}
          onToggle={() => setPartnerCollapsed((v) => !v)}
          accentBorder={C.purple}
        />

        {!partnerCollapsed && (
          <div style={{ padding: '0 16px 16px' }}>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: `${C.purple}12`, borderRadius: 14, padding: '12px 14px', border: `1px solid ${C.purple}22` }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 5 }}>
                  {names.a} paid
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.purple, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(p2pAmountA)}
                </div>
                <div style={{ fontSize: 10, color: C.text3, marginTop: 3 }}>
                  {p2pCountA} transaction{p2pCountA !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ background: `${C.blue}12`, borderRadius: 14, padding: '12px 14px', border: `1px solid ${C.blue}22` }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 5 }}>
                  {names.b} paid
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.blue, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(p2pAmountB)}
                </div>
                <div style={{ fontSize: 10, color: C.text3, marginTop: 3 }}>
                  {p2pCountB} transaction{p2pCountB !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* Net direction */}
            {p2pDir === 'zero' ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: C.greenBg, border: `1px solid ${C.green}44`,
                borderRadius: 14, padding: '12px 16px', marginBottom: 14,
              }}>
                <Icon name="check" size={18} color={C.green} />
                <span style={{ fontWeight: 700, fontSize: 14, color: C.green }}>All settled up · no payment needed</span>
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center',
                background: C.accentBg, border: `1px solid ${C.accent}44`,
                borderRadius: 14, padding: '12px 16px', marginBottom: 14, gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 3 }}>Net direction</div>
                  <div style={{ fontSize: 14, color: C.text1 }}>
                    <span style={{ color: C.accent, fontWeight: 800 }}>{netDirectionText?.from}</span>
                    <span style={{ color: C.text3 }}> pays </span>
                    <span style={{ color: C.accent, fontWeight: 800 }}>{netDirectionText?.to}</span>
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: C.accent, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {fmt(Math.abs(p2pNetBalance))}
                </div>
              </div>
            )}

            {/* Select all / clear */}
            {pendingPartnerItems.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>
                  {p2pSelected.size > 0 ? `${p2pSelected.size} selected` : `${pendingPartnerItems.length} transactions`}
                </span>
                <span
                  onClick={() => p2pSelected.size === pendingPartnerItems.length
                    ? setP2pSelected(new Set())
                    : setP2pSelected(new Set(pendingPartnerItems.map((i: any) => i.id)))
                  }
                  style={{ fontSize: 12, fontWeight: 700, color: C.accent, cursor: 'pointer' }}
                >
                  {p2pSelected.size === pendingPartnerItems.length ? 'Clear all' : 'Select all'}
                </span>
              </div>
            )}

            {/* Transaction list */}
            {pendingPartnerItems.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 12px', textAlign: 'center' }}>
                <Icon name="check" size={28} color={C.green} />
                <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>No pending splits</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingPartnerItems.map((item: any) => {
                  const paidByA  = item.account === names.a || item.account === 'Partner A';
                  const payer    = paidByA ? names.a : names.b;
                  const debtor   = paidByA ? names.b : names.a;
                  const isP2pSel = p2pSelected.has(item.id);
                  const icon     = catIcon(item.category);
                  return (
                    <div
                      key={item.id}
                      onClick={() => setP2pSelected((prev) => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                        background: isP2pSel ? `${C.purple}15` : C.surface2,
                        border: `1px solid ${isP2pSel ? C.purple : C.border}`,
                        borderRadius: 14, cursor: 'pointer', transition: 'all .12s',
                      }}
                    >
                      {/* Custom checkbox */}
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        border: `1.5px solid ${isP2pSel ? C.purple : C.border2}`,
                        background: isP2pSel ? C.purple : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isP2pSel && <Icon name="check" size={12} color="#fff" strokeWidth={3} />}
                      </div>
                      {/* Category icon */}
                      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `${C.purple}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={icon} size={17} color={C.purple} />
                      </div>
                      {/* Meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.textW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.category}</div>
                        <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                          {item.date} · <span style={{ color: C.text2 }}>{payer}</span> paid · {item.breakdownText}
                        </div>
                      </div>
                      {/* Amount + debtor label */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.purple, fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(Number(item.amountOwed))}
                        </div>
                        <div style={{ fontSize: 10, color: C.text3, marginTop: 1 }}>
                          {debtor} owes
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Settle selected button — shows total + net direction */}
            {p2pSelected.size > 0 && (
              <button
                onClick={() => openWizard(p2pSelItems)}
                style={{
                  marginTop: 12,
                  width: '100%',
                  padding: '14px 18px',
                  borderRadius: 16,
                  border: 'none',
                  background: C.purple,
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Icon name="zap" size={18} color="#fff" strokeWidth={2.5} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>
                    Settle {p2pSelected.size} item{p2pSelected.size !== 1 ? 's' : ''}
                    {' · '}
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(p2pSelTotal)}</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, marginTop: 2, lineHeight: 1.3 }}>
                    {p2pSelIsZero
                      ? '⇄ Items cancel out — net zero payment'
                      : `→ ${p2pSelNetFrom} pays ${p2pSelNetTo} ${fmt(p2pSelNetAbs)} net`
                    }
                  </div>
                </div>
                <Icon name="chevron" size={14} color="rgba(255,255,255,0.7)" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2: JOINT POOL SETTLEMENTS
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: C.surface,
        borderRadius: 20,
        border: `1px solid ${C.teal}33`,
        boxShadow: C.shadowSm,
        overflow: 'hidden',
      }}>
        <SectionHeader
          icon="wallet"
          iconColor={C.teal}
          iconBg={`${C.teal}20`}
          title="Joint Pool Settlements"
          subtitle="Personal expenses to be reimbursed from the joint account"
          badge={pending.length > 0 ? `${pending.length} pending · ${fmt(jointTotal)}` : 'All settled'}
          badgeColor={pending.length > 0 ? C.teal : C.green}
          collapsed={jointCollapsed}
          onToggle={() => setJointCollapsed((v) => !v)}
        />

        {!jointCollapsed && (
          <div style={{ padding: '0 16px 16px' }}>
            {!hasJointPending ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 12px', textAlign: 'center' }}>
                <Icon name="check" size={28} color={C.green} />
                <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>No joint pool items pending</div>
              </div>
            ) : (
              <>
                {/* Bulk action bar */}
                {selected.size > 0 && (
                  <div style={{ background: `${C.teal}15`, border: `1px solid ${C.teal}44`, borderRadius: 14, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ color: C.teal, fontWeight: 700, fontSize: 14 }}>{selected.size} selected</span>
                      <span style={{ color: C.text1, fontSize: 13, marginLeft: 10 }}>
                        {fmt(data.expenses.reduce((s, e) => selected.has(e.id) ? s + (e.amount || 0) : s, 0))}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setSelected(new Set())} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '6px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Deselect</button>
                      <button onClick={settleSelected} style={{ background: C.teal, color: '#0a0a0a', border: 'none', borderRadius: 999, padding: '7px 16px', fontWeight: 800, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${C.purple}22`, border: `1px solid ${C.purple}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: C.purple }}>
                            {names.a.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.textW }}>{names.a}&apos;s Expenses</div>
                            <div style={{ fontSize: 11, color: C.text3 }}>to be reimbursed from joint pool</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.purple, fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(pendingA.reduce((s, e) => s + e.amount, 0))}
                        </div>
                        <button onClick={() => selectAll(pendingA)} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 10, fontFamily: 'inherit' }}>All</button>
                        <button onClick={() => clearGroup(pendingA)} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 10, fontFamily: 'inherit' }}>Clear</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {pendingA.map((e) => (
                        <div key={e.id}
                          style={{ background: selected.has(e.id) ? `${C.purple}12` : C.surface2, borderRadius: 12, padding: '13px 14px', border: `1px solid ${selected.has(e.id) ? C.purple + '44' : C.border + '33'}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'all 0.12s' }}
                          onClick={() => toggle(e.id)}
                        >
                          <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${selected.has(e.id) ? C.purple : C.border2}`, background: selected.has(e.id) ? C.purple : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {selected.has(e.id) && <Icon name="check" size={10} color="#fff" strokeWidth={3} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                              {e.note || e.category}
                            </div>
                            <div style={{ fontSize: 11, color: C.text3, marginTop: 3, lineHeight: 1.3 }}>{e.date} · {e.category}</div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: C.purple, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(e.amount)}</div>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${C.blue}22`, border: `1px solid ${C.blue}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: C.blue }}>
                            {names.b.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.textW }}>{names.b}&apos;s Expenses</div>
                            <div style={{ fontSize: 11, color: C.text3 }}>to be reimbursed from joint pool</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.blue, fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(pendingB.reduce((s, e) => s + e.amount, 0))}
                        </div>
                        <button onClick={() => selectAll(pendingB)} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 10, fontFamily: 'inherit' }}>All</button>
                        <button onClick={() => clearGroup(pendingB)} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 10, fontFamily: 'inherit' }}>Clear</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {pendingB.map((e) => (
                        <div key={e.id}
                          style={{ background: selected.has(e.id) ? `${C.blue}12` : C.surface2, borderRadius: 12, padding: '13px 14px', border: `1px solid ${selected.has(e.id) ? C.blue + '44' : C.border + '33'}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'all 0.12s' }}
                          onClick={() => toggle(e.id)}
                        >
                          <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${selected.has(e.id) ? C.blue : C.border2}`, background: selected.has(e.id) ? C.blue : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {selected.has(e.id) && <Icon name="check" size={10} color="#fff" strokeWidth={3} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                              {e.note || e.category}
                            </div>
                            <div style={{ fontSize: 11, color: C.text3, marginTop: 3, lineHeight: 1.3 }}>{e.date} · {e.category}</div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: C.blue, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(e.amount)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Recently settled ─────────────────────────────────────────────────── */}
      {(() => {
        const recent = data.expenses
          .filter((e) => e.settled)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5);
        if (!recent.length) return null;
        return (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>Recently settled</span>
              <span style={{ flex: 1, height: 1, background: C.border, borderRadius: 1 }} />
            </div>
            <div style={{ background: C.surface, borderRadius: 16, padding: '4px 16px', border: `1px solid ${C.border}` }}>
              {recent.map((e, idx) => {
                const isLast = idx === recent.length - 1;
                const settledName = e.settledFor === 'Partner A' ? names.a : e.settledFor === 'Partner B' ? names.b : (e.settledFor ?? '');
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={catIcon(e.category)} size={15} color={C.green} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.text1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.note || e.category}
                      </div>
                      <div style={{ fontSize: 11, color: C.text3, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span>{e.date}</span>
                        {settledName && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: C.green }}>
                            <Icon name="check" size={10} color={C.green} />
                            settled with {settledName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.green, fontVariantNumeric: 'tabular-nums' }}>{fmt(e.amount)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
