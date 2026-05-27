// components/dashboard/AddGroupExpense.tsx
// The split wizard for adding a group expense.
// Three modes: Equal / Custom amounts / Itemized (per-person items)
// Designed as a bottom sheet, consistent with the existing ChillarFlow
// modal patterns in SettleDashboard.tsx.

'use client';

import React, { useState, useMemo } from 'react';
import { C } from '@/constants';
import { Icon } from '@/components/ui/Icon';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Profile {
  id:           string;
  display_name: string | null;
  ghost_name:   string | null;
  is_ghost:     boolean;
}

interface ItemizedEntry {
  userId:   string;
  itemName: string;
  amount:   string;
}

interface Props {
  groupId:   string;
  groupName: string;
  currency:  string;
  members:   Profile[];
  userId:    string;
  fmt:       (n: number) => string;
  onClose:   () => void;
  onAdded:   () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function memberDisplayName(p: Profile): string {
  return p.display_name || p.ghost_name || 'Member';
}

const AVATAR_COLORS = [C.accent, C.green, C.purple, C.blue, C.teal, C.orange];

function MemberAvatar({
  member, size = 36, colorIndex = 0, selected = false, onToggle,
}: {
  member:     Profile;
  size?:      number;
  colorIndex: number;
  selected?:  boolean;
  onToggle?:  () => void;
}) {
  const bg = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        cursor: onToggle ? 'pointer' : 'default',
        opacity: selected === false && onToggle ? 0.35 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: bg, color: '#0a0a0a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 800,
        border: selected && onToggle ? `3px solid ${C.textW}` : `3px solid transparent`,
        boxSizing: 'border-box',
        transition: 'border-color 0.15s',
      }}>
        {memberDisplayName(member).charAt(0).toUpperCase()}
      </div>
      <div style={{
        fontSize: 9, fontWeight: 600, color: selected ? C.textW : C.text3,
        textAlign: 'center', maxWidth: size + 8,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {member.id === undefined ? 'You' : memberDisplayName(member).split(' ')[0]}
      </div>
    </div>
  );
}

const EXPENSE_CATEGORIES = [
  'Dining Out', 'Groceries', 'Travel', 'Entertainment',
  'Alcohol', 'Hosting Day', 'Transport', 'Utilities', 'Miscellaneous',
];

const CAT_EMOJI: Record<string, string> = {
  'Dining Out': '🍽️', 'Groceries': '🛒', 'Travel': '✈️',
  'Entertainment': '🎬', 'Alcohol': '🍻', 'Hosting Day': '🏠',
  'Transport': '🚗', 'Utilities': '⚡', 'Miscellaneous': '📦',
};

// ─── Main component ───────────────────────────────────────────────────────────
export function AddGroupExpense({
  groupId, groupName, currency, members, userId, fmt, onClose, onAdded,
}: Props) {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [step, setStep]             = useState<1 | 2 | 3>(1);
  const [description, setDescription] = useState('');
  const [amount, setAmount]         = useState('');
  const [category, setCategory]     = useState('Miscellaneous');
  const [paidBy, setPaidBy]         = useState(userId);
  const [splitType, setSplitType]   = useState<'equal' | 'custom' | 'itemized'>('equal');
  const [notes, setNotes]           = useState('');

  // Equal split: which members are included
  const [includedMembers, setIncludedMembers] = useState<Set<string>>(
    new Set(members.map((m) => m.id))
  );

  // Custom split: per-member amounts
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(
    Object.fromEntries(members.map((m) => [m.id, '']))
  );

  // Itemized split: list of { userId, itemName, amount }
  const [itemizedEntries, setItemizedEntries] = useState<ItemizedEntry[]>([
    { userId, itemName: '', amount: '' },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const totalAmount = parseFloat(amount) || 0;

  // ── Derived values ─────────────────────────────────────────────────────────
  const includedList = members.filter((m) => includedMembers.has(m.id));

  const equalShare = useMemo(() => {
    if (includedList.length === 0 || totalAmount === 0) return 0;
    return totalAmount / includedList.length;
  }, [includedList.length, totalAmount]);

  const customTotal = useMemo(() =>
    Object.values(customAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [customAmounts]
  );

  const itemizedTotal = useMemo(() =>
    itemizedEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
    [itemizedEntries]
  );

  // ── Input style ────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: '100%', background: C.surface2,
    border: '1.5px solid transparent', borderRadius: 12,
    color: C.textW, fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
    padding: '11px 14px', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  // ── Step validation ────────────────────────────────────────────────────────
  const step1Valid = description.trim().length > 0 && totalAmount > 0;

  const step2Valid = splitType === 'equal'
    ? includedList.length > 0
    : splitType === 'custom'
    ? Math.abs(customTotal - totalAmount) <= 0.02
    : Math.abs(itemizedTotal - totalAmount) <= 0.02;

  // ── Build split payload ────────────────────────────────────────────────────
  const buildSplits = () => {
    if (splitType === 'equal') {
      return includedList.map((m) => ({ userId: m.id }));
    }
    if (splitType === 'custom') {
      return members
        .filter((m) => parseFloat(customAmounts[m.id] || '0') > 0)
        .map((m) => ({ userId: m.id, amount: parseFloat(customAmounts[m.id]) }));
    }
    // itemized
    return itemizedEntries
      .filter((e) => e.userId && e.itemName.trim() && parseFloat(e.amount) > 0)
      .map((e) => ({
        userId:   e.userId,
        itemName: e.itemName.trim(),
        amount:   parseFloat(e.amount),
      }));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      const splits = buildSplits();

      const res = await fetch(`/api/groups/${groupId}/transactions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          paidBy,
          description: description.trim(),
          totalAmount,
          splitType,
          category,
          notes,
          splits,
          createdBy: userId,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onAdded();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Step progress dots ───────────────────────────────────────────────────
  const StepDots = () => (
    <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
      {[1, 2, 3].map((s) => (
        <div key={s} style={{
          height: 4, flex: s === step ? 2 : 1,
          borderRadius: 99,
          background: s <= step ? C.accent : C.border,
          transition: 'all 0.25s',
        }} />
      ))}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface, borderRadius: '24px 24px 0 0',
          padding: '20px 24px 40px',
          maxWidth: 520, width: '100%',
          maxHeight: '92vh', overflowY: 'auto',
          boxShadow: '0 -16px 60px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />

        <StepDots />

        {/* ── STEP 1: What & How Much ──────────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.textW, letterSpacing: '-0.02em', marginBottom: 4 }}>
              What did you spend on?
            </div>

            {/* Amount hero input */}
            <div style={{
              background: C.surface2, borderRadius: 20, padding: '20px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
                Total amount
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: C.text3 }}>₹</span>
                <input
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="0"
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    color: C.textW, fontFamily: 'inherit',
                    fontSize: 48, fontWeight: 900, letterSpacing: '-0.04em',
                    textAlign: 'center', maxWidth: 220, width: '100%',
                  }}
                />
              </div>
            </div>

            {/* Description */}
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this for? (e.g. Dinner at Olive)"
              style={inp}
              onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = 'transparent'; }}
            />

            {/* Category grid */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>
                Category
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    style={{
                      padding: '7px 14px', borderRadius: 99,
                      border: `1px solid ${category === cat ? C.accent : C.border2}`,
                      background: category === cat ? C.accentBg : 'transparent',
                      color: category === cat ? C.accent : C.text2,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {CAT_EMOJI[cat]} {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Paid by */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>
                Paid by
              </div>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                {members.map((m, i) => (
                  <div
                    key={m.id}
                    onClick={() => setPaidBy(m.id)}
                    style={{ cursor: 'pointer', opacity: paidBy === m.id ? 1 : 0.4, transition: 'opacity 0.15s' }}
                  >
                    <MemberAvatar
                      member={m} colorIndex={i} selected={paidBy === m.id} size={44}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '13px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!step1Valid}
                style={{
                  flex: 2, padding: '13px', borderRadius: 99, border: 'none',
                  background: step1Valid ? C.accent : C.surface2,
                  color: step1Valid ? '#0a0a0a' : C.text3,
                  fontSize: 14, fontWeight: 800,
                  cursor: step1Valid ? 'pointer' : 'not-allowed',
                }}
              >
                Split it →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: How to Split ─────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.textW, letterSpacing: '-0.02em' }}>
                How to split?
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.accent }}>
                {fmt(totalAmount)}
              </div>
            </div>

            {/* Split type selector */}
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { id: 'equal',    label: '⚖️ Equal',    desc: 'Split evenly' },
                { id: 'custom',   label: '✏️ Custom',   desc: 'Set amounts' },
                { id: 'itemized', label: '📋 Itemized',  desc: 'Per item' },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSplitType(opt.id)}
                  style={{
                    flex: 1, padding: '10px 6px', borderRadius: 12,
                    border: `1px solid ${splitType === opt.id ? C.accent : C.border2}`,
                    background: splitType === opt.id ? C.accentBg : 'transparent',
                    color: splitType === opt.id ? C.accent : C.text2,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{opt.label.split(' ')[0]}</span>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{opt.label.split(' ').slice(1).join(' ')}</span>
                </button>
              ))}
            </div>

            {/* ── Equal split UI ──────────────────────────────────────────── */}
            {splitType === 'equal' && (
              <div>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 10 }}>
                  Tap to include or exclude members
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {members.map((m, i) => (
                    <MemberAvatar
                      key={m.id}
                      member={m}
                      colorIndex={i}
                      selected={includedMembers.has(m.id)}
                      size={48}
                      onToggle={() => {
                        setIncludedMembers((prev) => {
                          const next = new Set(prev);
                          next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
                {includedList.length > 0 && totalAmount > 0 && (
                  <div style={{
                    marginTop: 14, padding: '12px 16px',
                    background: C.accentBg, borderRadius: 12,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 13, color: C.text2 }}>
                      {includedList.length} people × {fmt(equalShare)} each
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.accent }}>
                      = {fmt(totalAmount)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Custom split UI ─────────────────────────────────────────── */}
            {splitType === 'custom' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {members.map((m, i) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <MemberAvatar member={m} colorIndex={i} size={36} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text1 }}>
                      {memberDisplayName(m)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, background: C.surface2, borderRadius: 10, padding: '8px 12px' }}>
                      <span style={{ fontSize: 13, color: C.text3 }}>₹</span>
                      <input
                        type="number"
                        value={customAmounts[m.id]}
                        onChange={(e) => setCustomAmounts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        placeholder="0"
                        style={{ background: 'transparent', border: 'none', outline: 'none', color: C.textW, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, width: 80, textAlign: 'right' }}
                      />
                    </div>
                  </div>
                ))}
                <div style={{
                  padding: '10px 14px', borderRadius: 12, marginTop: 4,
                  background: Math.abs(customTotal - totalAmount) <= 0.02 ? C.greenBg : `${C.red}15`,
                  border: `1px solid ${Math.abs(customTotal - totalAmount) <= 0.02 ? C.green : C.red}33`,
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 12, color: C.text2 }}>
                    Total assigned: {fmt(customTotal)}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: Math.abs(customTotal - totalAmount) <= 0.02 ? C.green : C.red,
                  }}>
                    {Math.abs(customTotal - totalAmount) <= 0.02
                      ? '✓ Matches'
                      : `${customTotal > totalAmount ? '+' : ''}${fmt(customTotal - totalAmount)} off`}
                  </span>
                </div>
              </div>
            )}

            {/* ── Itemized split UI ────────────────────────────────────────── */}
            {splitType === 'itemized' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: C.text3 }}>
                  Assign specific items to specific people
                </div>
                {itemizedEntries.map((entry, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={entry.userId}
                      onChange={(e) => setItemizedEntries((prev) => prev.map((x, i) => i === idx ? { ...x, userId: e.target.value } : x))}
                      style={{ background: C.surface2, border: 'none', color: C.textW, borderRadius: 10, padding: '9px 10px', fontSize: 12, outline: 'none', cursor: 'pointer', maxWidth: 90 }}
                    >
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{memberDisplayName(m).split(' ')[0]}</option>
                      ))}
                    </select>
                    <input
                      value={entry.itemName}
                      onChange={(e) => setItemizedEntries((prev) => prev.map((x, i) => i === idx ? { ...x, itemName: e.target.value } : x))}
                      placeholder="Item name"
                      style={{ ...inp, flex: 1, padding: '9px 12px' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, background: C.surface2, borderRadius: 10, padding: '9px 10px' }}>
                      <span style={{ fontSize: 12, color: C.text3 }}>₹</span>
                      <input
                        type="number"
                        value={entry.amount}
                        onChange={(e) => setItemizedEntries((prev) => prev.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                        placeholder="0"
                        style={{ background: 'transparent', border: 'none', outline: 'none', color: C.textW, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, width: 60, textAlign: 'right' }}
                      />
                    </div>
                    {itemizedEntries.length > 1 && (
                      <button
                        onClick={() => setItemizedEntries((prev) => prev.filter((_, i) => i !== idx))}
                        style={{ background: 'transparent', border: 'none', color: C.red, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px', flexShrink: 0 }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setItemizedEntries((prev) => [...prev, { userId, itemName: '', amount: '' }])}
                  style={{
                    padding: '9px', borderRadius: 10, border: `1px dashed ${C.border2}`,
                    background: 'transparent', color: C.text3, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  + Add another item
                </button>
                <div style={{
                  padding: '10px 14px', borderRadius: 12,
                  background: Math.abs(itemizedTotal - totalAmount) <= 0.02 ? C.greenBg : `${C.red}15`,
                  border: `1px solid ${Math.abs(itemizedTotal - totalAmount) <= 0.02 ? C.green : C.red}33`,
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 12, color: C.text2 }}>
                    Total: {fmt(itemizedTotal)} of {fmt(totalAmount)}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: Math.abs(itemizedTotal - totalAmount) <= 0.02 ? C.green : C.red,
                  }}>
                    {Math.abs(itemizedTotal - totalAmount) <= 0.02
                      ? '✓ Balanced'
                      : `${fmt(Math.abs(itemizedTotal - totalAmount))} remaining`}
                  </span>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, padding: '13px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                style={{
                  flex: 2, padding: '13px', borderRadius: 99, border: 'none',
                  background: step2Valid ? C.accent : C.surface2,
                  color: step2Valid ? '#0a0a0a' : C.text3,
                  fontSize: 14, fontWeight: 800,
                  cursor: step2Valid ? 'pointer' : 'not-allowed',
                }}
              >
                Review →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Confirm ──────────────────────────────────────────── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.textW, letterSpacing: '-0.02em' }}>
              Confirm & add
            </div>

            {/* Summary card */}
            <div style={{ background: C.surface2, borderRadius: 16, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.textW }}>{description}</div>
                  <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
                    {category} · {splitType} split
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.accent, letterSpacing: '-0.03em' }}>
                  {fmt(totalAmount)}
                </div>
              </div>

              {/* Split preview */}
              {splitType === 'equal' && includedList.map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                  <span style={{ color: C.text2 }}>{memberDisplayName(m)}</span>
                  <span style={{ color: C.textW, fontWeight: 600 }}>{fmt(equalShare)}</span>
                </div>
              ))}

              {splitType === 'custom' && members.filter((m) => parseFloat(customAmounts[m.id] || '0') > 0).map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                  <span style={{ color: C.text2 }}>{memberDisplayName(m)}</span>
                  <span style={{ color: C.textW, fontWeight: 600 }}>{fmt(parseFloat(customAmounts[m.id]))}</span>
                </div>
              ))}

              {splitType === 'itemized' && itemizedEntries.filter((e) => e.itemName && e.amount).map((e, i) => {
                const m = members.find((x) => x.id === e.userId);
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                    <span style={{ color: C.text2 }}>
                      {m ? memberDisplayName(m).split(' ')[0] : '?'} · {e.itemName}
                    </span>
                    <span style={{ color: C.textW, fontWeight: 600 }}>{fmt(parseFloat(e.amount))}</span>
                  </div>
                );
              })}
            </div>

            {/* Optional note */}
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note (optional)"
              style={inp}
            />

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 12, fontSize: 13,
                background: `${C.red}15`, border: `1px solid ${C.red}44`, color: C.red,
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(2)} style={{ flex: 1, padding: '13px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  flex: 2, padding: '13px', borderRadius: 99, border: 'none',
                  background: loading ? C.surface2 : C.green,
                  color: loading ? C.text3 : '#0a0a0a',
                  fontSize: 14, fontWeight: 800,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {loading ? 'Adding…' : `Add to ${groupName}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
