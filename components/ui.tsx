'use client';
// ─── components/ui.tsx ────────────────────────────────────────────────────────
// ChillarFlow NeoPOP Component Library
// All primitives: Card, Button, Input, Badge, Progress, Metric, ThemePicker, etc.
// Uses CSS classes from globals.css — no inline theme colours needed.

import React from 'react';
import { C } from '@/constants';

// ─── Types ────────────────────────────────────────────────────────────────────
type Variant = 'primary' | 'ghost' | 'danger' | 'teal' | 'green' | 'success';
export type ToastType = 'success' | 'error' | 'info';

// ─── Card ─────────────────────────────────────────────────────────────────────
// NeoPOP card: sharp corners, hard drop shadow, press-to-lift animation
interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  animate?: boolean;
  padding?: string;
}
export function Card({ children, className = '', style, onClick, animate, padding = '18px 20px' }: CardProps) {
  return (
    <div
      className={`neo-card${animate ? ' animate-fade-up' : ''}${className ? ' ' + className : ''}`}
      style={{ padding, cursor: onClick ? 'pointer' : undefined, ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ─── Section title (NeoPOP style with trailing rule line) ──────────────────────
export function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="neo-section-title" style={style}>
      {children}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
}
export function Btn({ variant = 'primary', size = 'md', fullWidth, children, style, ...p }: BtnProps) {
  const sizeMap = { sm: '8px 14px', md: '12px 20px', lg: '14px 28px' };
  const fontMap  = { sm: 11, md: 13, lg: 15 };
  const cls = variant === 'primary' ? 'neo-btn'
    : variant === 'ghost'   ? 'neo-btn neo-btn-ghost'
    : variant === 'danger'  ? 'neo-btn neo-btn-danger'
    : variant === 'success' ? 'neo-btn'
    : variant === 'teal'    ? 'neo-btn'
    : 'neo-btn neo-btn-ghost';
  return (
    <button
      className={cls}
      style={{
        padding: sizeMap[size],
        fontSize: fontMap[size],
        width: fullWidth ? '100%' : undefined,
        ...(variant === 'success' ? { background: C.green,  borderColor: '#000' } : {}),
        ...(variant === 'teal'    ? { background: C.teal,   borderColor: '#000' } : {}),
        ...(variant === 'green'   ? { background: C.green,  borderColor: '#000' } : {}),
        ...style,
      }}
      {...p}
    >
      {children}
    </button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InpProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}
export function Inp({ label, hint, style, id, ...p }: InpProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div style={{ width: '100%' }}>
      {label && (
        <label htmlFor={inputId} style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className="neo-input"
        style={{ fontSize: 16, ...style }} // 16px prevents iOS zoom
        {...p}
      />
      {hint && <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Sel({ style, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="neo-input"
      style={{ cursor: 'pointer', ...style }}
      {...p}
    />
  );
}

// ─── Label ────────────────────────────────────────────────────────────────────
export function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="t-caption" style={{ marginBottom: 8, ...style }}>{children}</div>
  );
}

// ─── Badge / Tag ──────────────────────────────────────────────────────────────
type BadgeColor = 'accent' | 'green' | 'red' | 'blue' | 'teal' | 'purple' | 'orange' | 'muted';
export function Badge({ children, color = 'muted', style }: { children: React.ReactNode; color?: BadgeColor; style?: React.CSSProperties }) {
  const colorMap: Record<BadgeColor, { color: string; borderColor: string }> = {
    accent:  { color: C.accent,  borderColor: C.accent  },
    green:   { color: C.green,   borderColor: C.green   },
    red:     { color: C.red,     borderColor: C.red     },
    blue:    { color: C.blue,    borderColor: C.blue    },
    teal:    { color: C.teal,    borderColor: C.teal    },
    purple:  { color: C.purple,  borderColor: C.purple  },
    orange:  { color: C.orange,  borderColor: C.orange  },
    muted:   { color: C.text3,   borderColor: C.border  },
  };
  return (
    <span className="neo-badge" style={{ ...colorMap[color], ...style }}>{children}</span>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
interface ProgressProps {
  value: number;  // 0–100
  color?: string;
  height?: number;
}
export function Progress({ value, color, height = 6 }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = color || (pct >= 90 ? C.red : pct >= 70 ? C.accent : C.green);
  return (
    <div className="neo-progress" style={{ height }}>
      <div
        className="neo-progress-fill"
        style={{ width: `${pct}%`, background: barColor }}
      />
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className={`neo-toggle${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={() => onChange(!on)}
      onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? onChange(!on) : undefined}
      style={{ cursor: 'pointer' }}
    >
      <div className="neo-toggle-thumb" />
    </div>
  );
}

// ─── Metric tile ──────────────────────────────────────────────────────────────
interface MetricProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  progress?: number;
  animate?: boolean;
}
export function Metric({ label, value, sub, color, progress, animate }: MetricProps) {
  return (
    <div className={`neo-metric${animate ? ' animate-count' : ''}`}>
      <div className="neo-metric-label">{label}</div>
      <div className="neo-metric-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>{sub}</div>}
      {progress !== undefined && (
        <div style={{ marginTop: 10 }}>
          <Progress value={progress} />
        </div>
      )}
    </div>
  );
}

// ─── Usage meter (plan/AI parse tracker) ─────────────────────────────────────
export function UsageMeter({ count, limit, pct }: { count: number; limit: number; pct: number }) {
  const color = pct >= 90 ? C.red : pct >= 70 ? C.accent : C.teal;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="t-caption">AI parses this month</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{count} / {limit}</span>
      </div>
      <Progress value={pct} color={color} height={4} />
      {pct >= 80 && (
        <div style={{ fontSize: 11, color: pct >= 100 ? C.red : C.accent, marginTop: 6 }}>
          {pct >= 100 ? '▪ Limit reached — upgrade for unlimited' : `▪ ${Math.round(100 - pct)}% remaining`}
        </div>
      )}
    </div>
  );
}

// ─── Plan badge ───────────────────────────────────────────────────────────────
export function PlanBadge({ plan }: { plan: 'free' | 'pro' }) {
  if (plan === 'pro') {
    return <span className="pro-shimmer" style={{ fontSize: 12, letterSpacing: '0.05em' }}>✦ PRO</span>;
  }
  return <Badge color="muted">FREE</Badge>;
}

// ─── Theme picker ─────────────────────────────────────────────────────────────
const THEMES = [
  { id: 'obsidian', label: 'Obsidian', swatches: ['#09090b', '#18181b', '#f59e0b'] },
  { id: 'pearl',    label: 'Pearl',    swatches: ['#fafafa', '#ffffff', '#d97706'] },
  { id: 'emerald',  label: 'Emerald',  swatches: ['#030a06', '#071a0e', '#22c55e'] },
] as const;

export function ThemePicker({ current, onChange }: { current: string; onChange: (t: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {THEMES.map(({ id, label, swatches }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="neo-btn-ghost"
          style={{
            flex: 1, padding: '12px 8px',
            background: current === id ? C.accentBg : C.surface2,
            borderColor: current === id ? C.accent : C.border,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            boxShadow: current === id ? C.neoShadow : C.neoShadowSm,
          }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            {swatches.map((s) => (
              <div key={s} style={{ width: 14, height: 14, background: s, border: '1px solid rgba(255,255,255,0.15)' }} />
            ))}
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: current === id ? C.accent : C.text3 }}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Horizontal quick-action tray (NeoPOP story bar) ──────────────────────────
interface TrayItem {
  icon: string;
  label: string;
  value?: string;
  color?: string;
  onClick?: () => void;
}
export function QuickTray({ items }: { items: TrayItem[] }) {
  return (
    <div className="neo-tray">
      {items.map((item, i) => (
        <div key={i} className="neo-tray-card" onClick={item.onClick}>
          <div style={{ fontSize: 18, marginBottom: 4 }}>{item.icon}</div>
          {item.value && (
            <div style={{ fontSize: 13, fontWeight: 800, color: item.color || C.textW, letterSpacing: '-0.02em', marginBottom: 2 }}>
              {item.value}
            </div>
          )}
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Bottom navigation ────────────────────────────────────────────────────────
interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
}
export function BottomNav({
  items,
  active,
  onSelect,
}: {
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="neo-bottom-nav" role="navigation" aria-label="Main navigation">
      {items.map((item) => (
        <div
          key={item.id}
          className={`neo-nav-item${active === item.id ? ' active' : ''}`}
          onClick={() => onSelect(item.id)}
          role="button"
          aria-label={item.label}
          aria-pressed={active === item.id}
        >
          <div className="neo-nav-pip" />
          <div style={{ color: active === item.id ? C.accent : C.text3, transition: 'color 0.15s', fontSize: 20 }}>
            {item.icon}
          </div>
          <div className="neo-nav-label">{item.label}</div>
        </div>
      ))}
    </nav>
  );
}

// ─── Toast notification ───────────────────────────────────────────────────────
interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}
const toastEmit = new EventTarget();
export function addToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  toastEmit.dispatchEvent(Object.assign(new Event('toast'), { message, type }));
}

export function ToastContainer() {
  const [toasts, setToasts] = React.useState<(ToastState & { id: number })[]>([]);
  const idRef = React.useRef(0);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as Event & { message: string; type: string };
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, message: ev.message, type: ev.type as any, visible: true }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
    };
    toastEmit.addEventListener('toast', handler);
    return () => toastEmit.removeEventListener('toast', handler);
  }, []);

  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 'max(20px, env(safe-area-inset-top))', right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className="neo-card-sm animate-slide-right"
          style={{
            padding: '12px 16px',
            background: t.type === 'success' ? C.greenBg : t.type === 'error' ? C.redBg : C.accentBg,
            borderColor: t.type === 'success' ? C.green : t.type === 'error' ? C.red : C.accent,
            boxShadow: C.neoShadow,
            maxWidth: 320,
            fontSize: 13,
            fontWeight: 600,
            color: t.type === 'success' ? C.green : t.type === 'error' ? C.red : C.accent,
          }}
        >
          {t.type === 'success' ? '✓ ' : t.type === 'error' ? '✕ ' : '· '}{t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Backward-compatibility aliases ───────────────────────────────────────────
// Some existing components import these names — keep them working.
export const ProgressBar = Progress;

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}
export function StatCard({ label, value, sub, color }: StatCardProps) {
  return <Metric label={label} value={value} sub={sub} color={color} />;
}

// ─── useToast hook (backward-compatible shim) ─────────────────────────────────
// Wraps the standalone addToast function so components using the hook still work.
export function useToast() {
  const toast = React.useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => addToast(message, type),
    []
  );
  return { addToast: toast };
}

// ─── Divider ──────────────────────────────────────────────────────────────────
export function Divider({ style }: { style?: React.CSSProperties }) {
  return <div className="divider" style={style} />;
}

// ─── Collapsible section (NeoPOP style) ───────────────────────────────────────
interface CollapsibleProps {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}
export function Collapsible({ title, badge, children, defaultOpen = false }: CollapsibleProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="neo-card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.textW }}>{title}</span>
          {badge && !open && (
            <span style={{ fontSize: 10, color: C.text3, fontWeight: 500 }}>{badge}</span>
          )}
        </div>
        <span style={{ color: C.text3, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: 12 }}>
          ▾
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${C.border}` }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.textW, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 16 }: { width?: string | number; height?: number }) {
  return (
    <div style={{ width, height, background: C.surface2, animation: 'pulse 1.5s ease-in-out infinite' }} />
  );
}
