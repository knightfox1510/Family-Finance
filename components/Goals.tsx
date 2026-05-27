'use client';
import React, { useState } from 'react';
import type { AppData } from '@/types';
import { Inp, Label } from '@/components/ui';
import { C } from '@/constants';

const GOAL_COLORS = [C.amber, C.green, C.blue, C.purple, C.red, C.teal, '#f97316', '#ec4899'];
const HORIZONS = ['Short-Term', 'Mid-Term', 'Long-Term'] as const;

interface Props {
  data: AppData;
  onUpdate: (id: string, updated: any) => void;
  onAdd: (goal: any) => void;
  onDelete: (id: string) => void;
  fmt: (n: number) => string;
}

interface GoalFormState {
  name: string; target: string | number; partnerATarget: string | number;
  partnerBTarget: string | number; partnerACurrent: string | number;
  partnerBCurrent: string | number; targetDate: string; strategy: string;
  icon: string; color: string; [key: string]: any;
}

const BLANK_GOAL: GoalFormState = {
  name: '', target: '', partnerATarget: '', partnerBTarget: '',
  partnerACurrent: '', partnerBCurrent: '', targetDate: '',
  strategy: 'Short-Term', icon: '🎯', color: C.amber,
};

const inpStyle: React.CSSProperties = {
  width: '100%', background: C.surface2, border: `1.5px solid transparent`,
  color: C.textW, fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
  padding: '11px 14px', outline: 'none', borderRadius: 12, boxSizing: 'border-box',
};

function SmallLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 5 }}>{children}</div>;
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {GOAL_COLORS.map((c) => (
        <div key={c} onClick={() => onChange(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: value === c ? '3px solid #fff' : '3px solid transparent', transition: 'border 0.15s' }} />
      ))}
    </div>
  );
}

function StrategySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inpStyle, cursor: 'pointer' }}>
      {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}

export function Goals({ data, onUpdate, onAdd, onDelete, fmt }: Props) {
  const nameA      = data.settings.partnerAName;
  const nameB      = data.settings.partnerBName;
  const mode       = data.settings.householdMode ?? 'joint';
  const isSolo     = mode === 'solo';
  const hasPartner = mode !== 'solo';

  const [editing, setEditing]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState<GoalFormState>(BLANK_GOAL);
  const [adding, setAdding]     = useState(false);
  const [newGoal, setNewGoal]   = useState<GoalFormState>(BLANK_GOAL);

  const ongoingGoals   = data.goals.filter((g) => Number(g.current) < Number(g.target));
  const completedGoals = data.goals.filter((g) => Number(g.current) >= Number(g.target));
  const totalSaved     = data.goals.reduce((s, g) => s + Number(g.current || 0), 0);

  const startEditing = (g: any) => { setEditing(g.id); setEditForm({ ...g, targetDate: g.targetDate ?? '' }); };

  const syncNewGoalTotal = (update: Partial<GoalFormState>) => {
    setNewGoal((prev) => {
      const next = { ...prev, ...update };
      const computed = Number(next.partnerATarget || 0) + Number(next.partnerBTarget || 0);
      return { ...next, target: computed > 0 ? String(computed) : next.target };
    });
  };
  const syncEditFormTotal = (update: Partial<GoalFormState>) => {
    setEditForm((prev) => {
      const next = { ...prev, ...update };
      return { ...next, target: Number(next.partnerATarget || 0) + Number(next.partnerBTarget || 0) };
    });
  };

  const formStyle: React.CSSProperties = {
    background: C.surface, borderRadius: 20, padding: '18px 18px 20px',
    boxShadow: C.shadowMd, display: 'flex', flexDirection: 'column', gap: 12,
  };

  const AddForm = () => (
    <div style={formStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, marginBottom: 2 }}>New Savings Milestone</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
        <div><SmallLabel>Goal Name</SmallLabel><input style={inpStyle} value={newGoal.name} placeholder="e.g. Emergency Fund" onChange={(e) => setNewGoal((g) => ({ ...g, name: e.target.value }))} /></div>
        <div><SmallLabel>Strategy</SmallLabel><StrategySelect value={newGoal.strategy} onChange={(v) => setNewGoal((g) => ({ ...g, strategy: v }))} /></div>
        <div><SmallLabel>Icon</SmallLabel><input style={inpStyle} value={newGoal.icon} onChange={(e) => setNewGoal((g) => ({ ...g, icon: e.target.value }))} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isSolo ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10 }}>
        <div><SmallLabel>{isSolo ? 'Target Amount (₹)' : 'Total Target (₹)'}</SmallLabel>
          <input type="number" style={inpStyle} placeholder={isSolo ? '' : 'Auto-computed'} value={newGoal.target}
            onChange={(e) => isSolo ? setNewGoal((g) => ({ ...g, target: e.target.value, partnerATarget: e.target.value })) : setNewGoal((g) => ({ ...g, target: e.target.value }))} />
        </div>
        {!isSolo && <div><SmallLabel>{nameA}'s Share (₹)</SmallLabel><input type="number" style={inpStyle} value={newGoal.partnerATarget} onChange={(e) => syncNewGoalTotal({ partnerATarget: e.target.value })} /></div>}
        {hasPartner && <div><SmallLabel>{nameB}'s Share (₹)</SmallLabel><input type="number" style={inpStyle} value={newGoal.partnerBTarget} onChange={(e) => syncNewGoalTotal({ partnerBTarget: e.target.value })} /></div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isSolo ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10 }}>
        <div><SmallLabel>Target Date</SmallLabel><input type="date" style={inpStyle} value={newGoal.targetDate} onChange={(e) => setNewGoal((g) => ({ ...g, targetDate: e.target.value }))} /></div>
        <div><SmallLabel>{isSolo ? 'Amount Saved (₹)' : `${nameA}'s Saved (₹)`}</SmallLabel><input type="number" style={inpStyle} value={newGoal.partnerACurrent} onChange={(e) => setNewGoal((g) => ({ ...g, partnerACurrent: e.target.value, ...(isSolo ? { partnerBCurrent: 0 } : {}) }))} /></div>
        {hasPartner && <div><SmallLabel>{nameB}'s Saved (₹)</SmallLabel><input type="number" style={inpStyle} value={newGoal.partnerBCurrent} onChange={(e) => setNewGoal((g) => ({ ...g, partnerBCurrent: e.target.value }))} /></div>}
      </div>
      <div><SmallLabel>Colour</SmallLabel><ColorPicker value={newGoal.color} onChange={(c) => setNewGoal((g) => ({ ...g, color: c }))} /></div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={() => { onAdd(newGoal); setNewGoal(BLANK_GOAL); setAdding(false); }}
          style={{ flex: 1, padding: '12px', borderRadius: 999, border: 'none', background: C.accent, color: '#0a0a0a', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
          Save Goal
        </button>
        <button onClick={() => setAdding(false)}
          style={{ flex: 1, padding: '12px', borderRadius: 999, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
      </div>
    </div>
  );

  const EditCard = ({ id }: { id: string }) => (
    <div style={{ ...formStyle, border: `1px solid ${C.teal}44` }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>Edit Goal</div>
      <div><SmallLabel>Goal Title</SmallLabel><input style={inpStyle} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: isSolo ? '1fr' : '1fr 1fr', gap: 8 }}>
        <div><SmallLabel>{isSolo ? 'Target Amount (₹)' : `${nameA}'s Target (₹)`}</SmallLabel>
          <input type="number" style={inpStyle} value={editForm.partnerATarget} onChange={(e) => isSolo ? setEditForm((f) => ({ ...f, partnerATarget: e.target.value, target: Number(e.target.value) })) : syncEditFormTotal({ partnerATarget: e.target.value })} />
        </div>
        {hasPartner && <div><SmallLabel>{nameB}'s Target (₹)</SmallLabel><input type="number" style={inpStyle} value={editForm.partnerBTarget} onChange={(e) => syncEditFormTotal({ partnerBTarget: e.target.value })} /></div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isSolo ? '1fr' : '1fr 1fr', gap: 8 }}>
        <div><SmallLabel>{isSolo ? 'Amount Saved (₹)' : `${nameA}'s Saved (₹)`}</SmallLabel><input type="number" style={inpStyle} value={editForm.partnerACurrent} onChange={(e) => setEditForm((f) => ({ ...f, partnerACurrent: e.target.value, ...(isSolo ? { partnerBCurrent: 0 } : {}) }))} /></div>
        {hasPartner && <div><SmallLabel>{nameB}'s Saved (₹)</SmallLabel><input type="number" style={inpStyle} value={editForm.partnerBCurrent} onChange={(e) => setEditForm((f) => ({ ...f, partnerBCurrent: e.target.value }))} /></div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><SmallLabel>Target Date</SmallLabel><input type="date" style={inpStyle} value={editForm.targetDate} onChange={(e) => setEditForm((f) => ({ ...f, targetDate: e.target.value }))} /></div>
        <div><SmallLabel>Strategy</SmallLabel><StrategySelect value={editForm.strategy} onChange={(v) => setEditForm((f) => ({ ...f, strategy: v }))} /></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { onUpdate(id, editForm); setEditing(null); }}
            style={{ padding: '10px 20px', borderRadius: 999, border: 'none', background: C.accent, color: '#0a0a0a', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Update</button>
          <button onClick={() => setEditing(null)}
            style={{ padding: '10px 20px', borderRadius: 999, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        </div>
        <button onClick={() => { if (confirm('Permanently delete this goal?')) { onDelete(id); setEditing(null); } }}
          style={{ padding: '10px 16px', borderRadius: 999, border: `1px solid ${C.red}44`, background: 'transparent', color: C.red, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Delete
        </button>
      </div>
    </div>
  );

  const GoalCard = ({ g }: { g: any }) => {
    const pct  = g.target > 0 ? (g.current / g.target) * 100 : 0;
    const pctA = g.partnerATarget > 0 ? (g.partnerACurrent / g.partnerATarget) * 100 : 0;
    const pctB = g.partnerBTarget > 0 ? (g.partnerBCurrent / g.partnerBTarget) * 100 : 0;
    const statusColor = g.paceStatus === 'Critical' ? C.red : g.paceStatus === 'Needs Attention' ? C.amber : C.teal;
    const goalColor = g.color || C.amber;
    const deadline = g.targetDate ? new Date(g.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'Flexible';

    return (
      <div style={{ background: C.surface, borderRadius: 20, padding: '18px 18px', boxShadow: C.shadowSm }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: `${goalColor}22`, color: goalColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
            {g.icon || '🎯'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.textW, letterSpacing: '-0.01em' }}>{g.name}</div>
            <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
              by {deadline}
              {g.paceStatus && <span style={{ marginLeft: 6, color: statusColor, fontWeight: 600 }}>· {g.paceStatus}</span>}
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: goalColor }}>{Math.round(pct)}%</div>
        </div>

        {/* Amounts */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.textW }}>{fmt(g.current)}</span>
          <span style={{ fontSize: 12, color: C.text3 }}>of {fmt(g.target)}</span>
        </div>
        <div style={{ height: 6, background: C.surface2, borderRadius: 99, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: goalColor, borderRadius: 99, transition: 'width .5s' }} />
        </div>

        {/* Partner breakdown */}
        {hasPartner && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {[
              { name: nameA, cur: g.partnerACurrent, tgt: g.partnerATarget, pct: pctA, color: C.purple },
              { name: nameB, cur: g.partnerBCurrent, tgt: g.partnerBTarget, pct: pctB, color: C.blue },
            ].map((p) => (
              <div key={p.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: C.text3 }}>{fmt(p.cur)} / {fmt(p.tgt)}</span>
                </div>
                <div style={{ height: 3, background: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, p.pct)}%`, height: '100%', background: p.color, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Velocity */}
        {g.shortfall > 0 && g.monthsRemaining > 0 && (
          <div style={{ background: C.surface2, borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 11, color: C.text2 }}>
            <span style={{ color: C.amber, fontWeight: 600 }}>⚡ {g.monthsRemaining}mo left · </span>
            {isSolo ? `Save ${fmt(g.velocityA)}/mo` : `${nameA} ${fmt(g.velocityA)}/mo · ${nameB} ${fmt(g.velocityB)}/mo`}
          </div>
        )}

        <button onClick={() => startEditing(g)}
          style={{ width: '100%', padding: '8px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text3, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Edit Parameters
        </button>
      </div>
    );
  };

  const CompletedCard = ({ g }: { g: any }) => (
    <div style={{ background: C.surface, borderRadius: 20, padding: '18px 18px', boxShadow: C.shadowSm, border: `1px solid ${C.green}33`, opacity: 0.85 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: `${C.green}22`, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
          {g.icon || '🏆'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text2, textDecoration: 'line-through' }}>{g.name}</div>
          <div style={{ fontSize: 11, color: C.green, marginTop: 2, fontWeight: 600 }}>🏆 Complete · {fmt(g.target)} funded</div>
        </div>
      </div>
      <div style={{ height: 4, background: C.green, borderRadius: 99, marginBottom: 10 }} />
      <button onClick={() => startEditing(g)}
        style={{ width: '100%', padding: '7px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text3, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        Edit Parameters
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Hero total card */}
      {data.goals.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 20, padding: '20px 18px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>Total saved toward goals</div>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: C.teal, lineHeight: 1 }}>{fmt(totalSaved)}</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>across {data.goals.length} goal{data.goals.length !== 1 ? 's' : ''}</div>
        </div>
      )}

      {/* Add form */}
      {adding && <AddForm />}

      {/* Active goals */}
      {ongoingGoals.map((g) =>
        editing === g.id ? <EditCard key={g.id} id={g.id} /> : <GoalCard key={g.id} g={g} />
      )}

      {/* Completed goals */}
      {completedGoals.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.green, padding: '4px 4px 10px' }}>
            Achieved ({completedGoals.length})
          </div>
          {completedGoals.map((g) =>
            editing === g.id ? <EditCard key={g.id} id={g.id} /> : <CompletedCard key={g.id} g={g} />
          )}
        </div>
      )}

      {/* Add button */}
      <button onClick={() => { setNewGoal(BLANK_GOAL); setAdding(true); }}
        style={{ width: '100%', padding: '14px', borderRadius: 999, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        + Add new goal
      </button>

      {/* Empty state */}
      {data.goals.length === 0 && !adding && (
        <div style={{ background: C.surface, borderRadius: 20, padding: '40px 20px', textAlign: 'center', boxShadow: C.shadowSm }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ color: C.textW, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No goals yet</div>
          <div style={{ color: C.text2, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>Set a shared savings target — holiday, emergency fund, big purchase.</div>
          <button onClick={() => { setNewGoal(BLANK_GOAL); setAdding(true); }}
            style={{ padding: '12px 24px', borderRadius: 999, border: 'none', background: C.accent, color: '#0a0a0a', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Add your first goal
          </button>
        </div>
      )}
    </div>
  );
}
