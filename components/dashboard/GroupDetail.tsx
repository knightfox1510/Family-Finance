// components/dashboard/GroupDetail.tsx
// Fixed version — no new API endpoints needed.
// Members are fetched from the existing /settle endpoint which always queries
// group_members JOIN profiles regardless of transaction count.
// The Add button is never blocked by member loading state.

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { C } from '@/constants';
import { Icon } from '@/components/ui/Icon';
import { addToast } from '@/components/ui/ui';
import { AddGroupExpense } from './AddGroupExpense';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Profile {
  id:           string;
  display_name: string | null;
  ghost_name:   string | null;
  is_ghost:     boolean;
}

interface Split {
  id:           string;
  user_id:      string;
  item_name:    string;
  share_amount: number;
  is_settled:   boolean;
  settled_at:   string | null;
  settled_via:  string | null;
  profiles:     Profile;
}

interface Transaction {
  id:                  string;
  description:         string;
  total_amount:        number;
  split_type:          string;
  category:            string;
  notes:               string | null;
  created_at:          string;
  payer:               Profile;
  transaction_splits:  Split[];
}

interface NetPair {
  creditor: string;
  debtor:   string;
  amount:   number;
}

interface BalanceData {
  net_pairs:     NetPair[];
  members:       Profile[];
  my_splits:     any[];
  my_total_owed: number;
}

interface GroupDetailProps {
  groupId:     string;
  groupName:   string;
  currency:    string;
  userId:      string;
  ghostToken?: string;
  onBack:      () => void;
  fmt:         (n: number) => string;
}

type TabId = 'expenses' | 'balances' | 'members';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function displayName(p: Profile | null | undefined): string {
  if (!p) return 'Unknown';
  return p.display_name || p.ghost_name || 'Member';
}

const AVATAR_COLORS = [C.accent, C.green, C.purple, C.blue, C.teal, C.orange];

function MemberAvatar({ member, size = 32, colorIndex = 0 }: { member: Profile; size?: number; colorIndex?: number }) {
  const bg = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, flexShrink: 0,
    }}>
      {displayName(member).charAt(0).toUpperCase()}
    </div>
  );
}

function relTime(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const mins  = Math.floor(diff / 60000);
  if (days > 6)  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (days > 0)  return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0)  return `${mins}m ago`;
  return 'just now';
}

const CAT_EMOJI: Record<string, string> = {
  'Groceries': '🛒', 'Dining Out': '🍽️', 'Travel': '✈️',
  'Entertainment': '🎬', 'Utilities': '⚡', 'Transport': '🚗',
  'Cab Services': '🚕', 'Online Food Orders': '🛵',
  'Alcohol': '🍻', 'Hosting Day': '🏠', 'Miscellaneous': '📦',
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ height: 72, borderRadius: 14, background: C.surface, opacity: 0.5 }} />
      ))}
    </div>
  );
}

// ─── Transaction card ─────────────────────────────────────────────────────────
function TransactionCard({ tx, userId, fmt, onDelete }: {
  tx:       Transaction;
  userId:   string;
  fmt:      (n: number) => string;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const mySlice    = tx.transaction_splits.find((s) => s.user_id === userId);
  const iPaid      = tx.payer?.id === userId;
  const allSettled = tx.transaction_splits.every((s) => s.is_settled);

  return (
    <div style={{ background: C.surface, borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}`, boxShadow: C.shadowSm }}>
      <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded((e) => !e)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            {CAT_EMOJI[tx.category] ?? '📦'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.textW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tx.description}
            </div>
            <div style={{ fontSize: 11, color: C.text3, marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span>{iPaid ? 'You paid' : `${displayName(tx.payer)} paid`}</span>
              <span>·</span>
              <span>{relTime(tx.created_at)}</span>
              {allSettled && <><span>·</span><span style={{ color: C.green, fontWeight: 700 }}>✓ Settled</span></>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.textW }}>{fmt(tx.total_amount)}</div>
            {mySlice && !iPaid && (
              <div style={{ fontSize: 11, marginTop: 2, color: mySlice.is_settled ? C.green : C.red, fontWeight: 600 }}>
                {mySlice.is_settled ? '✓ paid' : `you owe ${fmt(mySlice.share_amount)}`}
              </div>
            )}
            {iPaid && !allSettled && (
              <div style={{ fontSize: 11, color: C.teal, fontWeight: 600, marginTop: 2 }}>pending</div>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, background: C.surface2, padding: '12px 16px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
            Split · {tx.split_type}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tx.transaction_splits.map((s, i) => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                background: s.user_id === userId ? `${C.accent}0a` : 'transparent',
                borderRadius: 8,
                border: `1px solid ${s.user_id === userId ? C.accent + '22' : 'transparent'}`,
              }}>
                <MemberAvatar member={s.profiles} size={24} colorIndex={i} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text1 }}>
                    {s.user_id === userId ? 'You' : displayName(s.profiles)}
                  </span>
                  {tx.split_type === 'itemized' && (
                    <span style={{ fontSize: 11, color: C.text3, marginLeft: 6 }}>{s.item_name}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.is_settled ? C.green : C.textW }}>{fmt(s.share_amount)}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: s.is_settled ? C.green : C.text3, padding: '2px 8px', borderRadius: 99, background: s.is_settled ? C.greenBg : C.surface }}>
                  {s.is_settled ? '✓' : 'owes'}
                </div>
              </div>
            ))}
          </div>
          {tx.payer?.id === userId && (
            <button onClick={() => onDelete(tx.id)} style={{ marginTop: 12, width: '100%', padding: '8px', borderRadius: 10, border: `1px solid ${C.red}33`, background: 'transparent', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Delete transaction
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Balance row ──────────────────────────────────────────────────────────────
function BalanceRow({ pair, members, userId, fmt, onSettle }: {
  pair:     NetPair;
  members:  Profile[];
  userId:   string;
  fmt:      (n: number) => string;
  onSettle: (pair: NetPair) => void;
}) {
  const creditor = members.find((m) => m.id === pair.creditor);
  const debtor   = members.find((m) => m.id === pair.debtor);
  const isMyDebt = pair.debtor   === userId;
  const iOweMe   = pair.creditor === userId;
  if (!creditor || !debtor) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: isMyDebt ? `${C.red}0a` : iOweMe ? `${C.green}0a` : C.surface2, borderRadius: 12, border: `1px solid ${isMyDebt ? C.red + '22' : iOweMe ? C.green + '22' : 'transparent'}` }}>
      <MemberAvatar member={debtor} size={28} colorIndex={1} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>
          <span style={{ color: isMyDebt ? C.red : C.textW }}>{isMyDebt ? 'You' : displayName(debtor)}</span>
          <span style={{ color: C.text3, fontWeight: 400 }}> owe </span>
          <span style={{ color: iOweMe ? C.green : C.textW }}>{iOweMe ? 'you' : displayName(creditor)}</span>
        </div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: isMyDebt ? C.red : iOweMe ? C.green : C.textW }}>{fmt(pair.amount)}</div>
      {isMyDebt && (
        <button onClick={() => onSettle(pair)} style={{ padding: '6px 14px', borderRadius: 99, border: 'none', background: C.accent, color: '#0a0a0a', fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>
          Settle
        </button>
      )}
    </div>
  );
}

// ─── Settle modal ─────────────────────────────────────────────────────────────
function SettleModal({ pair, members, mySplits, userId, groupId, fmt, onClose, onSettled }: {
  pair:      NetPair;
  members:   Profile[];
  mySplits:  any[];
  userId:    string;
  groupId:   string;
  fmt:       (n: number) => string;
  onClose:   () => void;
  onSettled: () => void;
}) {
  const [method, setMethod]     = useState<'upi' | 'cash' | 'manual'>('upi');
  const [note, setNote]         = useState('');
  const [settling, setSettling] = useState(false);
  const creditor       = members.find((m) => m.id === pair.creditor);
  const relevantSplits = mySplits.filter((s: any) => s.group_transactions?.paid_by === pair.creditor);

  const handleSettle = async () => {
    if (relevantSplits.length === 0) { addToast('No unsettled items found', 'error'); return; }
    setSettling(true);
    try {
      const res  = await fetch(`/api/groups/${groupId}/settle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settledBy: userId, splitIds: relevantSplits.map((s: any) => s.id), settledVia: method, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { addToast(data.error, 'error'); return; }
      addToast(`Settled ${fmt(pair.amount)} with ${displayName(creditor!)} ✓`, 'success');
      onSettled();
    } catch {
      addToast('Could not record settlement. Try again.', 'error');
    } finally {
      setSettling(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '20px 24px 40px', maxWidth: 480, width: '100%', boxShadow: '0 -16px 60px rgba(0,0,0,0.6)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>You owe {displayName(creditor!)}</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: C.red, letterSpacing: '-0.04em' }}>{fmt(pair.amount)}</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>across {relevantSplits.length} transaction{relevantSplits.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>How did you pay?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['upi', 'cash', 'manual'] as const).map((m) => (
              <button key={m} onClick={() => setMethod(m)} style={{ flex: 1, padding: '10px', borderRadius: 12, border: `1px solid ${method === m ? C.accent : C.border2}`, background: method === m ? C.accentBg : 'transparent', color: method === m ? C.accent : C.text2, fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
                {m === 'upi' ? '⚡ UPI' : m === 'cash' ? '💵 Cash' : '✏️ Manual'}
              </button>
            ))}
          </div>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ width: '100%', background: C.surface2, border: '1.5px solid transparent', borderRadius: 12, color: C.textW, fontFamily: 'inherit', fontSize: 14, padding: '12px 16px', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '13px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSettle} disabled={settling} style={{ flex: 2, padding: '13px', borderRadius: 99, border: 'none', background: settling ? C.surface2 : C.green, color: settling ? C.text3 : '#0a0a0a', fontSize: 14, fontWeight: 800, cursor: settling ? 'not-allowed' : 'pointer' }}>
            {settling ? 'Recording…' : `Mark ${fmt(pair.amount)} settled`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function GroupDetail({ groupId, groupName, currency, userId, ghostToken, onBack, fmt }: GroupDetailProps) {
  const [members, setMembers]           = useState<Profile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balanceData, setBalanceData]   = useState<BalanceData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState<TabId>('expenses');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [settlingPair, setSettlingPair]    = useState<NetPair | null>(null);

  // ── Build request headers ────────────────────────────────────────────────────
  // Always send userId as a query param (existing endpoints accept this).
  // Ghost token forwarded as header when present.
  const makeHeaders = (): HeadersInit => {
    const h: Record<string, string> = {};
    if (ghostToken) h['x-ghost-token'] = ghostToken;
    return h;
  };

  // ── Single load function — parallel fetch of transactions + balance ──────────
  // The /settle endpoint fetches members from group_members JOIN profiles,
  // which works even with zero transactions. We use those members.
  // The /transactions endpoint returns existing expenses.
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, balRes] = await Promise.all([
        fetch(`/api/groups/${groupId}/transactions?userId=${userId}`, { headers: makeHeaders() }),
        fetch(`/api/groups/${groupId}/settle?userId=${userId}`,       { headers: makeHeaders() }),
      ]);

      const [txData, balData] = await Promise.all([txRes.json(), balRes.json()]);

      setTransactions(txData.transactions ?? []);
      setBalanceData(balData);

      // ── Key fix: members come from the settle endpoint ─────────────────────
      // The settle route queries group_members JOIN profiles regardless of
      // whether any transactions exist. This always returns the full list.
      if (Array.isArray(balData.members) && balData.members.length > 0) {
        setMembers(balData.members);
      }
    } catch {
      addToast('Could not load group data', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId, userId, ghostToken]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const myNetBalance = balanceData?.net_pairs
    ? balanceData.net_pairs.reduce((net, p) => {
        if (p.creditor === userId) return net + p.amount;
        if (p.debtor   === userId) return net - p.amount;
        return net;
      }, 0)
    : 0;

  const handleExpenseAdded = () => {
    setShowAddExpense(false);
    loadData();
    addToast('Expense added ✓', 'success');
  };

  const handleDeleteTx = async (txId: string) => {
    if (!confirm('Delete this transaction?')) return;
    await fetch(`/api/groups/${groupId}/transactions`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', ...makeHeaders() },
      body: JSON.stringify({ transactionId: txId, userId }),
    });
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
    loadData();
    addToast('Transaction deleted', 'success');
  };

  // ── Tab config ────────────────────────────────────────────────────────────────
  const tabs: { id: TabId; label: string; badge?: string }[] = [
    { id: 'expenses', label: 'Expenses', badge: transactions.length ? String(transactions.length) : undefined },
    { id: 'balances', label: 'Balances', badge: (balanceData?.my_total_owed ?? 0) > 0 ? fmt(balanceData!.my_total_owed) : undefined },
    { id: 'members',  label: 'Members',  badge: members.length ? String(members.length) : undefined },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: C.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="arrowLeft" size={16} color={C.text2} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.textW, letterSpacing: '-0.02em' }}>{groupName}</div>
          <div style={{ fontSize: 12, marginTop: 2, fontWeight: 600, color: myNetBalance > 0 ? C.green : myNetBalance < 0 ? C.red : C.text3 }}>
            {loading ? 'Loading…' : myNetBalance > 0 ? `You are owed ${fmt(myNetBalance)}` : myNetBalance < 0 ? `You owe ${fmt(Math.abs(myNetBalance))}` : 'All settled up ✓'}
          </div>
        </div>
        {/* Add button — always clickable; wizard shows loading if members not ready */}
        <button
          onClick={() => setShowAddExpense(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 99, border: 'none', background: C.accent, color: '#0a0a0a', fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
        >
          <Icon name="plus" size={15} color="#0a0a0a" />
          Add
        </button>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2, background: C.surface2, borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '9px 6px', borderRadius: 10, border: 'none', background: activeTab === tab.id ? C.surface : 'transparent', color: activeTab === tab.id ? C.textW : C.text3, fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            {tab.label}
            {tab.badge && (
              <span style={{ fontSize: 10, fontWeight: 700, background: activeTab === tab.id ? C.accentBg : C.surface, color: activeTab === tab.id ? C.accent : C.text3, padding: '1px 6px', borderRadius: 99 }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Loading skeleton ──────────────────────────────────────────────── */}
      {loading && <SkeletonList />}

      {/* ── EXPENSES TAB ─────────────────────────────────────────────────── */}
      {!loading && activeTab === 'expenses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', background: C.surface, borderRadius: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.textW, marginBottom: 8 }}>No expenses yet</div>
              <div style={{ fontSize: 13, color: C.text2, marginBottom: 20, lineHeight: 1.6 }}>
                Add the first expense and split it with the group.
              </div>
              <button onClick={() => setShowAddExpense(true)} style={{ padding: '12px 24px', borderRadius: 99, border: 'none', background: C.accent, color: '#0a0a0a', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                Add first expense
              </button>
            </div>
          ) : (
            transactions.map((tx) => (
              <TransactionCard key={tx.id} tx={tx} userId={userId} fmt={fmt} onDelete={handleDeleteTx} />
            ))
          )}
        </div>
      )}

      {/* ── BALANCES TAB ─────────────────────────────────────────────────── */}
      {!loading && activeTab === 'balances' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(balanceData?.my_total_owed ?? 0) > 0 && (
            <div style={{ background: `${C.red}0f`, border: `1px solid ${C.red}33`, borderRadius: 14, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: C.red, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Total you owe</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: C.red, letterSpacing: '-0.03em' }}>{fmt(balanceData!.my_total_owed)}</div>
              </div>
              <div style={{ fontSize: 28 }}>💸</div>
            </div>
          )}
          {myNetBalance > 0 && (
            <div style={{ background: `${C.green}0f`, border: `1px solid ${C.green}33`, borderRadius: 14, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: C.green, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Total owed to you</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: C.green, letterSpacing: '-0.03em' }}>{fmt(myNetBalance)}</div>
              </div>
              <div style={{ fontSize: 28 }}>🤑</div>
            </div>
          )}
          {!balanceData?.net_pairs?.length ? (
            <div style={{ textAlign: 'center', padding: '40px 24px', background: C.surface, borderRadius: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.green }}>Everyone's settled up!</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {balanceData.net_pairs.map((pair, i) => (
                <BalanceRow key={i} pair={pair} members={members} userId={userId} fmt={fmt} onSettle={setSettlingPair} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MEMBERS TAB ──────────────────────────────────────────────────── */}
      {!loading && activeTab === 'members' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {members.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 24px', background: C.surface, borderRadius: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>👥</div>
              <div style={{ fontSize: 15, color: C.text2 }}>No members found</div>
              <div style={{ fontSize: 12, color: C.text3, marginTop: 6 }}>This may be a data sync issue — try refreshing.</div>
            </div>
          ) : (
            <>
              {members.map((member, i) => {
                const isMe = member.id === userId;
                const netWithMember = balanceData?.net_pairs
                  ? balanceData.net_pairs.reduce((net, p) => {
                      if (p.creditor === userId && p.debtor   === member.id) return net + p.amount;
                      if (p.debtor   === userId && p.creditor === member.id) return net - p.amount;
                      return net;
                    }, 0)
                  : 0;
                return (
                  <div key={member.id} style={{ background: C.surface, borderRadius: 14, padding: '14px 16px', border: isMe ? `1px solid ${C.accent}44` : `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 14, boxShadow: C.shadowSm }}>
                    <MemberAvatar member={member} size={44} colorIndex={i} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: C.textW }}>{isMe ? 'You' : displayName(member)}</span>
                        {isMe && <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, background: C.accentBg, padding: '2px 8px', borderRadius: 99 }}>YOU</span>}
                        {member.is_ghost && <span style={{ fontSize: 10, fontWeight: 600, color: C.text3, background: C.surface2, padding: '2px 8px', borderRadius: 99 }}>Guest</span>}
                      </div>
                      {!isMe && (
                        <div style={{ fontSize: 12, marginTop: 3, color: netWithMember > 0 ? C.green : netWithMember < 0 ? C.red : C.text3, fontWeight: 600 }}>
                          {netWithMember > 0 ? `Owes you ${fmt(netWithMember)}` : netWithMember < 0 ? `You owe ${fmt(Math.abs(netWithMember))}` : 'All settled'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Invite hint */}
              <div style={{ background: C.surface2, borderRadius: 14, padding: '14px 16px', border: `1px dashed ${C.border2}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.surface, border: `1.5px dashed ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="plus" size={18} color={C.text3} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text2 }}>Invite someone</div>
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>Go back → tap the share icon on the group card</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Add expense sheet ─────────────────────────────────────────────── */}
      {showAddExpense && (
        members.length > 0 ? (
          <AddGroupExpense
            groupId={groupId}
            groupName={groupName}
            currency={currency}
            members={members}
            userId={userId}
            ghostToken={ghostToken}
            fmt={fmt}
            onClose={() => setShowAddExpense(false)}
            onAdded={handleExpenseAdded}
          />
        ) : (
          /* Members not loaded yet — show a simple loading sheet */
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowAddExpense(false)}>
            <div style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '32px 24px 48px', maxWidth: 480, width: '100%', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 14, color: C.text2, marginBottom: 8 }}>Loading group members…</div>
              <div style={{ fontSize: 12, color: C.text3 }}>If this persists, go back and reopen the group.</div>
              <button onClick={() => setShowAddExpense(false)} style={{ marginTop: 20, padding: '12px 28px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 14, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        )
      )}

      {/* ── Settle modal ──────────────────────────────────────────────────── */}
      {settlingPair && balanceData && (
        <SettleModal
          pair={settlingPair}
          members={members}
          mySplits={balanceData.my_splits}
          userId={userId}
          groupId={groupId}
          fmt={fmt}
          onClose={() => setSettlingPair(null)}
          onSettled={() => { setSettlingPair(null); loadData(); }}
        />
      )}
    </div>
  );
}
