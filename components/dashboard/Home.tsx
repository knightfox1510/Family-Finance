'use client';
import React, { useMemo, useState, useEffect } from 'react';
import type { AppData, ViewId } from '@/types';
import { C } from '@/constants';
import { Icon } from '@/components/ui/Icon';
import { ActiveProfileNudge } from '@/components/dashboard/ActiveProfileNudge';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  data: AppData;
  fmt: (n: number) => string;
  onNavigate: (view: ViewId) => void;
  session?: { user?: { email?: string } };
  onAddExpense?: () => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function QuickAction({
  label, icon, accent, onClick,
}: { label: string; icon: string; accent?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        background: accent ? C.accent : C.surface2,
        border: 'none',
        borderRadius: 18,
        padding: '14px 8px 12px',
        cursor: 'pointer',
        transition: 'opacity 0.15s, transform 0.1s',
        WebkitTapHighlightColor: 'transparent',
        minWidth: 0,
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
      onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <Icon name={icon} size={22} color={accent ? '#0a0a0a' : C.text2} />
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: accent ? '#0a0a0a' : C.text2,
        lineHeight: 1,
        textAlign: 'center',
      }}>
        {label}
      </span>
    </button>
  );
}

function SectionCard({
  icon, label, sub, color, onClick, wide, badge,
}: {
  icon: string;
  label: string;
  sub: string;
  color: string;
  onClick: () => void;
  wide?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        gridColumn: wide ? '1 / -1' : undefined,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 20,
        padding: '16px 16px 14px',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: wide ? 'row' : 'column',
        alignItems: wide ? 'center' : 'flex-start',
        justifyContent: 'space-between',
        gap: wide ? 0 : 10,
        transition: 'background 0.15s, transform 0.1s',
        WebkitTapHighlightColor: 'transparent',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-md)',
        minWidth: 0,
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
      onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {/* Color accent strip */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 2,
        background: color,
        borderRadius: '20px 20px 0 0',
        opacity: 0.7,
      }} />

      {/* Left content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center' }}>
          <Icon name={icon} size={22} color={color} />
        </div>
        <div style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.02em',
          color: C.textW,
          marginBottom: 4,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 11,
          color: C.text3,
          lineHeight: 1.3,
          whiteSpace: wide ? 'nowrap' : 'normal',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {sub}
        </div>
      </div>

      {/* Right: badge or chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {badge && (
          <div style={{
            background: color,
            color: '#0a0a0a',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '3px 7px',
            borderRadius: 99,
          }}>
            {badge}
          </div>
        )}
        <Icon name="chevron" size={14} color={C.text3} />
      </div>
    </button>
  );
}

// ─── Hero Card ────────────────────────────────────────────────────────────────
function HeroCard({
  fmt, data, isGhost, hasPartner, currentMonthKey,
}: {
  fmt: (n: number) => string;
  data: AppData;
  isGhost: boolean;
  hasPartner: boolean;
  currentMonthKey: string;
}) {
  const monthExp = data.expenses.filter(
    (e) => monthKey(e.date) === currentMonthKey && e.type !== 'income'
  );
  const monthInc = data.expenses.filter(
    (e) => monthKey(e.date) === currentMonthKey && e.type === 'income'
  );
  const totalSpent  = monthExp.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const totalIncome = monthInc.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const retained    = totalIncome - totalSpent;

  const groups = (data as any).groups ?? [];
  const hasAnyData = data.expenses.length > 0 || groups.length > 0;

  // ── Ghost / Groups-only user ───────────────────────────────────────────────
  if (isGhost) {
    const groupCount = groups.length;
    return (
      <div style={{
        borderRadius: 24,
        padding: '22px 20px 20px',
        background: `linear-gradient(135deg, ${C.surface} 0%, color-mix(in srgb, var(--blue) 8%, ${C.surface}) 100%)`,
        border: `1px solid color-mix(in srgb, var(--blue) 25%, ${C.border})`,
        boxShadow: 'var(--shadow-md)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 120, height: 120, borderRadius: '50%',
          background: 'var(--blue)', opacity: 0.06,
          pointerEvents: 'none',
        }} />
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: 12 }}>
          Your Groups
        </div>
        {groupCount === 0 ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.textW, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 8 }}>
              No groups yet
            </div>
            <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.5 }}>
              Join or create a group to start splitting expenses with friends & family.
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 34, fontWeight: 900, color: C.textW, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
              {groupCount} {groupCount === 1 ? 'Group' : 'Groups'}
            </div>
            <div style={{ fontSize: 13, color: C.text3 }}>
              Tap <span style={{ color: 'var(--blue)', fontWeight: 700 }}>Groups</span> to view balances & settle up
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <div style={{ background: C.surface2, borderRadius: 99, padding: '5px 12px', fontSize: 11, color: C.text3, fontWeight: 600 }}>
            💡 No household setup needed
          </div>
        </div>
      </div>
    );
  }

  // ── New user — no data at all ──────────────────────────────────────────────
  if (!hasAnyData) {
    return (
      <div style={{
        borderRadius: 24,
        padding: '22px 20px 20px',
        background: `linear-gradient(135deg, ${C.surface} 0%, color-mix(in srgb, var(--accent) 6%, ${C.surface}) 100%)`,
        border: `1px solid color-mix(in srgb, var(--accent) 20%, ${C.border})`,
        boxShadow: 'var(--shadow-md)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'var(--accent)', opacity: 0.06, pointerEvents: 'none' }} />
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, marginBottom: 12 }}>Getting started</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.textW, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 8 }}>
          Welcome to ChillarFlow 👋
        </div>
        <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.5 }}>
          Add your first expense or set up your household to get started.
        </div>
      </div>
    );
  }

  // ── Household user ─────────────────────────────────────────────────────────
  const isPositive  = retained >= 0;
  const accentColor = isPositive ? C.green : C.red;

  const contextMessage = (() => {
    if (totalIncome === 0) return `${fmt(totalSpent)} spent this month — add your income to see retention`;
    if (isPositive) {
      const retentionPct = ((retained / totalIncome) * 100).toFixed(0);
      return `${retentionPct}% of income retained · ${fmt(totalSpent)} spent`;
    }
    const overspendPct = (((Math.abs(retained)) / totalIncome) * 100).toFixed(0);
    return `${overspendPct}% over income · spent ${fmt(Math.abs(retained))} more than earned`;
  })();

  return (
    <div style={{
      borderRadius: 24,
      padding: '22px 20px 20px',
      background: `linear-gradient(145deg, ${C.surface} 0%, color-mix(in srgb, ${accentColor} 7%, ${C.surface}) 100%)`,
      border: `1px solid color-mix(in srgb, ${accentColor} 20%, ${C.border})`,
      boxShadow: 'var(--shadow-md)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -40, right: -40,
        width: 140, height: 140, borderRadius: '50%',
        background: accentColor, opacity: 0.07,
        pointerEvents: 'none',
      }} />

      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 12 }}>
        This month · {new Date().toLocaleString('en-IN', { month: 'long' })}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 4 }}>
        <div style={{
          fontSize: 38,
          fontWeight: 900,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color: accentColor,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {fmt(Math.abs(retained))}
        </div>
      </div>

      <div style={{ fontSize: 13, color: C.text3, marginBottom: 18, lineHeight: 1.4 }}>
        {contextMessage}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ background: C.surface2, borderRadius: 99, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
          <span style={{ fontSize: 11, color: C.text2, fontWeight: 600 }}>In {fmt(totalIncome)}</span>
        </div>
        <div style={{ background: C.surface2, borderRadius: 99, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent }} />
          <span style={{ fontSize: 11, color: C.text2, fontWeight: 600 }}>Out {fmt(totalSpent)}</span>
        </div>
        {hasPartner && (
          <div style={{ background: C.surface2, borderRadius: 99, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--purple)' }} />
            <span style={{ fontSize: 11, color: C.text2, fontWeight: 600 }}>Joint</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function Home({ data, fmt, onNavigate, session, onAddExpense }: Props) {
  const d   = new Date();
  const cmk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const mode       = data.settings.householdMode ?? null;
  const isGhost    = !mode;
  const isSolo     = mode === 'solo';
  const hasPartner = mode === 'joint' || mode === 'split';

  const [activeRole, setActiveRole] = useState<'Partner A' | 'Partner B'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('active_partner_role');
      if (saved === 'Partner A' || saved === 'Partner B') return saved;
    }
    return (data.currentUserRole === 'Partner B' ? 'Partner B' : 'Partner A');
  });

  useEffect(() => {
    const fromStorage = typeof window !== 'undefined'
      ? localStorage.getItem('active_partner_role')
      : null;
    if (fromStorage === 'Partner A' || fromStorage === 'Partner B') {
      setActiveRole(fromStorage);
    } else {
      setActiveRole(data.currentUserRole === 'Partner B' ? 'Partner B' : 'Partner A');
    }
  }, [data.currentUserRole]);

  const firstName = useMemo(() => {
    if (activeRole === 'Partner B' && hasPartner) {
      const nameB = data.settings.partnerBName;
      if (nameB && nameB !== 'Partner B') return nameB.split(' ')[0];
    } else {
      const nameA = data.settings.partnerAName;
      if (nameA && nameA !== 'Partner A') return nameA.split(' ')[0];
    }
    const email = session?.user?.email ?? '';
    return email.split('@')[0] || 'there';
  }, [activeRole, hasPartner, data.settings.partnerAName, data.settings.partnerBName, session]);

  const groups = (data as any).groups ?? [];

  const stats = useMemo(() => {
    const thisMonthExp = data.expenses.filter(
      (e) => monthKey(e.date) === cmk && e.type !== 'income'
    );
    const thisMonthInc = data.expenses.filter(
      (e) => monthKey(e.date) === cmk && e.type === 'income'
    );
    const totalSpent  = thisMonthExp.reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const totalIncome = thisMonthInc.reduce((s, e) => s + Number(e.amount ?? 0), 0);

    const goalsCount  = data.goals.length;
    const goalsSaved  = data.goals.reduce((s, g) => s + Number(g.current ?? 0), 0);
    const goalsTarget = data.goals.reduce((s, g) => s + Number(g.target ?? 0), 0);
    const goalsPct    = goalsTarget > 0 ? Math.round((goalsSaved / goalsTarget) * 100) : 0;

    const loans     = (data as any).loans ?? [];
    const loanCount = loans.length;
    const loanTotal = loans.reduce((s: number, l: any) => s + Number(l.emi ?? l.amount ?? 0), 0);

    const contributions = data.contributions ?? [];
    const thisContrib   = contributions.find((c) => c.month === cmk);
    const contribTotal  = thisContrib
      ? Number(thisContrib.partnerA ?? 0) + Number(thisContrib.partnerB ?? 0)
      : 0;

    const unsettled  = data.expenses.filter((e) => e.toSettle && !e.settled);
    const groupCount = groups.length;

    return {
      totalSpent, totalIncome, thisMonthExp,
      goalsCount, goalsSaved, goalsPct,
      loanCount, loanTotal,
      contribTotal,
      unsettled: unsettled.length,
      groupCount,
    };
  }, [data, cmk, groups]);

  type SectionDef = { icon: string; label: string; sub: string; color: string; view: ViewId; wide?: boolean; badge?: string; show: boolean };
  const sections = ([
    {
      icon: 'card', label: 'Expenses',
      sub: stats.thisMonthExp.length > 0
        ? `${stats.thisMonthExp.length} this month · ${fmt(stats.totalSpent)}`
        : 'No expenses this month',
      color: C.accent, view: 'expenses', show: true,
    },
    {
      icon: 'trendUp', label: 'Income',
      sub: stats.totalIncome > 0 ? `${fmt(stats.totalIncome)} earned this month` : 'No income logged yet',
      color: C.green, view: 'income', show: !isGhost,
    },
    {
      icon: 'users', label: 'Groups',
      sub: stats.groupCount > 0 ? `${stats.groupCount} active ${stats.groupCount === 1 ? 'group' : 'groups'}` : 'Split bills with anyone',
      color: 'var(--blue)', view: 'groups',
      badge: stats.groupCount > 0 ? `${stats.groupCount}` : undefined, show: true,
    },
    {
      icon: 'handshake', label: 'Settle Up',
      sub: stats.unsettled > 0 ? `${stats.unsettled} pending ${stats.unsettled === 1 ? 'settlement' : 'settlements'}` : 'All settled ✓',
      color: C.teal, view: 'settle',
      badge: stats.unsettled > 0 ? `${stats.unsettled}` : undefined, show: true,
    },
    {
      icon: 'target', label: 'Goals',
      sub: stats.goalsCount > 0 ? `${stats.goalsCount} goals · ${stats.goalsPct}% funded` : 'Set your savings targets',
      color: 'var(--purple)', view: 'goals', show: true,
    },
    {
      icon: 'wallet', label: 'Contributions',
      sub: stats.contribTotal > 0 ? `${fmt(stats.contribTotal)} pooled this month` : 'Log monthly contributions',
      color: C.blue, view: 'contributions', show: hasPartner,
    },
    {
      icon: 'bank', label: 'Loans & EMIs',
      sub: stats.loanCount > 0 ? `${stats.loanCount} active · ${fmt(stats.loanTotal)}/mo` : 'Track your EMIs & loans',
      color: C.red, view: 'loans', show: !isGhost,
    },
    {
      icon: 'sparkles', label: 'AI Insights',
      sub: 'Spending patterns · Smart nudges',
      color: C.teal, view: 'insights', wide: true,
      show: !isGhost || data.expenses.length > 0,
    },
  ] as SectionDef[]).filter((s) => s.show);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 16 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: C.textW, lineHeight: 1.1 }}>
            {greeting()}, {firstName} 👋
          </div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4, fontWeight: 500 }}>
            {todayLabel()}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isGhost && (
            <div style={{
              background: `color-mix(in srgb, var(--blue) 15%, ${C.surface2})`,
              border: `1px solid color-mix(in srgb, var(--blue) 30%, ${C.border})`,
              borderRadius: 99, padding: '4px 10px',
              fontSize: 10, fontWeight: 700, color: 'var(--blue)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              Groups
            </div>
          )}
          <button
            onClick={() => onNavigate('settings')}
            style={{
              background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12,
              width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0,
            }}
          >
            <Icon name="settings" size={18} color={C.text2} />
          </button>
        </div>
      </div>

      {/* ── Active Device Profile nudge ─────────────────────────────────────
           Shows only for joint/separate households where display_name is still
           a placeholder role string. Dismissible, stored in localStorage.   */}
      <ActiveProfileNudge
        currentUserRole={data.currentUserRole ?? 'Partner A'}
        settings={{
          ...data.settings,
          householdMode: data.settings.householdMode ?? undefined,
        }}
        onNavigate={(v: string) => onNavigate(v as ViewId)}
      />

      {/* ── Hero Card ───────────────────────────────────────────────────────── */}
      <HeroCard
        fmt={fmt}
        data={data}
        isGhost={isGhost}
        hasPartner={hasPartner}
        currentMonthKey={cmk}
      />

      {/* ── Quick Actions ───────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
          Quick Actions
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <QuickAction label="Add"    icon="plus"      accent onClick={() => onAddExpense?.()} />
          <QuickAction label="Settle" icon="handshake"        onClick={() => onNavigate('settle')} />
          <QuickAction label="Groups" icon="users"            onClick={() => onNavigate('groups')} />
          {!isGhost ? (
            <QuickAction label="Stats" icon="barChart" onClick={() => onNavigate('dashboard')} />
          ) : (
            <QuickAction label="Goals" icon="target"  onClick={() => onNavigate('goals')} />
          )}
        </div>
      </div>

      {/* ── Section Grid ────────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
          All Sections
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {sections.map((s) => (
            <SectionCard
              key={s.view}
              icon={s.icon}
              label={s.label}
              sub={s.sub}
              color={s.color}
              onClick={() => onNavigate(s.view)}
              wide={s.wide}
              badge={s.badge}
            />
          ))}
        </div>
      </div>

      {/* ── Setup prompt for ghost users with no groups ──────────────────────── */}
      {isGhost && groups.length === 0 && (
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 20, padding: '18px 16px', boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
            Optional Setup
          </div>
          <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5, marginBottom: 14 }}>
            Want to track household finances? Set up your household to unlock income tracking, contributions & partner splits.
          </div>
          <button
            onClick={() => onNavigate('settings')}
            style={{
              background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 99,
              padding: '9px 16px', fontSize: 12, fontWeight: 700, color: C.textW,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Set up household
            <Icon name="chevron" size={12} color={C.text3} />
          </button>
        </div>
      )}

      {/* ── Footer spacer for bottom nav ────────────────────────────────────── */}
      <div style={{ height: 8 }} />
    </div>
  );
}
