// components/dashboard/Groups.tsx
// The main groups view — lists all groups, shows net balances,
// and lets users create new groups or copy invite links.
// Plugs into the existing app shell as a new ViewId.

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { C } from '@/constants';
import { Icon } from '@/components/ui/Icon';
import { addToast } from '@/components/ui/ui';
import type { AppData } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────
interface GroupMember {
  id:           string;
  display_name: string | null;
  ghost_name:   string | null;
  is_ghost:     boolean;
}

interface Group {
  id:            string;
  name:          string;
  description:   string | null;
  currency:      string;
  created_by:    string;
  created_at:    string;
  last_activity: string;
  member_count:  number;
  members:       GroupMember[];
  net_balance:   number;
  is_archived:   boolean;
}

interface Props {
  data:    AppData;
  session: any;
  fmt:     (n: number) => string;
}

// ─── Helper: member display name ─────────────────────────────────────────────
function memberName(m: GroupMember): string {
  return m.display_name || m.ghost_name || 'Unknown';
}

// ─── Helper: relative time ────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const mins  = Math.floor(diff / 60000);
  if (days > 30)  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (days > 0)   return `${days}d ago`;
  if (hours > 0)  return `${hours}h ago`;
  if (mins > 0)   return `${mins}m ago`;
  return 'just now';
}

// ─── Member avatar cluster ────────────────────────────────────────────────────
const AVATAR_COLORS = [C.accent, C.green, C.purple, C.blue, C.teal, C.orange];

function MemberCluster({ members, total }: { members: GroupMember[]; total: number }) {
  const shown = members.slice(0, 4);
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <div
          key={m.id}
          title={memberName(m)}
          style={{
            width: 26, height: 26,
            borderRadius: '50%',
            background: AVATAR_COLORS[i % AVATAR_COLORS.length],
            border: `2px solid ${C.surface}`,
            marginLeft: i > 0 ? -8 : 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: '#0a0a0a',
            zIndex: shown.length - i, position: 'relative',
            flexShrink: 0,
          }}
        >
          {memberName(m).charAt(0).toUpperCase()}
        </div>
      ))}
      {total > 4 && (
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: C.surface2,
          border: `2px solid ${C.surface}`,
          marginLeft: -8, zIndex: 0, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700, color: C.text3,
        }}>
          +{total - 4}
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyGroups({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div style={{
      textAlign: 'center', padding: '56px 24px',
      background: C.surface, borderRadius: 20,
      boxShadow: C.shadowSm,
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.textW, marginBottom: 8 }}>
        No groups yet
      </div>
      <div style={{
        fontSize: 14, color: C.text2, lineHeight: 1.6,
        maxWidth: 280, margin: '0 auto 24px',
      }}>
        Create a group for a trip, flatmates, or any shared expense — then invite friends via a link.
      </div>
      <button
        onClick={onCreateClick}
        style={{
          padding: '12px 28px', borderRadius: 99, border: 'none',
          background: C.accent, color: '#0a0a0a',
          fontSize: 14, fontWeight: 800, cursor: 'pointer',
        }}
      >
        Create your first group
      </button>
    </div>
  );
}

// ─── Create group modal ───────────────────────────────────────────────────────
function CreateGroupModal({
  onClose,
  onCreated,
  userId,
}: {
  onClose:   () => void;
  onCreated: (group: Group, inviteUrl: string) => void;
  userId:    string;
}) {
  const [name, setName]         = useState('');
  const [desc, setDesc]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const SUGGESTIONS = ['Goa Trip 🏖️', 'Flat 4B 🏠', 'Office Lunch 🍱', 'Weekend Trek 🏕️', 'Book Club 📚'];

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/groups', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), description: desc.trim() || undefined, createdBy: userId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onCreated(data.group, data.invite_url);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.surface2,
    border: '1.5px solid transparent', borderRadius: 12,
    color: C.textW, fontFamily: 'inherit', fontSize: 15, fontWeight: 500,
    padding: '12px 16px', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.80)',
        zIndex: 9999,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface, borderRadius: '24px 24px 0 0',
          padding: '20px 24px 40px',
          maxWidth: 480, width: '100%',
          boxShadow: '0 -16px 60px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />

        <div style={{ fontSize: 18, fontWeight: 800, color: C.textW, marginBottom: 20, letterSpacing: '-0.02em' }}>
          New group
        </div>

        {/* Name suggestions */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setName(s)}
              style={{
                padding: '6px 14px', borderRadius: 99, border: `1px solid ${C.border2}`,
                background: name === s ? C.accentBg : C.surface2,
                color: name === s ? C.accent : C.text2,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Group name (e.g. Goa Trip)"
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = 'transparent'; }}
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = 'transparent'; }}
          />
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 12, fontSize: 13,
            background: `${C.red}15`, border: `1px solid ${C.red}44`, color: C.red,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '13px', borderRadius: 99,
              border: `1px solid ${C.border2}`, background: 'transparent',
              color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            style={{
              flex: 2, padding: '13px', borderRadius: 99, border: 'none',
              background: name.trim() && !loading ? C.accent : C.surface2,
              color: name.trim() && !loading ? '#0a0a0a' : C.text3,
              fontSize: 14, fontWeight: 800,
              cursor: name.trim() && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invite share modal (shown after group creation) ─────────────────────────
function InviteShareModal({
  inviteUrl,
  groupName,
  onClose,
}: {
  inviteUrl: string;
  groupName: string;
  onClose:   () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const share = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: `Join ${groupName} on ChillarFlow`, url: inviteUrl });
    } else {
      copy();
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '20px 24px 40px', maxWidth: 480, width: '100%', boxShadow: '0 -16px 60px rgba(0,0,0,0.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: C.accentBg, border: `2px solid ${C.accent}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, margin: '0 auto 12px',
          }}>🎉</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.textW, letterSpacing: '-0.02em' }}>
            {groupName} is ready!
          </div>
          <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>
            Share the link to invite friends
          </div>
        </div>

        {/* Link preview */}
        <div style={{
          background: C.surface2, borderRadius: 12, padding: '12px 16px',
          fontSize: 13, color: C.teal, wordBreak: 'break-all',
          lineHeight: 1.5, marginBottom: 16,
          border: `1px solid ${C.teal}22`,
        }}>
          {inviteUrl}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={copy}
            style={{
              flex: 1, padding: '13px', borderRadius: 99,
              border: `1px solid ${C.border2}`,
              background: copied ? C.greenBg : 'transparent',
              color: copied ? C.green : C.text1,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name={copied ? 'check' : 'briefcase'} size={15} color={copied ? C.green : C.text1} />
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={share}
            style={{
              flex: 1, padding: '13px', borderRadius: 99, border: 'none',
              background: C.accent, color: '#0a0a0a',
              fontSize: 14, fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Icon name="send" size={15} color="#0a0a0a" />
            Share
          </button>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 12, padding: '11px', borderRadius: 99,
            border: 'none', background: 'transparent',
            color: C.text3, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Done — I'll share later
        </button>
      </div>
    </div>
  );
}

// ─── Main Groups component ────────────────────────────────────────────────────
export function Groups({ data, session, fmt }: Props) {
  const [groups, setGroups]           = useState<Group[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);
  const [inviteData, setInviteData]   = useState<{ url: string; groupName: string } | null>(null);
  const [copiedId, setCopiedId]       = useState<string | null>(null);

  const userId = session?.user?.id;

  const loadGroups = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/groups?userId=${userId}`);
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch {
      addToast('Could not load groups', 'error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const handleGroupCreated = (group: Group, inviteUrl: string) => {
    setShowCreate(false);
    setGroups((prev) => [group, ...prev]);
    setInviteData({ url: inviteUrl, groupName: group.name });
  };

  const copyGroupInvite = async (groupId: string) => {
    try {
      const res  = await fetch('/api/groups/invite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ groupId, userId }),
      });
      const data = await res.json();
      if (!res.ok) { addToast(data.error, 'error'); return; }
      await navigator.clipboard.writeText(data.invite_url);
      setCopiedId(groupId);
      setTimeout(() => setCopiedId(null), 2500);
      addToast('Invite link copied!', 'success');
    } catch {
      addToast('Could not generate invite link', 'error');
    }
  };

  const fieldLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: C.text3, marginBottom: 10,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header row ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>
            {groups.length} group{groups.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 18px', borderRadius: 99, border: 'none',
            background: C.accent, color: '#0a0a0a',
            fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}
        >
          <Icon name="plus" size={15} color="#0a0a0a" />
          New group
        </button>
      </div>

      {/* ── Loading state ─────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 100, borderRadius: 16,
                background: C.surface,
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!loading && groups.length === 0 && (
        <EmptyGroups onCreateClick={() => setShowCreate(true)} />
      )}

      {/* ── Group cards ────────────────────────────────────────────────── */}
      {!loading && groups.map((g) => {
        const isPositive = g.net_balance > 0;
        const isNegative = g.net_balance < 0;
        const isSettled  = g.net_balance === 0;

        return (
          <div
            key={g.id}
            style={{
              background: C.surface,
              borderRadius: 18,
              padding: '16px 18px',
              boxShadow: C.shadowSm,
              border: `1px solid ${C.border}`,
              transition: 'transform 0.15s',
            }}
          >
            {/* Top row: name + balance */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 16, fontWeight: 800, color: C.textW,
                  letterSpacing: '-0.01em', marginBottom: 3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {g.name}
                </div>
                {g.description && (
                  <div style={{
                    fontSize: 12, color: C.text3, lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {g.description}
                  </div>
                )}
              </div>

              {/* Balance badge */}
              <div style={{
                flexShrink: 0, marginLeft: 12,
                padding: '5px 12px', borderRadius: 99,
                background: isSettled ? C.surface2 : isPositive ? C.greenBg : `${C.red}15`,
                border: `1px solid ${isSettled ? C.border : isPositive ? C.green : C.red}44`,
                fontSize: 13, fontWeight: 800,
                color: isSettled ? C.text3 : isPositive ? C.green : C.red,
              }}>
                {isSettled ? 'Settled' : isPositive ? `+${fmt(g.net_balance)}` : fmt(g.net_balance)}
              </div>
            </div>

            {/* Bottom row: members + activity + actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MemberCluster members={g.members} total={g.member_count} />
                <span style={{ fontSize: 11, color: C.text3 }}>
                  {relativeTime(g.last_activity)}
                </span>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6 }}>
                {/* Copy invite link */}
                <button
                  onClick={() => copyGroupInvite(g.id)}
                  title="Copy invite link"
                  style={{
                    width: 34, height: 34, borderRadius: 10, border: 'none',
                    background: copiedId === g.id ? C.greenBg : C.surface2,
                    color: copiedId === g.id ? C.green : C.text2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <Icon
                    name={copiedId === g.id ? 'check' : 'send'}
                    size={15}
                    color={copiedId === g.id ? C.green : C.text2}
                  />
                </button>

                {/* Open group — placeholder for Phase 3 */}
                <button
                  onClick={() => addToast('Full group view coming in Phase 3!', 'info')}
                  style={{
                    padding: '0 14px', height: 34, borderRadius: 10, border: 'none',
                    background: C.accentBg, color: C.accent,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  Open <Icon name="chevron" size={12} color={C.accent} />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* ── Info banner: what's coming ─────────────────────────────────── */}
      {!loading && groups.length > 0 && (
        <div style={{
          background: C.accentBg, border: `1px solid ${C.accent}33`,
          borderRadius: 14, padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 22 }}>🚧</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textW, marginBottom: 2 }}>
              Add expenses coming soon
            </div>
            <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
              Invite your friends now. Full expense splitting, AI receipt scanning, and UPI handshake ship in the next update.
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateGroupModal
          userId={userId}
          onClose={() => setShowCreate(false)}
          onCreated={handleGroupCreated}
        />
      )}

      {inviteData && (
        <InviteShareModal
          inviteUrl={inviteData.url}
          groupName={inviteData.groupName}
          onClose={() => setInviteData(null)}
        />
      )}
    </div>
  );
}
