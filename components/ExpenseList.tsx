'use client';
import React, { useState } from 'react';
import type { AppData } from '@/types';
import { C } from '@/constants';

function today() { return new Date().toISOString().slice(0, 10); }
function monthKey(d: string) { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; }
function monthLabel(key: string) { if (!key || key === 'All') return 'All Months'; const [y,m]=key.split('-'); return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-IN',{month:'short',year:'numeric'}); }

function dayLabel(dateStr: string): string {
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  const diff = Math.round((now.getTime() - d.getTime()) / 86400000);
  const short = new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const long  = new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  if (diff === 0) return `Today · ${short}`;
  if (diff === 1) return `Yesterday · ${short}`;
  return long;
}

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

const catIconStyle = (cat: string, type?: string): { bg: string; color: string; emoji: string } => {
  if (type === 'income') return { bg: C.greenBg, color: C.green, emoji: '💰' };
  const map: Record<string, { bg: string; color: string; emoji: string }> = {
    'Groceries':            { bg: C.greenBg,  color: C.green,  emoji: '🛒' },
    'Dining Out':           { bg: C.orangeBg, color: C.orange, emoji: '🍽️' },
    'Coffee & Snacks':      { bg: C.orangeBg, color: C.orange, emoji: '☕' },
    'Rent / Mortgage':      { bg: C.blueBg,   color: C.blue,   emoji: '🏠' },
    'Electricity':          { bg: C.tealBg,   color: C.teal,   emoji: '⚡' },
    'Water & Gas':          { bg: C.tealBg,   color: C.teal,   emoji: '💧' },
    'Internet':             { bg: C.purpleBg, color: C.purple, emoji: '📡' },
    'Mobile Plans':         { bg: C.purpleBg, color: C.purple, emoji: '📱' },
    'Streaming Services':   { bg: C.purpleBg, color: C.purple, emoji: '🎬' },
    'Insurance':            { bg: C.blueBg,   color: C.blue,   emoji: '🛡️' },
    'Medical / Health':     { bg: C.redBg,    color: C.red,    emoji: '🏥' },
    'Gym & Fitness':        { bg: C.greenBg,  color: C.green,  emoji: '💪' },
    'Clothing & Apparel':   { bg: C.purpleBg, color: C.purple, emoji: '👗' },
    'Personal Care':        { bg: C.purpleBg, color: C.purple, emoji: '✨' },
    'Transport / Fuel':     { bg: C.tealBg,   color: C.teal,   emoji: '🚗' },
    'Public Transport':     { bg: C.tealBg,   color: C.teal,   emoji: '🚌' },
    'Flights & Hotels':     { bg: C.blueBg,   color: C.blue,   emoji: '✈️' },
    'Investment':           { bg: C.tealBg,   color: C.teal,   emoji: '📈' },
    'Investments':          { bg: C.tealBg,   color: C.teal,   emoji: '📈' },
    'Entertainment':        { bg: C.purpleBg, color: C.purple, emoji: '🎭' },
    'Gifts & Celebrations': { bg: C.redBg,    color: C.red,    emoji: '🎁' },
    'Education':            { bg: C.blueBg,   color: C.blue,   emoji: '📚' },
    'Kids & School':        { bg: C.blueBg,   color: C.blue,   emoji: '🎒' },
    'Home Maintenance':     { bg: C.orangeBg, color: C.orange, emoji: '🔧' },
  };
  return map[cat] ?? { bg: C.accentBg, color: C.accent, emoji: '💸' };
};

export function ExpenseList({ data, fmt, onToggleToSettle, onDelete, onUpdate, onUnsettle, onBulkDelete, onDuplicate, onBulkFlagToSettle, onBulkMarkAsSettled, onBulkAssignToAccount, onTriggerEdit }: Props) {
  const names      = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const mode       = data.settings.householdMode ?? 'joint';
  const isJoint    = mode === 'joint';
  const isSolo     = mode === 'solo';
  const hasPartner = mode !== 'solo';
  const mk = monthKey(today());
  const [filter, setFilter] = useState({ month: mk, account: 'All', category: 'All', type: 'All', settled: 'All' });
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState<any>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchNote, setSearchNote] = useState('');
  const [selectedTargetAccount, setSelectedTargetAccount] = useState('');

  const sf = (k: string, v: string) => setFilter((f) => ({ ...f, [k]: v }));

  const allMonths = [...new Set(data.expenses.map((e) => monthKey(e.date)))].sort().reverse();
  const allCats = [...data.settings.expenseCategories, ...data.settings.incomeCategories];

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
      if (filter.settled === 'pendingJoint'   && !(e.toSettle && !e.settled && e.settleTrack !== 'partner')) return false;
      if (filter.settled === 'pendingPartner' && !(e.settleTrack === 'partner' && !e.settled)) return false;
      if (filter.settled === 'personal'       && (e.toSettle || e.settleTrack === 'partner' || e.settled)) return false;
      if (filter.settled === 'settled'        && !e.settled) return false;
      if (filter.settled === 'settledA'       && (!e.settled || (e.settledFor !== 'Partner A' && e.settledFor !== names.a))) return false;
      if (filter.settled === 'settledB'       && (!e.settled || (e.settledFor !== 'Partner B' && e.settledFor !== names.b))) return false;
    }
    return true;
  }).sort((a, b) => { const d = new Date(b.date).getTime() - new Date(a.date).getTime(); return d !== 0 ? d : String(b.id).localeCompare(String(a.id)); });

  // Day groups
  const dayGroups = filtered.reduce<{ date: string; label: string; items: typeof filtered; net: number }[]>((acc, e) => {
    const last = acc[acc.length - 1];
    const amt = Number(e.amount ?? 0);
    const contrib = e.type === 'income' ? amt : -amt;
    if (last && last.date === e.date) { last.items.push(e); last.net += contrib; }
    else acc.push({ date: e.date, label: dayLabel(e.date), items: [e], net: contrib });
    return acc;
  }, []);

  const toggleSelect = (id: string) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map((e) => e.id)));
  const saveEdit = () => { onUpdate(editingId!, { ...editForm, amount: Number(editForm.amount) }); setEditingId(null); };

  const selStyle: React.CSSProperties = { background: C.surface2, border: `1px solid ${C.border}`, color: C.text1, borderRadius: 99, padding: '6px 14px', fontSize: 12, cursor: 'pointer', outline: 'none' };
  const smallBtn = (color?: string): React.CSSProperties => ({ background: 'transparent', border: `1px solid ${color ?? C.border}`, color: color ?? C.text2, borderRadius: 99, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

  // Quick account filter chips
  const chips = [
    { label: 'All',      account: 'All',    type: 'All'     },
    ...(isJoint ? [{ label: 'Joint', account: 'Joint', type: 'All' }] : []),
    { label: names.a,    account: names.a,  type: 'All'     },
    ...(hasPartner ? [{ label: names.b, account: names.b, type: 'All' }] : []),
    { label: 'Income',   account: 'All',    type: 'income'  },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Filter section ───────────────────────────────────────────────── */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="search" placeholder="Search notes or category…"
          value={searchNote} onChange={(e) => setSearchNote(e.target.value)}
          style={{ width: '100%', background: C.surface2, border: 'none', color: C.textW, borderRadius: 99, padding: '10px 16px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
        />
        {/* Account + type chips */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' as any }}>
          {chips.map((chip) => {
            const active = filter.account === chip.account && filter.type === chip.type;
            return (
              <span key={chip.label} onClick={() => setFilter((f) => ({ ...f, account: chip.account, type: chip.type }))}
                style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 16px', background: active ? C.accentBg : C.surface2, borderRadius: 999, fontSize: 13, fontWeight: 600, color: active ? C.accent : C.textW, border: `1px solid ${active ? C.accent : C.border2}`, whiteSpace: 'nowrap' as const, flexShrink: 0, cursor: 'pointer' }}>
                {chip.label}
              </span>
            );
          })}
        </div>
        {/* Month + Category + Status */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          <select style={selStyle} value={filter.month} onChange={(e) => sf('month', e.target.value)}>
            <option value="All">All Months</option>
            <option value="year">This Year</option>
            {allMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <select style={selStyle} value={filter.category} onChange={(e) => sf('category', e.target.value)}>
            <option value="All">All Categories</option>
            {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={selStyle} value={filter.settled} onChange={(e) => sf('settled', e.target.value)}>
            <option value="All">All Statuses</option>
            {isJoint && <option value="pendingJoint">⏳ Joint Pending</option>}
            {hasPartner && <option value="pendingPartner">🤝 Partner Split</option>}
            <option value="personal">👤 Personal</option>
            <option value="settled">✅ Settled</option>
            <option value="settledA">✅ {names.a}</option>
            {hasPartner && <option value="settledB">✅ {names.b}</option>}
          </select>
        </div>
      </div>

      {/* ── Bulk action bar ───────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{ background: C.red + '15', border: `1px solid ${C.red}44`, borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 10 }}>
          <span style={{ color: C.red, fontWeight: 700, fontSize: 14 }}>💥 {selectedIds.size} selected</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <select value={selectedTargetAccount} onChange={(e) => setSelectedTargetAccount(e.target.value)} style={{ ...selStyle, fontSize: 12 }}>
              <option value="">-- Account --</option>
              <option value="Partner A">{names.a}</option>
              {hasPartner && <option value="Partner B">{names.b}</option>}
              {isJoint && <option value="Joint">Joint</option>}
            </select>
            <button style={smallBtn(selectedTargetAccount ? C.amber : undefined)} disabled={!selectedTargetAccount}
              onClick={() => { onBulkAssignToAccount([...selectedIds], selectedTargetAccount); setSelectedTargetAccount(''); setSelectedIds(new Set()); }}>
              🔄 Assign
            </button>
            <button style={smallBtn()} onClick={() => setSelectedIds(new Set())}>Deselect</button>
            <button style={smallBtn(C.amber)} onClick={() => { onBulkFlagToSettle([...selectedIds]); setSelectedIds(new Set()); }}>⚖️ Flag</button>
            <button style={smallBtn(C.green)} onClick={() => { onBulkMarkAsSettled([...selectedIds]); setSelectedIds(new Set()); }}>✅ Settle</button>
            <button style={{ ...smallBtn(C.red), fontWeight: 700 }} onClick={() => { if (confirm(`Delete ${selectedIds.size} records?`)) { onBulkDelete([...selectedIds]); setSelectedIds(new Set()); } }}>🗑️ Delete</button>
          </div>
        </div>
      )}

      {/* ── Select all row ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.text2 }}>
          <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length} onChange={toggleAll}
            style={{ cursor: 'pointer', accentColor: C.accent, width: 16, height: 16 }} />
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${filtered.length} transactions`}
        </label>
      </div>

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: C.text3 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text1, marginBottom: 6 }}>No transactions found</div>
          <div style={{ fontSize: 13 }}>Try adjusting your filters</div>
        </div>
      )}

      {/* ── Day-grouped expense list ──────────────────────────────────────── */}
      {dayGroups.map((group) => (
        <div key={group.date}>
          {/* Day header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.text3 }}>{group.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: group.net >= 0 ? C.green : C.text3, fontVariantNumeric: 'tabular-nums' }}>
              {group.net >= 0 ? '+' : '−'}₹{Math.abs(Math.round(group.net)).toLocaleString('en-IN')}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.items.map((e) => {
              const isEditing  = editingId === e.id;
              const isSelected = selectedIds.has(e.id);

              if (isEditing) return (
                <div key={e.id} style={{ background: C.surface, borderRadius: 16, padding: 16, boxShadow: `0 0 0 2px ${C.accent}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>Editing transaction</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input type="date" value={editForm.date} onChange={(ev) => setEditForm((f: any) => ({ ...f, date: ev.target.value }))} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
                    <input value={editForm.note ?? ''} placeholder="Note" onChange={(ev) => setEditForm((f: any) => ({ ...f, note: ev.target.value }))} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
                    <select value={editForm.category} onChange={(ev) => setEditForm((f: any) => ({ ...f, category: ev.target.value }))} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }}>
                      {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" value={editForm.amount} placeholder="Amount" onChange={(ev) => setEditForm((f: any) => ({ ...f, amount: ev.target.value }))} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
                  </div>
                  <select value={editForm.account} onChange={(ev) => setEditForm((f: any) => ({ ...f, account: ev.target.value }))} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }}>
                    <option value="Joint">Joint</option>
                    <option value={names.a}>{names.a}</option>
                    <option value={names.b}>{names.b}</option>
                  </select>
                  {!(editForm.type === 'income' || editForm.account === 'Joint' || isSolo) && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.text1 }}>
                      <input type="checkbox" checked={editForm.toSettle} onChange={(ev) => setEditForm((f: any) => ({ ...f, toSettle: ev.target.checked }))} style={{ accentColor: C.accent }} />
                      {isJoint ? 'Shared / Reimburse from pool' : 'Split with partner'}
                    </label>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={saveEdit} style={{ flex: 1, background: C.green, color: '#fff', border: 'none', borderRadius: 99, padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>✓ Save</button>
                    <button onClick={() => setEditingId(null)} style={{ flex: 1, background: 'transparent', border: `1px solid ${C.border}`, color: C.text1, borderRadius: 99, padding: '11px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✕ Cancel</button>
                  </div>
                </div>
              );

              const icon = catIconStyle(e.category, e.type);
              const acctColor = (acc: string) => acc === names.a || acc === 'Partner A' ? C.purple : acc === names.b || acc === 'Partner B' ? C.blue : C.green;
              const acctLabel = (acc: string) => acc === names.a || acc === 'Partner A' ? names.a : acc === names.b || acc === 'Partner B' ? names.b : 'Joint';

              return (
                <div key={e.id}
                  style={{ background: isSelected ? C.accentBg : C.surface, borderRadius: 14, padding: '14px 16px', boxShadow: isSelected ? `0 0 0 1.5px ${C.accent}` : '0 2px 12px rgba(0,0,0,0.18)', transition: 'all 0.15s', cursor: 'pointer' }}
                  onClick={() => toggleSelect(e.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: isSelected ? C.accent + '30' : icon.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, border: `1.5px solid ${isSelected ? C.accent : 'transparent'}`, transition: 'all 0.15s' }}>
                      {isSelected
                        ? <input type="checkbox" checked readOnly style={{ cursor: 'pointer', accentColor: C.accent, width: 16, height: 16 }} onClick={(ev) => ev.stopPropagation()} />
                        : icon.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 3 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: C.textW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>
                          {e.note || e.category}{e.isRecurring && <span style={{ marginLeft: 6, fontSize: 12 }}>🔄</span>}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: e.type === 'income' ? C.green : C.textW, flexShrink: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                          {e.type === 'income' ? '+' : ''}{fmt(e.amount)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: 11, color: C.text3 }}>{e.date}</span>
                        <span style={{ fontSize: 11, color: C.text3 }}>·</span>
                        <span style={{ fontSize: 11, color: C.text2, fontWeight: 500 }}>{e.category}</span>
                        {/* Account badge */}
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, padding: '2px 6px', borderRadius: 99, color: acctColor(e.account), background: acctColor(e.account) + '20' }}>
                          {acctLabel(e.account)}
                        </span>
                        {e.settled && (
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, padding: '2px 6px', borderRadius: 99, color: C.green, background: C.greenBg }}>
                            ✓ Settled{e.settledFor ? ` — ${e.settledFor === 'Partner A' ? names.a : e.settledFor === 'Partner B' ? names.b : e.settledFor}` : ''}
                          </span>
                        )}
                        {!e.settled && e.toSettle && (
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, padding: '2px 6px', borderRadius: 99, color: C.accent, background: C.accentBg }}>⏳ Pending</span>
                        )}
                        {!e.settled && e.settleTrack === 'partner' && (
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, padding: '2px 6px', borderRadius: 99, color: C.purple, background: C.purpleBg }}>Split</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }} onClick={(ev) => ev.stopPropagation()}>
                      <button style={smallBtn()} onClick={() => onTriggerEdit(e)}>✏️ Edit</button>
                      <button style={smallBtn()} onClick={() => onDuplicate(e)}>📋 Copy</button>
                      {e.account !== 'Joint' && !e.settled && e.type !== 'income' && (
                        <button style={smallBtn(C.amber)} onClick={(ev) => { ev.stopPropagation(); onBulkFlagToSettle([e.id]); }}>⚖️ Flag</button>
                      )}
                      {e.settled && (
                        <button style={smallBtn()} onClick={() => onUnsettle(e.id)}>↩ Unsettle</button>
                      )}
                      <button style={{ ...smallBtn(C.red), marginLeft: 'auto' }} onClick={() => onDelete(e.id)}>🗑️</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
