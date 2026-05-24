// ─── components/ui.tsx ────────────────────────────────────────────────────────
// Shared primitive components used across every view.
// Import from here: import { Card, Btn, Inp, Sel, Badge, ... } from '@/components/ui';

import React, { CSSProperties } from 'react';
import { C } from '@/constants';

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({
  children,
  style = {},
  onClick,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: '20px 22px',
        cursor: onClick ? 'pointer' : undefined,
        boxShadow: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 2px 12px rgba(0,0,0,0.2)',
        transition: 'box-shadow 0.25s, transform 0.2s',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export function Inp({ style = {}, ...p }: any) {
  return (
    <input
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        color: C.textW,
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 16, // 16px prevents iOS auto-zoom on focus
        width: '100%',
        outline: 'none',
        boxSizing: 'border-box' as const,
        transition: 'border-color 0.2s',
        WebkitAppearance: 'none',
        minHeight: 44, // iOS touch target
        ...style,
      }}
      {...p}
    />
  );
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------
export function Sel({ children, style = {}, ...p }: any) {
  return (
    <select
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        color: C.textW,
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 14,
        width: '100%',
        outline: 'none',
        boxSizing: 'border-box' as const,
        cursor: 'pointer',
        ...style,
      }}
      {...p}
    >
      {children}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type BtnVariant = 'primary' | 'ghost' | 'danger' | 'success' | 'purple';

const btnVariants: Record<BtnVariant, CSSProperties> = {
  primary: { background: C.amber,             color: C.bg,     fontWeight: 600 },
  ghost:   { background: 'transparent',        border: `1px solid ${C.border}`, color: C.text2 },
  danger:  { background: `${C.red}22`,   border: `1px solid ${C.red}44`,   color: C.red },
  success: { background: `${C.green}22`, border: `1px solid ${C.green}44`, color: C.green },
  purple:  { background: `${C.purple}22`,border: `1px solid ${C.purple}44`,color: C.purple },
};

export function Btn({
  children,
  variant = 'primary',
  style = {},
  ...p
}: {
  children: React.ReactNode;
  variant?: BtnVariant;
  style?: CSSProperties;
  [key: string]: any;
}) {
  return (
    <button
      className="btn-press"
      style={{
        padding: '10px 16px',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        border: '1px solid transparent',
        transition: 'all 0.2s',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        outline: 'none',
        WebkitAppearance: 'none',
        // iOS minimum touch target
        minHeight: 44,
        ...btnVariants[variant],
        ...style,
      }}
      {...p}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: C.text2, fontSize: 12, fontWeight: 600, marginBottom: 5, letterSpacing: 0.3 }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
export function Badge({ children, color, style = {} }: { children: React.ReactNode; color: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        background: color + '22',
        color,
        border: `1px solid ${color}44`,
        borderRadius: 6,
        padding: '2px 9px',
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SectionTitle
// ---------------------------------------------------------------------------
export function SectionTitle({ children, style = {} }: { children: React.ReactNode; style?: CSSProperties }) {
  return (
    <h3 style={{ color: C.textW, fontSize: 15, fontWeight: 700, margin: '0 0 16px', letterSpacing: -0.3, ...style }}>
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------
export function ProgressBar({ pct, color = C.amber, height = 8 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ background: C.border, borderRadius: 99, height, overflow: 'hidden', width: '100%' }}>
      <div
        style={{
          background: color,
          height: '100%',
          width: `${Math.min(Math.max(pct, 0), 100)}%`,
          borderRadius: 99,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', background: C.surface, borderRadius: 10,
        border: `1px solid ${C.border}`, cursor: 'pointer', width: '100%', boxSizing: 'border-box',
      }}
    >
      <span style={{ fontSize: 14, color: C.text1 }}>{label}</span>
      <div style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span
          style={{
            position: 'absolute', cursor: 'pointer',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: checked ? C.amber : C.border,
            transition: '0.3s', borderRadius: 24,
          }}
        />
        <span
          style={{
            position: 'absolute',
            height: 18, width: 18,
            left: checked ? 22 : 3,
            bottom: 3,
            backgroundColor: checked ? C.bg : C.text2,
            transition: '0.3s', borderRadius: '50%',
          }}
        />
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------
export function StatCard({
  label, value, sub, accent = C.amber, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: string;
}) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: C.text2, fontSize: 12, fontWeight: 600, letterSpacing: 0.3 }}>{label}</span>
        {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
      </div>
      <div style={{ color: accent, fontSize: 24, fontWeight: 800, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 12 }}>{sub}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Toast — lightweight in-app notification (replaces alert())
// ---------------------------------------------------------------------------
export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  text: string;
  type: ToastType;
}

const toastColors: Record<ToastType, string> = {
  success: C.green,
  error:   C.red,
  info:    C.amber,
};

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: 'fixed', bottom: 90, right: 20, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          style={{
            background: C.surface,
            border: `1px solid ${toastColors[t.type]}44`,
            borderLeft: `4px solid ${toastColors[t.type]}`,
            borderRadius: 10,
            padding: '12px 16px',
            color: toastColors[t.type],
            fontSize: 13,
            fontWeight: 600,
            maxWidth: 320,
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            animation: 'slideIn 0.2s ease',
          }}
        >
          {t.text}
        </div>
      ))}
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:none; } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlanBadge — shows Free or Pro with shimmer effect for Pro
// ---------------------------------------------------------------------------
export function PlanBadge({ plan }: { plan: 'free' | 'pro' }) {
  if (plan === 'pro') {
    return (
      <span className="pro-badge" style={{ fontSize: 12, letterSpacing: 0.5 }}>
        ✦ PRO
      </span>
    );
  }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: `${C.border}60`, color: C.text2, letterSpacing: 0.5,
    }}>
      FREE
    </span>
  );
}

// ---------------------------------------------------------------------------
// UsageMeter — visual meter for free plan usage
// ---------------------------------------------------------------------------
export function UsageMeter({ count, limit, pct }: { count: number; limit: number; pct: number }) {
  const color = pct >= 90 ? C.red : pct >= 70 ? C.amber : C.teal;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.text2 }}>AI parses this month</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{count} / {limit}</span>
      </div>
      <div style={{ background: C.border, borderRadius: 99, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
      {pct >= 80 && (
        <div style={{ fontSize: 11, color: C.amber, marginTop: 6 }}>
          {pct >= 100 ? '🚫 Limit reached — upgrade for unlimited access' : `⚠️ ${Math.round(100 - pct)}% remaining`}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThemePicker — three theme options with live preview swatches
// ---------------------------------------------------------------------------
const THEMES = [
  { id: 'dark-navy',  label: 'Navy',    swatches: ['#0b0f1a', '#131928', '#f59e0b'] },
  { id: 'dark-slate', label: 'Slate',   swatches: ['#0f1117', '#1a1d27', '#e9a23b'] },
  { id: 'dark-green', label: 'Emerald', swatches: ['#080f0e', '#0d1a17', '#34d399'] },
  { id: 'light',      label: 'Light',   swatches: ['#f4f6fb', '#ffffff', '#d97706'] },
] as const;

export function ThemePicker({ current, onChange }: { current: string; onChange: (t: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {THEMES.map(({ id, label, swatches }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="btn-press"
          style={{
            flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
            background: current === id ? `${C.amber}18` : C.bg,
            border: `2px solid ${current === id ? C.amber : C.border}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}
        >
          <div style={{ display: 'flex', gap: 3 }}>
            {swatches.map((s) => (
              <div key={s} style={{ width: 14, height: 14, borderRadius: '50%', background: s, border: '1px solid rgba(255,255,255,0.1)' }} />
            ))}
          </div>
          <span style={{ fontSize: 11, color: current === id ? C.amber : C.text2, fontWeight: current === id ? 700 : 400 }}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// useToast hook — use this instead of alert()
// ---------------------------------------------------------------------------
export function useToast() {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const addToast = React.useCallback((text: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, text, type }]);
    // Auto-dismiss after 4 seconds
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismiss };
}
