'use client';
import React, { useState } from 'react';
import type { AppData } from '@/types';
import { Card, Btn, SectionTitle } from '@/components/ui';
import { C } from '@/constants';

function today() { return new Date().toISOString().slice(0, 10); }
function monthKey(d: string) { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; }
function monthLabel(key: string) { const [y,m]=key.split('-'); return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-IN',{month:'short',year:'numeric'}); }

const MODES = [
  { id: 'monthly',       label: '📊 Monthly Summary' },
  { id: 'anomalies',     label: '🔍 Unusual Spending' },
  { id: 'advice',        label: '💡 Financial Advice' },
  { id: 'loans',         label: '🏧 Loan Strategy' },
  { id: 'runway',        label: '⏳ Runway & Forecast' },
  { id: 'milestones',    label: '🎯 Goal Velocity' },
  { id: 'discretionary', label: '✂️ Lifestyle Pruning' },
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <SectionTitle>AI-Powered Financial Insights</SectionTitle>
        <p style={{ color: C.text1, fontSize: 14, margin: '0 0 18px', lineHeight: 1.6 }}>Personalised insights based on your actual spending, goals, and loans.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {MODES.map((m) => <Btn key={m.id} variant={mode === m.id ? 'primary' : 'ghost'} onClick={() => setMode(m.id)} style={{ fontSize: 13 }}>{m.label}</Btn>)}
        </div>
        <Btn variant="primary" onClick={generate} style={{ padding: '11px 24px', fontSize: 14 }} disabled={loading}>{loading ? 'Generating…' : '✨ Generate Insight'}</Btn>
      </Card>

      {loading && (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ color: C.amber, fontSize: 32, marginBottom: 12, animation: 'spin 1.2s linear infinite' }}>✨</div>
          <div style={{ color: C.text1, fontSize: 15 }}>Analysing your finances…</div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </Card>
      )}

      {error && <Card style={{ border: `1px solid ${C.red}44`, background: C.red + '11' }}><p style={{ color: C.red, margin: 0 }}>{error}</p></Card>}

      {report && (
        <Card style={{ border: `1px solid ${C.amber}33` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>✨</span>
            <span style={{ color: C.textW, fontWeight: 700, fontSize: 15 }}>{MODES.find((m) => m.id === mode)?.label}</span>
            <span style={{ color: C.muted, fontSize: 12, marginLeft: 'auto' }}>{monthLabel(monthKey(today()))}</span>
          </div>
          <div style={{ color: C.text1, fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{report}</div>
        </Card>
      )}
    </div>
  );
}
