'use client';
import React, { useState } from 'react';
import type { AppData } from '@/types';
import { Card, Btn, Inp, Label, SectionTitle, StatCard, ProgressBar } from '@/components/ui';
import { C } from '@/constants';

function today() { return new Date().toISOString().slice(0, 10); }
function uid() { return typeof window !== 'undefined' && window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).slice(2); }

interface Props { data: AppData; onAdd: (l: any) => void; onUpdate: (id: string, l: any) => void; onDelete: (id: string) => void; fmt: (n: number) => string; }

const blank = { name: '', lender: '', principal: '', outstanding: '', emi: '', interestRate: '', startDate: today(), tenureMonths: '', paymentDay: 1, icon: '🏠' };

const LoanForm = ({ val, onChange, onSave, onCancel }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div><Label>Loan Name</Label><Inp value={val.name} onChange={(e: any) => onChange('name', e.target.value)} placeholder="e.g. Home Loan" /></div>
      <div><Label>Icon</Label><Inp value={val.icon} onChange={(e: any) => onChange('icon', e.target.value)} /></div>
    </div>
    <div><Label>Lender</Label><Inp value={val.lender} onChange={(e: any) => onChange('lender', e.target.value)} placeholder="Bank name" /></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div><Label>Principal (₹)</Label><Inp type="number" value={val.principal} onChange={(e: any) => onChange('principal', e.target.value)} /></div>
      <div><Label>Outstanding (₹)</Label><Inp type="number" value={val.outstanding} onChange={(e: any) => onChange('outstanding', e.target.value)} /></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
      <div><Label>EMI (₹)</Label><Inp type="number" value={val.emi} onChange={(e: any) => onChange('emi', e.target.value)} /></div>
      <div><Label>Rate (%)</Label><Inp type="number" step="0.1" value={val.interestRate} onChange={(e: any) => onChange('interestRate', e.target.value)} /></div>
      <div><Label>Tenure (mo)</Label><Inp type="number" value={val.tenureMonths} onChange={(e: any) => onChange('tenureMonths', e.target.value)} /></div>
      <div><Label>EMI Day</Label><Inp type="number" min="1" max="31" value={val.paymentDay || ''} onChange={(e: any) => onChange('paymentDay', Number(e.target.value))} /></div>
    </div>
    <div><Label>Start Date</Label><Inp type="date" value={val.startDate} onChange={(e: any) => onChange('startDate', e.target.value)} /></div>
    <div style={{ display: 'flex', gap: 8 }}>
      <Btn variant="primary" style={{ flex: 1 }} onClick={onSave}>Save Loan</Btn>
      <Btn variant="ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</Btn>
    </div>
  </div>
);

export function LoanTracker({ data, onAdd, onUpdate, onDelete, fmt }: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>(blank);
  const totalEMI = data.loans.reduce((s, l) => s + l.emi, 0);
  const totalOutstanding = data.loans.reduce((s, l) => s + l.outstanding, 0);
  const chg = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <StatCard label="Total Monthly EMI" value={fmt(totalEMI)} accent={C.teal} icon="📅" sub={`${data.loans.length} active loans`} />
        <StatCard label="Total Outstanding" value={fmt(totalOutstanding)} accent={C.red} icon="💳" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn variant="primary" onClick={() => { setAdding(true); setForm(blank); }}>+ Add Loan</Btn>
      </div>

      {adding && (
        <Card style={{ border: `1px solid ${C.teal}44` }}>
          <SectionTitle>New Loan / EMI</SectionTitle>
          <LoanForm val={form} onChange={chg} onSave={() => { onAdd({ ...form, id: uid(), principal: Number(form.principal), outstanding: Number(form.outstanding), emi: Number(form.emi), interestRate: Number(form.interestRate), tenureMonths: Number(form.tenureMonths) }); setAdding(false); }} onCancel={() => setAdding(false)} />
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        {data.loans.map((l) => {
          const paidPct = l.principal > 0 ? ((l.principal - l.outstanding) / l.principal) * 100 : 0;
          const monthsLeft = l.emi > 0 ? Math.ceil(l.outstanding / l.emi) : 0;
          return (
            <Card key={l.id}>
              {editing === l.id ? (
                <>
                  <SectionTitle>Edit — {l.name}</SectionTitle>
                  <LoanForm val={form} onChange={chg} onSave={() => { onUpdate(l.id, { ...form, principal: Number(form.principal), outstanding: Number(form.outstanding), emi: Number(form.emi), interestRate: Number(form.interestRate), tenureMonths: Number(form.tenureMonths) }); setEditing(null); }} onCancel={() => setEditing(null)} />
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <span style={{ fontSize: 28, marginRight: 8 }}>{(l as any).icon || '🏦'}</span>
                      <span style={{ color: C.textW, fontWeight: 700, fontSize: 17 }}>{l.name}</span>
                      <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{l.lender} · {l.interestRate}% p.a.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn variant="ghost" style={{ fontSize: 11, padding: '4px 9px' }} onClick={() => { setEditing(l.id); setForm({ ...l }); }}>Edit</Btn>
                      <Btn variant="danger" style={{ fontSize: 11, padding: '4px 9px' }} onClick={() => onDelete(l.id)}>✕</Btn>
                    </div>
                  </div>
                  <ProgressBar pct={paidPct} color={C.teal} height={10} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0 14px' }}>
                    <span style={{ color: C.muted, fontSize: 12 }}>{paidPct.toFixed(1)}% paid off</span>
                    <span style={{ color: C.teal, fontSize: 12, fontWeight: 600 }}>~{monthsLeft} months left</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[['Outstanding', fmt(l.outstanding), C.red], ['Monthly EMI', fmt(l.emi), C.teal], ['Principal', fmt(l.principal), C.text1], ['Started', l.startDate, C.text1]].map(([label, val, color]) => (
                      <div key={label as string} style={{ background: C.bg, borderRadius: 0, padding: '10px 12px' }}>
                        <div style={{ color: C.muted, fontSize: 11 }}>{label}</div>
                        <div style={{ color: color as string, fontWeight: 700, fontSize: 14, marginTop: 2 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
