'use client';
// ─── components/Goals.tsx ─────────────────────────────────────────────────────
// Split-funded savings milestones with per-partner targets, progress bars,
// monthly velocity calculations, and an inline edit form.

import React, { useState } from 'react';
import type { AppData } from '@/types';
import { Card, Btn, Inp, Label, SectionTitle, ProgressBar } from '@/components/ui';
import { C } from '@/constants';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOAL_COLORS = [
  C.amber, C.green, C.blue, C.purple,
  C.red, C.teal, '#f97316', '#ec4899',
];

const HORIZONS = ['Short-Term', 'Mid-Term', 'Long-Term'] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  data: AppData;
  onUpdate: (id: string, updated: any) => void;
  onAdd: (goal: any) => void;
  onDelete: (id: string) => void;
  fmt: (n: number) => string;
}

interface GoalFormState {
  name: string;
  target: string | number;
  partnerATarget: string | number;
  partnerBTarget: string | number;
  partnerACurrent: string | number;
  partnerBCurrent: string | number;
  targetDate: string;
  strategy: string;
  icon: string;
  color: string;
  [key: string]: any;
}

const BLANK_GOAL: GoalFormState = {
  name: '',
  target: '',
  partnerATarget: '',
  partnerBTarget: '',
  partnerACurrent: '',
  partnerBCurrent: '',
  targetDate: '',
  strategy: 'Short-Term',
  icon: '🎯',
  color: C.amber,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Color swatch picker row */
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      {GOAL_COLORS.map((c) => (
        <div
          key={c}
          onClick={() => onChange(c)}
          style={{
            width: 22, height: 22, borderRadius: '50%', background: c,
            cursor: 'pointer',
            border: value === c ? '3px solid #fff' : '3px solid transparent',
            transition: 'border 0.15s',
          }}
        />
      ))}
    </div>
  );
}

/** Strategy dropdown — shared between add and edit forms */
function StrategySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', background: C.bg, color: C.text1,
        border: `1px solid ${C.border}`, padding: '8px 10px',
        borderRadius: 8, fontSize: 13, outline: 'none', cursor: 'pointer',
      }}
    >
      {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Goals({ data, onUpdate, onAdd, onDelete, fmt }: Props) {
  const nameA = data.settings.partnerAName;
  const nameB = data.settings.partnerBName;

  const [editing, setEditing]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState<GoalFormState>(BLANK_GOAL);
  const [adding, setAdding]     = useState(false);
  const [newGoal, setNewGoal]   = useState<GoalFormState>(BLANK_GOAL);

  const ongoingGoals   = data.goals.filter((g) => Number(g.current) < Number(g.target));
  const completedGoals = data.goals.filter((g) => Number(g.current) >= Number(g.target));

  // ── Helpers ────────────────────────────────────────────────────────────────

  const startEditing = (g: any) => {
    setEditing(g.id);
    setEditForm({ ...g, targetDate: g.targetDate ?? '' });
  };

  /** Auto-sum target from individual partner splits */
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

  // ── Add form ───────────────────────────────────────────────────────────────

  const AddForm = () => (
    <Card style={{ border: `1px solid ${C.amber}44` }}>
      <SectionTitle>New Savings Milestone</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Name / strategy / icon */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <div>
            <Label>Goal Name</Label>
            <Inp
              value={newGoal.name}
              placeholder="e.g. Emergency Fund"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewGoal((g) => ({ ...g, name: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Strategy</Label>
            <StrategySelect value={newGoal.strategy} onChange={(v) => setNewGoal((g) => ({ ...g, strategy: v }))} />
          </div>
          <div>
            <Label>Icon</Label>
            <Inp
              value={newGoal.icon}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewGoal((g) => ({ ...g, icon: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Target amounts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <Label>Total Target (₹)</Label>
            <Inp
              type="number"
              placeholder="Auto-computed"
              value={newGoal.target}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewGoal((g) => ({ ...g, target: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>{nameA}'s Share (₹)</Label>
            <Inp
              type="number"
              value={newGoal.partnerATarget}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                syncNewGoalTotal({ partnerATarget: e.target.value })
              }
            />
          </div>
          <div>
            <Label>{nameB}'s Share (₹)</Label>
            <Inp
              type="number"
              value={newGoal.partnerBTarget}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                syncNewGoalTotal({ partnerBTarget: e.target.value })
              }
            />
          </div>
        </div>

        {/* Date + current savings */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <Label>Target Date</Label>
            <Inp
              type="date"
              value={newGoal.targetDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewGoal((g) => ({ ...g, targetDate: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>{nameA}'s Saved (₹)</Label>
            <Inp
              type="number"
              value={newGoal.partnerACurrent}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewGoal((g) => ({ ...g, partnerACurrent: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>{nameB}'s Saved (₹)</Label>
            <Inp
              type="number"
              value={newGoal.partnerBCurrent}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewGoal((g) => ({ ...g, partnerBCurrent: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Color */}
        <div>
          <Label>Color</Label>
          <ColorPicker value={newGoal.color} onChange={(c) => setNewGoal((g) => ({ ...g, color: c }))} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Btn
            variant="primary"
            onClick={() => {
              onAdd(newGoal);
              setNewGoal(BLANK_GOAL);
              setAdding(false);
            }}
          >
            Save Goal
          </Btn>
          <Btn variant="ghost" onClick={() => setAdding(false)}>Cancel</Btn>
        </div>
      </div>
    </Card>
  );

  // ── Edit card (replaces the goal card in-place) ────────────────────────────

  const EditCard = ({ id }: { id: string }) => (
    <Card style={{ border: `1px solid ${C.teal}44`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Label><span style={{ fontWeight: 700, color: C.teal }}>Edit Goal</span></Label>

      <div>
        <Label>Goal Title</Label>
        <Inp
          value={editForm.name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setEditForm((f) => ({ ...f, name: e.target.value }))
          }
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <Label>{nameA}'s Target (₹)</Label>
          <Inp
            type="number"
            value={editForm.partnerATarget}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              syncEditFormTotal({ partnerATarget: e.target.value })
            }
          />
        </div>
        <div>
          <Label>{nameB}'s Target (₹)</Label>
          <Inp
            type="number"
            value={editForm.partnerBTarget}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              syncEditFormTotal({ partnerBTarget: e.target.value })
            }
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <Label>{nameA}'s Saved (₹)</Label>
          <Inp
            type="number"
            value={editForm.partnerACurrent}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditForm((f) => ({ ...f, partnerACurrent: e.target.value }))
            }
          />
        </div>
        <div>
          <Label>{nameB}'s Saved (₹)</Label>
          <Inp
            type="number"
            value={editForm.partnerBCurrent}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditForm((f) => ({ ...f, partnerBCurrent: e.target.value }))
            }
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <Label>Target Date</Label>
          <Inp
            type="date"
            value={editForm.targetDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditForm((f) => ({ ...f, targetDate: e.target.value }))
            }
          />
        </div>
        <div>
          <Label>Strategy</Label>
          <StrategySelect
            value={editForm.strategy}
            onChange={(v) => setEditForm((f) => ({ ...f, strategy: v }))}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant="primary" onClick={() => { onUpdate(id, editForm); setEditing(null); }}>
            Update
          </Btn>
          <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
        </div>
        <span
          style={{ color: C.red, fontSize: 12, cursor: 'pointer', alignSelf: 'center' }}
          onClick={() => {
            if (confirm('Permanently delete this goal?')) { onDelete(id); setEditing(null); }
          }}
        >
          🗑️ Delete
        </span>
      </div>
    </Card>
  );

  // ── Active goal card ───────────────────────────────────────────────────────

  const GoalCard = ({ g }: { g: any }) => {
    const pct       = g.target > 0 ? (g.current / g.target) * 100 : 0;
    const pctA      = g.partnerATarget > 0 ? (g.partnerACurrent / g.partnerATarget) * 100 : 0;
    const pctB      = g.partnerBTarget > 0 ? (g.partnerBCurrent / g.partnerBTarget) * 100 : 0;
    const statusColor =
      g.paceStatus === 'Critical'       ? C.red   :
      g.paceStatus === 'Needs Attention' ? C.amber : C.teal;

    return (
      <Card style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 16 }}>
        <div>
          {/* Status badges */}
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: `${C.border}44`, color: C.text1 }}>
              {g.strategy}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}33` }}>
              {g.paceStatus}
            </span>
          </div>

          {/* Title */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>{g.icon || '🎯'}</span>
            <div style={{ fontWeight: 700, color: C.textW, fontSize: 15 }}>{g.name}</div>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
            Target:{' '}
            {g.targetDate
              ? new Date(g.targetDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })
              : 'Flexible deadline'}
          </div>

          {/* Combined progress */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, fontWeight: 600, color: C.text1 }}>
            <span>Combined Progress</span>
            <span>{fmt(g.current)} / {fmt(g.target)} ({pct.toFixed(0)}%)</span>
          </div>
          <ProgressBar pct={pct} color={g.color || statusColor} height={8} />

          {/* Per-partner breakdown */}
          <div style={{ marginTop: 14, background: `${C.bg}66`, padding: 10, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { name: nameA, cur: g.partnerACurrent, tgt: g.partnerATarget, pct: pctA, color: C.teal },
              { name: nameB, cur: g.partnerBCurrent, tgt: g.partnerBTarget, pct: pctB, color: '#ec4899' },
            ].map((p) => (
              <div key={p.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: p.color, fontWeight: 600 }}>👤 {p.name}'s Share</span>
                  <span style={{ color: C.text2 }}>{fmt(p.cur)} of {fmt(p.tgt)} ({p.pct.toFixed(0)}%)</span>
                </div>
                <ProgressBar pct={p.pct} color={p.color} height={4} />
              </div>
            ))}
          </div>

          {/* Monthly velocity */}
          {g.shortfall > 0 && g.monthsRemaining > 0 && (
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.border}22` }}>
              <span style={{ color: C.muted, display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 6 }}>
                ⚠️ Monthly savings needed ({g.monthsRemaining} mo left):
              </span>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: C.text1 }}><strong style={{ color: C.teal }}>{nameA}:</strong> {fmt(g.velocityA)}/mo</span>
                <span style={{ color: C.text1 }}><strong style={{ color: '#ec4899' }}>{nameB}:</strong> {fmt(g.velocityB)}/mo</span>
              </div>
            </div>
          )}
        </div>

        {/* Edit trigger */}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${C.border}11`, paddingTop: 8 }}>
          <span
            onClick={() => startEditing(g)}
            style={{ fontSize: 10, fontWeight: 600, color: C.muted, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, background: `${C.border}22` }}
          >
            ⚙️ Parameters
          </span>
        </div>
      </Card>
    );
  };

  // ── Completed goal card ────────────────────────────────────────────────────

  const CompletedCard = ({ g }: { g: any }) => (
    <Card style={{ position: 'relative', background: `${C.surface}66`, border: `1px solid ${C.green}33`, padding: 16 }}>
      <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: `${C.green}20`, color: C.green, border: `1px solid ${C.green}44` }}>
        🏆 Complete
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>{g.icon || '🎉'}</span>
        <div style={{ fontWeight: 700, color: C.text1, fontSize: 14, textDecoration: 'line-through' }}>{g.name}</div>
      </div>
      <p style={{ margin: '4px 0 10px', fontSize: 12, color: C.muted }}>
        Funded at {fmt(g.target)} — {nameA} ({fmt(g.partnerATarget)}) · {nameB} ({fmt(g.partnerBTarget)})
      </p>
      <div style={{ background: `${C.green}11`, padding: '6px 10px', borderRadius: 6, fontSize: 11, color: C.green, fontWeight: 600, textAlign: 'center' }}>
        100% Capitalized
      </div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <span
          onClick={() => startEditing(g)}
          style={{ fontSize: 10, fontWeight: 600, color: C.muted, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, background: `${C.border}22` }}
        >
          ⚙️ Parameters
        </span>
      </div>
    </Card>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 18, color: C.text1, fontWeight: 700 }}>Financial Targets</h2>
        <Btn variant="primary" onClick={() => { setNewGoal(BLANK_GOAL); setAdding(true); }}>
          + Add Goal
        </Btn>
      </div>

      {/* Add form */}
      {adding && <AddForm />}

      {/* Active goals */}
      {ongoingGoals.length > 0 && (
        <div>
          <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 6, marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 13, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
              Active Goals ({ongoingGoals.length})
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 }}>
            {ongoingGoals.map((g) =>
              editing === g.id ? <EditCard key={g.id} id={g.id} /> : <GoalCard key={g.id} g={g} />
            )}
          </div>
        </div>
      )}

      {/* Completed goals */}
      {completedGoals.length > 0 && (
        <div>
          <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 6, marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 13, color: C.green, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
              Achieved 🏆 ({completedGoals.length})
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16 }}>
            {completedGoals.map((g) =>
              editing === g.id ? <EditCard key={g.id} id={g.id} /> : <CompletedCard key={g.id} g={g} />
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {ongoingGoals.length === 0 && completedGoals.length === 0 && !adding && (
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ color: C.text1, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No goals yet</div>
          <div style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
            Set a shared savings target — holiday, emergency fund, big purchase.
          </div>
          <Btn variant="primary" onClick={() => { setNewGoal(BLANK_GOAL); setAdding(true); }}>
            + Add your first goal
          </Btn>
        </Card>
      )}
    </div>
  );
}
