'use client';
// components/dashboard/ExpenseListPaginated.tsx
// Drop-in replacement for ExpenseList.tsx that uses server-side pagination
// instead of loading all transactions into React state.
//
// Key differences from the original:
//   • Filter state drives API calls, not client-side Array.filter()
//   • Data is fetched 50 rows at a time; "Load more" appends the next page
//   • The total row count comes from the DB (displayed as "X transactions")
//   • Search uses ILIKE in Postgres, not JS string includes()
//   • Bulk operations still call the existing useActions helpers after
//     mutating, then reset to page 0 so the list refreshes
//
// Usage in app/page.tsx: replace <ExpenseList ...> with <ExpenseListPaginated ...>
// The props interface is identical to the original.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AppData } from '@/types';
import { C } from '@/constants';
import { Icon } from '@/components/ui/Icon';

const PAGE_SIZE = 50;

function monthKey(d: string) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string) {
  if (!key || key === 'All') return 'All Months';
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', {
    month: 'short', year: 'numeric',
  });
}
function dayLabel(dateStr: string): string {
  const now  = new Date(); now.setHours(0, 0, 0, 0);
  const d    = new Date(dateStr); d.setHours(0, 0, 0, 0);
  const diff = Math.round((now.getTime() - d.getTime()) / 86400000);
  const short = new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const long  = new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  if (diff === 0) return `Today · ${short}`;
  if (diff === 1) return `Yesterday · ${short}`;
  return long;
}

const catIconStyle = (cat: string, type?: string): { bg: string; color: string; icon: string } => {
  if (type === 'income') return { bg: C.greenBg, color: C.green, icon: 'wallet' };
  const map: Record<string, { bg: string; color: string; icon: string }> = {
    'Groceries':            { bg: C.greenBg,  color: C.green,  icon: 'cart'      },
    'Dining Out':           { bg: C.orangeBg, color: C.orange, icon: 'utensils'  },
    'Coffee & Snacks':      { bg: C.orangeBg, color: C.orange, icon: 'coffee'    },
    'Rent / Mortgage':      { bg: C.blueBg,   color: C.blue,   icon: 'home'      },
    'Electricity':          { bg: C.tealBg,   color: C.teal,   icon: 'zap'       },
    'Internet':             { bg: C.purpleBg, color: C.purple, icon: 'sync'      },
    'Streaming Services':   { bg: C.purpleBg, color: C.purple, icon: 'film'      },
    'Insurance':            { bg: C.blueBg,   color: C.blue,   icon: 'shield'    },
    'Medical / Health':     { bg: C.redBg,    color: C.red,    icon: 'alert'     },
    'Gym & Fitness':        { bg: C.greenBg,  color: C.green,  icon: 'target'    },
    'Transport / Fuel':     { bg: C.tealBg,   color: C.teal,   icon: 'car'       },
    'Flights & Hotels':     { bg: C.blueBg,   color: C.blue,   icon: 'send'      },
    'Investment':           { bg: C.tealBg,   color: C.teal,   icon: 'trendUp'   },
    'Investments':          { bg: C.tealBg,   color: C.teal,   icon: 'trendUp'   },
    'Entertainment':        { bg: C.purpleBg, color: C.purple, icon: 'star'      },
    'Miscellaneous':        { bg: C.accentBg, color: C.accent, icon: 'more'      },
  };
  return map[cat] ?? { bg: C.accentBg, color: C.accent, icon: 'wallet' };
};

interface Props {
  data:                   AppData;
  fmt:                    (n: number) => string;
  onToggleToSettle:       (id: string) => void;
  onDelete:               (id: string) => void;
  onUpdate:               (id: string, u: any) => void;
  onUnsettle:             (id: string) => void;
  onBulkDelete:           (ids: string[]) => void;
  onBulkFlagToSettle:     (ids: string[]) => void;
  onBulkMarkAsSettled:    (ids: string[]) => void;
  onBulkAssignToAccount:  (ids: string[], account: string) => void;
  onTriggerEdit:          (e: any) => void;
  onDuplicate:            (e: any) => void;
}

interface FilterState {
  month:    string;
  account:  string;
  category: string;
  type:     string;
  settled:  string;
}

export function ExpenseListPaginated({
  data, fmt,
  onToggleToSettle, onDelete, onUpdate, onUnsettle,
  onBulkDelete, onBulkFlagToSettle, onBulkMarkAsSettled, onBulkAssignToAccount,
  onTriggerEdit, onDuplicate,
}: Props) {
  // Memoize names so they don't recreate on every render and trigger
  // fetchExpenses to loop via the useCallback dependency array.
  const nameA      = data.settings.partnerAName;
  const nameB      = data.settings.partnerBName;
  const names      = React.useMemo(() => ({ a: nameA, b: nameB }), [nameA, nameB]);
  const mode       = data.settings.householdMode ?? 'joint';
  const isJoint    = mode === 'joint';
  const isSolo     = mode === 'solo';
  const hasPartner = mode !== 'solo';

  const currentMonth = monthKey(new Date().toISOString().slice(0, 10));

  // ── Filter state ─────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<FilterState>({
    month:    currentMonth,
    account:  'All',
    category: 'All',
    type:     'All',
    settled:  'All',
  });
  const [search, setSearch]   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Pagination state ──────────────────────────────────────────────────────
  const [expenses, setExpenses]   = useState<any[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [hasMore, setHasMore]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError]   = useState<string | null>(null);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  // ── Selection state ──────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds]             = useState<Set<string>>(new Set());
  const [selectedTargetAccount, setSelectedTargetAccount] = useState('');

  // ── Fetch expenses from API ───────────────────────────────────────────────
  const fetchExpenses = useCallback(async (
    filterState: FilterState,
    searchTerm:  string,
    pageNum:     number,
    append:      boolean,
  ) => {
    if (append) setLoadingMore(true);
    else        setLoading(true);

    try {
      setFetchError(null);
      const params = new URLSearchParams({
        householdId:  data.householdId,
        page:         String(pageNum),
        limit:        String(PAGE_SIZE),
        partnerAName: names.a,
        partnerBName: names.b,
      });

      if (filterState.month !== 'All' && filterState.month !== 'year') {
        params.set('month', filterState.month);
      } else if (filterState.month === 'year') {
        params.set('year', 'current');
      }

      if (filterState.account  !== 'All') params.set('account',  filterState.account);
      if (filterState.category !== 'All') params.set('category', filterState.category);
      if (filterState.type     !== 'All') params.set('type',     filterState.type);
      if (filterState.settled  !== 'All') params.set('settled',  filterState.settled);
      if (searchTerm.trim())              params.set('search',   searchTerm.trim());

      // Include the Supabase session token so the API can verify the caller
      // belongs to the requested household.
      let authHeader: Record<string, string> = {};
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          authHeader = { Authorization: `Bearer ${session.access_token}` };
        }
      } catch {}

      const res  = await fetch(`/api/expenses?${params}`, { headers: authHeader });
      const json = await res.json();

      if (!res.ok) {
        const msg = json.error ?? `HTTP ${res.status}`;
        console.error('[ExpenseListPaginated] API error:', msg);
        setFetchError(msg);
        return;
      }

      setTotal(json.total ?? 0);
      setHasMore(json.hasMore ?? false);
      
      if (!append && json.availableMonths) {
        setAvailableMonths(json.availableMonths);
      }

      if (append) {
        setExpenses((prev) => [...prev, ...(json.expenses ?? [])]);
      } else {
        setExpenses(json.expenses ?? []);
        setSelectedIds(new Set()); // clear selection on filter change
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Network error';
      console.error('[ExpenseListPaginated] Fetch error:', msg);
      setFetchError(msg);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [data.householdId, names.a, names.b]);

  // Re-fetch whenever filter or search changes (reset to page 0)
  useEffect(() => {
    setPage(0);
    fetchExpenses(filter, debouncedSearch, 0, false);
  }, [filter, debouncedSearch, fetchExpenses]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchExpenses(filter, debouncedSearch, next, true);
  };

  // Re-fetch from page 0 after a mutation
  const refresh = () => {
    setPage(0);
    fetchExpenses(filter, debouncedSearch, 0, false);
  };

  // ── Available months for the month picker ─────────────────────────────────
  // Derive from data.expenses (summary is fast since loadData still loads meta)
  // Now dynamically updated via API instead of hardcoded 18 months.

  const allCats = [...data.settings.expenseCategories, ...data.settings.incomeCategories];

  // ── Filter helpers ────────────────────────────────────────────────────────
  const sf = (k: keyof FilterState, v: string) => setFilter((f) => ({ ...f, [k]: v }));

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelectedIds(selectedIds.size === expenses.length ? new Set() : new Set(expenses.map((e) => e.id)));

  // ── Day groups ────────────────────────────────────────────────────────────
  const dayGroups = expenses.reduce<{ date: string; label: string; items: any[]; net: number }[]>((acc, e) => {
    const last   = acc[acc.length - 1];
    const amt    = Number(e.amount ?? 0);
    const contrib = e.type === 'income' ? amt : -amt;
    if (last && last.date === e.date) { last.items.push(e); last.net += contrib; }
    else acc.push({ date: e.date, label: dayLabel(e.date), items: [e], net: contrib });
    return acc;
  }, []);

  const selStyle: React.CSSProperties = {
    background: C.surface2, border: `1px solid ${C.border}`,
    color: C.text1, borderRadius: 99, padding: '6px 14px', fontSize: 12, cursor: 'pointer', outline: 'none',
  };

  const smallBtn = (color?: string): React.CSSProperties => ({
    background: 'transparent', border: `1px solid ${color ?? C.border}`,
    color: color ?? C.text2, borderRadius: 99, padding: '6px 12px',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  });

  const chips = [
    { label: 'All',      account: 'All',    type: 'All'    },
    ...(isJoint ? [{ label: 'Joint', account: 'Joint', type: 'All' }] : []),
    { label: names.a,    account: names.a,  type: 'All'    },
    ...(hasPartner ? [{ label: names.b, account: names.b, type: 'All' }] : []),
    { label: 'Income',   account: 'All',    type: 'income' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Filter section ─────────────────────────────────────────────────── */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="search"
          placeholder="Search notes or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', background: C.surface2, border: 'none', color: C.textW, borderRadius: 99, padding: '10px 16px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
        />
        {/* Account + type chips */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' as any }}>
          {chips.map((chip) => {
            const active = filter.account === chip.account && filter.type === chip.type;
            return (
              <span
                key={chip.label}
                onClick={() => setFilter((f) => ({ ...f, account: chip.account, type: chip.type }))}
                style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 16px', background: active ? C.accentBg : C.surface2, borderRadius: 999, fontSize: 13, fontWeight: 600, color: active ? C.accent : C.textW, border: `1px solid ${active ? C.accent : C.border2}`, whiteSpace: 'nowrap' as const, flexShrink: 0, cursor: 'pointer' }}
              >
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
            {availableMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <select style={selStyle} value={filter.category} onChange={(e) => sf('category', e.target.value)}>
            <option value="All">All Categories</option>
            {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={selStyle} value={filter.settled} onChange={(e) => sf('settled', e.target.value)}>
            <option value="All">All Statuses</option>
            {isJoint    && <option value="pendingJoint">Joint Pending</option>}
            {hasPartner && <option value="pendingPartner">Partner Split</option>}
            <option value="personal">Personal</option>
            <option value="settled">Settled</option>
            <option value="settledA">Settled — {names.a}</option>
            {hasPartner && <option value="settledB">Settled — {names.b}</option>}
          </select>
        </div>
      </div>

      {/* ── Bulk action bar ─────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{ background: C.red + '15', border: `1px solid ${C.red}44`, borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 10 }}>
          <span style={{ color: C.red, fontWeight: 700, fontSize: 14 }}>{selectedIds.size} selected</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <select value={selectedTargetAccount} onChange={(e) => setSelectedTargetAccount(e.target.value)} style={{ ...selStyle, fontSize: 12 }}>
              <option value="">-- Account --</option>
              <option value="Partner A">{names.a}</option>
              {hasPartner && <option value="Partner B">{names.b}</option>}
              {isJoint && <option value="Joint">Joint</option>}
            </select>
            <button style={{ ...smallBtn(selectedTargetAccount ? C.amber : undefined), display: 'inline-flex', alignItems: 'center', gap: 4 }} disabled={!selectedTargetAccount}
              onClick={() => {
                const ids = [...selectedIds];
                const acc = selectedTargetAccount;
                setSelectedTargetAccount('');
                setSelectedIds(new Set());
                onBulkAssignToAccount(ids, acc);
                refresh();
              }}>
              <Icon name="sync" size={12} color={selectedTargetAccount ? C.amber : C.text2} /> Assign
            </button>
            <button style={smallBtn()} onClick={() => setSelectedIds(new Set())}>Deselect</button>
            <button style={{ ...smallBtn(C.amber), display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => {
                const ids = [...selectedIds];
                setSelectedIds(new Set());
                onBulkFlagToSettle(ids);
                refresh();
              }}>
              <Icon name="alert" size={12} color={C.amber} /> Flag
            </button>
            <button style={{ ...smallBtn(C.green), display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => {
                const ids = [...selectedIds];
                setSelectedIds(new Set());
                onBulkMarkAsSettled(ids);
                refresh();
              }}>
              <Icon name="check" size={12} color={C.green} strokeWidth={3} /> Settle
            </button>
            <button style={{ ...smallBtn(C.red), fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => {
                if (confirm(`Delete ${selectedIds.size} records?`)) {
                  const ids = [...selectedIds];
                  setSelectedIds(new Set());
                  onBulkDelete(ids);
                  refresh();
                }
              }}>
              <Icon name="trash" size={12} color={C.red} /> Delete
            </button>
          </div>
        </div>
      )}

      {/* ── Select-all row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.text2 }}>
          <input type="checkbox" checked={expenses.length > 0 && selectedIds.size === expenses.length} onChange={toggleAll}
            style={{ cursor: 'pointer', accentColor: C.accent, width: 16, height: 16 }} />
          {loading ? 'Loading…' : selectedIds.size > 0 ? `${selectedIds.size} selected` : `${total.toLocaleString('en-IN')} transactions`}
        </label>
        {loading && <Icon name="clock" size={14} color={C.text3} />}
      </div>

      {/* ── Fetch error banner ──────────────────────────────────────────────── */}
      {fetchError && (
        <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}44`, borderRadius: 14, padding: '14px 16px', fontSize: 13, color: C.red, lineHeight: 1.5 }}>
          <strong>Could not load expenses:</strong> {fetchError}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!loading && !fetchError && expenses.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: C.text3 }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
            <Icon name="search" size={40} color={C.text3} strokeWidth={1.5} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text1, marginBottom: 6 }}>No transactions found</div>
          <div style={{ fontSize: 13 }}>Try adjusting your filters</div>
        </div>
      )}

      {/* ── Day-grouped expense list ─────────────────────────────────────────── */}
      {dayGroups.map((group) => (
        <div key={group.date}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.text3 }}>{group.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: group.net >= 0 ? C.green : C.text3, fontVariantNumeric: 'tabular-nums' }}>
              {group.net >= 0 ? '+' : '−'}₹{Math.abs(Math.round(group.net)).toLocaleString('en-IN')}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.items.map((e) => {
              const isSelected = selectedIds.has(e.id);
              const icon       = catIconStyle(e.category, e.type);
              const acctColor  = (acc: string) => acc === names.a || acc === 'Partner A' ? C.purple : acc === names.b || acc === 'Partner B' ? C.blue : C.green;
              const acctLabel  = (acc: string) => acc === names.a || acc === 'Partner A' ? names.a : acc === names.b || acc === 'Partner B' ? names.b : 'Joint';

              return (
                <div
                  key={e.id}
                  style={{ background: isSelected ? C.accentBg : C.surface, borderRadius: 14, padding: '14px 16px', boxShadow: isSelected ? `0 0 0 1.5px ${C.accent}` : '0 2px 12px rgba(0,0,0,0.18)', transition: 'all 0.15s', cursor: 'pointer' }}
                  onClick={() => toggleSelect(e.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: isSelected ? C.accent + '30' : icon.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${isSelected ? C.accent : 'transparent'}`, transition: 'all 0.15s' }}>
                      {isSelected
                        ? <input type="checkbox" checked readOnly style={{ cursor: 'pointer', accentColor: C.accent, width: 16, height: 16 }} onClick={(ev) => ev.stopPropagation()} />
                        : <Icon name={icon.icon} size={20} color={icon.color} strokeWidth={1.8} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 3 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: C.textW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>
                          {e.note || e.category}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: e.type === 'income' ? C.green : C.textW, flexShrink: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                          {e.type === 'income' ? '+' : ''}{fmt(e.amount)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: 11, color: C.text3 }}>{e.date}</span>
                        <span style={{ fontSize: 11, color: C.text3 }}>·</span>
                        <span style={{ fontSize: 11, color: C.text2, fontWeight: 500 }}>{e.category}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, padding: '2px 6px', borderRadius: 99, color: acctColor(e.account), background: acctColor(e.account) + '20' }}>
                          {acctLabel(e.account)}
                        </span>
                        {e.settled && (
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, padding: '2px 6px', borderRadius: 99, color: C.green, background: C.greenBg }}>
                            ✓ Settled{e.settledFor ? ` — ${e.settledFor}` : ''}
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

                  {/* Quick action row when selected */}
                  {isSelected && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }} onClick={(ev) => ev.stopPropagation()}>
                      <button style={{ ...smallBtn(), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => onTriggerEdit(e)}>
                        <Icon name="edit" size={12} color={C.text2} /> Edit
                      </button>
                      <button style={{ ...smallBtn(), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => onDuplicate(e)}>
                        <Icon name="briefcase" size={12} color={C.text2} /> Copy
                      </button>
                      {e.account !== 'Joint' && !e.settled && e.type !== 'income' && (
                        <button style={{ ...smallBtn(C.amber), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => {
                          const ids = [e.id];
                          onBulkFlagToSettle(ids);
                          refresh();
                        }}>
                          <Icon name="alert" size={12} color={C.amber} /> Flag
                        </button>
                      )}
                      {e.settled && (
                        <button style={{ ...smallBtn(), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => { onUnsettle(e.id); refresh(); }}>
                          <Icon name="arrowLeft" size={12} color={C.text2} /> Unsettle
                        </button>
                      )}
                      <button style={{ ...smallBtn(C.red), marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => { onDelete(e.id); refresh(); }}>
                        <Icon name="trash" size={14} color={C.red} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Load more ────────────────────────────────────────────────────────── */}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          style={{
            width: '100%', padding: '14px', borderRadius: 999,
            border: `1px solid ${C.border2}`, background: 'transparent',
            color: C.text2, fontSize: 14, fontWeight: 600,
            cursor: loadingMore ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: loadingMore ? 0.6 : 1,
          }}
        >
          {loadingMore
            ? <><Icon name="clock" size={14} color={C.text3} /> Loading…</>
            : `Load more · ${Math.min(PAGE_SIZE, total - expenses.length)} of ${total - expenses.length} remaining`}
        </button>
      )}

      {/* Scroll-end summary */}
      {!hasMore && expenses.length > 0 && (
        <div style={{ textAlign: 'center', fontSize: 12, color: C.text3, padding: '8px 0' }}>
          {expenses.length.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} transactions shown
        </div>
      )}
    </div>
  );
}
