'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

import { supabase } from '../lib/supabaseClient';
import Auth from './Auth';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_EXPENSE_CATS = [
  'Groceries',
  'Dining Out',
  'Coffee & Snacks',
  'Rent / Mortgage',
  'Electricity',
  'Water & Gas',
  'Internet',
  'Mobile Plans',
  'Streaming Services',
  'Insurance',
  'Medical / Health',
  'Gym & Fitness',
  'Clothing & Apparel',
  'Personal Care',
  'Home Maintenance',
  'Furniture & Decor',
  'Transport / Fuel',
  'Parking & Tolls',
  'Public Transport',
  'Flights & Hotels',
  'Education',
  'Books & Courses',
  'Kids & School',
  'Gifts & Celebrations',
  'Entertainment',
  'Subscriptions',
  'Miscellaneous',
  'Other',
];
const DEFAULT_INCOME_CATS = [
  'Salary',
  'Freelance',
  'Rental Income',
  'Investment Returns',
  'Bonus',
  'Gift',
  'Other Income',
];
function ACCOUNT_TYPES(names: { a: string; b: string }) {
  return ['Joint', names.a, names.b];
}
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const DEFAULT_SETTINGS = {
  partnerAName: 'Partner A',
  partnerBName: 'Partner B',
  expenseCategories: DEFAULT_EXPENSE_CATS,
  incomeCategories: DEFAULT_INCOME_CATS,
  budgets: {},
  notifications: {
    enabled: false,
    newExpense: true,
    settlement: true,
    budgetAlert: true,
    budgetThreshold: 80,
  },
  currency: 'INR',
};

function fmt(n: number, currency: string = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n || 0);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function monthKey(dateStr: string) {
  const d = new Date(dateStr); // ✕ Changed 'date' to 'dateStr'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string) {
  if (!key || key === 'All') return 'All Months';
  const [year, month] = key.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}
function uid() {
  // Safe for both Server-Side Pre-rendering and Browser execution
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback string generator if executed on Vercel's build server
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// ─── Seed data ────────────────────────────────────────────────────────────────
function seedData() {
  const mk = monthKey(today());
  return {
    expenses: [], // Start with a completely clean slate!
    contributions: [{ id: uid(), month: mk, partnerA: 0, partnerB: 0 }],
    goals: [],
    loans: [],
    settings: DEFAULT_SETTINGS,
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────
async function loadData(userId: string) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('household_id')
      .eq('id', userId)
      .single();
    if (!profile) throw new Error('Profile not found');
    const hId = profile.household_id;

    // Fetch EVERYTHING in parallel!
    const [tx, gl, ln, cb, st] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('household_id', hId)
        .order('date', { ascending: false }),
      supabase.from('goals').select('*').eq('household_id', hId),
      supabase.from('loans').select('*').eq('household_id', hId),
      supabase.from('contributions').select('*').eq('household_id', hId),
      supabase
        .from('household_settings')
        .select('settings_data')
        .eq('household_id', hId)
        .single(),
    ]);

    const formattedData = {
      householdId: hId,
      expenses: (tx.data || []).map((r) => ({
        id: r.id,
        date: r.date,
        amount: r.amount,
        category: r.category,
        type: r.type,
        account: r.account_used,
        addedBy: r.added_by,
        note: r.note,
        toSettle: r.to_settle,
        settled: r.settled,
        settledFor: r.settled_with,
      })),
      goals: gl.data || [],
      loans: (ln.data || []).map((r) => ({
        ...r,
        interestRate: r.interest_rate,
        startDate: r.start_date,
        tenureMonths: r.tenure_months,
        paymentDay: r.payment_day || 1,
      })),
      contributions: (cb.data || []).map((r) => ({
        id: r.month,
        month: r.month,
        partnerA: r.partner_a,
        partnerB: r.partner_b,
      })),
      settings: st.data?.settings_data
        ? { ...DEFAULT_SETTINGS, ...st.data.settings_data }
        : DEFAULT_SETTINGS,
    };
    return formattedData;
  } catch (err) {
    console.error('Error loading cloud data:', err);
    return seedData();
  }
}

// ─── Design primitives ────────────────────────────────────────────────────────
const C = {
  bg: '#0b0f1a',
  surface: '#131928',
  border: '#1e2840',
  muted: '#3d4f6e',
  text2: '#6b82a8',
  text1: '#a8b8d4',
  textW: '#e8eeff',
  amber: '#f59e0b',
  green: '#10b981',
  red: '#ef4444',
  purple: '#8b5cf6',
  blue: '#3b82f6',
  teal: '#06b6d4',
};

function Card({ children, style = {} }: { children: React.ReactNode; style?: any }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: '20px 22px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
function Inp({ style = {}, ...props }: any) {
  return (
    <input
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        color: C.textW,
        borderRadius: 9,
        padding: '9px 13px',
        fontSize: 14,
        width: '100%',
        boxSizing: 'border-box',
        outline: 'none',
        ...style,
      }}
      {...p}
    />
  );
}
function Sel({ children, style = {}, ...props }: any) {
  return (
    <select
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        color: C.text1,
        borderRadius: 9,
        padding: '9px 13px',
        fontSize: 14,
        width: '100%',
        boxSizing: 'border-box',
        cursor: 'pointer',
        ...style,
      }}
      {...p}
    >
      {children}
    </select>
  );
}
function Btn({ children, variant = 'primary', onClick, style = {}, id }: { children: React.ReactNode; variant?: string; onClick?: any; style?: any; id?: string }) {
  const base = {
    border: 'none',
    borderRadius: 9,
    padding: '9px 18px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity .15s',
  };
  const variants = {
    primary: {
      background: `linear-gradient(135deg,${C.amber},#d97706)`,
      color: '#0b0f1a',
    },
    ghost: {
      background: 'transparent',
      border: `1px solid ${C.border}`,
      color: C.text1,
    },
    danger: {
      background: C.red + '22',
      border: `1px solid ${C.red}44`,
      color: C.red,
    },
    success: {
      background: C.green + '22',
      border: `1px solid ${C.green}44`,
      color: C.green,
    },
    purple: {
      background: C.purple + '22',
      border: `1px solid ${C.purple}44`,
      color: C.purple,
    },
  };
  return (
    <button style={{ ...base, ...variants[variant], ...style }} {...p}>
      {children}
    </button>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: C.text2,
        fontSize: 12,
        fontWeight: 600,
        marginBottom: 5,
        letterSpacing: 0.3,
      }}
    >
      {children}
    </div>
  );
}
function Badge({ children, color }: { children: React.ReactNode; color: string }) {
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
      }}
    >
      {children}
    </span>
  );
}
function SectionTitle({ children, style = {} }: { children: React.ReactNode; style?: any }) {
  return (
    <h3
      style={{
        color: C.textW,
        fontSize: 15,
        fontWeight: 700,
        margin: '0 0 16px',
        letterSpacing: -0.3,
      }}
    >
      {children}
    </h3>
  );
}
function ProgressBar({ pct, color = C.amber, height = 8 }) {
  return (
    <div
      style={{ background: C.bg, borderRadius: 99, height, overflow: 'hidden' }}
    >
      <div
        style={{
          width: `${Math.min(100, pct)}%`,
          height: '100%',
          background: `linear-gradient(90deg,${color}88,${color})`,
          borderRadius: 99,
          transition: 'width .6s ease',
        }}
      />
    </div>
  );
}
function Toggle({ checked, onChange, label }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
      }}
    >
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 99,
          background: checked ? C.green : C.border,
          position: 'relative',
          transition: 'background .2s',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left .2s',
          }}
        />
      </div>
      {label && <span style={{ color: C.text1, fontSize: 13 }}>{label}</span>}
    </label>
  );
}
function StatCard({ label, value, sub, accent = C.amber, icon }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            color: C.text2,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div
        style={{
          color: accent,
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: -1,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ color: C.muted, fontSize: 12 }}>{sub}</div>}
    </Card>
  );
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'add', label: 'Add Expense', icon: '➕' },
  { id: 'expenses', label: 'Expenses', icon: '📋' },
  { id: 'settle', label: 'Settlements', icon: '🔄' },
  { id: 'contributions', label: 'Contributions', icon: '🏦' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
  { id: 'loans', label: 'EMI Tracker', icon: '🏧' },
  { id: 'insights', label: 'AI Insights', icon: '✨' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

// ─── EXPORT HELPER ────────────────────────────────────────────────────────────
function exportToExcel(data) {
  const wb = XLSX.utils.book_new();
  // Expenses sheet
  const expRows = data.expenses.map((e) => ({
    ID: e.id,
    Date: e.date,
    Type: e.type || 'expense',
    Category: e.category,
    Amount: e.amount,
    Account: e.account,
    'Added By': e.addedBy,
    Note: e.note || '',
    'To Settle': e.toSettle ? 'Yes' : 'No',
    Settled: e.settled ? 'Yes' : 'No',
    'Settled For': e.settledFor || '',
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(expRows),
    'Expenses'
  );
  // Contributions
  const cRows = data.contributions.map((c) => ({
    Month: c.month,
    'Partner A': c.partnerA,
    'Partner B': c.partnerB,
    Total: c.partnerA + c.partnerB,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(cRows),
    'Contributions'
  );
  // Goals
  const gRows = data.goals.map((g) => ({
    Name: g.name,
    Target: g.target,
    Current: g.current,
    'Progress %': ((g.current / g.target) * 100).toFixed(1),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gRows), 'Goals');
  // Loans
  const lRows = data.loans.map((l) => ({
    Name: l.name,
    Lender: l.lender,
    Principal: l.principal,
    Outstanding: l.outstanding,
    EMI: l.emi,
    'Rate %': l.interestRate,
    'Start Date': l.startDate,
    'Tenure Months': l.tenureMonths,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lRows), 'Loans');

  XLSX.writeFile(wb, `FamilyFinance_${today()}.xlsx`);
}

// ─── IMPORT HELPER ────────────────────────────────────────────────────────────
function parseImport(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const getSheet = (name) => {
        const sh = wb.Sheets[name];
        return sh ? XLSX.utils.sheet_to_json(sh) : [];
      };
      const expenses = getSheet('Expenses').map((r) => ({
        id: r.ID || uid(),
        date: r.Date || today(),
        type: r.Type || 'expense',
        category: r.Category || 'Other',
        amount: Number(r.Amount) || 0,
        account: r.Account || 'Joint',
        addedBy: r['Added By'] || 'Partner A',
        note: r.Note || '',
        toSettle: r['To Settle'] === 'Yes',
        settled: r.Settled === 'Yes',
        settledFor: r['Settled For'] || null,
      }));
      const contribs = getSheet('Contributions').map((r) => ({
        id: r.Month,
        month: r.Month,
        partnerA: Number(r['Partner A']) || 0,
        partnerB: Number(r['Partner B']) || 0,
      }));
      callback({ expenses, contributions: contribs.length ? contribs : null });
    } catch (err) {
      callback(null, 'Failed to parse file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ data, onAddExpense }) {
  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };

  // Date Range State (Defaults to current month)
  const d = new Date();
  const defaultStart = new Date(d.getFullYear(), d.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const [dates, setDates] = useState({ start: defaultStart, end: today() });

  // Filter expenses based on selected dates
  const filteredExp = data.expenses.filter(
    (e) => e.date >= dates.start && e.date <= dates.end && e.type !== 'income'
  );

  const pool = data.contributions.reduce(
    (sum, c) => sum + c.partnerA + c.partnerB,
    0
  );
  const jointSpent = filteredExp
    .filter((e) => e.account === 'Joint')
    .reduce((s, e) => s + e.amount, 0);
  const totalPeriod = filteredExp.reduce((s, e) => s + e.amount, 0);

  const catMap = {};
  filteredExp.forEach((e) => {
    catMap[e.category] = (catMap[e.category] || 0) + e.amount;
  });
  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxCat = topCats[0]?.[1] || 1;

  // EMI Reminders (Is today the payment day?)
  const currentDay = new Date().getDate();
  const dueLoans = data.loans.filter((l) => l.paymentDay === currentDay);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Date Filter */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <Card
          style={{
            padding: '10px 14px',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            margin: 0,
          }}
        >
          <span style={{ color: C.muted, fontSize: 13, fontWeight: 600 }}>
            Date Range:
          </span>
          <Inp
            type="date"
            value={dates.start}
            onChange={(e) => setDates({ ...dates, start: e.target.value })}
            style={{ width: 130, padding: '4px 8px' }}
          />
          <span style={{ color: C.muted }}>to</span>
          <Inp
            type="date"
            value={dates.end}
            onChange={(e) => setDates({ ...dates, end: e.target.value })}
            style={{ width: 130, padding: '4px 8px' }}
          />
        </Card>
      </div>

      {/* EMI Alerts */}
      {dueLoans.length > 0 && (
        <Card
          style={{
            border: `1px solid ${C.amber}66`,
            background: C.amber + '11',
            padding: '14px 20px',
          }}
        >
          <SectionTitle style={{ color: C.amber, marginBottom: 8 }}>
            🔔 EMI Due Today
          </SectionTitle>
          {dueLoans.map((l) => (
            <div
              key={l.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 10,
              }}
            >
              <span style={{ color: C.textW, fontSize: 14 }}>
                {l.icon} <b>{l.name}</b> — {fmt(l.emi, data.settings.currency)}
              </span>
              <Btn
                variant="primary"
                style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => {
                  onAddExpense({
                    id: crypto.randomUUID(),
                    date: today(),
                    amount: l.emi,
                    category: 'Other',
                    account: 'Joint',
                    addedBy: 'Partner A',
                    note: `${l.name} EMI`,
                    toSettle: false,
                    type: 'expense',
                    settled: false,
                  });
                }}
              >
                Log EMI Expense
              </Btn>
            </div>
          ))}
        </Card>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))',
          gap: 12,
        }}
      >
        <StatCard
          label="Total Spent (Period)"
          value={fmt(totalPeriod, data.settings.currency)}
          accent={C.amber}
          icon="💸"
          sub={`${filteredExp.length} transactions`}
        />
        <StatCard
          label="Joint Spent (Period)"
          value={fmt(jointSpent, data.settings.currency)}
          accent={C.green}
          icon="🏦"
        />
        <StatCard
          label="Monthly EMI Load"
          value={fmt(
            data.loans.reduce((s, l) => s + l.emi, 0),
            data.settings.currency
          )}
          accent={C.teal}
          icon="🏧"
          sub={`${data.loans.length} active loans`}
        />
      </div>

      <Card>
        <SectionTitle>Top Categories — Selected Period</SectionTitle>
        {topCats.length === 0 && (
          <p style={{ color: C.muted, fontSize: 13 }}>
            No expenses found in this range.
          </p>
        )}
        {topCats.map(([cat, amt]) => {
          const budget = data.settings.budgets[cat];
          const over = budget && amt > budget;
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <span style={{ color: C.text1, fontSize: 13 }}>{cat}</span>
                <span
                  style={{
                    color: over ? C.red : C.textW,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {fmt(amt, data.settings.currency)} {over ? ' ⚠️' : ''}
                </span>
              </div>
              <ProgressBar
                pct={(amt / maxCat) * 100}
                color={over ? C.red : C.amber}
              />
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ─── ADD EXPENSE ──────────────────────────────────────────────────────────────
function AddExpense({ data, onAdd, onClose }) {
  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };
  const [form, setForm] = useState({
    date: today(),
    amount: '',
    category: data.settings.expenseCategories[0],
    account: 'Joint',
    addedBy: 'Partner A',
    note: '',
    toSettle: false,
    type: 'expense',
  });
  const [flash, setFlash] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    onAdd({
      ...form,
      amount: Number(form.amount),
      id: uid(),
      settled: false,
      settledFor: null,
    });
    setForm((f) => ({ ...f, amount: '', note: '', toSettle: false }));
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };

  const cats =
    form.type === 'income'
      ? data.settings.incomeCategories
      : data.settings.expenseCategories;

  return (
    <div style={{ maxWidth: 560 }}>
      <Card>
        {/* NEW: Header with Close Button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <SectionTitle style={{ margin: 0 }}>Add New Transaction</SectionTitle>
          {onClose && (
            <Btn
              variant="ghost"
              onClick={onClose}
              style={{ padding: '4px 10px', fontSize: 16 }}
            >
              ✕
            </Btn>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {['expense', 'income'].map((t) => (
            <Btn
              key={t}
              variant={form.type === t ? 'primary' : 'ghost'}
              onClick={() => {
                set('type', t);
                set(
                  'category',
                  t === 'income'
                    ? data.settings.incomeCategories[0]
                    : data.settings.expenseCategories[0]
                );
              }}
              style={{
                flex: 1,
                textAlign: 'center',
                textTransform: 'capitalize',
              }}
            >
              {t === 'expense' ? '💸 Expense' : '💰 Income'}
            </Btn>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
          >
            <div>
              <Label>Date</Label>
              <Inp
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
              />
            </div>
            <div>
              <Label>Amount (₹)</Label>
              <Inp
                type="number"
                placeholder="0"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <Sel
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Sel>
          </div>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
          >
            <div>
              <Label>Paid From</Label>
              <Sel
                value={form.account}
                onChange={(e) => set('account', e.target.value)}
              >
                <option value="Joint">Joint Account</option>
                <option value={names.a}>{names.a}</option>
                <option value={names.b}>{names.b}</option>
              </Sel>
            </div>
            <div>
              <Label>Added By</Label>
              <Sel
                value={form.addedBy}
                onChange={(e) => set('addedBy', e.target.value)}
              >
                <option value="Partner A">{names.a}</option>
                <option value="Partner B">{names.b}</option>
              </Sel>
            </div>
          </div>

          {/* AI Receipt Scanner Slot */}
          <div
            style={{
              background: C.surface,
              border: `1px dashed ${C.amber}66`,
              padding: 12,
              borderRadius: 10,
              marginBottom: 14,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, color: C.text2 }}>
              ⚡ AI Receipt Scanner
            </span>
            <input
              type="file"
              accept="image/*"
              id="receipt-upload"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const btn = document.getElementById('scan-btn');
                btn.innerText = '🤖 Scanning receipt...';

                // Convert image to base64 for Gemini API
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = async () => {
                  const base64Data = reader.result.split(',')[1];
                  try {
                    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
                    const res = await fetch(
                      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          contents: [
                            {
                              parts: [
                                {
                                  text: `Analyze this receipt. Return ONLY a raw JSON object with keys: "amount" (number), "date" (YYYY-MM-DD string), "category" (must be strictly one of these: ${data.settings.expenseCategories.join(
                                    ', '
                                  )}), and "note" (brief description). Do not include markdown code blocks.`,
                                },
                                {
                                  inlineData: {
                                    mimeType: file.type,
                                    data: base64Data,
                                  },
                                },
                              ],
                            },
                          ],
                        }),
                      }
                    );
                    const jsonRes = await res.json();
                    const txt =
                      jsonRes.candidates[0].content.parts[0].text.trim();
                    const parsed = JSON.parse(
                      txt.replace(/\`\`\`json|\`\`\`/g, '')
                    ); // Strip codeblocks if model ignores instructions

                    if (parsed.amount) set('amount', parsed.amount);
                    if (parsed.date) set('date', parsed.date);
                    if (parsed.category) set('category', parsed.category);
                    if (parsed.note) set('note', parsed.note);
                    btn.innerText = '✨ Scan Successful!';
                  } catch (err) {
                    console.error(err);
                    alert(
                      'AI failed to parse receipt. Please enter details manually.'
                    );
                    btn.innerText = '📸 Scan Receipt';
                  }
                };
              }}
            />
            <Btn
              id="scan-btn"
              variant="ghost"
              style={{ fontSize: 13, width: '100%' }}
              onClick={() => document.getElementById('receipt-upload').click()}
            >
              📸 Scan Receipt / Bill
            </Btn>
          </div>

          <div>
            <Label>Note (optional)</Label>
            <Inp
              placeholder="What was this for?"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </div>

          {form.type === 'expense' && form.account !== 'Joint' && (
            <div
              style={{
                background: C.bg,
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ color: C.text1, fontSize: 13, fontWeight: 600 }}>
                  To be settled by Joint Account?
                </div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                  Turn on if this personal expense should be reimbursed from the
                  joint pool
                </div>
              </div>
              <Toggle
                checked={form.toSettle}
                onChange={(v) => set('toSettle', v)}
              />
            </div>
          )}

          {/* NEW: Side-by-side action buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Btn
              variant={flash ? 'success' : 'primary'}
              onClick={submit}
              style={{ flex: 1, padding: 13, fontSize: 15 }}
            >
              {flash
                ? '✓ Added!'
                : `Add ${form.type === 'income' ? 'Income' : 'Expense'}`}
            </Btn>
            {onClose && (
              <Btn
                variant="ghost"
                onClick={onClose}
                style={{ padding: 13, fontSize: 15 }}
              >
                Cancel
              </Btn>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── EXPENSE LIST ─────────────────────────────────────────────────────────────
function ExpenseList({ data, onToggleToSettle, onDelete, onUpdate }) {
  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };
  const mk = monthKey(today());
  const [filter, setFilter] = useState({
    month: mk,
    account: 'All',
    category: 'All',
    type: 'All',
    settled: 'All',
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const sf = (k, v) => setFilter((f) => ({ ...f, [k]: v }));
  const allMonths = [...new Set(data.expenses.map((e) => monthKey(e.date)))]
    .sort()
    .reverse();

  const filtered = data.expenses
    .filter((e) => {
      if (filter.month !== 'All' && monthKey(e.date) !== filter.month)
        return false;
      if (filter.account !== 'All' && e.account !== filter.account)
        return false;
      if (filter.category !== 'All' && e.category !== filter.category)
        return false;
      if (filter.type !== 'All' && (e.type || 'expense') !== filter.type)
        return false;
      if (filter.settled === 'pending' && (!e.toSettle || e.settled))
        return false;
      if (filter.settled === 'settled' && !e.settled) return false;
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const startEdit = (e) => {
    setEditingId(e.id);
    setEditForm({ ...e });
  };
  const saveEdit = () => {
    onUpdate(editingId, { ...editForm, amount: Number(editForm.amount) });
    setEditingId(null);
  };

  const selStyle = {
    background: C.bg,
    border: `1px solid ${C.border}`,
    color: C.text1,
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card style={{ padding: '12px 18px' }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span style={{ color: C.muted, fontSize: 12 }}>Filter:</span>
          <select
            style={selStyle}
            value={filter.month}
            onChange={(e) => sf('month', e.target.value)}
          >
            <option value="All">All Months</option>
            {allMonths.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <select
            style={selStyle}
            value={filter.type}
            onChange={(e) => sf('type', e.target.value)}
          >
            <option value="All">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>
          <select
            style={selStyle}
            value={filter.account}
            onChange={(e) => sf('account', e.target.value)}
          >
            <option value="All">All Accounts</option>
            {ACCOUNT_TYPES(names).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            style={selStyle}
            value={filter.category}
            onChange={(e) => sf('category', e.target.value)}
          >
            <option value="All">All Categories</option>
            {[
              ...data.settings.expenseCategories,
              ...data.settings.incomeCategories,
            ].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: C.bg }}>
                {[
                  'Date',
                  'Category',
                  'Amount',
                  'Account',
                  'Note',
                  'Actions',
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '11px 14px',
                      color: C.muted,
                      fontWeight: 600,
                      textAlign: 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                if (editingId === e.id) {
                  return (
                    <tr
                      key={e.id}
                      style={{
                        background: C.bg + '99',
                        borderTop: `1px solid ${C.amber}`,
                      }}
                    >
                      <td style={{ padding: 8 }}>
                        <Inp
                          type="date"
                          value={editForm.date}
                          onChange={(ev) =>
                            setEditForm({ ...editForm, date: ev.target.value })
                          }
                        />
                      </td>
                      <td style={{ padding: 8 }}>
                        <Sel
                          value={editForm.category}
                          onChange={(ev) =>
                            setEditForm({
                              ...editForm,
                              category: ev.target.value,
                            })
                          }
                        >
                          {[
                            ...data.settings.expenseCategories,
                            ...data.settings.incomeCategories,
                          ].map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Sel>
                      </td>
                      <td style={{ padding: 8 }}>
                        <Inp
                          type="number"
                          value={editForm.amount}
                          onChange={(ev) =>
                            setEditForm({
                              ...editForm,
                              amount: ev.target.value,
                            })
                          }
                          style={{ width: 80 }}
                        />
                      </td>
                      <td style={{ padding: 8 }}>
                        <Sel
                          value={editForm.account}
                          onChange={(ev) =>
                            setEditForm({
                              ...editForm,
                              account: ev.target.value,
                            })
                          }
                        >
                          {ACCOUNT_TYPES(names).map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </Sel>
                      </td>
                      <td style={{ padding: 8 }}>
                        <Inp
                          value={editForm.note}
                          onChange={(ev) =>
                            setEditForm({ ...editForm, note: ev.target.value })
                          }
                        />
                      </td>
                      <td style={{ padding: 8, display: 'flex', gap: 6 }}>
                        <Btn
                          variant="success"
                          onClick={saveEdit}
                          style={{ padding: '6px 10px' }}
                        >
                          ✓
                        </Btn>
                        <Btn
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          style={{ padding: '6px 10px' }}
                        >
                          ✕
                        </Btn>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={e.id}
                    style={{
                      borderTop: `1px solid ${C.border}`,
                      background: i % 2 === 0 ? 'transparent' : C.bg + '80',
                    }}
                  >
                    <td style={{ padding: '10px 14px', color: C.text2 }}>
                      {e.date}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.text1 }}>
                      {e.category}
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        color: e.type === 'income' ? C.green : C.textW,
                        fontWeight: 700,
                      }}
                    >
                      {e.type === 'income' ? '+' : ''}
                      {fmt(e.amount, data.settings.currency)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Badge color={e.account === 'Joint' ? C.green : C.blue}>
                        {e.account}
                      </Badge>
                    </td>
                    <td style={{ padding: '10px 14px', color: C.muted }}>
                      {e.note || '—'}
                    </td>
                    <td
                      style={{ padding: '10px 14px', display: 'flex', gap: 6 }}
                    >
                      <Btn
                        variant="ghost"
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => startEdit(e)}
                      >
                        Edit
                      </Btn>
                      <Btn
                        variant="danger"
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => onDelete(e.id)}
                      >
                        ✕
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── SETTLEMENT DASHBOARD ─────────────────────────────────────────────────────
function SettleDashboard({ data, onBulkSettle, onSettleOne }) {
  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };
  const [selected, setSelected] = useState(new Set());
  const pending = data.expenses.filter(
    (e) => e.toSettle && !e.settled && e.account !== 'Joint'
  );
  const pendingA = pending.filter(
    (e) => e.account.includes(names.a) || e.account.includes('Partner A')
  );
  const pendingB = pending.filter(
    (e) => e.account.includes(names.b) || e.account.includes('Partner B')
  );
  const totalA = pendingA.reduce((s, e) => s + e.amount, 0);
  const totalB = pendingB.reduce((s, e) => s + e.amount, 0);

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const selectAll = (arr) =>
    setSelected((s) => {
      const n = new Set(s);
      arr.forEach((e) => n.add(e.id));
      return n;
    });
  const clearGroup = (arr) =>
    setSelected((s) => {
      const n = new Set(s);
      arr.forEach((e) => n.delete(e.id));
      return n;
    });

  const settleSelected = () => {
    onBulkSettle([...selected]);
    setSelected(new Set());
  };

  const SettleTable = ({ items, partner, color }) => (
    <Card style={{ marginBottom: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <div>
          <SectionTitle style={{ margin: 0 }}>{partner}</SectionTitle>
          <div
            style={{
              color: color,
              fontWeight: 800,
              fontSize: 18,
              marginTop: 2,
            }}
          >
            {fmt(
              items.reduce((s, e) => s + e.amount, 0),
              data.settings.currency
            )}{' '}
            pending
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn
            variant="ghost"
            style={{ fontSize: 12, padding: '5px 10px' }}
            onClick={() => selectAll(items)}
          >
            Select All
          </Btn>
          <Btn
            variant="ghost"
            style={{ fontSize: 12, padding: '5px 10px' }}
            onClick={() => clearGroup(items)}
          >
            Clear
          </Btn>
        </div>
      </div>
      {items.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13 }}>🎉 All settled!</p>
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: C.bg }}>
              {['', 'Date', 'Category', 'Amount', 'Note'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '9px 12px',
                    color: C.muted,
                    fontWeight: 600,
                    textAlign: 'left',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((e, i) => (
              <tr
                key={e.id}
                style={{
                  borderTop: `1px solid ${C.border}`,
                  background: selected.has(e.id) ? color + '11' : 'transparent',
                }}
              >
                <td style={{ padding: '9px 12px' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(e.id)}
                    onChange={() => toggle(e.id)}
                    style={{ cursor: 'pointer', accentColor: color }}
                  />
                </td>
                <td style={{ padding: '9px 12px', color: C.text2 }}>
                  {e.date}
                </td>
                <td style={{ padding: '9px 12px', color: C.text1 }}>
                  {e.category}
                </td>
                <td
                  style={{
                    padding: '9px 12px',
                    color: C.textW,
                    fontWeight: 700,
                  }}
                >
                  {fmt(e.amount, data.settings.currency)}
                </td>
                <td style={{ padding: '9px 12px', color: C.muted }}>
                  {e.note || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <StatCard
          label={`${names.a} — Pending`}
          value={fmt(totalA, data.settings.currency)}
          accent={C.purple}
          icon="👤"
          sub={`${pendingA.length} transactions`}
        />
        <StatCard
          label={`${names.b} — Pending`}
          value={fmt(totalB, data.settings.currency)}
          accent={C.blue}
          icon="👤"
          sub={`${pendingB.length} transactions`}
        />
      </div>

      {selected.size > 0 && (
        <Card
          style={{
            background: C.green + '11',
            border: `1px solid ${C.green}44`,
            padding: '14px 18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ color: C.green, fontWeight: 700, fontSize: 15 }}>
                {selected.size} transactions selected
              </span>
              <span style={{ color: C.text1, fontSize: 13, marginLeft: 10 }}>
                Total:{' '}
                {fmt(
                  [...selected].reduce((s, id) => {
                    const e = data.expenses.find((x) => x.id === id);
                    return s + (e?.amount || 0);
                  }, 0),
                  data.settings.currency
                )}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn
                variant="ghost"
                onClick={() => setSelected(new Set())}
                style={{ fontSize: 12 }}
              >
                Deselect All
              </Btn>
              <Btn
                variant="success"
                onClick={settleSelected}
                style={{ fontSize: 13 }}
              >
                ✓ Settle Selected
              </Btn>
            </div>
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <SettleTable
          items={pendingA}
          partner={`${names.a}'s Expenses`}
          color={C.purple}
        />
        <SettleTable
          items={pendingB}
          partner={`${names.b}'s Expenses`}
          color={C.blue}
        />
      </div>

      <Card>
        <SectionTitle>Recently Settled</SectionTitle>
        {(() => {
          const recent = data.expenses
            .filter((e) => e.settled)
            .slice(-5)
            .reverse();
          if (!recent.length)
            return (
              <p style={{ color: C.muted, fontSize: 13 }}>
                No settlements yet.
              </p>
            );
          return recent.map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div>
                <span style={{ color: C.text1, fontSize: 13 }}>
                  {e.category}
                </span>
                <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>
                  {e.date}
                </span>
                {e.settledFor && (
                  <Badge color={C.teal} style={{ marginLeft: 8 }}>
                    ↩ {e.settledFor.includes('A') ? names.a : names.b}
                  </Badge>
                )}
              </div>
              <span style={{ color: C.green, fontWeight: 700 }}>
                {fmt(e.amount, data.settings.currency)}
              </span>
            </div>
          ));
        })()}
      </Card>
    </div>
  );
}

// ─── CONTRIBUTIONS ────────────────────────────────────────────────────────────
function Contributions({ data, onUpdate }) {
  const currentMonth = monthKey(today());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };

  // Generate a list of the last 12 months for the dropdown
  const monthOptions = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return monthKey(d.toISOString().slice(0, 10));
  });

  const existing = data.contributions.find(
    (c) => c.month === selectedMonth
  ) || {
    partnerA: 0,
    partnerB: 0,
  };

  const [vals, setVals] = useState({
    partnerA: existing.partnerA,
    partnerB: existing.partnerB,
  });
  const [flash, setFlash] = useState(false);

  // Update inputs if the selected month changes
  useEffect(() => {
    setVals({ partnerA: existing.partnerA, partnerB: existing.partnerB });
  }, [selectedMonth, data.contributions]);

  const save = () => {
    onUpdate(selectedMonth, Number(vals.partnerA), Number(vals.partnerB));
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };

  const pool = (Number(vals.partnerA) || 0) + (Number(vals.partnerB) || 0);
  const history = [...data.contributions].sort((a, b) =>
    b.month.localeCompare(a.month)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card style={{ maxWidth: 520 }}>
        {/* NEW HEADER WITH DROPDOWN */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <SectionTitle style={{ margin: 0 }}>
            Monthly Contributions
          </SectionTitle>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              background: C.bg,
              border: `1px solid ${C.border}`,
              color: C.text1,
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)} {m === currentMonth ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
            marginBottom: 14,
          }}
        >
          <div>
            <Label>{names.a} (₹)</Label>
            <Inp
              type="number"
              value={vals.partnerA}
              onChange={(e) =>
                setVals((v) => ({ ...v, partnerA: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>{names.b} (₹)</Label>
            <Inp
              type="number"
              value={vals.partnerB}
              onChange={(e) =>
                setVals((v) => ({ ...v, partnerB: e.target.value }))
              }
            />
          </div>
        </div>

        <div
          style={{
            background: C.bg,
            borderRadius: 10,
            padding: '11px 14px',
            marginBottom: 14,
          }}
        >
          <span style={{ color: C.text2, fontSize: 13 }}>Joint Pool: </span>
          <span style={{ color: C.green, fontWeight: 800, fontSize: 18 }}>
            {fmt(pool, data.settings.currency)}
          </span>
        </div>

        <Btn
          variant={flash ? 'success' : 'primary'}
          onClick={save}
          style={{ width: '100%', padding: 12 }}
        >
          {flash ? '✓ Saved!' : 'Save Contributions'}
        </Btn>
      </Card>

      {history.length > 0 && (
        <Card>
          <SectionTitle>History</SectionTitle>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: C.bg }}>
                {['Month', names.a, names.b, 'Total Pool'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 14px',
                      color: C.muted,
                      fontWeight: 600,
                      textAlign: 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((c, i) => (
                <tr
                  key={c.month}
                  style={{
                    borderTop: `1px solid ${C.border}`,
                    background: i % 2 === 0 ? 'transparent' : C.bg + '80',
                  }}
                >
                  <td
                    style={{
                      padding: '10px 14px',
                      color: C.text1,
                      fontWeight: 600,
                    }}
                  >
                    {monthLabel(c.month)}
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      color: C.purple,
                      fontWeight: 600,
                    }}
                  >
                    {fmt(c.partnerA, data.settings.currency)}
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      color: C.blue,
                      fontWeight: 600,
                    }}
                  >
                    {fmt(c.partnerB, data.settings.currency)}
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      color: C.green,
                      fontWeight: 800,
                    }}
                  >
                    {fmt(c.partnerA + c.partnerB, data.settings.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ─── GOALS ────────────────────────────────────────────────────────────────────
function Goals({ data, onUpdate, onAdd, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [adding, setAdding] = useState(false);
  const [newGoal, setNewGoal] = useState({
    name: '',
    target: '',
    current: '',
    icon: '🎯',
    color: C.amber,
  });

  const COLORS = [
    C.amber,
    C.green,
    C.blue,
    C.purple,
    C.red,
    C.teal,
    '#f97316',
    '#ec4899',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn variant="primary" onClick={() => setAdding(true)}>
          + Add Goal
        </Btn>
      </div>
      {adding && (
        <Card style={{ border: `1px solid ${C.amber}44` }}>
          <SectionTitle>New Goal</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <div>
                <Label>Name</Label>
                <Inp
                  value={newGoal.name}
                  onChange={(e) =>
                    setNewGoal((g) => ({ ...g, name: e.target.value }))
                  }
                  placeholder="e.g. Emergency Fund"
                />
              </div>
              <div>
                <Label>Icon (emoji)</Label>
                <Inp
                  value={newGoal.icon}
                  onChange={(e) =>
                    setNewGoal((g) => ({ ...g, icon: e.target.value }))
                  }
                />
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <div>
                <Label>Target Amount</Label>
                <Inp
                  type="number"
                  value={newGoal.target}
                  onChange={(e) =>
                    setNewGoal((g) => ({ ...g, target: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Current Saved</Label>
                <Inp
                  type="number"
                  value={newGoal.current}
                  onChange={(e) =>
                    setNewGoal((g) => ({ ...g, current: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Color</Label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {COLORS.map((c) => (
                  <div
                    key={c}
                    onClick={() => setNewGoal((g) => ({ ...g, color: c }))}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: c,
                      cursor: 'pointer',
                      border:
                        newGoal.color === c
                          ? `3px solid #fff`
                          : '3px solid transparent',
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn
                variant="primary"
                onClick={() => {
                  onAdd(newGoal);
                  setNewGoal({
                    name: '',
                    target: '',
                    current: '',
                    icon: '🎯',
                    color: C.amber,
                  });
                  setAdding(false);
                }}
              >
                Save Goal
              </Btn>
              <Btn variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Btn>
            </div>
          </div>
        </Card>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))',
          gap: 16,
        }}
      >
        {data.goals.map((g) => {
          const pct = Math.min(100, (g.current / g.target) * 100);
          return (
            <Card key={g.id}>
              {editing === g.id ? (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                    }}
                  >
                    <div>
                      <Label>Name</Label>
                      <Inp
                        value={form.name}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, name: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Icon</Label>
                      <Inp
                        value={form.icon}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, icon: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Target</Label>
                    <Inp
                      type="number"
                      value={form.target}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, target: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Current</Label>
                    <Inp
                      type="number"
                      value={form.current}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, current: e.target.value }))
                      }
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn
                      variant="primary"
                      style={{ flex: 1 }}
                      onClick={() => {
                        onUpdate(g.id, form);
                        setEditing(null);
                      }}
                    >
                      Save
                    </Btn>
                    <Btn
                      variant="ghost"
                      style={{ flex: 1 }}
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Btn>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 14,
                    }}
                  >
                    <span style={{ fontSize: 28 }}>{g.icon}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn
                        variant="ghost"
                        style={{ fontSize: 11, padding: '4px 9px' }}
                        onClick={() => {
                          setEditing(g.id);
                          setForm({
                            name: g.name,
                            icon: g.icon,
                            target: g.target,
                            current: g.current,
                          });
                        }}
                      >
                        Edit
                      </Btn>
                      <Btn
                        variant="danger"
                        style={{ fontSize: 11, padding: '4px 9px' }}
                        onClick={() => onDelete(g.id)}
                      >
                        ✕
                      </Btn>
                    </div>
                  </div>
                  <div
                    style={{
                      color: C.textW,
                      fontWeight: 700,
                      fontSize: 16,
                      marginBottom: 10,
                    }}
                  >
                    {g.name}
                  </div>
                  <ProgressBar pct={pct} color={g.color} height={10} />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: 8,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: g.color,
                          fontWeight: 800,
                          fontSize: 18,
                        }}
                      >
                        {fmt(g.current, data.settings.currency)}
                      </div>
                      <div style={{ color: C.muted, fontSize: 11 }}>saved</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: C.textW, fontWeight: 600 }}>
                        {fmt(g.target, data.settings.currency)}
                      </div>
                      <div style={{ color: C.muted, fontSize: 11 }}>goal</div>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      padding: '8px 12px',
                      background: C.bg,
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ color: C.muted, fontSize: 12 }}>
                      {pct.toFixed(1)}% ·{' '}
                    </span>
                    <span
                      style={{ color: g.color, fontSize: 12, fontWeight: 700 }}
                    >
                      {fmt(g.target - g.current, data.settings.currency)} to go
                    </span>
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

// ─── EMI TRACKER ─────────────────────────────────────────────────────────────
function LoanTracker({ data, onAdd, onUpdate, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const blank = {
    name: '',
    lender: '',
    principal: '',
    outstanding: '',
    emi: '',
    interestRate: '',
    startDate: today(),
    tenureMonths: '',
    icon: '🏠',
  };
  const [form, setForm] = useState(blank);
  const cur = data.settings.currency;

  const totalEMI = data.loans.reduce((s, l) => s + l.emi, 0);
  const totalOutstanding = data.loans.reduce((s, l) => s + l.outstanding, 0);

  const LoanForm = ({ val, onChange, onSave, onCancel }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <Label>Loan Name</Label>
          <Inp
            value={val.name}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="e.g. Home Loan"
          />
        </div>
        <div>
          <Label>Icon</Label>
          <Inp
            value={val.icon}
            onChange={(e) => onChange('icon', e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>Lender</Label>
        <Inp
          value={val.lender}
          onChange={(e) => onChange('lender', e.target.value)}
          placeholder="Bank name"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <Label>Principal Amount (₹)</Label>
          <Inp
            type="number"
            value={val.principal}
            onChange={(e) => onChange('principal', e.target.value)}
          />
        </div>
        <div>
          <Label>Outstanding (₹)</Label>
          <Inp
            type="number"
            value={val.outstanding}
            onChange={(e) => onChange('outstanding', e.target.value)}
          />
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: 10,
        }}
      >
        <div>
          <Label>Monthly EMI (₹)</Label>
          <Inp
            type="number"
            value={val.emi}
            onChange={(e) => onChange('emi', e.target.value)}
          />
        </div>
        <div>
          <Label>Rate (%)</Label>
          <Inp
            type="number"
            step="0.1"
            value={val.interestRate}
            onChange={(e) => onChange('interestRate', e.target.value)}
          />
        </div>
        <div>
          <Label>Tenure (mo)</Label>
          <Inp
            type="number"
            value={val.tenureMonths}
            onChange={(e) => onChange('tenureMonths', e.target.value)}
          />
        </div>
        <div>
          <Label>EMI Day (1-31)</Label>
          <Inp
            type="number"
            min="1"
            max="31"
            value={val.paymentDay || ''}
            onChange={(e) => onChange('paymentDay', e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>Start Date</Label>
        <Inp
          type="date"
          value={val.startDate}
          onChange={(e) => onChange('startDate', e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="primary" style={{ flex: 1 }} onClick={onSave}>
          Save Loan
        </Btn>
        <Btn variant="ghost" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </Btn>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
          gap: 12,
        }}
      >
        <StatCard
          label="Total Monthly EMI"
          value={fmt(totalEMI, cur)}
          accent={C.teal}
          icon="📅"
          sub={`${data.loans.length} active loans`}
        />
        <StatCard
          label="Total Outstanding"
          value={fmt(totalOutstanding, cur)}
          accent={C.red}
          icon="💳"
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn
          variant="primary"
          onClick={() => {
            setAdding(true);
            setForm(blank);
          }}
        >
          + Add Loan
        </Btn>
      </div>

      {adding && (
        <Card style={{ border: `1px solid ${C.teal}44` }}>
          <SectionTitle>New Loan / EMI</SectionTitle>
          <LoanForm
            val={form}
            onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
            onSave={() => {
              onAdd({
                ...form,
                id: uid(),
                principal: Number(form.principal),
                outstanding: Number(form.outstanding),
                emi: Number(form.emi),
                interestRate: Number(form.interestRate),
                tenureMonths: Number(form.tenureMonths),
              });
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </Card>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
          gap: 16,
        }}
      >
        {data.loans.map((l) => {
          const paidPct = ((l.principal - l.outstanding) / l.principal) * 100;
          const monthsLeft = Math.ceil(l.outstanding / l.emi);
          return (
            <Card key={l.id}>
              {editing === l.id ? (
                <>
                  <SectionTitle>Edit — {l.name}</SectionTitle>
                  <LoanForm
                    val={form}
                    onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                    onSave={() => {
                      onUpdate(l.id, {
                        ...form,
                        principal: Number(form.principal),
                        outstanding: Number(form.outstanding),
                        emi: Number(form.emi),
                        interestRate: Number(form.interestRate),
                        tenureMonths: Number(form.tenureMonths),
                      });
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </>
              ) : (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 28, marginRight: 8 }}>
                        {l.icon}
                      </span>
                      <span
                        style={{
                          color: C.textW,
                          fontWeight: 700,
                          fontSize: 17,
                        }}
                      >
                        {l.name}
                      </span>
                      <div
                        style={{ color: C.muted, fontSize: 12, marginTop: 2 }}
                      >
                        {l.lender} · {l.interestRate}% p.a.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn
                        variant="ghost"
                        style={{ fontSize: 11, padding: '4px 9px' }}
                        onClick={() => {
                          setEditing(l.id);
                          setForm({ ...l });
                        }}
                      >
                        Edit
                      </Btn>
                      <Btn
                        variant="danger"
                        style={{ fontSize: 11, padding: '4px 9px' }}
                        onClick={() => onDelete(l.id)}
                      >
                        ✕
                      </Btn>
                    </div>
                  </div>
                  <ProgressBar pct={paidPct} color={C.teal} height={10} />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      margin: '8px 0 14px',
                    }}
                  >
                    <span style={{ color: C.muted, fontSize: 12 }}>
                      {paidPct.toFixed(1)}% paid off
                    </span>
                    <span
                      style={{ color: C.teal, fontSize: 12, fontWeight: 600 }}
                    >
                      ~{monthsLeft} months left
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                    }}
                  >
                    {[
                      {
                        label: 'Outstanding',
                        val: fmt(l.outstanding, cur),
                        color: C.red,
                      },
                      {
                        label: 'Monthly EMI',
                        val: fmt(l.emi, cur),
                        color: C.teal,
                      },
                      {
                        label: 'Principal',
                        val: fmt(l.principal, cur),
                        color: C.text1,
                      },
                      { label: 'Started', val: l.startDate, color: C.text1 },
                    ].map(({ label, val, color }) => (
                      <div
                        key={label}
                        style={{
                          background: C.bg,
                          borderRadius: 8,
                          padding: '10px 12px',
                        }}
                      >
                        <div style={{ color: C.muted, fontSize: 11 }}>
                          {label}
                        </div>
                        <div
                          style={{
                            color,
                            fontWeight: 700,
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        >
                          {val}
                        </div>
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

// ─── AI INSIGHTS ─────────────────────────────────────────────────────────────
function AIInsights({ data }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('monthly');

  const MODES = [
    { id: 'monthly', label: '📊 Monthly Summary' },
    { id: 'anomalies', label: '🔍 Unusual Spending' },
    { id: 'advice', label: '💡 Financial Advice' },
    { id: 'loans', label: '🏧 Loan Strategy' },
  ];

  const generate = async () => {
    setLoading(true);
    setReport(null);
    setError(null);
    const names = {
      a: data.settings.partnerAName,
      b: data.settings.partnerBName,
    };
    const mk = monthKey(today());
    const monthExp = data.expenses.filter((e) => monthKey(e.date) === mk);
    const catTotals = {};
    monthExp.forEach((e) => {
      catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
    });
    const contrib = data.contributions.find((c) => c.month === mk) || {
      partnerA: 0,
      partnerB: 0,
    };
    const totalEMI = data.loans.reduce((s, l) => s + l.emi, 0);

    const prompts = {
      monthly: `You are a personal finance advisor for a couple in India. Analyze their spending data and write a warm, practical monthly summary. Couple: ${
        names.a
      } and ${names.b}. Month: ${monthLabel(mk)}. Joint contributions: ${
        names.a
      }: ₹${contrib.partnerA}, ${names.b}: ₹${
        contrib.partnerB
      }. Spending by category: ${JSON.stringify(
        catTotals
      )}. Total monthly EMI commitment: ₹${totalEMI}. Goals progress: ${data.goals
        .map((g) => `${g.name}: ${((g.current / g.target) * 100).toFixed(0)}%`)
        .join(', ')}. Category budgets: ${JSON.stringify(
        data.settings.budgets
      )}. Write a 3-4 paragraph summary covering: (1) overall spending health, (2) notable patterns or concerns by category, (3) how they're tracking against budgets, (4) one actionable recommendation for next month. Be specific with numbers and direct. Format with clear paragraphs, no bullet points.`,
      anomalies: `You are a sharp financial analyst. Look at this couple's spending data and identify genuinely unusual patterns, spikes, or concerns. Names: ${
        names.a
      } and ${names.b}. This month's category spending: ${JSON.stringify(
        catTotals
      )}. Budgets set: ${JSON.stringify(
        data.settings.budgets
      )}. Monthly EMI: ₹${totalEMI}. Identify 3-4 specific anomalies or patterns worth their attention. Be concrete — mention actual numbers and categories. If something looks healthy, say so too. Write in clear paragraphs.`,
      advice: `You are a trusted personal finance advisor for an Indian couple managing a shared household budget. Give them 4-5 specific, actionable pieces of advice based on their actual data. Combined monthly joint contributions: ₹${
        contrib.partnerA + contrib.partnerB
      }. This month's spending by category: ${JSON.stringify(
        catTotals
      )}. Active loans: ${data.loans
        .map(
          (l) => `${l.name}: ₹${l.outstanding} outstanding @ ${l.interestRate}%`
        )
        .join('; ')}. Financial goals: ${data.goals
        .map(
          (g) => `${g.name}: ${((g.current / g.target) * 100).toFixed(0)}% done`
        )
        .join(
          '; '
        )}. Give advice that is practical for an Indian household. Reference their specific numbers. Write in clear paragraphs.`,
      loans: `You are a debt management expert. Analyze this couple's loan portfolio and give strategic advice. Loans: ${data.loans
        .map(
          (l) =>
            `- ${l.name}: Principal ₹${l.principal}, Outstanding ₹${l.outstanding}, EMI ₹${l.emi}/month @ ${l.interestRate}%, started ${l.startDate}`
        )
        .join(
          '\n'
        )}. Total monthly EMI burden: ₹${totalEMI}. Monthly joint contribution: ₹${
        contrib.partnerA + contrib.partnerB
      }. Cover: (1) which loan to prioritize for prepayment and why, (2) overall debt-to-income health, (3) estimated time to debt freedom with current EMIs, (4) one concrete strategy to reduce total interest. Be specific with numbers.`,
    };

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey)
        throw new Error('Missing Gemini API Key in .env.local file.');

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompts[mode] }] }],
          }),
        }
      );

      const d = await res.json();
      if (d.error) throw new Error(d.error.message);

      const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('No response from Gemini API');

      setReport(text);
    } catch (e) {
      setError('Could not generate insights: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <SectionTitle>AI-Powered Financial Insights</SectionTitle>
        <p
          style={{
            color: C.text1,
            fontSize: 14,
            margin: '0 0 18px',
            lineHeight: 1.6,
          }}
        >
          Get personalised insights generated by Claude based on your actual
          spending data, goals, and loans.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 18,
          }}
        >
          {MODES.map((m) => (
            <Btn
              key={m.id}
              variant={mode === m.id ? 'primary' : 'ghost'}
              onClick={() => setMode(m.id)}
              style={{ fontSize: 13 }}
            >
              {m.label}
            </Btn>
          ))}
        </div>
        <Btn
          variant="primary"
          onClick={generate}
          style={{ padding: '11px 24px', fontSize: 14 }}
          disabled={loading}
        >
          {loading ? 'Generating…' : '✨ Generate Insight'}
        </Btn>
      </Card>

      {loading && (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <div
            style={{
              color: C.amber,
              fontSize: 32,
              marginBottom: 12,
              animation: 'spin 1.2s linear infinite',
            }}
          >
            ✨
          </div>
          <div style={{ color: C.text1, fontSize: 15 }}>
            Claude is analysing your finances…
          </div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </Card>
      )}

      {error && (
        <Card
          style={{ border: `1px solid ${C.red}44`, background: C.red + '11`' }}
        >
          <p style={{ color: C.red, margin: 0 }}>{error}</p>
        </Card>
      )}

      {report && (
        <Card style={{ border: `1px solid ${C.amber}33` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 20 }}>✨</span>
            <span style={{ color: C.textW, fontWeight: 700, fontSize: 15 }}>
              {MODES.find((m) => m.id === mode)?.label}
            </span>
            <span style={{ color: C.muted, fontSize: 12, marginLeft: 'auto' }}>
              {monthLabel(monthKey(today()))}
            </span>
          </div>
          <div
            style={{
              color: C.text1,
              fontSize: 14,
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
            }}
          >
            {report}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function Settings({
  data,
  householdId,
  onSave,
  onExport,
  onImport,
  onJoinHousehold,
}) {
  const [s, setS] = useState(JSON.parse(JSON.stringify(data.settings)));
  const [flash, setFlash] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const [newExpCat, setNewExpCat] = useState('');
  const [newIncCat, setNewIncCat] = useState('');
  const fileRef = useRef();

  const save = () => {
    onSave(s);
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };
  const addExpCat = () => {
    if (newExpCat.trim()) {
      setS((x) => ({
        ...x,
        expenseCategories: [...x.expenseCategories, newExpCat.trim()],
      }));
      setNewExpCat('');
    }
  };
  const addIncCat = () => {
    if (newIncCat.trim()) {
      setS((x) => ({
        ...x,
        incomeCategories: [...x.incomeCategories, newIncCat.trim()],
      }));
      setNewIncCat('');
    }
  };
  const removeExpCat = (c) =>
    setS((x) => ({
      ...x,
      expenseCategories: x.expenseCategories.filter((e) => e !== c),
    }));
  const removeIncCat = (c) =>
    setS((x) => ({
      ...x,
      incomeCategories: x.incomeCategories.filter((e) => e !== c),
    }));

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    parseImport(file, (result, err) => {
      if (err) {
        setImportMsg({ type: 'error', text: err });
        return;
      }
      onImport(result);
      setImportMsg({
        type: 'success',
        text: `Imported ${result.expenses.length} transactions successfully!`,
      });
      setTimeout(() => setImportMsg(null), 4000);
    });
    e.target.value = '';
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        maxWidth: 720,
      }}
    >
      {/* Partner names */}
      <Card>
        <SectionTitle>Partner Names</SectionTitle>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}
        >
          <div>
            <Label>Partner A Name</Label>
            <Inp
              value={s.partnerAName}
              onChange={(e) =>
                setS((x) => ({ ...x, partnerAName: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Partner B Name</Label>
            <Inp
              value={s.partnerBName}
              onChange={(e) =>
                setS((x) => ({ ...x, partnerBName: e.target.value }))
              }
            />
          </div>
        </div>
      </Card>
      {/* Multiplayer / Household Sync */}
      <Card style={{ border: `1px solid ${C.teal}44` }}>
        <SectionTitle>Household Sync (Multiplayer)</SectionTitle>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 14px' }}>
          Link accounts with your partner to share the same dashboard. One of
          you should copy your code, and the other should paste it below.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Option A: Share Code */}
          <div style={{ background: C.bg, padding: 14, borderRadius: 10 }}>
            <Label>Your Household Code</Label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Inp
                readOnly
                value={householdId}
                style={{ color: C.teal, fontFamily: 'monospace' }}
              />
              <Btn
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(householdId);
                  alert('Code copied to clipboard!');
                }}
              >
                Copy
              </Btn>
            </div>
          </div>

          {/* Option B: Join Partner */}
          <div style={{ background: C.bg, padding: 14, borderRadius: 10 }}>
            <Label>Join a Partner's Household</Label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Inp
                id="join-code-input"
                placeholder="Paste their code here..."
                style={{ fontFamily: 'monospace' }}
              />
              <Btn
                variant="primary"
                onClick={() => {
                  const val = document.getElementById('join-code-input').value;
                  if (val && val.length > 20) {
                    if (
                      confirm(
                        'Warning: Joining a new household will disconnect you from your current data. Continue?'
                      )
                    ) {
                      onJoinHousehold(val.trim());
                    }
                  } else {
                    alert('Please enter a valid Household Code.');
                  }
                }}
              >
                Join
              </Btn>
            </div>
          </div>
        </div>
      </Card>

      {/* Categories */}
      <Card>
        <SectionTitle>Expense Categories</SectionTitle>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 7,
            marginBottom: 12,
          }}
        >
          {s.expenseCategories.map((c) => (
            <span
              key={c}
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 7,
                padding: '4px 10px',
                fontSize: 13,
                color: C.text1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {c}
              <span
                onClick={() => removeExpCat(c)}
                style={{
                  color: C.red,
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 15,
                  lineHeight: 1,
                }}
              >
                ×
              </span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Inp
            value={newExpCat}
            onChange={(e) => setNewExpCat(e.target.value)}
            placeholder="Add new category…"
            onKeyDown={(e) => e.key === 'Enter' && addExpCat()}
            style={{ flex: 1 }}
          />
          <Btn variant="ghost" onClick={addExpCat}>
            Add
          </Btn>
        </div>
      </Card>

      <Card>
        <SectionTitle>Income Categories</SectionTitle>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 7,
            marginBottom: 12,
          }}
        >
          {s.incomeCategories.map((c) => (
            <span
              key={c}
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 7,
                padding: '4px 10px',
                fontSize: 13,
                color: C.text1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {c}
              <span
                onClick={() => removeIncCat(c)}
                style={{
                  color: C.red,
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 15,
                  lineHeight: 1,
                }}
              >
                ×
              </span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Inp
            value={newIncCat}
            onChange={(e) => setNewIncCat(e.target.value)}
            placeholder="Add income category…"
            onKeyDown={(e) => e.key === 'Enter' && addIncCat()}
            style={{ flex: 1 }}
          />
          <Btn variant="ghost" onClick={addIncCat}>
            Add
          </Btn>
        </div>
      </Card>

      {/* Category Budgets */}
      <Card>
        <SectionTitle>Category Budgets (Monthly)</SectionTitle>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 14px' }}>
          Set monthly spending limits per category. Overages will be flagged on
          the dashboard.
        </p>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
        >
          {s.expenseCategories.map((c) => (
            <div
              key={c}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span
                style={{
                  color: C.text1,
                  fontSize: 13,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c}
              </span>
              <Inp
                type="number"
                value={s.budgets[c] || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setS((x) => ({
                    ...x,
                    budgets: { ...x.budgets, [c]: v ? Number(v) : undefined },
                  }));
                }}
                placeholder="No limit"
                style={{ width: 100, padding: '6px 10px', fontSize: 12 }}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <SectionTitle>Push Notifications</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Toggle
            checked={s.notifications.enabled}
            onChange={(v) =>
              setS((x) => ({
                ...x,
                notifications: { ...x.notifications, enabled: v },
              }))
            }
            label="Enable push notifications (browser permission required)"
          />
          {s.notifications.enabled && (
            <>
              <Toggle
                checked={s.notifications.newExpense}
                onChange={(v) =>
                  setS((x) => ({
                    ...x,
                    notifications: { ...x.notifications, newExpense: v },
                  }))
                }
                label="Notify when partner adds an expense"
              />
              <Toggle
                checked={s.notifications.settlement}
                onChange={(v) =>
                  setS((x) => ({
                    ...x,
                    notifications: { ...x.notifications, settlement: v },
                  }))
                }
                label="Notify on settlement actions"
              />
              <Toggle
                checked={s.notifications.budgetAlert}
                onChange={(v) =>
                  setS((x) => ({
                    ...x,
                    notifications: { ...x.notifications, budgetAlert: v },
                  }))
                }
                label="Alert when approaching budget limit"
              />
              {s.notifications.budgetAlert && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Label style={{ margin: 0 }}>Alert at</Label>
                  <Inp
                    type="number"
                    value={s.notifications.budgetThreshold}
                    onChange={(e) =>
                      setS((x) => ({
                        ...x,
                        notifications: {
                          ...x.notifications,
                          budgetThreshold: Number(e.target.value),
                        },
                      }))
                    }
                    style={{ width: 70 }}
                  />
                  <span style={{ color: C.text1, fontSize: 13 }}>
                    % of budget used
                  </span>
                </div>
              )}
              <Btn
                variant="ghost"
                style={{ alignSelf: 'flex-start' }}
                onClick={async () => {
                  if ('Notification' in window) {
                    const p = await Notification.requestPermission();
                    if (p === 'granted')
                      new Notification('FamilyFinance', {
                        body: 'Notifications are working! ✓',
                      });
                    else
                      alert(
                        'Please allow notifications in your browser settings.'
                      );
                  }
                }}
              >
                Test Notification
              </Btn>
            </>
          )}
        </div>
      </Card>

      {/* Data */}
      <Card>
        <SectionTitle>Data Management</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div
              style={{
                color: C.text1,
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Export to Excel
            </div>
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>
              Download all your data as a formatted .xlsx file with separate
              sheets for expenses, contributions, goals, and loans.
            </div>
            <Btn variant="success" onClick={onExport}>
              ⬇ Export to Excel
            </Btn>
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <div
              style={{
                color: C.text1,
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Import from Excel / CSV
            </div>
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>
              Import your existing expense data. The file should have an
              "Expenses" sheet matching the exported format. Existing data will
              be merged (not replaced).
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
            <Btn variant="purple" onClick={() => fileRef.current?.click()}>
              ⬆ Import File
            </Btn>
            {importMsg && (
              <div
                style={{
                  marginTop: 10,
                  padding: '9px 14px',
                  background:
                    importMsg.type === 'success'
                      ? C.green + '22'
                      : C.red + '22',
                  border: `1px solid ${
                    importMsg.type === 'success' ? C.green : C.red
                  }44`,
                  borderRadius: 8,
                  color: importMsg.type === 'success' ? C.green : C.red,
                  fontSize: 13,
                }}
              >
                {importMsg.text}
              </div>
            )}
            <div
              style={{
                marginTop: 10,
                padding: '10px 14px',
                background: C.bg,
                borderRadius: 8,
                fontSize: 12,
                color: C.muted,
              }}
            >
              <strong style={{ color: C.text1 }}>
                Import format (Expenses sheet columns):
              </strong>
              <br />
              ID, Date (YYYY-MM-DD), Type (expense/income), Category, Amount,
              Account, Added By, Note, To Settle (Yes/No), Settled (Yes/No),
              Settled For
            </div>
          </div>
        </div>
      </Card>

      <Btn
        variant={flash ? 'success' : 'primary'}
        onClick={save}
        style={{ alignSelf: 'flex-start', padding: '12px 28px', fontSize: 15 }}
      >
        {flash ? '✓ Settings Saved!' : 'Save All Settings'}
      </Btn>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  // 1. ALL state and hooks must be declared at the very top
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);

  const [view, setView] = useState('dashboard');
  const [prevView, setPrevView] = useState('dashboard'); // <-- NEW: Remembers where you came from
  const [sidebarOpen, setSidebarOpen] = useState(true); // <-- NEW: Controls sidebar width
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile(); // Check immediately
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const [loading, setLoading] = useState(true);

  // Check for login status on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load data ONLY if a session exists (This is the newly updated one!)
  useEffect(() => {
    if (session) {
      loadData(session.user.id).then((d) => {
        setData(d);
        setLoading(false);
      });
    }
  }, [session]);

  const persist = useCallback((nd) => {
    setData(nd);
  }, []);

  const notify = (title, body, settings) => {
    if (
      settings?.notifications?.enabled &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification(title, { body });
    }
  };

  // 2. Conditional returns happen AFTER all hooks are declared
  if (!session) {
    return <Auth />;
  }

  // 2. NOW we can do conditional returns (after all hooks are declared)
  if (!session) {
    return <Auth />;
  }

  if (loading || !data) {
    return (
      <div
        style={{
          background: C.bg,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 40 }}>💰</div>
        <div style={{ color: C.amber, fontSize: 17, fontWeight: 700 }}>
          Loading FamilyFinance…
        </div>
      </div>
    );
  }

  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };

  const actions = {
    addExpense: async (e) => {
      const nd = { ...data, expenses: [...data.expenses, e] };
      setData(nd);
      const { error } = await supabase.from('transactions').insert([
        {
          household_id: data.householdId,
          date: e.date,
          amount: e.amount,
          category: e.category,
          type: e.type,
          account_used: e.account,
          added_by: e.addedBy,
          note: e.note,
          to_settle: e.toSettle,
          settled: e.settled,
        },
      ]);
      if (error) alert('Failed to save to cloud: ' + error.message);
      else
        notify(
          'New Expense Added',
          `Added ₹${e.amount} for ${e.category}`,
          data.settings
        );
    },
    updateExpense: async (id, updated) => {
      setData((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? updated : e)),
      }));
      const { error } = await supabase
        .from('transactions')
        .update({
          date: updated.date,
          amount: updated.amount,
          category: updated.category,
          account_used: updated.account,
          added_by: updated.addedBy,
          note: updated.note,
          to_settle: updated.toSettle,
        })
        .eq('id', id);
      if (error) alert('Failed to update: ' + error.message);
    },
    deleteExpense: async (id) => {
      setData((prev) => ({
        ...prev,
        expenses: prev.expenses.filter((e) => e.id !== id),
      }));
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      if (error) alert('Failed to delete: ' + error.message);
    },
    toggleToSettle: async (id) => {
      const expense = data.expenses.find((e) => e.id === id);
      const newValue = !expense.toSettle;
      setData((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) =>
          e.id === id ? { ...e, toSettle: newValue } : e
        ),
      }));
      const { error } = await supabase
        .from('transactions')
        .update({ to_settle: newValue })
        .eq('id', id);
      if (error) alert('Failed to update status: ' + error.message);
    },
    bulkSettle: (ids) => {
      const idSet = new Set(ids);
      const nd = {
        ...data,
        expenses: data.expenses.map((e) => {
          if (!idSet.has(e.id)) return e;
          const partner =
            e.account.includes(names.a) || e.account.includes('Partner A')
              ? 'Partner A'
              : 'Partner B';
          return { ...e, settled: true, settledFor: partner, account: 'Joint' };
        }),
      };
      persist(nd);
      notify(
        'Settlements Processed',
        `${ids.length} expenses settled`,
        data.settings
      );
    },
    updateContrib: async (month, pA, pB) => {
      setData((prev) => ({
        ...prev,
        contributions: [
          ...prev.contributions.filter((c) => c.month !== month),
          { id: month, month, partnerA: pA, partnerB: pB },
        ],
      }));
      await supabase.from('contributions').upsert({
        id: `${data.householdId}_${month}`,
        household_id: data.householdId,
        month: month,
        partner_a: pA,
        partner_b: pB,
      });
    },
    addGoal: async (g) => {
      const newGoal = {
        ...g,
        id: uid(),
        target: Number(g.target),
        current: Number(g.current),
      };
      setData((prev) => ({ ...prev, goals: [...prev.goals, newGoal] }));
      await supabase.from('goals').insert({
        id: newGoal.id,
        household_id: data.householdId,
        name: newGoal.name,
        target: newGoal.target,
        current: newGoal.current,
        icon: newGoal.icon,
        color: newGoal.color,
      });
    },
    updateGoal: async (id, f) => {
      setData((prev) => ({
        ...prev,
        goals: prev.goals.map((g) =>
          g.id === id
            ? {
                ...g,
                ...f,
                target: Number(f.target),
                current: Number(f.current),
              }
            : g
        ),
      }));
      await supabase
        .from('goals')
        .update({
          name: f.name,
          target: Number(f.target),
          current: Number(f.current),
          icon: f.icon,
          color: f.color,
        })
        .eq('id', id);
    },
    deleteGoal: async (id) => {
      setData((prev) => ({
        ...prev,
        goals: prev.goals.filter((g) => g.id !== id),
      }));
      await supabase.from('goals').delete().eq('id', id);
    },
    addLoan: async (l) => {
      setData((prev) => ({ ...prev, loans: [...prev.loans, l] }));
      await supabase.from('loans').insert({
        id: l.id,
        household_id: data.householdId,
        name: l.name,
        lender: l.lender,
        principal: l.principal,
        outstanding: l.outstanding,
        emi: l.emi,
        interest_rate: l.interestRate,
        start_date: l.startDate,
        tenure_months: l.tenureMonths,
        payment_day: l.paymentDay,
        icon: l.icon,
      });
    },
    updateLoan: async (id, f) => {
      setData((prev) => ({
        ...prev,
        loans: prev.loans.map((l) => (l.id === id ? { ...l, ...f } : l)),
      }));
      await supabase
        .from('loans')
        .update({
          name: f.name,
          lender: f.lender,
          principal: f.principal,
          outstanding: f.outstanding,
          emi: f.emi,
          interest_rate: f.interestRate,
          start_date: f.startDate,
          tenure_months: f.tenureMonths,
          payment_day: f.paymentDay,
          icon: f.icon,
        })
        .eq('id', id);
    },
    deleteLoan: async (id) => {
      setData((prev) => ({
        ...prev,
        loans: prev.loans.filter((l) => l.id !== id),
      }));
      await supabase.from('loans').delete().eq('id', id);
    },
    saveSettings: async (s) => {
      // 1. Update the local UI state instantly
      setData((prev) => ({ ...prev, settings: s }));

      // 2. Push to Supabase and explicitly grab the error token
      const { error } = await supabase.from('household_settings').upsert({
        household_id: data.householdId,
        settings_data: s,
      });

      // 3. Alert us immediately if the cloud bounces it back
      if (error) {
        alert('Supabase rejected settings change: ' + error.message);
      }
    },
    joinHousehold: async (newHouseholdId) => {
      const { error } = await supabase
        .from('profiles')
        .update({ household_id: newHouseholdId })
        .eq('id', session.user.id);
      if (error) {
        alert('Failed to join household: ' + error.message);
        return;
      }
      setLoading(true);
      const d = await loadData(session.user.id);
      setData(d);
      setLoading(false);
      alert("Successfully joined partner's household!");
    },
    importData: ({ expenses, contributions }) => {
      const existingIds = new Set(data.expenses.map((e) => e.id));
      const newExp = expenses.filter((e) => !existingIds.has(e.id));
      const mergedContribs = contributions
        ? [
            ...data.contributions.filter(
              (c) => !contributions.find((nc) => nc.month === c.month)
            ),
            ...contributions,
          ]
        : data.contributions;
      persist({
        ...data,
        expenses: [...data.expenses, ...newExp],
        contributions: mergedContribs,
      });
    },
  };

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100vh',
        fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif",
        color: C.textW,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
      }}
    >
      {/* DESKTOP COLLAPSIBLE SIDEBAR (Hidden on Mobile) */}
      {!isMobile && (
        <div
          style={{
            width: sidebarOpen ? 240 : 80,
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            background: C.surface,
            borderRight: `1px solid ${C.border}`,
            display: 'flex',
            flexDirection: 'column',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflowX: 'hidden',
          }}
        >
          <div
            style={{
              padding: sidebarOpen ? '24px 20px' : '24px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarOpen ? 'space-between' : 'center',
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            {sidebarOpen && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minWidth: 150,
                }}
              >
                <span style={{ fontSize: 26 }}>💰</span>
                <span
                  style={{
                    color: C.amber,
                    fontWeight: 900,
                    fontSize: 18,
                    letterSpacing: -0.5,
                  }}
                >
                  FamilyFinance
                </span>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: 'transparent',
                border: 'none',
                color: C.text1,
                cursor: 'pointer',
                fontSize: 20,
                padding: 4,
              }}
            >
              {sidebarOpen ? '◀' : '☰'}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '20px 12px',
              flex: 1,
              overflowY: 'auto',
            }}
          >
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                title={n.label}
                style={{
                  background: view === n.id ? C.amber + '22' : 'transparent',
                  border: 'none',
                  color: view === n.id ? C.amber : C.text2,
                  borderRadius: 10,
                  padding: sidebarOpen ? '12px 16px' : '12px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: view === n.id ? 700 : 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  gap: 12,
                  transition: 'all .2s',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 18 }}>{n.icon}</span>
                {sidebarOpen && (
                  <span style={{ whiteSpace: 'nowrap' }}>{n.label}</span>
                )}
              </button>
            ))}
          </div>

          <div
            style={{
              padding: '20px',
              borderTop: `1px solid ${C.border}`,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={() => supabase.auth.signOut()}
              title="Log Out"
              style={{
                width: '100%',
                background: 'transparent',
                border: sidebarOpen ? `1px solid ${C.border}` : 'none',
                color: C.text2,
                borderRadius: 8,
                padding: '10px',
                fontSize: 14,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {sidebarOpen ? 'Log Out' : '🚪'}
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          height: isMobile ? 'calc(100vh - 70px)' : '100vh',
          overflowY: 'auto',
        }}
      >
        {/* MOBILE TOP HEADER */}
        {isMobile && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: `1px solid ${C.border}`,
              background: C.surface,
              position: 'sticky',
              top: 0,
              zIndex: 50,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>💰</span>
              <span style={{ color: C.amber, fontWeight: 900, fontSize: 16 }}>
                FamilyFinance
              </span>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                background: 'transparent',
                border: `1px solid ${C.border}`,
                color: C.text2,
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
              }}
            >
              Log Out
            </button>
          </div>
        )}

        <div
          style={{
            maxWidth: 1000,
            margin: '0 auto',
            padding: isMobile ? '20px 20px 100px' : '40px 40px 100px',
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h2
              style={{
                color: C.textW,
                fontSize: 28,
                fontWeight: 800,
                margin: 0,
                letterSpacing: -0.5,
              }}
            >
              {NAV.find((n) => n.id === view)?.label}
            </h2>
          </div>

          {/* VIEW ROUTER */}
          {view === 'dashboard' && (
            <Dashboard data={data} onAddExpense={actions.addExpense} />
          )}
          {view === 'add' && (
            <AddExpense
              data={data}
              onAdd={actions.addExpense}
              onClose={() => setView(prevView)}
            />
          )}
          {view === 'expenses' && (
            <ExpenseList
              data={data}
              onToggleToSettle={actions.toggleToSettle}
              onDelete={actions.deleteExpense}
              onUpdate={actions.updateExpense}
            />
          )}
          {view === 'settle' && (
            <SettleDashboard data={data} onBulkSettle={actions.bulkSettle} />
          )}
          {view === 'contributions' && (
            <Contributions data={data} onUpdate={actions.updateContrib} />
          )}
          {view === 'goals' && (
            <Goals
              data={data}
              onUpdate={actions.updateGoal}
              onAdd={actions.addGoal}
              onDelete={actions.deleteGoal}
            />
          )}
          {view === 'loans' && (
            <LoanTracker
              data={data}
              onAdd={actions.addLoan}
              onUpdate={actions.updateLoan}
              onDelete={actions.deleteLoan}
            />
          )}
          {view === 'insights' && <AIInsights data={data} />}
          {view === 'settings' && (
            <Settings
              data={data}
              householdId={data.householdId}
              onSave={actions.saveSettings}
              onExport={() => exportToExcel(data)}
              onImport={actions.importData}
              onJoinHousehold={actions.joinHousehold}
            />
          )}
        </div>

        {/* FLOATING ACTION BUTTON (FAB) */}
        {view !== 'add' && (
          <button
            onClick={() => {
              setPrevView(view);
              setView('add');
            }}
            style={{
              position: 'fixed',
              bottom: isMobile ? 90 : 40,
              right: isMobile ? 20 : 40,
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.amber}, #d97706)`,
              color: '#0b0f1a',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              boxShadow: '0 8px 24px rgba(245, 158, 11, 0.4)',
              transition: 'transform .2s',
              zIndex: 1000,
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.transform = 'scale(1.05)')
            }
            onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            +
          </button>
        )}
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      {isMobile && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: 70,
            background: C.surface,
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            overflowX: 'auto',
            padding: '0 10px',
            alignItems: 'center',
            gap: 10,
            zIndex: 900,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {NAV.filter((n) => n.id !== 'add').map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              style={{
                background: view === n.id ? C.amber + '11' : 'transparent',
                border: 'none',
                color: view === n.id ? C.amber : C.text2,
                borderRadius: 10,
                padding: '8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                minWidth: 64,
              }}
            >
              <span style={{ fontSize: 20 }}>{n.icon}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: view === n.id ? 700 : 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {n.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
