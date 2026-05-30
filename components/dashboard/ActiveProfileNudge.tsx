// components/dashboard/ActiveProfileNudge.tsx
// 
// Drop this component in Home.tsx (or anywhere visible after first login).
// It shows a one-time yellow banner when profiles.display_name is still
// the system role string ('Partner A' / 'Partner B') rather than a real name —
// which happens when a joint/separate household is set up but the second
// partner hasn't switched their device profile yet.
//
// Usage in Home.tsx:
//   import { ActiveProfileNudge } from '@/components/dashboard/ActiveProfileNudge';
//   // Inside Home() JSX, before the hero card:
//   <ActiveProfileNudge currentUserRole={data.currentUserRole} settings={data.settings} onNavigate={onNavigate} />

'use client';
import React, { useState } from 'react';
import { C } from '@/constants';
import { Icon } from '@/components/ui/Icon';

const ROLE_STRINGS  = new Set(['Partner A', 'Partner B', 'partner_a', 'partner_b']);
const DISMISSED_KEY = 'cf_profile_nudge_dismissed';

interface Props {
  currentUserRole: string;
  settings: { householdMode?: string; partnerAName: string; partnerBName: string };
  onNavigate: (view: string) => void;
}

export function ActiveProfileNudge({ currentUserRole, settings, onNavigate }: Props) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(DISMISSED_KEY) === '1';
  });

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  const isMultiPartner    = settings.householdMode === 'joint' || settings.householdMode === 'separate';
  const nameIsPlaceholder = ROLE_STRINGS.has(currentUserRole?.trim() ?? '');

  if (!isMultiPartner || !nameIsPlaceholder || dismissed) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '12px 14px',
      borderRadius: 14,
      background: `${C.amber}18`,
      border: `1px solid ${C.amber}55`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: `${C.amber}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
      }}>
        <Icon name="user" size={16} color={C.amber} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textW, marginBottom: 3 }}>
          Set your active device profile
        </div>
        <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
          This is a shared household. Tell us which partner is using this device so
          expenses are tagged correctly.
        </div>
        <button
          onClick={() => { onNavigate('settings'); dismiss(); }}
          style={{
            marginTop: 8, padding: '6px 14px', borderRadius: 99, border: 'none',
            background: C.amber, color: '#0a0a0a',
            fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Go to Settings →
        </button>
      </div>

      <button
        onClick={dismiss}
        style={{
          background: 'transparent', border: 'none', color: C.text3,
          cursor: 'pointer', fontSize: 18, lineHeight: 1,
          padding: '0 2px', flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
