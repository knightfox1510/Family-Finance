'use client';
import React, { useState } from 'react';
import type { AppData } from '@/types';
import { C } from '@/constants';

function today() { return new Date().toISOString().slice(0, 10); }
function uid() { return typeof window !== 'undefined' && window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).slice(2); }

interface Props { data: AppData; onAdd: (l: any) => void; onUpdate: (id: string, l: any) => void; onDelete: (id: string) => void; fmt: (n: number) => string; }

const blank = { name: '', lender: '', principal: '', outstanding: '', emi: '', interestRate: '', startDate: today(), tenureMonths: '', paymentDay: 1, icon: '🏠' };

const inpStyle: React.CSSProperties = {
  width: '100%', background: 'var(--surface2)', border: '1.5px solid transparent',
  color: 'var(--textW)', fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
  padding: '10px 13px', outline: 'none', borderRadius: 12, boxSizing: 'border-box',
};

function SmallLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 5 }}>{children}</div>;
}

const LoanForm = ({ val, onChange, onSave, onCancel }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
      <div><SmallLabel>Loan Name</SmallLabel><input style={inpStyle} value={val.name} onChange={(e) => onChange('name', e.target.value)} placeholder="e.g. Home Loan" /></div>
      <div><SmallLabel>Icon</SmallLabel><input style={inpStyle} value={val.icon} onChange={(e) => onChange('icon', e.target.value)} /></div>
    </div>
    <div><SmallLabel>Lender</SmallLabel><input style={inpStyle} value={val.lender} onChange={(e) => onChange('lender', e.target.value)} placeholder="Bank name" /></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div><SmallLabel>Principal (₹)</SmallLabel><input type="number" style={inpStyle} value={val.principal} onChange={(e) => onChange('principal', e.target.value)} /></div>
      <div><SmallLabel>Outstanding (₹)</SmallLabel><input type="number" style={inpStyle} value={val.outstanding} onChange={(e) => onChange('outstanding', e.target.value)} /></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
      <div><SmallLabel>EMI (₹)</SmallLabel><input type="number" style={inpStyle} value={val.emi} onChange={(e) => onChange('emi', e.target.value)} /></div>
      <div><SmallLabel>Rate (%)</SmallLabel><input type="number" step="0.1" style={inpStyle} value={val.interestRate} onChange={(e) => onChange('interestRate', e.target.value)} /></div>
      <div><SmallLabel>Tenure (mo)</SmallLabel><input type="number" style={inpStyle} value={val.tenureMonths} onChange={(e) => onChange('tenureMonths', e.target.value)} /></div>
      <div><SmallLabel>EMI Day</SmallLabel><input type="number" min="1" max="31" style={inpStyle} value={val.paymentDay || ''} onChange={(e) => onChange('paymentDay', Number(e.target.value))} /></div>
    </div>
    <div><SmallLabel>Start Date</SmallLabel><input type="date" style={inpStyle} value={val.startDate} onChange={(e) => onChange('startDate', e.target.value)} /></div>
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={onSave} style={{ flex: 1, padding: '12px', borderRadius: 999, border: 'none', background: C.accent, color: '#0a0a0a', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Save Loan</button>
      <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: 999, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
    </div>
  </div>
);

const LOAN_ACCENTS = [C.teal, C.orange, C.red, C.blue, C.purple, C.green];

export function LoanTracker({ data, onAdd, onUpdate, onDelete, fmt }: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>(blank);
  const totalEMI = data.loans.reduce((s, l) => s + l.emi, 0);
  const totalOutstanding = data.loans.reduce((s, l) => s + l.outstanding, 0);
  const chg = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const nextDueDays = data.loans.reduce((min, l) => {
    const day = (l as any).paymentDay || 5;
    const now = new Date();
    let due = new Date(now.getFullYear(), now.getMonth(), day);
    if (due <= now) due = new Date(now.getFullYear(), now.getMonth() + 1, day);
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff < min ? diff : min;
  }, 999);
  const nextDueLabel = data.loans.length > 0 && nextDueDays < 999 ? `in ${nextDueDays}d` : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Hero total outstanding */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '20px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>Total outstanding</div>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: C.red, lineHeight: 1 }}>{fmt(totalOutstanding)}</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>{data.loans.length} active loan{data.loans.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: C.border, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ background: C.surface2, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>Monthly EMI</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.teal, letterSpacing: '-0.03em' }}>{fmt(totalEMI)}</div>
          </div>
          <div style={{ background: C.surface2, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>Next due</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.textW, letterSpacing: '-0.03em' }}>{nextDueLabel}</div>
          </div>
        </div>
      </div>

      {/* Add loan form */}
      {adding && (
        <div style={{ background: C.surface, borderRadius: 20, padding: '18px', boxShadow: C.shadowSm }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, marginBottom: 14 }}>New Loan / EMI</div>
          <LoanForm val={form} onChange={chg}
            onSave={() => { onAdd({ ...form, id: uid(), principal: Number(form.principal), outstanding: Number(form.outstanding), emi: Number(form.emi), interestRate: Number(form.interestRate), tenureMonths: Number(form.tenureMonths) }); setAdding(false); }}
            onCancel={() => setAdding(false)} />
        </div>
      )}

      {/* Loan cards */}
      {data.loans.map((l, idx) => {
        const paidPct = l.principal > 0 ? ((l.principal - l.outstanding) / l.principal) * 100 : 0;
        const monthsLeft = l.emi > 0 ? Math.ceil(l.outstanding / l.emi) : 0;
        const yearsLeft = (monthsLeft / 12).toFixed(1);
        const accent = LOAN_ACCENTS[idx % LOAN_ACCENTS.length];

        return (
          <div key={l.id} style={{ background: C.surface, borderRadius: 20, padding: '18px', boxShadow: C.shadowSm }}>
            {editing === l.id ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 14 }}>Edit — {l.name}</div>
                <LoanForm val={form} onChange={chg}
                  onSave={() => { onUpdate(l.id, { ...form, principal: Number(form.principal), outstanding: Number(form.outstanding), emi: Number(form.emi), interestRate: Number(form.interestRate), tenureMonths: Number(form.tenureMonths) }); setEditing(null); }}
                  onCancel={() => setEditing(null)} />
                <button onClick={() => { if (confirm('Delete this loan?')) onDelete(l.id); }}
                  style={{ marginTop: 10, width: '100%', padding: '8px', borderRadius: 99, border: `1px solid ${C.red}44`, background: 'transparent', color: C.red, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Delete Loan
                </button>
              </>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: `${accent}22`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    {(l as any).icon || '🏦'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.textW }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{l.lender} · {l.interestRate}% p.a.</div>
                  </div>
                  <button onClick={() => { setEditing(l.id); setForm({ ...l }); }}
                    style={{ padding: '7px 14px', borderRadius: 99, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text3, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Edit
                  </button>
                </div>

                {/* Progress */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text2 }}>{paidPct.toFixed(0)}% paid off</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>~{yearsLeft}y left · {monthsLeft} EMIs</span>
                  </div>
                  <div style={{ height: 6, background: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${paidPct}%`, height: '100%', background: accent, borderRadius: 99 }} />
                  </div>
                </div>

                {/* Numbers grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Outstanding', value: fmt(l.outstanding), color: C.red },
                    { label: 'Monthly EMI', value: fmt(l.emi), color: accent },
                    { label: 'Principal', value: fmt(l.principal), color: C.textW },
                    { label: 'EMI Day', value: `${(l as any).paymentDay || '?'}th of month`, color: C.textW },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: C.surface2, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color }}>{value}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Add button */}
      <button onClick={() => { setAdding(true); setForm(blank); }}
        style={{ width: '100%', padding: '14px', borderRadius: 999, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        + Add new loan
      </button>

      {data.loans.length === 0 && !adding && (
        <div style={{ background: C.surface, borderRadius: 20, padding: '40px 20px', textAlign: 'center', boxShadow: C.shadowSm }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏧</div>
          <div style={{ color: C.textW, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No loans tracked</div>
          <div style={{ color: C.text2, fontSize: 13, lineHeight: 1.6 }}>Add a loan to get prepayment insights, EMI calendar, and debt-to-income tracking.</div>
        </div>
      )}
    </div>
  );
}
