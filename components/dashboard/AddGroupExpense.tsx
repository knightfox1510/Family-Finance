// components/dashboard/AddGroupExpense.tsx
// Fixed itemized split: item-first then assign to one or more members
// Fixed auth: sends Bearer token for regular users, x-ghost-token for guests
// Added: OCR Receipt scanning feature

'use client';

import React, { useState, useMemo, useRef } from 'react';
import { C } from '@/constants';
import { Icon } from '@/components/ui/Icon';

interface Profile {
  id:           string;
  display_name: string | null;
  ghost_name:   string | null;
  is_ghost:     boolean;
}

// For itemized: one item can be shared by multiple members
interface ItemizedEntry {
  id:         string;           // local key
  itemName:   string;
  totalAmount: string;
  // split: 'equal' splits among selected members, 'custom' lets you set per-member
  splitMode:  'equal' | 'custom';
  memberIds:  string[];         // which members share this item
  customAmounts: Record<string, string>; // userId → amount (for custom mode)
}

interface Props {
  groupId:     string;
  groupName:   string;
  currency:    string;
  members:     Profile[];
  userId:      string;
  ghostToken?: string;
  fmt:         (n: number) => string;
  onClose:     () => void;
  onAdded:     () => void;
}

const ROLE_STRINGS = new Set(['Partner A', 'Partner B', 'partner_a', 'partner_b']);

function memberDisplayName(p: Profile): string {
  const dn = p.display_name;
  if (dn && !ROLE_STRINGS.has(dn)) return dn;
  return p.ghost_name || dn || 'Member';
}

const AVATAR_COLORS = [C.accent, C.green, C.purple, C.blue, C.teal, C.orange];

function MemberChip({ member, colorIndex, selected, onToggle }: {
  member:     Profile;
  colorIndex: number;
  selected:   boolean;
  onToggle:   () => void;
}) {
  const bg   = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const name = memberDisplayName(member).split(' ')[0];
  return (
    <div onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 12px 5px 6px',
      borderRadius: 99,
      border: `1px solid ${selected ? bg : C.border2}`,
      background: selected ? bg + '22' : 'transparent',
      cursor: 'pointer', transition: 'all 0.15s',
      opacity: selected ? 1 : 0.5,
    }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: bg, color: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
        {name.charAt(0).toUpperCase()}
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: selected ? C.textW : C.text2 }}>{name}</span>
    </div>
  );
}

function MemberAvatar({ member, size = 36, colorIndex = 0, selected = false, onToggle }: {
  member:     Profile;
  size?:      number;
  colorIndex: number;
  selected?:  boolean;
  onToggle?:  () => void;
}) {
  const bg = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  return (
    <div onClick={onToggle} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: onToggle ? 'pointer' : 'default', opacity: selected === false && onToggle ? 0.35 : 1, transition: 'opacity 0.15s' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 800, border: selected && onToggle ? `3px solid ${C.textW}` : `3px solid transparent`, boxSizing: 'border-box', transition: 'border-color 0.15s' }}>
        {memberDisplayName(member).charAt(0).toUpperCase()}
      </div>
      <div style={{ fontSize: 9, fontWeight: 600, color: selected ? C.textW : C.text3, textAlign: 'center', maxWidth: size + 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {memberDisplayName(member).split(' ')[0]}
      </div>
    </div>
  );
}

const EXPENSE_CATEGORIES = ['Dining Out', 'Groceries', 'Travel', 'Entertainment', 'Alcohol', 'Hosting Day', 'Transport', 'Utilities', 'Miscellaneous'];
const CAT_EMOJI: Record<string, string> = { 'Dining Out': '🍽️', 'Groceries': '🛒', 'Travel': '✈️', 'Entertainment': '🎬', 'Alcohol': '🍻', 'Hosting Day': '🏠', 'Transport': '🚗', 'Utilities': '⚡', 'Miscellaneous': '📦' };

let itemCounter = 0;
function newItemId() { return `item_${++itemCounter}`; }

function newItem(allMemberIds: string[]): ItemizedEntry {
  return { id: newItemId(), itemName: '', totalAmount: '', splitMode: 'equal', memberIds: allMemberIds, customAmounts: {} };
}

export function AddGroupExpense({ groupId, groupName, currency, members, userId, ghostToken, fmt, onClose, onAdded }: Props) {
  const [step, setStep]               = useState<1 | 2 | 3>(1);
  const [description, setDescription] = useState('');
  const [amount, setAmount]           = useState('');
  const [category, setCategory]       = useState('Miscellaneous');
  const [paidBy, setPaidBy]           = useState(userId);
  const [splitType, setSplitType]     = useState<'equal' | 'custom' | 'itemized'>('equal');
  const [notes, setNotes]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // NEW: State and ref for Receipt Scanning
  const [isScanning, setIsScanning]   = useState(false);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  const allMemberIds = members.map((m) => m.id);

  // Equal split state
  const [includedMembers, setIncludedMembers] = useState<Set<string>>(new Set(allMemberIds));

  // Custom split state
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(Object.fromEntries(members.map((m) => [m.id, ''])));

  // Itemized split state — item first, then assign members
  const [items, setItems] = useState<ItemizedEntry[]>([newItem(allMemberIds)]);

  const totalAmount   = parseFloat(amount) || 0;
  const includedList  = members.filter((m) => includedMembers.has(m.id));
  const equalShare    = useMemo(() => includedList.length === 0 || totalAmount === 0 ? 0 : totalAmount / includedList.length, [includedList.length, totalAmount]);
  const customTotal   = useMemo(() => Object.values(customAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0), [customAmounts]);

  // Itemized: compute total across all items
  const itemizedTotal = useMemo(() => items.reduce((s, item) => s + (parseFloat(item.totalAmount) || 0), 0), [items]);

  // For each item, compute per-member amounts
  const itemSplitAmounts = (item: ItemizedEntry): Record<string, number> => {
    const itemTotal = parseFloat(item.totalAmount) || 0;
    if (item.memberIds.length === 0) return {};
    if (item.splitMode === 'equal') {
      const perPerson = itemTotal / item.memberIds.length;
      return Object.fromEntries(item.memberIds.map((id) => [id, perPerson]));
    } else {
      return Object.fromEntries(
        item.memberIds.map((id) => [id, parseFloat(item.customAmounts[id] || '0') || 0])
      );
    }
  };

  const itemCustomTotal = (item: ItemizedEntry) =>
    Object.values(item.customAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const step1Valid = description.trim().length > 0 && totalAmount > 0;
  const step2Valid = (() => {
    if (splitType === 'equal')    return includedList.length > 0;
    if (splitType === 'custom')   return Math.abs(customTotal - totalAmount) <= 0.02;
    if (splitType === 'itemized') {
      if (Math.abs(itemizedTotal - totalAmount) > 0.02) return false;
      return items.every((item) => {
        if (!item.itemName.trim() || !item.totalAmount) return false;
        if (item.memberIds.length === 0) return false;
        if (item.splitMode === 'custom') {
          const ct = itemCustomTotal(item);
          const it = parseFloat(item.totalAmount) || 0;
          return Math.abs(ct - it) <= 0.02;
        }
        return true;
      });
    }
    return false;
  })();

  // NEW: Receipt Upload Handler
  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setError(null);
    try {
      // 1. Upload to Supabase Storage
      const { supabase } = await import('@/lib/supabaseClient');
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `receipts/${groupId}/${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from('receipts')
        .upload(filePath, file);

      if (uploadErr) throw new Error('Failed to upload receipt image.');

      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath);

      // 2. Call the new OCR API route
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ghostToken) {
        headers['x-ghost-token'] = ghostToken;
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/groups/${groupId}/ocr`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageUrl: publicUrl })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process receipt.');

      // 3. Pre-populate the form and jump to Step 2
      if (data.items && data.items.length > 0) {
        const newItems = data.items.map((item: any) => ({
          id: newItemId(),
          itemName: item.name,
          totalAmount: String(item.price),
          splitMode: 'equal',
          memberIds: [], // Users will tap to assign members in Step 2
          customAmounts: {}
        }));
        
        setItems(newItems);
        setAmount(String(data.totalAmount));
        if (!description) setDescription('Receipt Expense');
        setSplitType('itemized');
        setStep(2); // Jump directly to the item assignment step
      } else {
        throw new Error('No items found on the receipt.');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong while scanning.');
    } finally {
      setIsScanning(false);
      // Reset the input so the same file can be selected again if it failed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Build splits payload for the API
  const buildSplits = () => {
    if (splitType === 'equal') return includedList.map((m) => ({ userId: m.id }));
    if (splitType === 'custom') {
      return members.filter((m) => parseFloat(customAmounts[m.id] || '0') > 0)
        .map((m) => ({ userId: m.id, amount: parseFloat(customAmounts[m.id]) }));
    }
    // Itemized: flatten items into per-member splits with item name
    const splitMap: Record<string, { amount: number; itemName: string }[]> = {};
    for (const item of items) {
      const amounts = itemSplitAmounts(item);
      for (const [memberId, amt] of Object.entries(amounts)) {
        if (amt <= 0) continue;
        if (!splitMap[memberId]) splitMap[memberId] = [];
        splitMap[memberId].push({ amount: amt, itemName: item.itemName.trim() });
      }
    }
    // Merge per member: if one member has multiple items, combine them
    return Object.entries(splitMap).map(([userId, entries]) => ({
      userId,
      amount:   entries.reduce((s, e) => s + e.amount, 0),
      itemName: entries.map((e) => e.itemName).join(', '),
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const splits  = buildSplits();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ghostToken) {
        headers['x-ghost-token'] = ghostToken;
      } else {
        try {
          const { supabase } = await import('@/lib/supabaseClient');
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        } catch {}
      }
      const res = await fetch(`/api/groups/${groupId}/transactions`, {
        method: 'POST', headers,
        body: JSON.stringify({ paidBy, description: description.trim(), totalAmount, splitType, category, notes, splits, createdBy: userId }),
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

  const inp: React.CSSProperties = { width: '100%', background: C.surface2, border: '1.5px solid transparent', borderRadius: 12, color: C.textW, fontFamily: 'inherit', fontSize: 14, fontWeight: 500, padding: '11px 14px', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' };

  const StepDots = () => (
    <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
      {[1, 2, 3].map((s) => (<div key={s} style={{ height: 4, flex: s === step ? 2 : 1, borderRadius: 99, background: s <= step ? C.accent : C.border, transition: 'all 0.25s' }} />))}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '20px 24px 40px', maxWidth: 520, width: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -16px 60px rgba(0,0,0,0.6)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />
        <StepDots />

        {/* ── STEP 1 ──────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.textW, letterSpacing: '-0.02em', marginBottom: 4 }}>What did you spend on?</div>
            <div style={{ background: C.surface2, borderRadius: 20, padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>Total amount</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: C.text3 }}>₹</span>
                <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0"
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: C.textW, fontFamily: 'inherit', fontSize: 48, fontWeight: 900, letterSpacing: '-0.04em', textAlign: 'center', maxWidth: 220, width: '100%' }} />
              </div>

              {/* NEW: OCR Upload Button */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleReceiptUpload} style={{ display: 'none' }} />
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  disabled={isScanning} 
                  style={{ padding: '8px 16px', borderRadius: 99, border: `1px solid ${C.accent}`, background: `${C.accent}15`, color: C.accent, fontSize: 13, fontWeight: 700, cursor: isScanning ? 'not-allowed' : 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}
                >
                  {isScanning ? '⏳ Scanning receipt...' : '📸 Scan Receipt'}
                </button>
              </div>
            </div>

            {/* NEW: Error Display in Step 1 */}
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 12, fontSize: 13, background: `${C.red}15`, border: `1px solid ${C.red}44`, color: C.red }}>{error}</div>
            )}

            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this for? (e.g. Dinner at Olive)" style={inp}
              onFocus={(e) => { e.currentTarget.style.borderColor = C.accent; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = 'transparent'; }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>Category</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <button key={cat} onClick={() => setCategory(cat)} style={{ padding: '7px 14px', borderRadius: 99, border: `1px solid ${category === cat ? C.accent : C.border2}`, background: category === cat ? C.accentBg : 'transparent', color: category === cat ? C.accent : C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {CAT_EMOJI[cat]} {cat}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>Paid by</div>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                {members.map((m, i) => (
                  <div key={m.id} onClick={() => setPaidBy(m.id)} style={{ cursor: 'pointer', opacity: paidBy === m.id ? 1 : 0.4, transition: 'opacity 0.15s' }}>
                    <MemberAvatar member={m} colorIndex={i} selected={paidBy === m.id} size={44} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '13px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => setStep(2)} disabled={!step1Valid} style={{ flex: 2, padding: '13px', borderRadius: 99, border: 'none', background: step1Valid ? C.accent : C.surface2, color: step1Valid ? '#0a0a0a' : C.text3, fontSize: 14, fontWeight: 800, cursor: step1Valid ? 'pointer' : 'not-allowed' }}>
                Split it →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2 ──────────────────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.textW, letterSpacing: '-0.02em' }}>How to split?</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.accent }}>{fmt(totalAmount)}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { id: 'equal'    as const, label: '⚖️ Equal'    },
                { id: 'custom'   as const, label: '✏️ Custom'   },
                { id: 'itemized' as const, label: '📋 Itemized' },
              ]).map((opt) => (
                <button key={opt.id} onClick={() => setSplitType(opt.id)} style={{ flex: 1, padding: '10px 6px', borderRadius: 12, border: `1px solid ${splitType === opt.id ? C.accent : C.border2}`, background: splitType === opt.id ? C.accentBg : 'transparent', color: splitType === opt.id ? C.accent : C.text2, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Equal */}
            {splitType === 'equal' && (
              <div>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 10 }}>Tap to include or exclude members</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {members.map((m, i) => (
                    <MemberAvatar key={m.id} member={m} colorIndex={i} selected={includedMembers.has(m.id)} size={48}
                      onToggle={() => setIncludedMembers((prev) => { const next = new Set(prev); next.has(m.id) ? next.delete(m.id) : next.add(m.id); return next; })} />
                  ))}
                </div>
                {includedList.length > 0 && totalAmount > 0 && (
                  <div style={{ marginTop: 14, padding: '12px 16px', background: C.accentBg, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: C.text2 }}>{includedList.length} people × {fmt(equalShare)} each</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.accent }}>= {fmt(totalAmount)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Custom */}
            {splitType === 'custom' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {members.map((m, i) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <MemberAvatar member={m} colorIndex={i} size={36} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text1 }}>{memberDisplayName(m)}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, background: C.surface2, borderRadius: 10, padding: '8px 12px' }}>
                      <span style={{ fontSize: 13, color: C.text3 }}>₹</span>
                      <input type="number" value={customAmounts[m.id]} onChange={(e) => setCustomAmounts((prev) => ({ ...prev, [m.id]: e.target.value }))} placeholder="0"
                        style={{ background: 'transparent', border: 'none', outline: 'none', color: C.textW, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, width: 80, textAlign: 'right' }} />
                    </div>
                  </div>
                ))}
                <div style={{ padding: '10px 14px', borderRadius: 12, background: Math.abs(customTotal - totalAmount) <= 0.02 ? C.greenBg : `${C.red}15`, border: `1px solid ${Math.abs(customTotal - totalAmount) <= 0.02 ? C.green : C.red}33`, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: C.text2 }}>Total: {fmt(customTotal)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: Math.abs(customTotal - totalAmount) <= 0.02 ? C.green : C.red }}>{Math.abs(customTotal - totalAmount) <= 0.02 ? '✓ Matches' : `${fmt(Math.abs(customTotal - totalAmount))} off`}</span>
                </div>
              </div>
            )}

            {/* Itemized — item first, then members */}
            {splitType === 'itemized' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, color: C.text3 }}>Add each item, then choose who shares it</div>

                {items.map((item, idx) => {
                  const itemTotal   = parseFloat(item.totalAmount) || 0;
                  const customSum   = itemCustomTotal(item);
                  const customOk    = item.splitMode !== 'custom' || Math.abs(customSum - itemTotal) <= 0.02;
                  const perPerson   = item.memberIds.length > 0 ? itemTotal / item.memberIds.length : 0;

                  return (
                    <div key={item.id} style={{ background: C.surface2, borderRadius: 14, padding: '14px' }}>
                      {/* Item name + amount row */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                        <input
                          value={item.itemName}
                          onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, itemName: e.target.value } : x))}
                          placeholder={`Item ${idx + 1} name`}
                          style={{ ...inp, flex: 1, padding: '9px 12px', background: C.surface }}
                        />
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, background: C.surface, borderRadius: 10, padding: '9px 12px', flexShrink: 0 }}>
                          <span style={{ fontSize: 12, color: C.text3 }}>₹</span>
                          <input type="number" value={item.totalAmount}
                            onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, totalAmount: e.target.value } : x))}
                            placeholder="0"
                            style={{ background: 'transparent', border: 'none', outline: 'none', color: C.textW, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, width: 70, textAlign: 'right' }} />
                        </div>
                        {items.length > 1 && (
                          <button onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} style={{ background: 'transparent', border: 'none', color: C.red, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px', flexShrink: 0 }}>×</button>
                        )}
                      </div>

                      {/* Who shares this item */}
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>Who shares this?</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {members.map((m, mi) => (
                          <MemberChip key={m.id} member={m} colorIndex={mi}
                            selected={item.memberIds.includes(m.id)}
                            onToggle={() => setItems((prev) => prev.map((x, i) => {
                              if (i !== idx) return x;
                              const ids = x.memberIds.includes(m.id)
                                ? x.memberIds.filter((id) => id !== m.id)
                                : [...x.memberIds, m.id];
                              return { ...x, memberIds: ids };
                            }))}
                          />
                        ))}
                      </div>

                      {/* Split mode for this item */}
                      {item.memberIds.length > 1 && (
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                          {(['equal', 'custom'] as const).map((mode) => (
                            <button key={mode} onClick={() => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, splitMode: mode } : x))}
                              style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${item.splitMode === mode ? C.accent : C.border2}`, background: item.splitMode === mode ? C.accentBg : 'transparent', color: item.splitMode === mode ? C.accent : C.text2, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                              {mode === 'equal' ? '⚖️ Split equally' : '✏️ Custom amounts'}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Per-member breakdown */}
                      {item.memberIds.length > 0 && itemTotal > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {item.memberIds.map((memberId) => {
                            const m = members.find((x) => x.id === memberId);
                            if (!m) return null;
                            return (
                              <div key={memberId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, color: C.text2, flex: 1 }}>{memberDisplayName(m)}</span>
                                {item.splitMode === 'equal' ? (
                                  <span style={{ fontSize: 12, fontWeight: 700, color: C.textW }}>{fmt(perPerson)}</span>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, background: C.surface, borderRadius: 8, padding: '5px 10px' }}>
                                    <span style={{ fontSize: 11, color: C.text3 }}>₹</span>
                                    <input type="number" value={item.customAmounts[memberId] ?? ''}
                                      onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, customAmounts: { ...x.customAmounts, [memberId]: e.target.value } } : x))}
                                      placeholder="0"
                                      style={{ background: 'transparent', border: 'none', outline: 'none', color: C.textW, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, width: 60, textAlign: 'right' }} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {item.splitMode === 'custom' && (
                            <div style={{ fontSize: 11, color: customOk ? C.green : C.red, marginTop: 4, fontWeight: 600 }}>
                              {customOk ? `✓ ${fmt(itemTotal)} balanced` : `${fmt(Math.abs(customSum - itemTotal))} ${customSum > itemTotal ? 'over' : 'remaining'}`}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <button onClick={() => setItems((prev) => [...prev, newItem(allMemberIds)])} style={{ padding: '10px', borderRadius: 12, border: `1px dashed ${C.border2}`, background: 'transparent', color: C.text3, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  + Add another item
                </button>

                {/* Total check */}
                <div style={{ padding: '10px 14px', borderRadius: 12, background: Math.abs(itemizedTotal - totalAmount) <= 0.02 ? C.greenBg : `${C.red}15`, border: `1px solid ${Math.abs(itemizedTotal - totalAmount) <= 0.02 ? C.green : C.red}33`, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: C.text2 }}>Items total: {fmt(itemizedTotal)} of {fmt(totalAmount)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: Math.abs(itemizedTotal - totalAmount) <= 0.02 ? C.green : C.red }}>
                    {Math.abs(itemizedTotal - totalAmount) <= 0.02 ? '✓ Balanced' : `${fmt(Math.abs(itemizedTotal - totalAmount))} remaining`}
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, padding: '13px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Back</button>
              <button onClick={() => setStep(3)} disabled={!step2Valid} style={{ flex: 2, padding: '13px', borderRadius: 99, border: 'none', background: step2Valid ? C.accent : C.surface2, color: step2Valid ? '#0a0a0a' : C.text3, fontSize: 14, fontWeight: 800, cursor: step2Valid ? 'pointer' : 'not-allowed' }}>
                Review →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Confirm ─────────────────────────────────────────────── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.textW, letterSpacing: '-0.02em' }}>Confirm & add</div>
            <div style={{ background: C.surface2, borderRadius: 16, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.textW }}>{description}</div>
                  <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{category} · {splitType} split</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.accent, letterSpacing: '-0.03em' }}>{fmt(totalAmount)}</div>
              </div>

              {/* Confirm: show per-member totals */}
              {(() => {
                const splits = buildSplits() as { userId: string; amount?: number; itemName?: string }[];
                return splits.map((s) => {
                  const m = members.find((x) => x.id === s.userId);
                  return (
                    <div key={s.userId} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                      <span style={{ color: C.text2 }}>{m ? memberDisplayName(m) : s.userId}</span>
                      <span style={{ color: C.textW, fontWeight: 600 }}>{fmt(s.amount ?? equalShare)}</span>
                    </div>
                  );
                });
              })()}
            </div>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note (optional)" style={inp} />
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 12, fontSize: 13, background: `${C.red}15`, border: `1px solid ${C.red}44`, color: C.red }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(2)} style={{ flex: 1, padding: '13px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Back</button>
              <button onClick={handleSubmit} disabled={loading} style={{ flex: 2, padding: '13px', borderRadius: 99, border: 'none', background: loading ? C.surface2 : C.green, color: loading ? C.text3 : '#0a0a0a', fontSize: 14, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                {loading ? 'Adding…' : `Add to ${groupName}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
