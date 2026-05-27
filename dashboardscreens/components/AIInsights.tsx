'use client';
import React, { useState } from 'react';
import type { AppData } from '@/types';
import { C } from '@/constants';
import { Icon } from '@/components/Icon';

function today() { return new Date().toISOString().slice(0, 10); }
function monthKey(d: string) { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; }
function monthLabel(key: string) { const [y,m]=key.split('-'); return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-IN',{month:'short',year:'numeric'}); }

const MODES = [
  { id: 'monthly',       icon: 'barChart' as const, label: 'Monthly Summary'   },
  { id: 'anomalies',     icon: 'search'   as const, label: 'Unusual Spending'  },
  { id: 'advice',        icon: 'sparkles' as const, label: 'Financial Advice'  },
  { id: 'loans',         icon: 'bank'     as const, label: 'Loan Strategy'     },
  { id: 'runway',        icon: 'clock'    as const, label: 'Runway & Forecast' },
  { id: 'milestones',    icon: 'target'   as const, label: 'Goal Velocity'     },
  { id: 'discretionary', icon: 'pieChart' as const, label: 'Lifestyle Pruning' },
];

interface Props { data: AppData; fmt: (n: number) => string; }

export function AIInsights({ data, fmt }: Props) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState('monthly');

  const generate = async () => {
    setLoading(true); setReport(null); setError(null);
    const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
    const mk = monthKey(today());
    const monthExp = data.expenses.filter((e) => monthKey(e.date) === mk);
    const catTotals: Record<string, number> = {};
    monthExp.forEach((e) => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
    const contrib = data.contributions.find((c) => c.month === mk) || { partnerA: 0, partnerB: 0 };
    const totalEMI = data.loans.reduce((s, l) => s + l.emi, 0);
    const TIMING = `CONTEXT: Salary inflows arrive end-of-month. Mid-month balance dips are normal — evaluate with this in mind.`;
    const GOALS_STR = data.goals.map((g) => `${g.name}: ${((g.current/g.target)*100).toFixed(0)}%`).join(', ');

    const prompts: Record<string, string> = {
      monthly: `You are a personal finance advisor for a couple in India. Couple: ${names.a} and ${names.b}. Month: ${monthLabel(mk)}. Contributions — ${names.a}: ₹${contrib.partnerA}, ${names.b}: ₹${contrib.partnerB}. Category spending: ${JSON.stringify(catTotals)}. EMI: ₹${totalEMI}. Goals: ${GOALS_STR}. Budgets: ${JSON.stringify(data.settings.budgets)}. ${TIMING} Write a 3-4 paragraph monthly summary: spending health, notable patterns, budget tracking, one recommendation. No bullet points.`,
      anomalies: `Financial analyst. Identify 3-4 unusual spending patterns or budget overruns. Names: ${names.a}, ${names.b}. This month: ${JSON.stringify(catTotals)}. Budgets: ${JSON.stringify(data.settings.budgets)}. EMI: ₹${totalEMI}. ${TIMING} Be concrete with numbers. Clear paragraphs.`,
      advice: `Personal finance advisor. Give 4-5 specific, actionable pieces of advice. Joint contributions: ₹${contrib.partnerA + contrib.partnerB}. Spending: ${JSON.stringify(catTotals)}. Loans: ${data.loans.map((l) => `${l.name}: ₹${l.outstanding} @ ${l.interestRate}%`).join('; ')}. Goals: ${GOALS_STR}. ${TIMING} Reference specific numbers. Clear paragraphs.`,
      loans: `Debt management expert. Loans: ${data.loans.map((l) => `${l.name}: Principal ₹${l.principal}, Outstanding ₹${l.outstanding}, EMI ₹${l.emi}/mo @ ${l.interestRate}%`).join('\n')}. Total EMI: ₹${totalEMI}. Monthly contribution: ₹${contrib.partnerA + contrib.partnerB}. Cover: prepayment priority, debt-to-income health, time to debt freedom, one interest-reduction strategy.`,
      runway: `Cash-flow analyst. Names: ${names.a}, ${names.b}. Spending: ${JSON.stringify(catTotals)}. EMI: ₹${totalEMI}. ${TIMING} Assess liquid buffer longevity and cash velocity. Project upcoming cycles. Clear paragraphs.`,
      milestones: `Wealth consultant. Goals: ${data.goals.map((g) => `${g.name}: Target ₹${g.target}, Saved ₹${g.current}, ${names.a} target ₹${g.partnerATarget} saved ₹${g.partnerACurrent}, ${names.b} target ₹${g.partnerBTarget} saved ₹${g.partnerBCurrent}, pace: ${g.paceStatus}, ${g.monthsRemaining} mo left`).join('\n')}. Audit completion tracks, flag misalignments, suggest reallocation strategies.`,
      discretionary: `Expense coach. Spending: ${JSON.stringify(catTotals)}. Budgets: ${JSON.stringify(data.settings.budgets)}. Separate Fixed (Rent, Utilities, EMI, Insurance) from Discretionary (Dining, Coffee, Entertainment, Apparel). Flag categories approaching limits. Suggest adjustments to reclaim capital for investments.`,
    };

    try {
      const res = await fetch('/api/insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompts[mode] }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setReport(d.text);
    } catch (e: any) {
      setError('Could not generate insight: ' + e.message);
    }
    setLoading(false);
  };

  const currentMode = MODES.find((m) => m.id === mode)!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Hero */}
      <div style={{ background: C.surface, borderRadius: 20, padding: '20px', display: 'flex', gap: 14, alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="sparkles" size={28} color="#0a0a0a" strokeWidth={2} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.textW, letterSpacing: '-0.02em' }}>AI-powered insights</div>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 3 }}>Personalised analysis of your spending, goals, and loans</div>
          <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent }}>✦ Powered by Claude</div>
        </div>
      </div>

      {/* Mode picker grid */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 10, padding: '0 4px' }}>
          Choose an analysis
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {MODES.map((m) => {
            const active = mode === m.id;
            return (
              <button key={m.id} onClick={() => setMode(m.id)} style={{
                background: active ? C.accentBg : C.surface,
                border: `1px solid ${active ? C.accent : 'transparent'}`,
                borderRadius: 14, padding: '14px 12px',
                display: 'flex', flexDirection: 'column', gap: 8,
                alignItems: 'flex-start', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left', transition: 'all .12s',
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: active ? C.accent : C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={m.icon} size={16} color={active ? '#0a0a0a' : 'var(--text2, #888)'} strokeWidth={2} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: active ? C.accent : C.textW, lineHeight: 1.3 }}>
                  {m.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Report card */}
      {report && (
        <div style={{ background: C.surface, border: `1px solid ${C.border2}`, borderRadius: 20, padding: '18px 18px 20px', boxShadow: C.shadowSm }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
            <Icon name="sparkles" size={18} color={C.accent} strokeWidth={2} />
            <span style={{ fontSize: 13, fontWeight: 800, color: C.textW }}>{currentMode.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.text3 }}>{monthLabel(monthKey(today()))}</span>
          </div>
          <div style={{ fontSize: 13, color: C.text1, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{report}</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: `${C.red}11`, border: `1px solid ${C.red}44`, borderRadius: 14, padding: '14px 16px', fontSize: 13, color: C.red }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ background: C.surface, borderRadius: 20, padding: '40px 20px', textAlign: 'center', boxShadow: C.shadowSm }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Icon name="sparkles" size={32} color={C.accent} strokeWidth={2} />
          </div>
          <div style={{ color: C.text1, fontSize: 15 }}>Analysing your finances…</div>
        </div>
      )}

      {/* Generate / Regenerate button */}
      <button onClick={generate} disabled={loading}
        style={{ width: '100%', minHeight: 52, borderRadius: 999, border: 'none',
          background: loading ? C.surface2 : C.accent, color: loading ? C.text3 : '#0a0a0a',
          fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', letterSpacing: '0.01em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: loading ? 'none' : `0 4px 20px ${C.accent}40` }}>
        <Icon name={loading ? 'clock' : 'sparkles'} size={18} color={loading ? 'var(--text3, #666)' : '#0a0a0a'} strokeWidth={2} />
        {loading ? 'Generating…' : report ? 'Regenerate' : 'Generate Insight'}
      </button>
    </div>
  );
}
