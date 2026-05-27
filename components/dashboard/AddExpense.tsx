'use client';
import { addToQueue } from '@/lib/offlineQueue';
import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@/components/Icon';
import type { AppData, Expense } from '@/types';
import { Inp, Sel } from '@/components/ui';
import { C } from '@/constants';
import { accountOptions } from '@/lib/householdModes';

function today() { return new Date().toISOString().slice(0, 10); }
function uid() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

interface Props {
  data: AppData;
  session: any;
  duplicateData: any;
  onAdd: (e: Expense) => void;
  onUpdateSave: (id: string, updated: Partial<Expense>) => void;
  onClose: () => void;
  isOnline?: boolean;
}

// ─── Category → Icon name ─────────────────────────────────────────────────────
const CAT_ICON: Record<string, string> = {
  'Groceries': 'cart',
  'Dining Out': 'utensils',
  'Coffee & Snacks': 'coffee',
  'Transport / Fuel': 'car',
  'Public Transport': 'car',
  'Parking & Tolls': 'car',
  'Electricity': 'zap',
  'Water & Gas': 'zap',
  'Streaming Services': 'film',
  'Subscriptions': 'film',
  'Entertainment': 'star',
  'Investment': 'trendUp',
  'Investments': 'trendUp',
  'Investment Returns': 'trendUp',
  'Bonus': 'trendUp',
  'Insurance': 'shield',
  'Rent / Mortgage': 'home',
  'Furniture & Decor': 'home',
  'Rental Income': 'home',
  'Medical / Health': 'alert',
  'Gym & Fitness': 'target',
  'Clothing & Apparel': 'sparkles',
  'Personal Care': 'sparkles',
  'Flights & Hotels': 'send',
  'Education': 'briefcase',
  'Books & Courses': 'briefcase',
  'Salary': 'briefcase',
  'Freelance': 'briefcase',
  'Gifts & Celebrations': 'star',
  'Gift': 'star',
  'Home Maintenance': 'settings',
  'Mobile Plans': 'more',
  'Internet': 'sync',
  'Kids & School': 'users',
  'Other Income': 'wallet',
  'Miscellaneous': 'more',
  'Other': 'more',
  '🤝 Partner Debt Settlement': 'handshake',
};

export function AddExpense({ data, session, duplicateData, onAdd, onUpdateSave, onClose, isOnline = true }: Props) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const mode       = data.settings.householdMode ?? 'joint';
  const isJoint    = mode === 'joint';
  const isSolo     = mode === 'solo';
  const hasPartner = mode !== 'solo';
  const isEditingMode = duplicateData && duplicateData.id !== null && duplicateData.id !== undefined;

  const [form, setForm] = useState<any>(duplicateData || {
    date: today(), amount: '', category: data.settings.expenseCategories[0],
    account: mode === 'joint' ? 'Joint' : (data.currentUserRole === 'Partner B' ? data.settings.partnerBName : data.settings.partnerAName),
    addedBy: 'Partner A', note: '', toSettle: false,
    type: 'expense', isRecurring: false, recurrenceInterval: 'monthly',
    settleTrack: 'none', splitMode: 'equal', partnerAShare: 0.50, partnerBShare: 0.50,
  });
  const [flash, setFlash] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const activeRole     = data.currentUserRole === 'Partner B' ? 'Partner B' : 'Partner A';
  const loggedInAccount = activeRole === 'Partner B' ? names.b : names.a;
  const loggedInAddedBy = activeRole;

  useEffect(() => {
    if (!duplicateData) {
      setForm((f: any) => ({ ...f, account: loggedInAccount, addedBy: loggedInAddedBy }));
    }
  }, [duplicateData, loggedInAccount, loggedInAddedBy]);

  // Smart quick-fill presets from history
  const { jointPresets, personalPresets } = useMemo(() => {
    if (!data.expenses.length) return { jointPresets: [], personalPresets: [] };
    const jointFreq: Record<string, any>    = {};
    const personalFreq: Record<string, any> = {};
    data.expenses.forEach((e) => {
      if (e.type !== 'expense' || !e.note) return;
      const cleanNote = e.note.trim();
      if (!cleanNote) return;
      const catLower = e.category.toLowerCase();
      if (catLower.includes('investment') || catLower.includes('insurance')) return;
      const key = `${cleanNote.toLowerCase()}▩${e.category}`;
      if (e.account === 'Joint' && !e.settled) {
        if (!jointFreq[key]) jointFreq[key] = { count: 0, cat: e.category, note: cleanNote, shared: false };
        jointFreq[key].count++;
      } else if (e.account === loggedInAccount || e.addedBy === loggedInAccount || (e.settled && e.settledFor === loggedInAccount)) {
        if (!personalFreq[key]) personalFreq[key] = { count: 0, cat: e.category, note: cleanNote, shared: e.toSettle || e.settled || false };
        personalFreq[key].count++;
      }
    });
    const process = (freq: Record<string, any>) => {
      const seen = new Set<string>();
      return Object.values(freq).sort((a, b) => b.count - a.count).reduce((acc: any[], p) => {
        if (acc.length >= 10 || seen.has(p.cat)) return acc;
        seen.add(p.cat);
        return [...acc, { ...p, label: p.note.length > 18 ? `${p.note.slice(0, 16)}…` : p.note }];
      }, []);
    };
    return { jointPresets: process(jointFreq), personalPresets: process(personalFreq) };
  }, [data.expenses, loggedInAccount]);

  const submit = () => {
    if (form.category === '🤝 Partner Debt Settlement') {
      form.settleTrack = 'partner';
      form.splitMode = 'fixed';
      const totalPayback = Number(form.amount);
      if (form.account === names.a) { form.partnerAShare = 0; form.partnerBShare = totalPayback; }
      else if (form.account === names.b) { form.partnerAShare = totalPayback; form.partnerBShare = 0; }
    }
    const numericAmount = Number(form.amount);
    if (!form.amount || isNaN(numericAmount) || numericAmount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    if (form.type === 'expense' && form.settleTrack !== 'none') {
      if (form.splitMode === 'percentage') {
        const sum = Number(form.partnerAShare || 0) + Number(form.partnerBShare || 0);
        if (sum !== 100) { alert(`Percentages must total 100%. Currently: ${sum}%`); return; }
      } else if (form.splitMode === 'fixed') {
        const sum = Number(form.partnerAShare || 0) + Number(form.partnerBShare || 0);
        if (Math.abs(sum - numericAmount) > 0.01) { alert(`Fixed amounts (₹${sum}) must equal total (₹${numericAmount}).`); return; }
      }
    }
    const payload = {
      ...form,
      amount: numericAmount,
      partnerAShare: form.splitMode === 'percentage' ? Number(form.partnerAShare) / 100 : Number(form.partnerAShare),
      partnerBShare: form.splitMode === 'percentage' ? Number(form.partnerBShare) / 100 : Number(form.partnerBShare),
    };
    if (isEditingMode) onUpdateSave(duplicateData.id, payload);
    else {
      const expense = { ...payload, id: uid(), settled: false, settledFor: null };
      if (!isOnline) {
        addToQueue(expense);
        setFlash(true);
        setTimeout(() => { setFlash(false); onClose(); }, 1500);
      } else {
        onAdd(expense);
      }
    }
    setFlash(true);
    setForm((f: any) => ({ ...f, amount: '', note: '' }));
    setTimeout(() => { setFlash(false); onClose?.(); }, 1500);
  };

  const cats       = form.type === 'income' ? data.settings.incomeCategories : data.settings.expenseCategories;
  const sortedCats = useMemo(() => [...cats].sort((a, b) => a.localeCompare(b)), [cats]);
  const accounts   = accountOptions(mode, data.settings);

  // ─── Styles ─────────────────────────────────────────────────────────────────
  const fieldLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: C.text3, marginBottom: 8,
  };

  return (
    <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Top bar: expense / income toggle + close ─────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', background: C.surface, borderRadius: 99, padding: 4, gap: 2, border: `1px solid ${C.border}` }}>
          {(['expense', 'income'] as const).map((t) => (
            <button key={t}
              onClick={() => { set('type', t); set('category', t === 'income' ? data.settings.incomeCategories[0] : data.settings.expenseCategories[0]); }}
              style={{
                padding: '7px 16px', fontSize: 12, border: 'none', cursor: 'pointer', borderRadius: 99,
                fontFamily: 'inherit', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
                fontWeight: form.type === t ? 700 : 500,
                background: form.type === t ? C.accent : 'transparent',
                color: form.type === t ? '#0a0a0a' : C.text3,
              }}>
              <Icon name={t === 'expense' ? 'trendDown' : 'trendUp'} size={13}
                color={form.type === t ? '#0a0a0a' : C.text3} strokeWidth={2.5} />
              {t === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>
        <button onClick={onClose}
          style={{ background: C.surface2, border: 'none', color: C.text2, width: 34, height: 34, borderRadius: '50%',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0 }}>
          <Icon name="more" size={16} color={C.text2} />
        </button>
      </div>

      {/* ── Hero amount ───────────────────────────────────────────────────── */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '24px 20px', textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
          {isEditingMode ? 'Edit Amount' : 'Amount'}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: C.text3 }}>₹</span>
          <input
            value={form.amount}
            onChange={(e: any) => set('amount', e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="0"
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: C.textW, fontFamily: 'inherit',
              fontSize: 56, fontWeight: 900, letterSpacing: '-0.04em',
              textAlign: 'center', maxWidth: 240, width: '100%',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
        </div>
        <input type="date" value={form.date} onChange={(e: any) => set('date', e.target.value)}
          style={{ background: 'transparent', border: 'none', color: C.text3, fontSize: 12, outline: 'none', cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit', marginTop: 6 }} />

        {/* Quick presets */}
        {!isEditingMode && (jointPresets.length > 0 || personalPresets.length > 0) && (
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[...(isJoint ? jointPresets : []), ...personalPresets].slice(0, 6).map((p: any) => (
              <button key={p.label} type="button"
                onClick={() => { set('category', p.cat); set('note', p.note); if (p.shared && isJoint) set('settleTrack', 'joint'); }}
                style={{
                  padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                  background: p.shared ? `${C.amber}18` : C.surface2,
                  border: `1px solid ${p.shared ? `${C.amber}44` : C.border2}`,
                  color: p.shared ? C.amber : C.text2, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Account toggle ────────────────────────────────────────────────── */}
      <div>
        <div style={fieldLabel}>Paid from</div>
        <div style={{ display: 'flex', background: C.surface, borderRadius: 14, padding: 4, gap: 3 }}>
          {accounts.map((a) => (
            <button key={a}
              onClick={() => {
                set('account', a);
                if (a === 'Joint') { set('settleTrack', 'none'); set('splitMode', 'equal'); set('partnerAShare', 0.5); set('partnerBShare', 0.5); }
              }}
              style={{
                flex: 1, padding: '12px 6px', borderRadius: 10, border: 'none',
                background: form.account === a ? C.accent : 'transparent',
                color: form.account === a ? '#0a0a0a' : C.text2,
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s',
              }}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* ── Settlement chips ──────────────────────────────────────────────── */}
      {form.type === 'expense' && mode !== 'solo' && form.account !== 'Joint' && (
        <div>
          <div style={fieldLabel}>Settlement</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([
              { id: 'none',    label: 'Personal',         color: C.text2   },
              ...(isJoint && form.account !== 'Joint' ? [{ id: 'joint', label: 'Joint Reimb.', color: C.orange }] : []),
              { id: 'partner', label: 'Split w/ partner', color: C.blue    },
            ] as { id: string; label: string; color: string }[]).map((s) => {
              const active = form.settleTrack === s.id;
              return (
                <button key={s.id}
                  onClick={() => { set('settleTrack', s.id); if (s.id !== 'partner') { set('splitMode', 'equal'); set('partnerAShare', 0.5); set('partnerBShare', 0.5); } }}
                  style={{
                    padding: '8px 16px', borderRadius: 999,
                    border: `1px solid ${active ? s.color : C.border2}`,
                    background: active ? C.surface : 'transparent',
                    color: active ? s.color : C.text2,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.15s',
                  }}>
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Split mode controls */}
          {form.settleTrack === 'partner' && (
            <div style={{ marginTop: 10, background: C.surface2, borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.text2, fontWeight: 600 }}>Split mode</span>
                <select value={form.splitMode} onChange={(e) => {
                  const m = e.target.value;
                  set('splitMode', m);
                  if (m === 'equal') { set('partnerAShare', 0.5); set('partnerBShare', 0.5); }
                  else if (m === 'percentage') { set('partnerAShare', 50); set('partnerBShare', 50); }
                  else { set('partnerAShare', ''); set('partnerBShare', ''); }
                }} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 10, padding: '5px 10px', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                  <option value="equal">50/50 Equal</option>
                  <option value="percentage">Percentages (%)</option>
                  <option value="fixed">Fixed Amounts (₹)</option>
                </select>
              </div>
              {form.splitMode !== 'equal' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {([['a', names.a], ['b', names.b]] as [string, string][]).map(([key, name]) => (
                    <div key={key}>
                      <div style={{ fontSize: 10, color: C.text3, fontWeight: 600, marginBottom: 4 }}>
                        {name}'s share ({form.splitMode === 'percentage' ? '%' : '₹'})
                      </div>
                      <Inp type="number" placeholder="0"
                        value={key === 'a' ? form.partnerAShare : form.partnerBShare}
                        onChange={(e: any) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          if (key === 'a') { set('partnerAShare', val); if (form.splitMode === 'percentage' && val !== '' && Number(val) <= 100) set('partnerBShare', 100 - Number(val)); }
                          else set('partnerBShare', val);
                        }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Category grid ─────────────────────────────────────────────────── */}
      <div>
        <div style={fieldLabel}>Category</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {cats.slice(0, 8).map((c) => {
            const active   = form.category === c;
            const iconName = CAT_ICON[c] ?? (form.type === 'income' ? 'trendUp' : 'wallet');
            return (
              <button key={c} onClick={() => set('category', c)}
                style={{
                  background: active ? C.accentBg : C.surface,
                  border: `1px solid ${active ? C.accent : 'transparent'}`,
                  borderRadius: 14, padding: '14px 6px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                <Icon
                  name={iconName}
                  size={22}
                  color={active ? C.accent : C.text2}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                <div style={{
                  fontSize: 9, fontWeight: 600, lineHeight: 1.2, textAlign: 'center',
                  color: active ? C.accent : C.text2,
                }}>
                  {c.length > 12 ? c.slice(0, 11) + '…' : c}
                </div>
              </button>
            );
          })}
        </div>
        {/* Full category selector */}
        <select value={form.category} onChange={(e: any) => set('category', e.target.value)}
          style={{ marginTop: 8, width: '100%', background: C.surface2, border: 'none', color: C.textW, borderRadius: 12, padding: '10px 14px', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
          {sortedCats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* ── Note ─────────────────────────────────────────────────────────── */}
      <div>
        <div style={fieldLabel}>Note</div>
        <input
          placeholder="What was this for?"
          value={form.note}
          onChange={(e: any) => set('note', e.target.value)}
          style={{
            width: '100%', background: C.surface2, border: '1.5px solid transparent',
            color: C.textW, fontFamily: 'inherit', fontSize: 15, fontWeight: 500,
            padding: '13px 16px', outline: 'none', borderRadius: 14,
            boxSizing: 'border-box', transition: 'border-color 0.15s',
          }}
          onFocus={(e: any)  => { e.currentTarget.style.borderColor = C.accent; }}
          onBlur={(e: any)   => { e.currentTarget.style.borderColor = 'transparent'; }}
        />
      </div>

      {/* ── Recurring toggle ─────────────────────────────────────────────── */}
      <div style={{ background: C.surface, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => set('isRecurring', !form.isRecurring)}>
          <span style={{ fontSize: 13, color: C.text2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="refresh" size={15} color={C.text2} strokeWidth={2} />
            Recurring commitment
          </span>
          <div style={{ width: 44, height: 26, background: form.isRecurring ? C.accent : C.surface2, borderRadius: 99, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 3, left: form.isRecurring ? 21 : 3, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }} />
          </div>
        </div>
        {form.isRecurring && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, color: C.text3, fontWeight: 600, marginBottom: 6 }}>Interval</div>
            <Sel value={form.recurrenceInterval} onChange={(e: any) => set('recurrenceInterval', e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly (Rent, WiFi, Maid…)</option>
              <option value="yearly">Yearly (Insurance, Taxes…)</option>
            </Sel>
          </div>
        )}
      </div>

      {/* ── Offline banner ───────────────────────────────────────────────── */}
      {!isOnline && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: `${C.amber}22`, border: `1px solid ${C.amber}44`, borderRadius: 12, padding: '10px 14px' }}>
          <Icon name="alert" size={16} color={C.amber} />
          <span style={{ fontSize: 12, color: C.amber, fontWeight: 500 }}>Offline — will sync when reconnected.</span>
        </div>
      )}

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <button onClick={submit}
        style={{
          width: '100%', minHeight: 56, borderRadius: 999, border: 'none',
          background: flash ? C.green : C.accent,
          color: flash ? '#fff' : '#0a0a0a',
          fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
          letterSpacing: '0.01em', transition: 'all 0.2s',
          boxShadow: flash ? `0 4px 20px ${C.green}40` : `0 4px 20px ${C.accent}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        {flash
          ? <><Icon name="check" size={18} color="#fff" strokeWidth={3} /> Saved!</>
          : isEditingMode
            ? `Update · ₹${form.amount || 0}`
            : `Log ${form.type === 'income' ? 'income' : 'expense'} · ₹${form.amount || 0}`}
      </button>
    </div>
  );
}
