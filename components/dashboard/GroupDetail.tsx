// components/dashboard/GroupDetail.tsx
// Phase 2: Debt simplification toggle in Group Settings sheet
// Phase 3: Activity tab - lazy-loaded, paginated audit log

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { C } from '@/constants';
import { Icon } from '@/components/ui/Icon';
import { addToast } from '@/components/ui/ui';
import { AddGroupExpense } from './AddGroupExpense';
import { Avatar } from '@/components/ui/Avatar';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Profile {
  id: string; display_name: string | null; ghost_name: string | null; is_ghost: boolean;
  role?: string;  // 'admin' | 'member' — present when fetched from group_members
}
interface Split {
  id: string; user_id: string; item_name: string; share_amount: number;
  is_settled: boolean; profiles: Profile | null;
}
interface Transaction {
  id: string; description: string; total_amount: number; split_type: string;
  category: string; notes: string | null; created_at: string;
  paid_by: string; payer: Profile | null; transaction_splits: Split[];
  is_flagged?:  boolean;
  flag_reason?: string | null;
  flagged_by?:  string | null;
}
interface NetPair { creditor: string; debtor: string; amount: number; }
interface BalanceData {
  net_pairs: NetPair[]; members: Profile[]; my_splits: any[];
  my_total_owed: number; simplify_debts?: boolean;
}
interface ActivityEntry {
  id: string; user_id: string; action_type: string;
  description: string; created_at: string;
  actor?: Profile | null;
}
interface GroupDetailProps {
  groupId: string; groupName: string; currency: string;
  userId: string; ghostToken?: string;
  onBack: () => void; fmt: (n: number) => string;
}
type TabId = 'expenses' | 'balances' | 'members' | 'activity';

// ── Helpers ───────────────────────────────────────────────────────────────────
const ROLE_STRINGS = new Set(['Partner A', 'Partner B', 'partner_a', 'partner_b']);

function displayName(p: Profile | null | undefined, fallback = 'Member'): string {
  if (!p) return fallback;
  const dn = p.display_name;
  if (dn && !ROLE_STRINGS.has(dn)) return dn;
  return p.ghost_name || dn || fallback;
}

function MemberAvatar({ profile, size = 32, colorIndex = 0 }: {
  profile: Profile | null; size?: number; colorIndex?: number;
}) {
  // Delegate to shared Avatar component — handles real photos and initials fallback
  return <Avatar profile={profile ?? undefined} size={size} />;
}

function relTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000), hours = Math.floor(diff / 3600000), mins = Math.floor(diff / 60000);
  if (days > 6) return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (days > 0) return days + 'd ago';
  if (hours > 0) return hours + 'h ago';
  if (mins > 0) return mins + 'm ago';
  return 'just now';
}

const CAT_EMOJI: Record<string, string> = {
  Groceries: '🛒', 'Dining Out': '🍽\uFE0F', Travel: '\u2708\uFE0F',
  Entertainment: '🎬', Utilities: '\u26A1', Transport: '🚗',
  Alcohol: '🍻', 'Hosting Day': '🏠', Miscellaneous: '📦',
};

const ACTION_ICON: Record<string, string> = {
  ADD_EXPENSE: 'plus', SETTLE_DEBT: 'check', DELETE_EXPENSE: 'trash',
  UPDATE_SETTING: 'settings', JOIN_GROUP: 'users',
};

function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ height: 64, borderRadius: 14, background: C.surface, opacity: 0.5 }} />
      ))}
    </div>
  );
}

// ── Transaction card ──────────────────────────────────────────────────────────
function TransactionCard({ tx, userId, userRole, members, fmt, onDelete, onEdit, onFlag, onUnflag }: {
  tx: Transaction; userId: string; userRole: 'admin' | 'member'; members: Profile[];
  fmt: (n: number) => string; onDelete: (id: string) => void; onEdit: (tx: Transaction) => void;
  onFlag: (tx: Transaction) => void; onUnflag: (txId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const iPaid       = tx.paid_by === userId || tx.payer?.id === userId;
  const mySlice     = tx.transaction_splits.find((s) => s.user_id === userId);
  const othersOwing = iPaid ? tx.transaction_splits.filter((s) => s.user_id !== userId && !s.is_settled) : [];
  const totalOwedToMe = othersOwing.reduce((s, x) => s + x.share_amount, 0);
  const allSettled  = tx.transaction_splits.every((s) => s.is_settled);

  const resolveProfile = (s: Split) => members.find((m) => m.id === s.user_id) ?? s.profiles ?? null;

  const sub = (() => {
    if (allSettled) return null;
    if (iPaid && totalOwedToMe > 0) return { text: 'you are owed ' + fmt(totalOwedToMe), color: C.green };
    if (!iPaid && mySlice && !mySlice.is_settled) return { text: 'you owe ' + fmt(mySlice.share_amount), color: C.red };
    if (!iPaid && mySlice?.is_settled) return { text: '\u2713 you paid', color: C.green };
    return null;
  })();

  return (
    <div style={{ background: C.surface, borderRadius: 16, overflow: 'hidden', border: '1px solid ' + C.border, boxShadow: C.shadowSm }}>
      <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded((e) => !e)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            {CAT_EMOJI[tx.category] ?? '📦'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.textW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
            <div style={{ fontSize: 11, color: C.text3, marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span>{iPaid ? 'You paid' : displayName(tx.payer) + ' paid'}</span>
              <span>&middot;</span><span>{relTime(tx.created_at)}</span>
              {allSettled && <><span>&middot;</span><span style={{ color: C.green, fontWeight: 700 }}>\u2713 All settled</span></>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              {tx.is_flagged && <Icon name="alert" size={13} color={C.amber} />}
              <span style={{ fontSize: 15, fontWeight: 800, color: C.textW }}>{fmt(tx.total_amount)}</span>
            </div>
            {sub && <div style={{ fontSize: 11, marginTop: 2, color: sub.color, fontWeight: 600 }}>{sub.text}</div>}
          </div>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid ' + C.border, background: C.surface2, padding: '12px 16px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>Split &middot; {tx.split_type}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tx.transaction_splits.map((s, i) => {
              const p    = resolveProfile(s);
              const isMe = s.user_id === userId;
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: isMe ? C.accent + '0a' : 'transparent', borderRadius: 8, border: '1px solid ' + (isMe ? C.accent + '22' : 'transparent') }}>
                  <MemberAvatar profile={p} size={24} colorIndex={i} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text1 }}>{isMe ? 'You' : displayName(p)}</span>
                    {s.item_name && s.item_name !== 'Shared Cost' && s.item_name !== 'Custom Share' && (
                      <span style={{ fontSize: 11, color: C.text3, marginLeft: 6 }}>{s.item_name}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: s.is_settled ? C.green : C.textW }}>{fmt(s.share_amount)}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: s.is_settled ? C.green : C.text3, padding: '2px 8px', borderRadius: 99, background: s.is_settled ? C.greenBg : C.surface }}>
                    {s.is_settled ? '\u2713' : 'owes'}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Flagged banner — visible to all when transaction is flagged */}
          {tx.is_flagged && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: C.amber + '15', border: '1px solid ' + C.amber + '44', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="alert" size={14} color={C.amber} style={{ marginTop: 1, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.amber }}>Flagged for review</div>
                {tx.flag_reason && <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{tx.flag_reason}</div>}
              </div>
              {/* Admin or creator can resolve */}
              {(userRole === 'admin' || iPaid) && (
                <button onClick={() => onUnflag(tx.id)} style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid ' + C.amber + '44', background: 'transparent', color: C.amber, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                  Resolve
                </button>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {/* Edit — creator only */}
            {iPaid && (
              <button onClick={() => onEdit(tx)} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid ' + C.border2, background: 'transparent', color: C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <Icon name="edit" size={13} color={C.text2} /> Edit
              </button>
            )}
            {/* Flag — non-creator members, only if not already flagged */}
            {!iPaid && !tx.is_flagged && (
              <button onClick={() => onFlag(tx)} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid ' + C.amber + '44', background: 'transparent', color: C.amber, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <Icon name="alert" size={13} color={C.amber} /> Flag
              </button>
            )}
            {/* Delete — creator OR admin */}
            {(iPaid || userRole === 'admin') && (
              <button onClick={() => onDelete(tx.id)} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid ' + C.red + '33', background: 'transparent', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <Icon name="trash" size={13} color={C.red} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Balance row ───────────────────────────────────────────────────────────────
function BalanceRow({ pair, members, userId, fmt, onSettle }: {
  pair: NetPair; members: Profile[]; userId: string; fmt: (n: number) => string; onSettle: (p: NetPair) => void;
}) {
  const creditor = members.find((m) => m.id === pair.creditor);
  const debtor   = members.find((m) => m.id === pair.debtor);
  const isMyDebt = pair.debtor === userId, iOweMe = pair.creditor === userId;
  if (!creditor || !debtor) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: isMyDebt ? C.red + '0a' : iOweMe ? C.green + '0a' : C.surface2, borderRadius: 12, border: '1px solid ' + (isMyDebt ? C.red + '33' : iOweMe ? C.green + '33' : 'transparent') }}>
      <MemberAvatar profile={debtor} size={36} colorIndex={1} />
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.text1, lineHeight: 1.4 }}>
        <span style={{ color: isMyDebt ? C.red : C.textW, fontWeight: 700 }}>{isMyDebt ? 'You' : displayName(debtor)}</span>
        <span style={{ color: C.text3, fontWeight: 400 }}> owe </span>
        <span style={{ color: iOweMe ? C.green : C.textW, fontWeight: 700 }}>{iOweMe ? 'you' : displayName(creditor)}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: isMyDebt ? C.red : iOweMe ? C.green : C.textW }}>{fmt(pair.amount)}</div>
      {isMyDebt && <button onClick={() => onSettle(pair)} style={{ padding: '8px 16px', borderRadius: 99, border: 'none', background: C.accent, color: '#0a0a0a', fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>Settle</button>}
    </div>
  );
}

// ── Settle modal ──────────────────────────────────────────────────────────────
function SettleModal({ pair, members, mySplits, userId, groupId, fmt, ghostToken, onClose, onSettled }: {
  pair: NetPair; members: Profile[]; mySplits: any[]; userId: string; groupId: string;
  fmt: (n: number) => string; ghostToken?: string; onClose: () => void; onSettled: () => void;
}) {
  const [method, setMethod] = useState<'upi' | 'cash' | 'manual'>('upi');
  const [note, setNote]     = useState('');
  const [busy, setBusy]     = useState(false);
  const creditor       = members.find((m) => m.id === pair.creditor);
  const relevantSplits = mySplits.filter((s: any) => s.group_transactions?.paid_by === pair.creditor);

  const go = async () => {
    if (!relevantSplits.length) { addToast('No unsettled items', 'error'); return; }
    setBusy(true);
    try {
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ghostToken) { h['x-ghost-token'] = ghostToken; }
      else { try { const { supabase } = await import('@/lib/supabaseClient'); const { data: { session } } = await supabase.auth.getSession(); if (session?.access_token) h['Authorization'] = 'Bearer ' + session.access_token; } catch {} }
      const res  = await fetch('/api/groups/' + groupId + '/settle', { method: 'POST', headers: h, body: JSON.stringify({ settledBy: userId, splitIds: relevantSplits.map((s: any) => s.id), settledVia: method, note: note.trim() || undefined }) });
      const data = await res.json();
      if (!res.ok) { addToast(data.error, 'error'); return; }
      addToast('Settled ' + fmt(pair.amount) + ' \u2713', 'success');
      onSettled();
    } catch { addToast('Could not record settlement', 'error'); } finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '20px 24px 40px', maxWidth: 480, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>You owe {displayName(creditor!)}</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: C.red }}>{fmt(pair.amount)}</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>across {relevantSplits.length} transaction{relevantSplits.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['upi', 'cash', 'manual'] as const).map((m) => (
            <button key={m} onClick={() => setMethod(m)} style={{ flex: 1, padding: '10px', borderRadius: 12, border: '1px solid ' + (method === m ? C.accent : C.border2), background: method === m ? C.accentBg : 'transparent', color: method === m ? C.accent : C.text2, fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
              {m === 'upi' ? '\u26A1 UPI' : m === 'cash' ? '💵 Cash' : '\u270F\uFE0F Manual'}
            </button>
          ))}
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ width: '100%', background: C.surface2, border: '1.5px solid transparent', borderRadius: 12, color: C.textW, fontFamily: 'inherit', fontSize: 14, padding: '12px 16px', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '13px', borderRadius: 99, border: '1px solid ' + C.border2, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={go} disabled={busy} style={{ flex: 2, padding: '13px', borderRadius: 99, border: 'none', background: busy ? C.surface2 : C.green, color: busy ? C.text3 : '#0a0a0a', fontSize: 14, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Recording\u2026' : 'Mark ' + fmt(pair.amount) + ' settled'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Phase 2: Group settings sheet ────────────────────────────────────────────
function GroupSettingsSheet({ groupId, userId, userRole, groupName, members, simplifyDebts, onClose, onSaved }: {
  groupId: string; userId: string; userRole: 'admin' | 'member'; groupName: string;
  members: Profile[]; simplifyDebts: boolean; onClose: () => void; onSaved: (simplify: boolean) => void;
}) {
  const [simplify, setSimplify]         = useState(simplifyDebts);
  const [saving, setSaving]             = useState(false);
  const [roleChanging, setRoleChanging] = useState<string | null>(null);
  const [removing, setRemoving]         = useState<string | null>(null);
  const isAdmin = userRole === 'admin';

  const save = async () => {
    setSaving(true);
    try {
      const res  = await fetch('/api/groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, userId, simplify_debts: simplify }),
      });
      if (!res.ok) { const d = await res.json(); addToast(d.error || 'Save failed', 'error'); return; }
      addToast('Group settings saved \u2713', 'success');
      onSaved(simplify);
      onClose();
    } catch { addToast('Could not save settings', 'error'); }
    finally { setSaving(false); }
  };


  const changeRole = async (targetId: string, newRole: 'admin' | 'member') => {
    setRoleChanging(targetId);
    try {
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      try { const { supabase } = await import('@/lib/supabaseClient'); const { data: { session } } = await supabase.auth.getSession(); if (session?.access_token) h['Authorization'] = 'Bearer ' + session.access_token; } catch {}
      const res = await fetch('/api/groups/' + groupId + '/members', { method: 'PATCH', headers: h, body: JSON.stringify({ callerId: userId, targetUserId: targetId, role: newRole }) });
      const d   = await res.json();
      if (!res.ok) { addToast(d.error, 'error'); return; }
      addToast(newRole === 'admin' ? 'Promoted to admin \u2713' : 'Set to member \u2713', 'success');
      onSaved(simplify);
    } catch { addToast('Could not update role', 'error'); } finally { setRoleChanging(null); }
  };

  const removeMember = async (targetId: string) => {
    const m = members.find((x) => x.id === targetId);
    if (!window.confirm('Remove ' + (m ? displayName(m) : 'this member') + ' from the group?')) return;
    setRemoving(targetId);
    try {
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      try { const { supabase } = await import('@/lib/supabaseClient'); const { data: { session } } = await supabase.auth.getSession(); if (session?.access_token) h['Authorization'] = 'Bearer ' + session.access_token; } catch {}
      const res = await fetch('/api/groups/' + groupId + '/members', { method: 'DELETE', headers: h, body: JSON.stringify({ callerId: userId, targetUserId: targetId }) });
      const d   = await res.json();
      if (!res.ok) { addToast(d.error, 'error'); return; }
      addToast('Member removed', 'success');
      onSaved(simplify);
    } catch { addToast('Could not remove member', 'error'); } finally { setRemoving(null); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '20px 24px 40px', maxWidth: 480, width: '100%', boxShadow: '0 -16px 60px rgba(0,0,0,0.6)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: C.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="settings" size={22} color={C.accent} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.textW }}>Group Settings</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{groupName}</div>
          </div>
        </div>

        {/* Debt simplification toggle */}
        <div style={{ background: C.surface2, borderRadius: 16, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer' }} onClick={() => setSimplify((v) => !v)}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textW, marginBottom: 4 }}>Debt Simplification</div>
              <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.6 }}>
                {simplify
                  ? 'ON \u2014 Minimises total payments using multilateral netting. Best for groups with complex overlapping debts.'
                  : 'OFF \u2014 Shows direct bilateral balances between each pair of people.'}
              </div>
              {simplify && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: C.accentBg, borderRadius: 10, fontSize: 11, color: C.accent, lineHeight: 1.6 }}>
                  Example: A owes B \u20b9200, B owes C \u20b9200 \u2192 simplified to A pays C \u20b9200 directly (B owes nothing).
                </div>
              )}
            </div>
            <div style={{ width: 48, height: 28, borderRadius: 99, background: simplify ? C.accent : C.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0, marginTop: 2 }}>
              <div style={{ position: 'absolute', top: 4, left: simplify ? 24 : 4, width: 20, height: 20, borderRadius: '50%', background: simplify ? '#0a0a0a' : C.text3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
        </div>

        {/* Members & role management — admin only */}
        {isAdmin && members.length > 0 && (
          <div style={{ background: C.surface2, borderRadius: 16, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Members</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {members.map((m) => {
                const isMe  = m.id === userId;
                const mRole = (m.role ?? 'member') as string;
                const busy  = roleChanging === m.id || removing === m.id;
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar profile={m} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.textW, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isMe ? 'You' : displayName(m)}
                        {mRole === 'admin' && <span style={{ fontSize: 9, fontWeight: 700, color: C.accent, background: C.accentBg, padding: '1px 6px', borderRadius: 99 }}>ADMIN</span>}
                        {m.is_ghost && <span style={{ fontSize: 9, color: C.text3, background: C.surface, padding: '1px 6px', borderRadius: 99 }}>Guest</span>}
                      </div>
                    </div>
                    {!isMe && (
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button
                          onClick={() => changeRole(m.id, mRole === 'admin' ? 'member' : 'admin')}
                          disabled={busy}
                          style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid ' + C.border2, background: 'transparent', color: mRole === 'admin' ? C.text3 : C.accent, fontSize: 11, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}
                        >
                          {busy && roleChanging === m.id ? '\u2026' : mRole === 'admin' ? 'Demote' : 'Make admin'}
                        </button>
                        <button
                          onClick={() => removeMember(m.id)}
                          disabled={busy}
                          style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid ' + C.red + '33', background: 'transparent', color: C.red, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Icon name="trash" size={12} color={C.red} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '13px', borderRadius: 99, border: '1px solid ' + C.border2, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex: 2, padding: '13px', borderRadius: 99, border: 'none', background: saving ? C.surface2 : C.accent, color: saving ? C.text3 : '#0a0a0a', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving\u2026' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Phase 3: Activity tab ─────────────────────────────────────────────────────
function ActivityTab({ groupId, userId, makeHeaders, fmt }: {
  groupId: string; userId: string; makeHeaders: () => HeadersInit; fmt: (n: number) => string;
}) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [hasMore, setHasMore]       = useState(false);
  const [page, setPage]             = useState(0);
  const PAGE_SIZE = 20;

  const loadActivities = useCallback(async (pageNum: number, append = false) => {
    setLoading(true);
    try {
      const res  = await fetch('/api/groups/' + groupId + '/activity?userId=' + userId + '&page=' + pageNum + '&limit=' + PAGE_SIZE, { headers: makeHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setActivities((prev) => append ? [...prev, ...(data.activities ?? [])] : (data.activities ?? []));
      setHasMore(data.has_more ?? false);
    } catch {} finally { setLoading(false); }
  }, [groupId, userId, makeHeaders]);

  useEffect(() => { loadActivities(0); }, [loadActivities]);

  const loadMore = () => { const next = page + 1; setPage(next); loadActivities(next, true); };

  const actionColor = (type: string) => {
    if (type === 'ADD_EXPENSE')    return C.accent;
    if (type === 'SETTLE_DEBT')    return C.green;
    if (type === 'DELETE_EXPENSE') return C.red;
    if (type === 'JOIN_GROUP')     return C.purple;
    return C.text3;
  };

  if (loading && activities.length === 0) return <SkeletonList count={4} />;

  if (activities.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 24px', background: C.surface, borderRadius: 20 }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.textW, marginBottom: 6 }}>No activity yet</div>
        <div style={{ fontSize: 13, color: C.text2 }}>Actions in this group will appear here.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ background: C.surface, borderRadius: 16, overflow: 'hidden', border: '1px solid ' + C.border }}>
        {activities.map((a, i) => {
          const isLast    = i === activities.length - 1;
          const iconName  = ACTION_ICON[a.action_type] ?? 'list';
          const color     = actionColor(a.action_type);
          const actorName = a.actor ? displayName(a.actor, 'Someone') : 'Someone';
          const isMe      = a.user_id === userId;
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px', borderBottom: isLast ? 'none' : '1px solid ' + C.border }}>
              {/* Icon */}
              <div style={{ width: 34, height: 34, borderRadius: 10, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <Icon name={iconName} size={16} color={color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.text1, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700, color: isMe ? C.accent : C.textW }}>{isMe ? 'You' : actorName}</span>
                  {' '}
                  <span style={{ color: C.text2 }}>{a.description.replace(actorName, '').replace(/^[ ,]+/, '')}</span>
                </div>
                <div style={{ fontSize: 11, color: C.text3, marginTop: 3 }}>{relTime(a.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button onClick={loadMore} disabled={loading} style={{ marginTop: 10, width: '100%', padding: '12px', borderRadius: 12, border: '1px solid ' + C.border2, background: 'transparent', color: C.text2, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Loading\u2026' : 'Load more'}
        </button>
      )}
    </div>
  );
}

// ── Flag for Review Sheet ────────────────────────────────────────────────────
function FlagSheet({ tx, groupId, userId, ghostToken, onClose, onFlagged }: {
  tx:          Transaction;
  groupId:     string;
  userId:      string;
  ghostToken?: string;
  onClose:     () => void;
  onFlagged:   () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const QUICK_REASONS = [
    'Amount looks wrong',
    'Wrong people included',
    'Already paid separately',
    'Duplicate entry',
    'Category is incorrect',
  ];

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ghostToken) { h['x-ghost-token'] = ghostToken; }
      else { try { const { supabase } = await import('@/lib/supabaseClient'); const { data: { session } } = await supabase.auth.getSession(); if (session?.access_token) h['Authorization'] = 'Bearer ' + session.access_token; } catch {} }
      const res  = await fetch('/api/groups/' + groupId + '/transactions/' + tx.id + '/flag', {
        method: 'POST', headers: h, body: JSON.stringify({ userId, reason: reason.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not flag'); return; }
      onFlagged();
    } catch { setError('Something went wrong'); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '20px 24px 40px', maxWidth: 520, width: '100%', boxShadow: '0 -16px 60px rgba(0,0,0,0.6)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: C.amber + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="alert" size={22} color={C.amber} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.textW }}>Flag for review</div>
            <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>"{tx.description}" &middot; ₹{Math.round(tx.total_amount).toLocaleString('en-IN')}</div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, marginBottom: 16 }}>
          The expense creator and group admins will see this flag in the Activity tab. They can edit or resolve it.
        </div>

        {/* Quick reason chips */}
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>Reason (optional)</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {QUICK_REASONS.map((r) => (
            <button key={r} onClick={() => setReason(reason === r ? '' : r)}
              style={{ padding: '6px 12px', borderRadius: 99, border: '1px solid ' + (reason === r ? C.amber : C.border2), background: reason === r ? C.amber + '18' : 'transparent', color: reason === r ? C.amber : C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {r}
            </button>
          ))}
        </div>

        {/* Custom reason */}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Or describe the issue..."
          rows={2}
          style={{ width: '100%', background: C.surface2, border: '1.5px solid transparent', borderRadius: 12, color: C.textW, fontFamily: 'inherit', fontSize: 14, padding: '11px 14px', outline: 'none', boxSizing: 'border-box', resize: 'none', marginBottom: 16 }}
        />

        {error && <div style={{ padding: '10px 14px', borderRadius: 12, background: C.red + '15', border: '1px solid ' + C.red + '44', color: C.red, fontSize: 13, marginBottom: 14 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '13px', borderRadius: 99, border: '1px solid ' + C.border2, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{ flex: 2, padding: '13px', borderRadius: 99, border: 'none', background: saving ? C.surface2 : C.amber, color: saving ? C.text3 : '#0a0a0a', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Flagging\u2026' : 'Flag this expense'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Expense Sheet ───────────────────────────────────────────────────────
// Creator-only. Lets you fix description, amount, category, paidBy.
// Split amounts are recalculated (equal only for simplicity on edit;
// custom/itemized users should delete and re-add for complex changes).
function EditExpenseSheet({ tx, groupId, members, userId, ghostToken, fmt, onClose, onSaved }: {
  tx:          Transaction;
  groupId:     string;
  members:     Profile[];
  userId:      string;
  ghostToken?: string;
  fmt:         (n: number) => string;
  onClose:     () => void;
  onSaved:     () => void;
}) {
  const [description, setDescription] = useState(tx.description);
  const [amount, setAmount]           = useState(String(tx.total_amount));
  const [category, setCategory]       = useState(tx.category);
  const [paidBy, setPaidBy]           = useState(tx.paid_by);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const CATEGORIES = ['Dining Out', 'Groceries', 'Travel', 'Entertainment', 'Alcohol', 'Hosting Day', 'Transport', 'Utilities', 'Miscellaneous'];
  const CAT_E: Record<string, string> = { 'Dining Out': '🍽\uFE0F', Groceries: '🛒', Travel: '\u2708\uFE0F', Entertainment: '🎬', Alcohol: '🍻', 'Hosting Day': '🏠', Transport: '🚗', Utilities: '\u26A1', Miscellaneous: '📦' };

  const inp: React.CSSProperties = { width: '100%', background: C.surface2, border: '1.5px solid transparent', borderRadius: 12, color: C.textW, fontFamily: 'inherit', fontSize: 14, padding: '11px 14px', outline: 'none', boxSizing: 'border-box' };

  const save = async () => {
    const total = parseFloat(amount);
    if (!description.trim() || !total || total <= 0) { setError('Please fill in description and amount.'); return; }
    setSaving(true); setError(null);
    try {
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ghostToken) { h['x-ghost-token'] = ghostToken; }
      else { try { const { supabase } = await import('@/lib/supabaseClient'); const { data: { session } } = await supabase.auth.getSession(); if (session?.access_token) h['Authorization'] = 'Bearer ' + session.access_token; } catch {} }

      const res  = await fetch('/api/groups/' + groupId + '/transactions/' + tx.id, {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ description: description.trim(), totalAmount: total, category, paidBy, userId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Save failed'); return; }
      onSaved();
    } catch { setError('Something went wrong. Try again.'); } finally { setSaving(false); }
  };

  const amountChanged = parseFloat(amount) !== tx.total_amount;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '20px 24px 40px', maxWidth: 520, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 -16px 60px rgba(0,0,0,0.6)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />

        <div style={{ fontSize: 18, fontWeight: 800, color: C.textW, marginBottom: 4 }}>Edit expense</div>
        <div style={{ fontSize: 12, color: C.text3, marginBottom: 20 }}>Changes apply to all splits. Only the description, amount, category and payer can be edited.</div>

        {/* Amount */}
        <div style={{ background: C.surface2, borderRadius: 16, padding: '16px', textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>Amount</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: C.text3 }}>\u20B9</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal"
              style={{ background: 'transparent', border: 'none', outline: 'none', color: C.textW, fontFamily: 'inherit', fontSize: 42, fontWeight: 900, textAlign: 'center', width: 200 }} />
          </div>
          {amountChanged && (
            <div style={{ fontSize: 11, color: C.amber, marginTop: 6 }}>
              \u26A0\uFE0F Splits will be recalculated equally between the original participants
            </div>
          )}
        </div>

        {/* Description */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>Description</div>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this for?" style={inp} />
        </div>

        {/* Category */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>Category</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATEGORIES.map((cat) => (
              <button key={cat} onClick={() => setCategory(cat)} style={{ padding: '6px 12px', borderRadius: 99, border: '1px solid ' + (category === cat ? C.accent : C.border2), background: category === cat ? C.accentBg : 'transparent', color: category === cat ? C.accent : C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                {CAT_E[cat] ?? '📦'} {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Paid by */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>Paid by</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {members.map((m) => (
              <div key={m.id} onClick={() => setPaidBy(m.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', opacity: paidBy === m.id ? 1 : 0.4, transition: 'opacity 0.15s' }}>
                <Avatar profile={m} size={44} highlight={paidBy === m.id ? C.accent : undefined} />
                <span style={{ fontSize: 9, fontWeight: 600, color: paidBy === m.id ? C.accent : C.text3 }}>{displayName(m).split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={{ padding: '10px 14px', borderRadius: 12, background: C.red + '15', border: '1px solid ' + C.red + '44', color: C.red, fontSize: 13, marginBottom: 14 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '13px', borderRadius: 99, border: '1px solid ' + C.border2, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex: 2, padding: '13px', borderRadius: 99, border: 'none', background: saving ? C.surface2 : C.accent, color: saving ? C.text3 : '#0a0a0a', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving\u2026' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Splitwise-style per-person balance row ───────────────────────────────────
function PersonBalanceRow({ member, pos, members, userId, fmt, onSettle }: {
  member:   Profile;
  pos:      { totalOwed: number; totalOwes: number; pairs: NetPair[] };
  members:  Profile[];
  userId:   string;
  fmt:      (n: number) => string;
  onSettle: (pair: NetPair) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isMe    = member.id === userId;
  const net     = pos.totalOwed - pos.totalOwes;
  const settled = Math.abs(net) < 0.005 && pos.pairs.length === 0;
  const getsBack = net > 0.005;
  const owes     = net < -0.005;

  // Label for the header row
  const headerLabel = () => {
    if (settled)   return { text: (isMe ? 'You are' : displayName(member) + ' is') + ' settled up', color: C.text2 };
    if (getsBack)  return { text: (isMe ? 'You get back ' : displayName(member) + ' gets back ') + fmt(Math.abs(net)) + ' in total', color: C.green };
    return         { text: (isMe ? 'You owe ' : displayName(member) + ' owes ') + fmt(Math.abs(net)) + ' in total', color: C.red };
  };
  const label = headerLabel();

  // Relevant pairs for this person's expanded view
  const creditorPairs = pos.pairs.filter((p) => p.creditor === member.id);  // others owe them
  const debtorPairs   = pos.pairs.filter((p) => p.debtor   === member.id);  // they owe others

  return (
    <div style={{ background: C.surface, borderRadius: 16, overflow: 'hidden', border: '1px solid ' + (settled ? C.border : getsBack ? C.green + '33' : C.red + '33'), boxShadow: C.shadowSm }}>

      {/* Header row — always visible */}
      <div
        onClick={() => !settled && setExpanded((e) => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: settled ? 'default' : 'pointer' }}
      >
        {/* Pie-chart style avatar — shows proportion of owed vs owes */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar profile={member} size={44} />
          {!settled && (
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 16, height: 16, borderRadius: '50%',
              background: getsBack ? C.green : C.red,
              border: '2px solid ' + C.surface,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 900, color: '#fff',
            }}>
              {getsBack ? '+' : '-'}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: label.color, lineHeight: 1.4 }}>
            {label.text}
          </div>
        </div>

        {/* Chevron — only if expandable */}
        {!settled && (
          <div style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: C.text3, flexShrink: 0 }}>
            <Icon name="chevronDown" size={16} color={C.text3} />
          </div>
        )}
      </div>

      {/* Expanded: debt breakdown */}
      {expanded && (
        <div style={{ borderTop: '1px solid ' + C.border }}>

          {/* Pairs where this person is owed */}
          {creditorPairs.map((pair) => {
            const debtor    = members.find((m) => m.id === pair.debtor);
            const debtorIsMe = pair.debtor === userId;
            return (
              <div key={pair.debtor} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 12px 20px', borderBottom: '1px solid ' + C.border + '66' }}>
                <Avatar profile={debtor ?? null} size={28} />
                <div style={{ flex: 1, fontSize: 13, color: C.text2 }}>
                  <span style={{ fontWeight: 600, color: debtorIsMe ? C.accent : C.textW }}>{debtorIsMe ? 'You' : displayName(debtor)}</span>
                  {' owes '}
                  <span style={{ color: C.green, fontWeight: 600 }}>{fmt(pair.amount)}</span>
                  {' to '}
                  <span style={{ fontWeight: 600, color: isMe ? C.accent : C.textW }}>{isMe ? 'you' : displayName(member)}</span>
                </div>
                {debtorIsMe && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSettle(pair); }}
                    style={{ padding: '6px 14px', borderRadius: 99, border: 'none', background: C.accent, color: '#0a0a0a', fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                  >
                    Settle up
                  </button>
                )}
              </div>
            );
          })}

          {/* Pairs where this person owes */}
          {debtorPairs.map((pair) => {
            const creditor    = members.find((m) => m.id === pair.creditor);
            const creditorIsMe = pair.creditor === userId;
            return (
              <div key={pair.creditor} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 12px 20px', borderBottom: '1px solid ' + C.border + '66' }}>
                <Avatar profile={creditor ?? null} size={28} />
                <div style={{ flex: 1, fontSize: 13, color: C.text2 }}>
                  <span style={{ fontWeight: 600, color: isMe ? C.accent : C.textW }}>{isMe ? 'You' : displayName(member)}</span>
                  {' owes '}
                  <span style={{ color: C.red, fontWeight: 600 }}>{fmt(pair.amount)}</span>
                  {' to '}
                  <span style={{ fontWeight: 600, color: creditorIsMe ? C.accent : C.textW }}>{creditorIsMe ? 'you' : displayName(creditor)}</span>
                </div>
                {isMe && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSettle(pair); }}
                    style={{ padding: '6px 14px', borderRadius: 99, border: 'none', background: C.accent, color: '#0a0a0a', fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                  >
                    Settle up
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function GroupDetail({ groupId, groupName, currency, userId, ghostToken, onBack, fmt }: GroupDetailProps) {
  const [members, setMembers]           = useState<Profile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balanceData, setBalanceData]   = useState<BalanceData | null>(null);
  const [simplifyDebts, setSimplifyDebts] = useState(false);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState<TabId>('expenses');
  const [showAddExpense, setShowAddExpense]   = useState(false);
  const [showSettings, setShowSettings]      = useState(false);
  const [settlingPair, setSettlingPair]       = useState<NetPair | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingTx, setEditingTx]             = useState<Transaction | null>(null);
  const [userRole, setUserRole]               = useState<'admin' | 'member'>('member');
  const [flaggingTx, setFlaggingTx]           = useState<Transaction | null>(null);

  const makeHeaders = useCallback((): HeadersInit => {
    const h: Record<string, string> = {};
    if (ghostToken) h['x-ghost-token'] = ghostToken;
    return h;
  }, [ghostToken]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, balRes] = await Promise.all([
        fetch('/api/groups/' + groupId + '/transactions?userId=' + userId, { headers: makeHeaders() }),
        fetch('/api/groups/' + groupId + '/settle?userId=' + userId,       { headers: makeHeaders() }),
      ]);
      const [txData, balData] = await Promise.all([txRes.json(), balRes.json()]);
      setTransactions(txData.transactions ?? []);
      setBalanceData(balData);
      if (balData.simplify_debts !== undefined) setSimplifyDebts(balData.simplify_debts);
      if (Array.isArray(balData.members) && balData.members.length > 0) {
        setMembers(balData.members);
        // Extract current user's role from the member list
        const me = balData.members.find((m: Profile) => m.id === userId);
        if (me?.role) setUserRole(me.role as 'admin' | 'member');
      }
    } catch { addToast('Could not load group data', 'error'); }
    finally { setLoading(false); }
  }, [groupId, userId, makeHeaders]);

  useEffect(() => { loadData(); }, [loadData]);

  // Memoized balance calculations
  const { myNetBalance, totalOwedToMe, totalIOwe, memberNetMap } = useMemo(() => {
    const pairs = balanceData?.net_pairs ?? [];
    const myNetBalance  = pairs.reduce((n, p) => p.creditor === userId ? n + p.amount : p.debtor === userId ? n - p.amount : n, 0);
    const totalOwedToMe = pairs.filter((p) => p.creditor === userId).reduce((s, p) => s + p.amount, 0);
    const totalIOwe     = pairs.filter((p) => p.debtor   === userId).reduce((s, p) => s + p.amount, 0);
    const memberNetMap: Record<string, number> = {};
    for (const p of pairs) {
      if (p.creditor === userId) memberNetMap[p.debtor]   = (memberNetMap[p.debtor]   ?? 0) + p.amount;
      if (p.debtor   === userId) memberNetMap[p.creditor] = (memberNetMap[p.creditor] ?? 0) - p.amount;
    }
    return { myNetBalance, totalOwedToMe, totalIOwe, memberNetMap };
  }, [balanceData?.net_pairs, userId]);

  const handleExpenseAdded = () => { setShowAddExpense(false); loadData(); addToast('Expense added \u2713', 'success'); };
  const handleDeleteTx     = (txId: string) => setDeleteConfirmId(txId);
  const handleEditTx       = (tx: Transaction)   => setEditingTx(tx);
  const handleFlagTx       = (tx: Transaction)   => setFlaggingTx(tx);

  const handleUnflagTx = async (txId: string) => {
    try {
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ghostToken) { h['x-ghost-token'] = ghostToken; }
      else { try { const { supabase } = await import('@/lib/supabaseClient'); const { data: { session } } = await supabase.auth.getSession(); if (session?.access_token) h['Authorization'] = 'Bearer ' + session.access_token; } catch {} }
      const res = await fetch('/api/groups/' + groupId + '/transactions/' + txId + '/flag', {
        method: 'DELETE', headers: h, body: JSON.stringify({ userId }),
      });
      if (res.ok) { loadData(); addToast('Flag resolved ✓', 'success'); }
      else { const d = await res.json(); addToast(d.error, 'error'); }
    } catch { addToast('Could not resolve flag', 'error'); }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    const txId = deleteConfirmId;
    setDeleteConfirmId(null);
    await fetch('/api/groups/' + groupId + '/transactions', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', ...makeHeaders() },
      body: JSON.stringify({ transactionId: txId, userId }),
    });
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
    loadData();
    addToast('Transaction deleted', 'success');
  };

  const headerSub = (() => {
    if (loading)            return { text: 'Loading\u2026', color: C.text3 };
    if (myNetBalance === 0) return { text: 'All settled up \u2713', color: C.text3 };
    if (myNetBalance > 0)   return { text: 'You are owed ' + fmt(myNetBalance), color: C.green };
    return { text: 'You owe ' + fmt(Math.abs(myNetBalance)), color: C.red };
  })();

  const tabs: { id: TabId; label: string; badge?: string }[] = [
    { id: 'expenses', label: 'Expenses', badge: transactions.length ? String(transactions.length) : undefined },
    { id: 'balances', label: 'Balances', badge: Math.abs(myNetBalance) > 0.005 ? fmt(Math.abs(myNetBalance)) : undefined },
    { id: 'members',  label: 'Members',  badge: members.length ? String(members.length) : undefined },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: C.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="arrowLeft" size={16} color={C.text2} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.textW, letterSpacing: '-0.02em' }}>{groupName}</div>
          <div style={{ fontSize: 12, marginTop: 2, fontWeight: 600, color: headerSub.color }}>{headerSub.text}</div>
        </div>
        {/* Settings gear */}
        <button onClick={() => setShowSettings(true)} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: C.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="settings" size={16} color={C.text2} />
        </button>
        <button onClick={() => setShowAddExpense(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 99, border: 'none', background: C.accent, color: '#0a0a0a', fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>
          <Icon name="plus" size={15} color="#0a0a0a" />
          Add
        </button>
      </div>

      {/* Debt simplification banner when active */}
      {simplifyDebts && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: C.accentBg, borderRadius: 12, marginBottom: 12, border: '1px solid ' + C.accent + '33' }}>
          <Icon name="sparkles" size={14} color={C.accent} />
          <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>Debt simplification is ON \u2014 balances show minimum payments needed</span>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, background: C.surface2, borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '9px 4px', borderRadius: 10, border: 'none', background: activeTab === tab.id ? C.surface : 'transparent', color: activeTab === tab.id ? C.textW : C.text3, fontSize: 11, fontWeight: activeTab === tab.id ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {tab.label}
            {tab.badge && (
              <span style={{ fontSize: 10, fontWeight: 700, background: activeTab === tab.id ? C.accentBg : C.surface, color: activeTab === tab.id ? C.accent : C.text3, padding: '1px 5px', borderRadius: 99 }}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <SkeletonList />}

      {/* Expenses */}
      {!loading && activeTab === 'expenses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', background: C.surface, borderRadius: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.textW, marginBottom: 8 }}>No expenses yet</div>
              <div style={{ fontSize: 13, color: C.text2, marginBottom: 20, lineHeight: 1.6 }}>Add the first expense and split it with the group.</div>
              <button onClick={() => setShowAddExpense(true)} style={{ padding: '12px 24px', borderRadius: 99, border: 'none', background: C.accent, color: '#0a0a0a', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>Add first expense</button>
            </div>
          ) : (
            transactions.map((tx) => (
              <TransactionCard key={tx.id} tx={tx} userId={userId} userRole={userRole} members={members} fmt={fmt} onDelete={handleDeleteTx} onEdit={handleEditTx} onFlag={handleFlagTx} onUnflag={handleUnflagTx} />
            ))
          )}
        </div>
      )}

      {/* Balances — Splitwise-style per-person collapsible rows */}
      {!loading && activeTab === 'balances' && (() => {
        // Build per-person position map from net_pairs
        type PersonPos = { totalOwed: number; totalOwes: number; pairs: NetPair[] };
        const posMap: Record<string, PersonPos> = {};
        const initPos = (id: string) => {
          if (!posMap[id]) posMap[id] = { totalOwed: 0, totalOwes: 0, pairs: [] };
        };
        // Seed every member so settled-up people appear too
        members.forEach((m) => initPos(m.id));
        (balanceData?.net_pairs ?? []).forEach((p) => {
          initPos(p.creditor); initPos(p.debtor);
          posMap[p.creditor].totalOwed += p.amount;
          posMap[p.debtor].totalOwes   += p.amount;
          posMap[p.creditor].pairs.push(p);
          posMap[p.debtor].pairs.push(p);
        });

        // Sort: people who get money back first, then settled, then people who owe
        const sorted = [...members].sort((a, b) => {
          const netA = (posMap[a.id]?.totalOwed ?? 0) - (posMap[a.id]?.totalOwes ?? 0);
          const netB = (posMap[b.id]?.totalOwed ?? 0) - (posMap[b.id]?.totalOwes ?? 0);
          return netB - netA;
        });

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map((member) => (
              <PersonBalanceRow
                key={member.id}
                member={member}
                pos={posMap[member.id] ?? { totalOwed: 0, totalOwes: 0, pairs: [] }}
                members={members}
                userId={userId}
                fmt={fmt}
                onSettle={setSettlingPair}
              />
            ))}

            {/* Debt simplification banner */}
            {simplifyDebts && (
              <div style={{ marginTop: 4, padding: '12px 16px', background: C.accentBg, borderRadius: 14, border: '1px solid ' + C.accent + '33', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="sparkles" size={16} color={C.accent} />
                <span style={{ fontSize: 12, color: C.accent, fontWeight: 600, lineHeight: 1.5 }}>
                  Debt simplification is ON &mdash; minimising total payments across the group
                </span>
              </div>
            )}
          </div>
        );
      })()}
      {/* Members */}
      {!loading && activeTab === 'members' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {members.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 24px', background: C.surface, borderRadius: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>👥</div>
              <div style={{ fontSize: 15, color: C.text2 }}>No members found</div>
            </div>
          ) : (
            <>
              {members.map((member, i) => {
                const isMe = member.id === userId;
                const net  = memberNetMap[member.id] ?? 0;
                return (
                  <div key={member.id} style={{ background: C.surface, borderRadius: 14, padding: '14px 16px', border: '1px solid ' + (isMe ? C.accent + '44' : C.border), display: 'flex', alignItems: 'center', gap: 14, boxShadow: C.shadowSm }}>
                    <MemberAvatar profile={member} size={44} colorIndex={i} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: C.textW }}>{isMe ? 'You' : displayName(member)}</span>
                        {isMe && <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, background: C.accentBg, padding: '2px 8px', borderRadius: 99 }}>YOU</span>}
                        {member.is_ghost && <span style={{ fontSize: 10, fontWeight: 600, color: C.text3, background: C.surface2, padding: '2px 8px', borderRadius: 99 }}>Guest</span>}
                      </div>
                      {!isMe && (
                        <div style={{ fontSize: 12, marginTop: 3, color: net > 0 ? C.green : net < 0 ? C.red : C.text3, fontWeight: 600 }}>
                          {net > 0 ? 'Owes you ' + fmt(net) : net < 0 ? 'You owe ' + fmt(Math.abs(net)) : 'All settled'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div style={{ background: C.surface2, borderRadius: 14, padding: '14px 16px', border: '1px dashed ' + C.border2, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.surface, border: '1.5px dashed ' + C.border2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="plus" size={18} color={C.text3} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text2 }}>Invite someone</div>
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>Go back and tap the share icon on the group card</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Activity — lazy loaded only when tab is active */}
      {!loading && activeTab === 'activity' && (
        <ActivityTab groupId={groupId} userId={userId} makeHeaders={makeHeaders} fmt={fmt} />
      )}

      {/* Add expense sheet */}
      {showAddExpense && (
        members.length > 0 ? (
          <AddGroupExpense groupId={groupId} groupName={groupName} currency={currency} members={members} userId={userId} ghostToken={ghostToken} fmt={fmt} onClose={() => setShowAddExpense(false)} onAdded={handleExpenseAdded} />
        ) : (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowAddExpense(false)}>
            <div style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '32px 24px 48px', maxWidth: 480, width: '100%', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 14, color: C.text2, marginBottom: 8 }}>Loading group members\u2026</div>
              <button onClick={() => setShowAddExpense(false)} style={{ marginTop: 20, padding: '12px 28px', borderRadius: 99, border: '1px solid ' + C.border2, background: 'transparent', color: C.text2, fontSize: 14, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        )
      )}

      {/* Settings sheet (Phase 2) */}
      {showSettings && (
        <GroupSettingsSheet groupId={groupId} userId={userId} userRole={userRole} groupName={groupName} members={members} simplifyDebts={simplifyDebts}
          onClose={() => setShowSettings(false)}
          onSaved={(v) => { setSimplifyDebts(v); loadData(); }}
        />
      )}

      {/* Settle modal */}
      {settlingPair && balanceData && (
        <SettleModal pair={settlingPair} members={members} mySplits={balanceData.my_splits} userId={userId} groupId={groupId} ghostToken={ghostToken} fmt={fmt} onClose={() => setSettlingPair(null)} onSettled={() => { setSettlingPair(null); loadData(); }} />
      )}

      {/* Flag for review sheet */}
      {flaggingTx && (
        <FlagSheet
          tx={flaggingTx}
          groupId={groupId}
          userId={userId}
          ghostToken={ghostToken}
          onClose={() => setFlaggingTx(null)}
          onFlagged={() => { setFlaggingTx(null); loadData(); addToast('Transaction flagged – creator will be notified', 'info'); }}
        />
      )}

      {/* Edit expense sheet */}
      {editingTx && (
        <EditExpenseSheet
          tx={editingTx}
          groupId={groupId}
          members={members}
          userId={userId}
          ghostToken={ghostToken}
          fmt={fmt}
          onClose={() => setEditingTx(null)}
          onSaved={() => { setEditingTx(null); loadData(); addToast('Expense updated ✓', 'success'); }}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirmId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setDeleteConfirmId(null)}>
          <div style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '20px 24px 40px', maxWidth: 480, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.red + '20', border: '2px solid ' + C.red + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Icon name="trash" size={24} color={C.red} />
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.textW, marginBottom: 6 }}>Delete transaction?</div>
              <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>This will remove the expense and all its splits. This cannot be undone.</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirmId(null)} style={{ flex: 1, padding: '13px', borderRadius: 99, border: '1px solid ' + C.border2, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmDelete} style={{ flex: 2, padding: '13px', borderRadius: 99, border: 'none', background: C.red, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
