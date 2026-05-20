'use client';
// ─── components/ExpenseList.tsx ───────────────────────────────────────────────
import React, { useState } from 'react';
import type { AppData } from '@/types';
import { Card, Btn, Inp, Sel, Badge } from '@/components/ui';
import { C } from '@/constants';

function today() { return new Date().toISOString().slice(0, 10); }
function monthKey(d: string) { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; }
function monthLabel(key: string) { if (!key || key === 'All') return 'All Months'; const [y,m]=key.split('-'); return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-IN',{month:'short',year:'numeric'}); }
function fmt(n: number, cur = 'INR') { return new Intl.NumberFormat('en-IN',{style:'currency',currency:cur,maximumFractionDigits:0}).format(n||0); }

interface Props {
  data: AppData;
  onToggleToSettle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, u: any) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkFlagToSettle: (ids: string[]) => void;
  onBulkMarkAsSettled: (ids: string[]) => void;
  onBulkAssignToAccount: (ids: string[], account: string) => void;
  onTriggerEdit: (e: any) => void;
  onDuplicate: (e: any) => void;
}

export function ExpenseList({ data, onToggleToSettle, onDelete, onUpdate, onBulkDelete, onDuplicate, onBulkFlagToSettle, onBulkMarkAsSettled, onBulkAssignToAccount, onTriggerEdit }: Props) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const mk = monthKey(today());
  const [filter, setFilter] = useState({ month: mk, account: 'All', category: 'All', type: 'All', settled: 'All' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTargetAccount, setSelectedTargetAccount] = useState('');
  const sf = (k: string, v: string) => setFilter((f) => ({ ...f, [k]: v }));

  const allMonths = [...new Set(data.expenses.map((e) => monthKey(e.date)))].sort().reverse();
  const filtered = data.expenses.filter((e) => {
    if (filter.month !== 'All' && monthKey(e.date) !== filter.month) return false;
    const acc = e.account;
    if (filter.account !== 'All') {
      const mA = (filter.account === names.a || filter.account === 'Partner A') && (acc === names.a || acc === 'Partner A');
      const mB = (filter.account === names.b || filter.account === 'Partner B') && (acc === names.b || acc === 'Partner B');
      const mJ = filter.account === 'Joint' && acc === 'Joint';
      if (!mA && !mB && !mJ) return false;
    }
    if (filter.category !== 'All' && e.category !== filter.category) return false;
    if (filter.type !== 'All' && (e.type || 'expense') !== filter.type) return false;
    if (filter.settled === 'pending' && (!e.toSettle || e.settled)) return false;
    if (filter.settled === 'personal' && e.toSettle) return false;
    if (filter.settled === 'settledA' && (!e.settled || e.settledFor !== 'Partner A')) return false;
    if (filter.settled === 'settledB' && (!e.settled || e.settledFor !== 'Partner B')) return false;
    return true;
  }).sort((a, b) => { const d = new Date(b.date).getTime() - new Date(a.date).getTime(); return d !== 0 ? d : String(b.id).localeCompare(String(a.id)); });

  const toggleSelect = (id: string) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map((e) => e.id)));
  const saveEdit = () => { onUpdate(editingId!, { ...editForm, amount: Number(editForm.amount) }); setEditingId(null); };

  const selStyle: React.CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, color: C.text1, borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' };
  const allCats = [...data.settings.expenseCategories, ...data.settings.incomeCategories];

  const accountBadge = (acc: string) => {
    if (acc === names.a || acc === 'Partner A') return <Badge color={C.purple}>{names.a}</Badge>;
    if (acc === names.b || acc === 'Partner B') return <Badge color={C.blue}>{names.b}</Badge>;
    return <Badge color={C.green}>Joint</Badge>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filter bar */}
      <Card style={{ padding: '12px 18px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: C.muted, fontSize: 12 }}>Filter:</span>
          <select style={selStyle} value={filter.month} onChange={(e) => sf('month', e.target.value)}><option value="All">All Months</option>{allMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
          <select style={selStyle} value={filter.type} onChange={(e) => sf('type', e.target.value)}><option value="All">All Types</option><option value="expense">Expenses</option><option value="income">Income</option></select>
          <select style={selStyle} value={filter.account} onChange={(e) => sf('account', e.target.value)}><option value="All">All Accounts</option><option value="Joint">Joint</option><option value={names.a}>{names.a}</option><option value={names.b}>{names.b}</option></select>
          <select style={selStyle} value={filter.category} onChange={(e) => sf('category', e.target.value)}><option value="All">All Categories</option>{allCats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <select style={selStyle} value={filter.settled} onChange={(e) => sf('settled', e.target.value)}><option value="All">All Statuses</option><option value="pending">⏳ Pending</option><option value="personal">👤 Personal</option><option value="settledA">✅ Settled — {names.a}</option><option value="settledB">✅ Settled — {names.b}</option></select>
        </div>
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
                <option value="Partner B">{names.b}</option>
                <option value="Joint">Joint</option>
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

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <th style={{ padding: '11px 14px', width: 40 }}><input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: C.amber }} /></th>
                <th style={{ padding: '11px 14px', width: 65, color: C.muted, fontWeight: 600, textAlign: 'left' }}>Copy</th>
                {['Date', 'Note', 'Category', 'Amount', 'Account', 'Status', 'Actions'].map((h) => <th key={h} style={{ padding: '11px 14px', color: C.muted, fontWeight: 600, textAlign: 'left' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                if (editingId === e.id) return (
                  <tr key={e.id} style={{ background: C.bg + '99', borderTop: `1px solid ${C.amber}` }}>
                    <td /><td />
                    <td style={{ padding: 8 }}><Inp type="date" value={editForm.date} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, date: ev.target.value }))} /></td>
                    <td style={{ padding: 8 }}><Inp value={editForm.note} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, note: ev.target.value }))} /></td>
                    <td style={{ padding: 8 }}><Sel value={editForm.category} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, category: ev.target.value }))}>{allCats.map((c) => <option key={c} value={c}>{c}</option>)}</Sel></td>
                    <td style={{ padding: 8 }}><Inp type="number" value={editForm.amount} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, amount: ev.target.value }))} style={{ width: 80 }} /></td>
                    <td style={{ padding: 8 }}><Sel value={editForm.account} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, account: ev.target.value }))}><option value="Joint">Joint</option><option value={names.a}>{names.a}</option><option value={names.b}>{names.b}</option></Sel></td>
                    <td style={{ padding: 8 }}>
                      {editForm.type === 'income' || editForm.account === 'Joint' ? <span style={{ color: C.muted, fontSize: 12 }}>N/A</span> : <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: C.text1 }}><input type="checkbox" checked={editForm.toSettle} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, toSettle: ev.target.checked }))} style={{ accentColor: C.amber }} />Shared</label>}
                    </td>
                    <td style={{ padding: 8, display: 'flex', gap: 6 }}><Btn variant="success" onClick={saveEdit} style={{ padding: '6px 10px' }}>✓</Btn><Btn variant="ghost" onClick={() => setEditingId(null)} style={{ padding: '6px 10px' }}>✕</Btn></td>
                  </tr>
                );
                return (
                  <tr key={e.id} style={{ borderTop: `1px solid ${C.border}`, background: selectedIds.has(e.id) ? C.red + '08' : i % 2 === 0 ? 'transparent' : C.bg + '80' }}>
                    <td style={{ padding: '10px 14px' }}><input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggleSelect(e.id)} style={{ cursor: 'pointer', accentColor: C.amber }} /></td>
                    <td style={{ padding: '10px 14px' }}><Btn variant="ghost" style={{ padding: '3px 8px', fontSize: 11, color: C.amber, borderColor: `${C.amber}33` }} onClick={() => onDuplicate(e)}>📋 Copy</Btn></td>
                    <td style={{ padding: '10px 14px', color: C.text2, whiteSpace: 'nowrap' }}>{e.date}</td>
                    <td style={{ padding: '10px 14px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: C.textW }}>{e.note || '—'}</span>
                      {e.isRecurring && <span title={`Recurring: ${e.recurrenceInterval}`} style={{ marginLeft: 6, color: C.amber, fontSize: 13 }}>🔄</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.text1 }}>{e.category}</td>
                    <td style={{ padding: '10px 14px', color: e.type === 'income' ? C.green : C.textW, fontWeight: 700 }}>{e.type === 'income' ? '+' : ''}{fmt(e.amount, data.settings.currency)}</td>
                    <td style={{ padding: '10px 14px' }}>{accountBadge(e.account)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {e.type === 'income' ? <span style={{ color: C.muted }}>—</span> : e.settled ? <Badge color={C.green}>✓ Settled — {e.settledFor === 'Partner A' ? names.a : names.b}</Badge> : e.account === 'Joint' ? <span style={{ color: C.muted, fontSize: 12, fontStyle: 'italic' }}>Shared</span> : !e.toSettle ? <span style={{ color: C.text2, fontSize: 12 }}>Personal</span> : <Badge color={C.amber}>⏳ Pending</Badge>}
                    </td>
                    <td style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
                      <Btn variant="ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => onTriggerEdit(e)}>Edit</Btn>
                      <Btn variant="danger" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => onDelete(e.id)}>✕</Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
