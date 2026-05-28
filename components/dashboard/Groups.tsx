// components/dashboard/Groups.tsx — Phase 2 + all UX fixes applied
// Fix 1:  Entire card is tappable (stopPropagation on action buttons)
// Fix 8:  Suggestion chips clear description field
// Fix 12: AvatarStack uses actual member initials, not A/B/C placeholders
// Fix DM: Responsive modals — bottom sheet on mobile, centered dialog on desktop
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { C } from '@/constants';
import { Icon } from '@/components/ui/Icon';
import { addToast } from '@/components/ui/ui';
import type { AppData } from '@/types';
import { GroupDetail } from './GroupDetail';

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

function memberName(m: GroupMember): string {
  return m.display_name || m.ghost_name || '?';
}

function relativeTime(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const mins  = Math.floor(diff / 60000);
  if (days > 30) return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (days > 0)  return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0)  return `${mins}m ago`;
  return 'just now';
}

const AVATAR_COLORS = [C.accent, C.green, C.purple, C.blue, C.teal, C.orange];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

// Fix 12: uses actual member initials from real member data
function MemberCluster({ members, total }: { members: GroupMember[]; total: number }) {
  const shown = members.slice(0, 4);
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <div
          key={m.id}
          title={memberName(m)}
          style={{
            width: 26, height: 26, borderRadius: '50%',
            background: AVATAR_COLORS[i % AVATAR_COLORS.length],
            border: `2px solid ${C.surface}`,
            marginLeft: i > 0 ? -8 : 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: '#0a0a0a',
            zIndex: shown.length - i, position: 'relative', flexShrink: 0,
          }}
        >
          {memberName(m).charAt(0).toUpperCase()}
        </div>
      ))}
      {total > 4 && (
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: C.surface2, border: `2px solid ${C.surface}`,
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

function EmptyGroups({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px', background: C.surface, borderRadius: 20, boxShadow: C.shadowSm }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.textW, marginBottom: 8 }}>No groups yet</div>
      <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, maxWidth: 280, margin: '0 auto 24px' }}>
        Create a group for a trip, flatmates, or any shared expense — then invite friends via a link.
      </div>
      <button onClick={onCreateClick} style={{ padding: '12px 28px', borderRadius: 99, border: 'none', background: C.accent, color: '#0a0a0a', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
        Create your first group
      </button>
    </div>
  );
}

// ── Responsive modal shell ────────────────────────────────────────────────────
// Mobile: slides up from bottom as a sheet
// Desktop: centered dialog with all-rounded corners
function ModalShell({ onClose, isMobile, children, width = 480 }: {
  onClose:  () => void;
  isMobile: boolean;
  children: React.ReactNode;
  width?:   number;
}) {
  const desktopDialog: React.CSSProperties = {
    background:   C.surface,
    borderRadius: 24,
    padding:      '28px 28px 32px',
    width:        '100%',
    maxWidth:     width,
    boxShadow:    '0 24px 80px rgba(0,0,0,0.6)',
    position:     'relative',
  };

  const mobileSheet: React.CSSProperties = {
    background:   C.surface,
    borderRadius: '24px 24px 0 0',
    padding:      '20px 24px 40px',
    width:        '100%',
    maxWidth:     width,
    boxShadow:    '0 -16px 60px rgba(0,0,0,0.6)',
    maxHeight:    '92vh',
    overflowY:    'auto',
  };

  return (
    <div
      style={{
        position:        'fixed',
        inset:           0,
        background:      isMobile ? 'rgba(0,0,0,0.80)' : 'rgba(0,0,0,0.55)',
        zIndex:          9999,
        display:         'flex',
        alignItems:      isMobile ? 'flex-end' : 'center',
        justifyContent:  'center',
        padding:         isMobile ? 0 : 24,
      }}
      onClick={onClose}
    >
      <div style={isMobile ? mobileSheet : desktopDialog} onClick={(e) => e.stopPropagation()}>
        {/* Mobile drag handle */}
        {isMobile && (
          <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />
        )}
        {/* Desktop close button */}
        {!isMobile && (
          <button
            onClick={onClose}
            style={{
              position:   'absolute', top: 16, right: 16,
              width:      32, height: 32, borderRadius: '50%',
              border:     'none', background: C.surface2,
              color:      C.text2, cursor: 'pointer',
              display:    'flex', alignItems: 'center', justifyContent: 'center',
              fontSize:   18, lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

function CreateGroupModal({ onClose, onCreated, userId }: {
  onClose:   () => void;
  onCreated: (group: Group, inviteUrl: string) => void;
  userId:    string;
}) {
  const isMobile          = useIsMobile();
  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const SUGGESTIONS = [
    { label: 'Goa Trip 🏖️',     desc: 'Beach trip expenses' },
    { label: 'Flat 4B 🏠',       desc: 'Monthly household bills' },
    { label: 'Office Lunch 🍱',  desc: 'Team lunch splits' },
    { label: 'Weekend Trek 🏕️',  desc: 'Trek gear & food' },
    { label: 'Book Club 📚',     desc: 'Books & meetup costs' },
  ];

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ name: name.trim(), description: desc.trim() || undefined, createdBy: userId }),
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
    width: '100%', background: C.surface2, border: '1.5px solid transparent',
    borderRadius: 12, color: C.textW, fontFamily: 'inherit', fontSize: 15,
    fontWeight: 500, padding: '12px 16px', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  return (
    <ModalShell onClose={onClose} isMobile={isMobile}>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.textW, marginBottom: 16, letterSpacing: '-0.02em' }}>
        New group
      </div>

      {/* Fix 8: tapping suggestion sets name AND clears desc so they don't mismatch */}
      <div style={{ display: 'flex', gap: 6, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', paddingBottom: isMobile ? 10 : 0, marginBottom: isMobile ? 0 : 8, scrollbarWidth: 'none' as any }}>
        {SUGGESTIONS.map((s) => (
          <button key={s.label} onClick={() => { setName(s.label); setDesc(''); }}
            style={{
              padding: '6px 14px', borderRadius: 99,
              border: `1px solid ${name === s.label ? C.accent : C.border2}`,
              background: name === s.label ? C.accentBg : C.surface2,
              color: name === s.label ? C.accent : C.text2,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap' as const, flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >{s.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
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
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, fontSize: 13, background: `${C.red}15`, border: `1px solid ${C.red}44`, color: C.red }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          onClick={onClose}
          style={{ flex: 1, padding: '13px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
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
    </ModalShell>
  );
}

function InviteShareModal({ inviteUrl, groupName, onClose }: {
  inviteUrl: string;
  groupName: string;
  onClose:   () => void;
}) {
  const isMobile      = useIsMobile();
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
    <ModalShell onClose={onClose} isMobile={isMobile}>
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

      <div style={{
        background: C.surface2, borderRadius: 12, padding: '12px 16px',
        fontSize: 13, color: C.teal, wordBreak: 'break-all' as const,
        lineHeight: 1.5, marginBottom: 16, border: `1px solid ${C.teal}22`,
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
            transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
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
    </ModalShell>
  );
}

export function Groups({ data, session, fmt }: Props) {
  const [groups, setGroups]         = useState<Group[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [inviteData, setInviteData] = useState<{ url: string; groupName: string } | null>(null);
  const [copiedId, setCopiedId]     = useState<string | null>(null);

  // Fix 1: track which group is open
  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string; currency: string; ghostToken?: string } | null>(null);

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
    setGroups((prev) => [group as unknown as Group, ...prev]);
    setInviteData({ url: inviteUrl, groupName: (group as any).name });
  };

  const copyGroupInvite = async (e: React.MouseEvent, groupId: string) => {
    // Fix 1: prevent card click from firing when invite button is tapped
    e.stopPropagation();
    try {
      const res  = await fetch('/api/groups/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ groupId, userId }),
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

  // Fix 1: if a group is selected, render GroupDetail instead of list
if (selectedGroup) {
    return (
      <GroupDetail
        groupId={selectedGroup.id}
        groupName={selectedGroup.name}
        currency={selectedGroup.currency}
        userId={userId}
        ghostToken={selectedGroup.ghostToken}
        fmt={fmt}
        onBack={() => { setSelectedGroup(null); loadGroups(); }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.text3 }}>
          {groups.length} group{groups.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 99, border: 'none', background: C.accent, color: '#0a0a0a', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
        >
          <Icon name="plus" size={15} color="#0a0a0a" />
          New group
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ height: 100, borderRadius: 16, background: C.surface, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && groups.length === 0 && <EmptyGroups onCreateClick={() => setShowCreate(true)} />}

      {/* Fix 1: entire card is clickable, action buttons stopPropagation */}
      {!loading && groups.map((g) => {
        const isPositive = g.net_balance > 0;
        const isSettled  = g.net_balance === 0;

        return (
          <div
            key={g.id}
            onClick={() => setSelectedGroup({ id: g.id, name: g.name, currency: g.currency, ghostToken: undefined })}
            style={{
              background: C.surface, borderRadius: 18, padding: '16px 18px',
              boxShadow: C.shadowSm, border: `1px solid ${C.border}`,
              cursor: 'pointer', transition: 'transform 0.12s, box-shadow 0.12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = C.shadowMd; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = C.shadowSm; }}
          >
            {/* Top: name + balance */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.textW, letterSpacing: '-0.01em', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {g.name}
                </div>
                {g.description && (
                  <div style={{ fontSize: 12, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {g.description}
                  </div>
                )}
              </div>
              <div style={{
                flexShrink: 0, marginLeft: 12, padding: '5px 12px', borderRadius: 99,
                background: isSettled ? C.surface2 : isPositive ? C.greenBg : `${C.red}15`,
                border: `1px solid ${isSettled ? C.border : isPositive ? C.green : C.red}44`,
                fontSize: 13, fontWeight: 800,
                color: isSettled ? C.text3 : isPositive ? C.green : C.red,
              }}>
                {isSettled ? 'Settled' : isPositive ? `+${fmt(g.net_balance)}` : fmt(g.net_balance)}
              </div>
            </div>

            {/* Bottom: members + time + actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MemberCluster members={g.members} total={g.member_count} />
                <span style={{ fontSize: 11, color: C.text3 }}>{relativeTime(g.last_activity)}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {/* Fix 1: e.stopPropagation() so card click doesn't fire */}
                <button
                  onClick={(e) => copyGroupInvite(e, g.id)}
                  title="Copy invite link"
                  style={{
                    width: 34, height: 34, borderRadius: 10, border: 'none',
                    background: copiedId === g.id ? C.greenBg : C.surface2,
                    color: copiedId === g.id ? C.green : C.text2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <Icon name={copiedId === g.id ? 'check' : 'send'} size={15} color={copiedId === g.id ? C.green : C.text2} />
                </button>
                <div style={{ padding: '0 10px', height: 34, borderRadius: 10, background: C.accentBg, color: C.accent, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none' }}>
                  Open <Icon name="chevron" size={12} color={C.accent} />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {showCreate && <CreateGroupModal userId={userId} onClose={() => setShowCreate(false)} onCreated={handleGroupCreated} />}
      {inviteData && <InviteShareModal inviteUrl={inviteData.url} groupName={inviteData.groupName} onClose={() => setInviteData(null)} />}
    </div>
  );
}
