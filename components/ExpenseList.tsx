'use client';
// ─── components/ExpenseList.tsx ───────────────────────────────────────────────
import React, { useState } from 'react';
import type { AppData } from '@/types';
import { Card, Btn, Inp, Sel, Badge } from '@/components/ui';
import { C } from '@/constants';

function today() { return new Date().toISOString().slice(0, 10); }
function monthKey(d: string) { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; }
function monthLabel(key: string) { if (!key || key === 'All') return 'All Months'; const [y,m]=key.split('-'); return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-IN',{month:'short',year:'numeric'}); }
// fmt is received as a prop from page.tsx so privacy mode is respected globally

interface Props {
  data: AppData;
  fmt: (n: number) => string;
  onToggleToSettle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, u: any) => void;
  onUnsettle: (id: string) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkFlagToSettle: (ids: string[]) => void;
  onBulkMarkAsSettled: (ids: string[]) => void;
  onBulkAssignToAccount: (ids: string[], account: string) => void;
  onTriggerEdit: (e: any) => void;
  onDuplicate: (e: any) => void;
}

export function ExpenseList({ data, fmt, onToggleToSettle, onDelete, onUpdate, onUnsettle, onBulkDelete, onDuplicate, onBulkFlagToSettle, onBulkMarkAsSettled, onBulkAssignToAccount, onTriggerEdit }: Props) {
  const names      = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const mode       = data.settings.householdMode ?? 'joint';
  const isJoint    = mode === 'joint';
  const isSolo     = mode === 'solo';
  const hasPartner = mode !== 'solo';
  const mk = monthKey(today());
  const [filter, setFilter] = useState({ month: mk, account: 'All', category: 'All', type: 'All', settled: 'All' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchNote, setSearchNote]   = useState('');
  const [selectedTargetAccount, setSelectedTargetAccount] = useState('');
  const sf = (k: string, v: string) => setFilter((f) => ({ ...f, [k]: v }));

  const allMonths = [...new Set(data.expenses.map((e) => monthKey(e.date)))].sort().reverse();
  const filtered = data.expenses.filter((e) => {
    if (searchNote && !(e.note || '').toLowerCase().includes(searchNote.toLowerCase()) &&
        !e.category.toLowerCase().includes(searchNote.toLowerCase())) return false;
    if (filter.month === 'year') {
      if (!e.date.startsWith(new Date().getFullYear().toString())) return false;
    } else if (filter.month !== 'All' && monthKey(e.date) !== filter.month) return false;
    const acc = e.account;
    if (filter.account !== 'All') {
      const mA = (filter.account === names.a || filter.account === 'Partner A') && (acc === names.a || acc === 'Partner A');
      const mB = (filter.account === names.b || filter.account === 'Partner B') && (acc === names.b || acc === 'Partner B');
      const mJ = filter.account === 'Joint' && acc === 'Joint';
      if (!mA && !mB && !mJ) return false;
    }
    if (filter.category !== 'All' && e.category !== filter.category) return false;
    if (filter.type !== 'All' && (e.type || 'expense') !== filter.type) return false;
    if (filter.settled !== 'All') {
      if (filter.settled === 'pendingJoint' && !(e.toSettle && !e.settled && e.settleTrack !== 'partner')) return false;
      if (filter.settled === 'pendingPartner' && !(e.settleTrack === 'partner' && !e.settled)) return false;
      if (filter.settled === 'personal' && (e.toSettle || e.settleTrack === 'partner' || e.settled)) return false;
      if (filter.settled === 'settled' && !e.settled) return false;
      if (filter.settled === 'settledA' && (!e.settled || (e.settledFor !== 'Partner A' && e.settledFor !== names.a))) return false;
      if (filter.settled === 'settledB' && (!e.settled || (e.settledFor !== 'Partner B' && e.settledFor !== names.b))) return false;
    }
    return true;
  }).sort((a, b) => { const d = new Date(b.date).getTime() - new Date(a.date).getTime(); return d !== 0 ? d : String(b.id).localeCompare(String(a.id)); });

  const toggleSelect = (id: string) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map((e) => e.id)));
  const saveEdit = () => { onUpdate(editingId!, { ...editForm, amount: Number(editForm.amount) }); setEditingId(null); };

  const selStyle: React.CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, color: C.text1, borderRadius: 0, padding: '6px 10px', fontSize: 12, cursor: 'pointer' };
  const allCats = [...data.settings.expenseCategories, ...data.settings.incomeCategories];

  const accountBadge = (acc: string) => {
    if (acc === names.a || acc === 'Partner A') return <Badge color="purple">{names.a}</Badge>;
    if (acc === names.b || acc === 'Partner B') return <Badge color="blue">{names.b}</Badge>;
    return <Badge color="green">Joint</Badge>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filter bar — stacked rows for mobile clarity */}
      <Card style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Search */}
        <input
          type="search"
          placeholder="🔍 Search notes or merchants..."
          value={searchNote}
          onChange={(e) => setSearchNote(e.target.value)}
          style={{ width: '100%', background: C.surface2, border: 'none', color: C.textW, borderRadius: 99, padding: '10px 16px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
        />
        {/* Row 1: Month + Type */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={selStyle} value={filter.month} onChange={(e) => sf('month', e.target.value)}>
            <option value="All">All Months</option>
            <option value="year">Current Year</option>
            {allMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <select style={selStyle} value={filter.type} onChange={(e) => sf('type', e.target.value)}>
            <option value="All">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>
        </div>
        {/* Row 2: Account + Category */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={selStyle} value={filter.account} onChange={(e) => sf('account', e.target.value)}>
            <option value="All">All Accounts</option>
            {isJoint && <option value="Joint">Joint</option>}
            <option value={names.a}>{names.a}</option>
            {hasPartner && <option value={names.b}>{names.b}</option>}
          </select>
          <select style={selStyle} value={filter.category} onChange={(e) => sf('category', e.target.value)}>
            <option value="All">All Categories</option>
            {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {/* Row 3: Status */}
        <select style={{ ...selStyle, width: '100%' }} value={filter.settled} onChange={(e) => sf('settled', e.target.value)}>
          <option value="All">All Statuses</option>
          {isJoint && <option value="pendingJoint">⏳ Pending — Joint Reimbursement</option>}
          {hasPartner && <option value="pendingPartner">🤝 Pending — Partner Split</option>}
          <option value="personal">👤 Personal (no settlement)</option>
          <option value="settled">✅ All Settled</option>
          <option value="settledA">✅ Settled — {names.a}</option>
          {hasPartner && <option value="settledB">✅ Settled — {names.b}</option>}
        </select>
      </Card>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <Card style={{ background: C.red + '15', border: `1px solid ${C.red}44`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ color: C.red, fontWeight: 700, fontSize: 14 }}>💥 {selectedIds.size} selected</span>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderRight: `1px solid ${C.border}`, paddingRight: 12 }}>
              <select value={selectedTargetAccount} onChange={(e) => setSelectedTargetAccount(e.target.value)} style={{ ...selStyle, fontSize: 12 }}>
                <option value="">-- Assign Account --</option>
                <option value="Partner A">{names.a}</option>
                {hasPartner && <option value="Partner B">{names.b}</option>}
                {isJoint && <option value="Joint">Joint</option>}
              </select>
              <Btn variant="ghost" disabled={!selectedTargetAccount} style={{ fontSize: 12, padding: '6px 12px', borderColor: selectedTargetAccount ? C.amber : C.border, color: selectedTargetAccount ? C.amber : C.muted }} onClick={() => { const ids = [...selectedIds]; onBulkAssignToAccount(ids, selectedTargetAccount); setSelectedTargetAccount(''); setSelectedIds(new Set()); }}>🔄 Assign</Btn>
            </div>
            <Btn variant="ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setSelectedIds(new Set())}>Deselect All</Btn>
            <Btn variant="ghost" style={{ fontSize: 12, padding: '6px 12px', border: `1px solid ${C.amber}`, color: C.amber }} onClick={() => { onBulkFlagToSettle([...selectedIds]); setSelectedIds(new Set()); }}>⚖️ Flag to Settle</Btn>
            <Btn variant="ghost" style={{ fontSize: 12, padding: '6px 12px', border: `1px solid ${C.green}`, color: C.green }} onClick={() => { onBulkMarkAsSettled([...selectedIds]); setSelectedIds(new Set()); }}>✅ Mark Settled</Btn>
            <Btn variant="danger" style={{ fontSize: 12, padding: '6px 14px', fontWeight: 700 }} onClick={() => { if (confirm(`Delete ${selectedIds.size} records?`)) { onBulkDelete([...selectedIds]); setSelectedIds(new Set()); } }}>🗑️ Delete</Btn>
          </div>
        </Card>
      )}

      {/* Expense cards — mobile first */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Select all row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.text2 }}>
            <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length} onChange={toggleAll}
              style={{ cursor: 'pointer', accentColor: C.accent, width: 16, height: 16 }} />
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${filtered.length} transactions`}
          </label>
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: C.text3 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text1, marginBottom: 6 }}>No transactions found</div>
            <div style={{ fontSize: 13 }}>Try adjusting your filters</div>
          </div>
        )}

        {filtered.map((e, i) => {
          const isEditing = editingId === e.id;
          const isSelected = selectedIds.has(e.id);

          if (isEditing) return (
            <div key={e.id} style={{ background: C.surface, borderRadius: 16, padding: '16px', boxShadow: `0 0 0 2px ${C.accent}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>Editing transaction</div>
              <div className="grid-2" style={{ gap: 8 }}>
                <Inp type="date" label="Date" value={editForm.date} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, date: ev.target.value }))} />
                <Inp label="Note" value={editForm.note} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, note: ev.target.value }))} />
                <Sel value={editForm.category} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, category: ev.target.value }))} style={{ fontSize: 14 }}>
                  {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
                </Sel>
                <Inp type="number" label="Amount" value={editForm.amount} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, amount: ev.target.value }))} />
              </div>
              <Sel value={editForm.account} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, account: ev.target.value }))} style={{ fontSize: 14 }}>
                <option value="Joint">Joint</option>
                <option value={names.a}>{names.a}</option>
                <option value={names.b}>{names.b}</option>
              </Sel>
              {!(editForm.type === 'income' || editForm.account === 'Joint' || isSolo) && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.text1 }}>
                  <input type="checkbox" checked={editForm.toSettle} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, toSettle: ev.target.checked }))} style={{ accentColor: C.accent }} />
                  {isJoint ? 'Shared / Reimburse from pool' : 'Split with partner'}
                </label>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="success" onClick={saveEdit} style={{ flex: 1 }}>✓ Save</Btn>
                <Btn variant="ghost" onClick={() => setEditingId(null)} style={{ flex: 1 }}>✕ Cancel</Btn>
              </div>
            </div>
          );

          return (
            <div key={e.id}
              style={{
                background: isSelected ? C.accentBg : C.surface,
                borderRadius: 14,
                padding: '14px 16px',
                boxShadow: isSelected ? `0 0 0 1.5px ${C.accent}` : '0 2px 8px rgba(0,0,0,0.2)',
                transition: 'all 0.15s',
                cursor: 'pointer',
              }}
              onClick={() => toggleSelect(e.id)}
            >
              {/* Row 1: checkbox + note + amount */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <input type="checkbox" checked={isSelected}
                  onChange={() => toggleSelect(e.id)}
                  onClick={(ev) => ev.stopPropagation()}
                  style={{ cursor: 'pointer', accentColor: C.accent, width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.textW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {e.note || e.category}
                      {e.isRecurring && <span style={{ marginLeft: 6, fontSize: 12 }}>🔄</span>}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: e.type === 'income' ? C.green : C.textW, flexShrink: 0, letterSpacing: '-0.02em' }}>
                      {e.type === 'income' ? '+' : ''}{fmt(e.amount)}
                    </div>
                  </div>
                  {/* Row 2: date + category + account badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: C.text3 }}>{e.date}</span>
                    <span style={{ fontSize: 11, color: C.text2 }}>{e.category}</span>
                    {accountBadge(e.account)}
                    {e.settled && (
                      <Badge color="green">
                        ✓ Settled{e.settledFor
                          ? ` — ${e.settledFor === 'Partner A' ? names.a : e.settledFor === 'Partner B' ? names.b : e.settledFor}`
                          : ''}
                      </Badge>
                    )}
                    {!e.settled && e.toSettle && <Badge color="accent">⏳ Pending</Badge>}
                    {!e.settled && e.settleTrack === 'partner' && <Badge color="purple">Split w/ partner</Badge>}
                  </div>
                </div>
              </div>

              {/* Actions row — only shown when selected */}
              {isSelected && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}
                  onClick={(ev) => ev.stopPropagation()}>
                  <Btn variant="ghost" size="sm" onClick={() => onTriggerEdit(e)}>✏️ Edit</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => onDuplicate(e)}>📋 Copy</Btn>
                  {!e.settled && e.type !== 'income' && (
                    {/* Only show Flag if personal account — Joint expenses are already shared */}
                  {e.account !== 'Joint' && !e.settled && e.type !== 'income' && (
                    <Btn variant="ghost" size="sm" onClick={(ev) => {
                      ev.stopPropagation();
                      // Ask: joint reimbursement or partner split?
                      const choice = window.confirm('Reimburse from Joint pool?\n\nOK = Joint Reimbursement\nCancel = Partner Split');
                      onBulkFlagToSettle([e.id]);
                    }}>⚖️ Flag</Btn>
                  )}
                  )}
                  {e.settled && (
                    <Btn variant="ghost" size="sm" onClick={() => onUnsettle(e.id)}>↩ Unsettle</Btn>
                  )}
                  <Btn variant="danger" size="sm" onClick={() => onDelete(e.id)} style={{ marginLeft: 'auto' }}>🗑️</Btn>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
