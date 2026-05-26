'use client';
import { addToQueue } from '@/lib/offlineQueue';
import React, { useState, useEffect, useMemo } from 'react';
import type { AppData, Expense } from '@/types';
import { Card, Btn, Inp, Sel, Label, SectionTitle } from '@/components/ui';
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

export function AddExpense({ data, session, duplicateData, onAdd, onUpdateSave, onClose, isOnline = true }: Props) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const mode       = data.settings.householdMode ?? 'joint';
  const isJoint    = mode === 'joint';
  const isSolo     = mode === 'solo';
  const hasPartner = mode !== 'solo';
  const isEditingMode = duplicateData && duplicateData.id !== null && duplicateData.id !== undefined;

  const [form, setForm] = useState<any>(duplicateData || {
    date: today(), amount: '', category: data.settings.expenseCategories[0],
    account: mode === 'joint' ? 'Joint' : (data.currentUserRole === 'Partner B' ? data.settings.partnerBName : data.settings.partnerAName), addedBy: 'Partner A', note: '', toSettle: false,
    type: 'expense', isRecurring: false, recurrenceInterval: 'monthly',
    settleTrack: 'none', splitMode: 'equal', partnerAShare: 0.50, partnerBShare: 0.50,
  });
  const [flash, setFlash] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const activeRole = data.currentUserRole === 'Partner B' ? 'Partner B' : 'Partner A';
  const loggedInAccount = activeRole === 'Partner B' ? names.b : names.a;
  const loggedInAddedBy = activeRole;

  useEffect(() => {
    if (!duplicateData) {
      setForm((f: any) => ({ ...f, account: loggedInAccount, addedBy: loggedInAddedBy }));
    }
  }, [duplicateData, loggedInAccount, loggedInAddedBy]);

  // Smart quick-fill presets from history
  const { jointPresets, personalPresets } = useMemo(() => {
    if (isSolo && !data.expenses.length) return { jointPresets: [], personalPresets: [] };
    if (!data.expenses.length) return { jointPresets: [], personalPresets: [] };
    const jointFreq: Record<string, any> = {};
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

  const presetBtnStyle = (shared: boolean): React.CSSProperties => ({
    background: shared ? `${C.amber}15` : `${C.border}30`,
    border: `1px solid ${shared ? `${C.amber}44` : C.border}`,
    color: C.text1, padding: '5px 10px', borderRadius: 0, fontSize: 11,
    cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s ease-in-out',
  });

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
        // Save to offline queue — will sync when connection restores
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

  const cats = form.type === 'income' ? data.settings.incomeCategories : data.settings.expenseCategories;
  const sortedCats = useMemo(() => [...cats].sort((a, b) => a.localeCompare(b)), [cats]);
  const accounts = accountOptions(mode, data.settings);

  return (
    <div style={{ maxWidth: 560 }}>
      <Card style={{ border: duplicateData ? `1px solid ${C.amber}55` : `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <SectionTitle style={{ margin: 0 }}>
            {isEditingMode ? '📝 Edit Transaction' : duplicateData ? '📋 Duplicate Entry' : 'Add New Transaction'}
          </SectionTitle>
          <Btn variant="ghost" onClick={onClose} style={{ padding: '4px 10px', fontSize: 16 }}>✕</Btn>
        </div>

        {/* Type toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {(['expense', 'income'] as const).map((t) => (
            <Btn key={t} variant={form.type === t ? 'primary' : 'ghost'} onClick={() => { set('type', t); set('category', t === 'income' ? data.settings.incomeCategories[0] : data.settings.expenseCategories[0]); }} style={{ flex: 1, textTransform: 'capitalize' }}>
              {t === 'expense' ? '💸 Expense' : '💰 Income'}
            </Btn>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>

          {/* Quick presets — shown at the top so they can pre-fill fields below */}
          {!isEditingMode && (jointPresets.length > 0 || personalPresets.length > 0) && (
            <div style={{ background: `${C.bg}80`, borderRadius: 0, padding: '10px 12px', border: `1px solid ${C.border}` }}>
              {[
                ...(isJoint ? [{ label: '🏠 Joint presets', presets: jointPresets }] : []),
                { label: isJoint ? '👤 Your presets' : '⚡ Quick fill', presets: personalPresets },
              ].map(({ label, presets }) => presets.length > 0 && (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 5 }}>{label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {presets.map((p: any) => (
                      <button key={p.label} type="button" style={presetBtnStyle(p.shared)}
                        onClick={() => {
                          set('category', p.cat);
                          set('note', p.note);
                          if (p.shared && isJoint) { set('toSettle', true); set('settleTrack', 'joint'); }
                        }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><Label>Date</Label><Inp type="date" value={form.date} onChange={(e: any) => set('date', e.target.value)} /></div>
            <div><Label>Amount (₹)</Label><Inp type="number" placeholder="0" value={form.amount} onChange={(e: any) => set('amount', e.target.value)} /></div>
          </div>

          <div><Label>Category</Label>
            <Sel value={form.category} onChange={(e: any) => set('category', e.target.value)}>
              {sortedCats.map((c) => <option key={c} value={c}>{c}</option>)}
            </Sel>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Paid From</Label>
              <Sel value={form.account} onChange={(e: any) => {
                const v = e.target.value;
                set('account', v);
                if (v === 'Joint') { set('settleTrack', 'none'); set('splitMode', 'equal'); set('partnerAShare', 0.5); set('partnerBShare', 0.5); }
              }}>
                {accounts.map((a) => <option key={a} value={a}>{a === 'Joint' ? 'Joint Account' : a}</option>)}
              </Sel>
            </div>
            <div>
              <Label>Added By</Label>
              <Sel value={form.addedBy} onChange={(e: any) => set('addedBy', e.target.value)}>
                <option value="Partner A">{names.a}</option>
                {hasPartner && <option value="Partner B">{names.b}</option>}
              </Sel>
            </div>
          </div>

          <div><Label>Note (optional)</Label><Inp placeholder="What was this for?" value={form.note} onChange={(e: any) => set('note', e.target.value)} /></div>

          {/* Recurring */}
          <div style={{ background: '#1e284033', padding: 14, borderRadius: 0, display: 'flex', flexDirection: 'column', gap: 12, border: `1px solid ${C.border}` }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <span style={{ fontSize: 14, color: C.text1 }}>🔄 Recurring Commitment</span>
              <input type="checkbox" checked={form.isRecurring} onChange={(e) => set('isRecurring', e.target.checked)} style={{ width: 18, height: 18, accentColor: C.amber, cursor: 'pointer' }} />
            </label>
            {form.isRecurring && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: C.text2, fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Interval</div>
                <Sel value={form.recurrenceInterval} onChange={(e: any) => set('recurrenceInterval', e.target.value)}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly (Rent, WiFi, Maid…)</option>
                  <option value="yearly">Yearly (Insurance, Taxes…)</option>
                </Sel>
              </div>
            )}
          </div>

          {/* Settlement track — hidden in solo mode */}
          {form.type === 'expense' && mode !== 'solo' && (
            <div style={{ background: '#1e284033', borderRadius: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 14, border: `1px solid ${C.border}` }}>
              <div>
                <Label>🎯 Settlement Track</Label>
                <p style={{ color: C.muted, fontSize: 11, margin: '4px 0 8px', lineHeight: 1.5 }}>
                  {form.account === 'Joint'
                    ? 'Joint account expenses are shared directly — no settlement needed.'
                    : isJoint
                    ? 'Did you pay personally for something that should be reimbursed?'
                    : 'Did someone else split this expense with you?'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>

                  {/* Option 1: No settlement */}
                  <button type="button"
                    onClick={() => { set('settleTrack', 'none'); set('splitMode', 'equal'); }}
                    style={{ padding: '10px 12px', borderRadius: 0, fontSize: 12, textAlign: 'left',
                      fontWeight: form.settleTrack === 'none' ? 700 : 500,
                      background: form.settleTrack === 'none' ? C.amber : `${C.bg}80`,
                      color: form.settleTrack === 'none' ? C.surface : C.text2,
                      border: `1px solid ${form.settleTrack === 'none' ? C.amber : C.border}`,
                      cursor: 'pointer' }}>
                    ❌ No Settlement — personal or already joint
                  </button>

                  {/* Option 2: Reimburse from Joint pool — joint mode + personal account only */}
                  {isJoint && form.account !== 'Joint' && (
                    <button type="button"
                      onClick={() => { set('settleTrack', 'joint'); set('splitMode', 'equal'); }}
                      style={{ padding: '10px 12px', borderRadius: 0, fontSize: 12, textAlign: 'left',
                        fontWeight: form.settleTrack === 'joint' ? 700 : 500,
                        background: form.settleTrack === 'joint' ? C.green : `${C.bg}80`,
                        color: form.settleTrack === 'joint' ? C.surface : C.text2,
                        border: `1px solid ${form.settleTrack === 'joint' ? C.green : C.border}`,
                        cursor: 'pointer' }}>
                      🏦 Reimburse from Joint Pool — I paid personally, Joint owes me
                    </button>
                  )}

                  {/* Option 3: Direct partner split — only when paid from personal account */}
                  {form.account !== 'Joint' && (
                    <button type="button"
                      onClick={() => { set('settleTrack', 'partner'); }}
                      style={{ padding: '10px 12px', borderRadius: 0, fontSize: 12, textAlign: 'left',
                        fontWeight: form.settleTrack === 'partner' ? 700 : 500,
                        background: form.settleTrack === 'partner' ? C.purple : `${C.bg}80`,
                        color: form.settleTrack === 'partner' ? '#fff' : C.text2,
                        border: `1px solid ${form.settleTrack === 'partner' ? C.purple : C.border}`,
                        cursor: 'pointer' }}>
                      🤝 Partner Split — my partner owes me part of this directly
                    </button>
                  )}
                </div>
              </div>

              {form.settleTrack === 'partner' && form.account !== 'Joint' && (
                <div style={{ background: `${C.bg}60`, padding: 12, borderRadius: 0, border: `1px solid ${C.border}60` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, color: C.text1, fontWeight: 600 }}>Split Mode</span>
                    <select value={form.splitMode} onChange={(e) => {
                      const m = e.target.value;
                      set('splitMode', m);
                      if (m === 'equal') { set('partnerAShare', 0.5); set('partnerBShare', 0.5); }
                      else if (m === 'percentage') { set('partnerAShare', 50); set('partnerBShare', 50); }
                      else { set('partnerAShare', ''); set('partnerBShare', ''); }
                    }} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 0, padding: '4px 8px', fontSize: 12 }}>
                      <option value="equal">50/50 Equal</option>
                      <option value="percentage">Percentages (%)</option>
                      <option value="fixed">Fixed Amounts (₹)</option>
                    </select>
                  </div>
                  {form.splitMode !== 'equal' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[['a', names.a], ['b', names.b]].map(([key, name]) => (
                        <div key={key}>
                          <span style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>{name}'s Share ({form.splitMode === 'percentage' ? '%' : '₹'})</span>
                          <Inp type="number" placeholder="0" value={key === 'a' ? form.partnerAShare : form.partnerBShare}
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

          {!isOnline && (
            <div style={{ background: '#f59e0b22', border: '1px solid #f59e0b44', borderRadius: 0, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#f59e0b', textAlign: 'center' }}>
              ⚠️ You are offline. This expense will be saved locally and synced when you reconnect.
            </div>
          )}
          <Btn variant={flash ? 'success' : 'primary'} onClick={submit} style={{ width: '100%', padding: '13px', fontSize: 15, fontWeight: 700 }}>
            {flash ? '✓ Saved!' : isEditingMode ? 'Update Transaction' : 'Add Transaction'}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
