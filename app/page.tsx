'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  budgets: {} as Record<string, number | undefined>,
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
  const d = new Date(dateStr);
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
    expenses: [] as any[], // Start with a completely clean slate!
    contributions: [{ id: uid(), month: mk, partnerA: 0, partnerB: 0 }],
    goals: [] as any[],
    loans: [] as any[],
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

    // ⚡ Bulletproof Pagination Engine to bypass the 1,000 server row cap
    let allTransactions: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: txChunk, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('household_id', hId)
        .order('date', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (txError) throw txError;

      if (!txChunk || txChunk.length === 0) {
        hasMore = false;
      } else {
        allTransactions = [...allTransactions, ...txChunk];
        if (txChunk.length < pageSize) {
          hasMore = false; // We grabbed the last remnant block
        } else {
          page++; // Advance loop step to request the next 1,000 rows
        }
      }
    }

// Fetch remaining data configurations in parallel
    const [gl, ln, cb, st] = await Promise.all([
      supabase.from('goals').select('*').eq('household_id', hId),
      supabase.from('loans').select('*').eq('household_id', hId),
      supabase.from('contributions').select('*').eq('household_id', hId),
      supabase
        .from('household_settings') // ⚡ FIX: Reverted to your actual database table name!
        .select('settings_data')
        .eq('household_id', hId)
        .single(),
    ]);

    const formattedData = {
      householdId: hId,
      expenses: allTransactions.map((r: any) => ({
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
      goals: (gl.data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        target: r.target_amount, // ⚡ FIX 2: Restored safe snake_case-to-camelCase mapping
        current: r.current_amount,
        targetDate: r.target_date,
      })),
      loans: (ln.data || []).map((r: any) => ({
        ...r,
        id: r.id,
        interestRate: r.interest_rate,
        startDate: r.start_date,
        tenureMonths: r.tenure_months,
        paymentDay: r.payment_day || 1,
      })),
      contributions: (cb.data || []).map((r: any) => ({
        id: r.id, // ⚡ FIX 1: Restored true DB UUID to prevent PostgreSQL 'invalid syntax' crash
        month: r.month,
        partnerA: r.partner_a_amount,
        partnerB: r.partner_b_amount,
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
function Inp({ style = {}, ...p }: any) {
  return (
    <input
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        color: C.textW,
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 14,
        width: '100%',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s',
        ...style,
      }}
      {...p}
    />
  );
}
function Sel({ children, style = {}, ...p }: any) {
  return (
    <select
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        color: C.textW,
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 14,
        width: '100%',
        outline: 'none',
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
function Btn({ children, variant = 'primary', style = {}, ...p }: any) {
  const base = {
    padding: '10px 16px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    outline: 'none',
  };

  const variants: any = {
    primary: { background: C.amber, color: C.bg, fontWeight: 600 },
    ghost: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text2 },
    danger: { background: `${C.red}22`, border: `1px solid ${C.red}44`, color: C.red },
    success: { background: `${C.green}22`, border: `1px solid ${C.green}44`, color: C.green },
    purple: { background: `${C.purple}22`, border: `1px solid ${C.purple}44`, color: C.purple },
  };

  return (
    <button style={{ ...base, ...(variants[variant] || {}), ...style }} {...p}>
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
function Badge({ children, color, style = {} }: any) {
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
        ...style,
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
function ProgressBar({ pct, color = C.amber, height = 8 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ background: C.border, borderRadius: 99, height, overflow: 'hidden', width: '100%' }}>
      <div
        style={{
          background: color,
          height: '100%',
          width: `${Math.min(Math.max(pct, 0), 100)}%`,
          borderRadius: 99,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
}
function Toggle({ checked, onChange, label }: any) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        background: C.surface,
        borderRadius: 10,
        border: `1px solid ${C.border}`,
        cursor: 'pointer',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <span style={{ fontSize: 14, color: C.text1 }}>{label}</span>
      <div style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span
          style={{
            position: 'absolute',
            cursor: 'pointer',
            top: 0,left: 0, right: 0, bottom: 0,
            backgroundColor: checked ? C.amber : C.border,
            transition: '0.3s',
            borderRadius: 24,
          }}
        />
        <span
          style={{
            position: 'absolute',
            content: '""',
            height: 18, width: 18,
            left: checked ? 22 : 3,
            bottom: 3,
            backgroundColor: checked ? C.bg : C.text2,
            transition: '0.3s',
            borderRadius: '50%',
          }}
        />
      </div>
    </label>
  );
}
function StatCard({ label, value, sub, accent = C.amber, icon }: any) {
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
  { id: 'income', label: 'Income', icon: '💰' },
  { id: 'expenses', label: 'Expenses', icon: '📋' },
  { id: 'settle', label: 'Settlements', icon: '🔄' },
  { id: 'contributions', label: 'Contributions', icon: '🏦' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
  { id: 'loans', label: 'EMI Tracker', icon: '🏧' },
  { id: 'insights', label: 'AI Insights', icon: '✨' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

// ─── EXPORT HELPER ────────────────────────────────────────────────────────────
function exportToExcel(data: any) {
  const wb = XLSX.utils.book_new();
  // Expenses sheet
  const expRows = data.expenses.map((e: any) => ({
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
  const cRows = data.contributions.map((c: any) => ({
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
  const gRows = data.goals.map((g: any) => ({
    Name: g.name,
    Target: g.target,
    Current: g.current,
    'Progress %': ((g.current / g.target) * 100).toFixed(1),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gRows), 'Goals');
  // Loans
  const lRows = data.loans.map((l: any) => ({
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
function parseImport(file: any, callback: any) {
  const reader = new FileReader();
  reader.onload = (e: any) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const getSheet = (name: string) => {
        const sh = wb.Sheets[name];
        return sh ? XLSX.utils.sheet_to_json(sh) : [];
      };

      // ⚡ UPGRADED RESILIENT DATE PARSER ENGINE
      const normalizeDate = (val: any) => {
        if (!val) return today();
        
        // 1. Handle numeric Excel date serial integers (e.g., 45658)
        if (!isNaN(val) && Number(val) > 30000) {
          const d = new Date((Number(val) - 25569) * 86400 * 1000);
          return d.toISOString().slice(0, 10);
        }
        
        // 2. Handle text strings containing regional variations (e.g., "25/1/2025" or "25-01-2025")
        const str = String(val).trim();
        const parts = str.split(/[-/]/); // Splits cleanly across slashes or dashes

        if (parts.length === 3) {
          // Case A: Format is already YYYY-MM-DD or YYYY/MM/DD
          if (parts[0].length === 4) {
            const y = parts[0];
            const m = parts[1].padStart(2, '0');
            const d = parts[2].padStart(2, '0');
            return `${y}-${m}-${d}`;
          } 
          // Case B: Format is regional like DD/MM/YYYY or D/M/YYYY
          else if (parts[2].length === 4) {
            const d = parts[0].padStart(2, '0');
            const m = parts[1].padStart(2, '0');
            const y = parts[2];
            return `${y}-${m}-${d}`;
          }
        }
        
        // 3. Absolute native Javascript parser fallback for unconventional string patterns
        try {
          const parsed = new Date(str);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().slice(0, 10);
          }
        } catch (err) {}

        return str; // Return fallback text if completely unparseable
      };
      
      const expenses = getSheet('Expenses').map((r: any) => {
        const row: Record<string, any> = {};
        Object.keys(r).forEach((k) => {
          row[k.toLowerCase().replace(/\s+/g, '')] = r[k];
        });

        const rawType = row.type ? String(row.type).toLowerCase().trim() : 'expense';

        return {
          id: row.id || null,
          date: normalizeDate(row.date), // Runs the upgraded format normalizer
          type: rawType === 'income' ? 'income' : 'expense',
          category: row.category || 'Other',
          amount: Number(row.amount) || 0,
          account: row.account || 'Joint',
          addedBy: row.addedby || 'Partner A',
          note: row.note || '',
          toSettle: row.tosettle === 'Yes' || row.tosettle === 'true' || row.tosettle === true,
          settled: row.settled === 'Yes' || row.settled === 'true' || row.settled === true,
          settledFor: row.settledfor || null,
        };
      });

      const contribs = getSheet('Contributions').map((r: any) => {
        const row: Record<string, any> = {};
        Object.keys(r).forEach((k) => {
          row[k.toLowerCase().replace(/\s+/g, '')] = r[k];
        });
        return {
          id: row.month || null,
          month: row.month ? String(row.month).trim() : null,
          partnerA: Number(row.partnera) || 0,
          partnerB: Number(row.partnerb) || 0,
        };
      });

      callback({ expenses, contributions: contribs.length ? contribs : null });
    } catch (err: any) {
      callback(null, 'Failed to parse file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function IncomeTracker({ data }: any) {
  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };

  // ⚡ Requirement 1: Set 'CurrentYear' as the absolute default state view
  const [timeFilter, setTimeFilter] = useState<string>('CurrentYear');
  // ⚡ Requirement 4: Added Earner/Partner state filter selection logic
  const [earnerFilter, setEarnerFilter] = useState<string>('All');

  const currentYearStr = String(new Date().getFullYear());

  // Gather unique months present in dataset
  const allAvailableMonths = data.expenses
    .map((e: any) => monthKey(e.date))
    .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index)
    .sort()
    .reverse();

  // ⚡ Apply Master Filter Pipeline
  const periodInflows = data.expenses.filter((e: any) => {
    // Isolate income inflows only
    if (e.type !== 'income') return false;

    // A. Apply Time Boundary Filter Scopes
    if (timeFilter === 'CurrentYear') {
      if (!e.date.startsWith(currentYearStr)) return false;
    } else if (timeFilter !== 'All') {
      if (monthKey(e.date) !== timeFilter) return false;
    }

    // B. Apply Earner Signature Check filters
    const isA = e.addedBy === 'Partner A' || e.account === names.a;
    const isB = e.addedBy === 'Partner B' || e.account === names.b;

    if (earnerFilter === 'PartnerA' && !isA) return false;
    if (earnerFilter === 'PartnerB' && !isB) return false;

    return true;
  });

  // Calculate Aggregates for Metrics Panel cards
  const totalIncome = periodInflows.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const incomeA = periodInflows
    .filter((e: any) => e.addedBy === 'Partner A' || e.account === names.a)
    .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const incomeB = periodInflows
    .filter((e: any) => e.addedBy === 'Partner B' || e.account === names.b)
    .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  // Group by Income Streams Categories
  const categoryMap = {} as Record<string, number>;
  periodInflows.forEach((e: any) => {
    categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount;
  });
  const sortedCategories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
  const maxCategoryValue = sortedCategories[0]?.[1] || 1;

  // ⚡ Requirement 3: Build Trend Datastructure Matrix for Multi-Month selection
  const showTrendWidget = timeFilter === 'CurrentYear' || timeFilter === 'All';
  
  const trendData = [...allAvailableMonths]
    .reverse() // Display chronological flow from left to right
    .filter(mKey => {
      if (timeFilter === 'CurrentYear') return mKey.startsWith(currentYearStr);
      return true;
    })
    .map(mKey => {
      const monthTotal = data.expenses
        .filter((e: any) => e.type === 'income' && monthKey(e.date) === mKey && (
          earnerFilter === 'All' ||
          (earnerFilter === 'PartnerA' && (e.addedBy === 'Partner A' || e.account === names.a)) ||
          (earnerFilter === 'PartnerB' && (e.addedBy === 'Partner B' || e.account === names.b))
        ))
        .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      return { label: monthLabel(mKey), total: monthTotal };
    });

  const maxTrendValue = trendData.reduce((max, m) => m.total > max ? m.total : max, 1);

  const selStyle = {
    background: C.bg,
    border: `1px solid ${C.border}`,
    color: C.text1,
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
    outline: 'none'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      
      {/* FILTER PANEL HEADER CONTROLS */}
      <Card style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionTitle style={{ margin: 0 }}>💰 Income & Inflow Dashboard</SectionTitle>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          
          {/* Earner Split Select Element Dropdown */}
          <select value={earnerFilter} onChange={(e) => setEarnerFilter(e.target.value)} style={selStyle}>
            <option value="All">Both Partners Combined</option>
            <option value="PartnerA">{names.a} Only</option>
            <option value="PartnerB">{names.b} Only</option>
          </select>

          {/* Time View Select Element Dropdown */}
          <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={selStyle}>
            {/* ⚡ Requirement 2: Inject explicit collective grouping target nodes */}
            <option value="CurrentYear">Current Year ({currentYearStr})</option>
            <option value="All">All Months History</option>
            {allAvailableMonths.map((m: any) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* TOP LINE METRICS PANEL */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <StatCard
          label="Total Net Inflow Pool"
          value={fmt(totalIncome, data.settings.currency)}
          accent={C.green}
          icon="🏦"
          sub={`Accumulated earnings for selection`}
        />
        <StatCard
          label={`${names.a}'s Allocation`}
          value={fmt(incomeA, data.settings.currency)}
          accent={C.purple}
          icon="👨‍💻"
          sub={`Share: ${totalIncome > 0 ? ((incomeA / totalIncome) * 100).toFixed(0) : 0}% of net pool`}
        />
        <StatCard
          label={`${names.b}'s Allocation`}
          value={fmt(incomeB, data.settings.currency)}
          accent={C.blue}
          icon="👩‍💻"
          sub={`Share: ${totalIncome > 0 ? ((incomeB / totalIncome) * 100).toFixed(0) : 0}% of net pool`}
        />
      </div>

      {/* ⚡ Requirement 3: Conditional Monthly Trend Chart Rendering Card */}
      {showTrendWidget && trendData.length > 0 && (
        <Card>
          <SectionTitle>Monthly Inflow Velocity Trend Timeline</SectionTitle>
          <div style={{ overflowX: 'auto', paddingBottom: 6, marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 140, gap: 12, minWidth: trendData.length * 55 }}>
              {trendData.map((m) => {
                const barHeightPct = (m.total / maxTrendValue) * 100;
                return (
                  <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: m.total > 0 ? C.textW : C.muted }}>
                      {m.total > 0 ? fmt(m.total, data.settings.currency) : '₹0'}
                    </div>
                    <div style={{ height: 85, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{
                        width: '100%',
                        height: `${Math.max(6, barHeightPct)}%`,
                        background: `linear-gradient(to top, ${C.surface}, ${C.green})`,
                        border: `1px solid ${C.border}`,
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease'
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: C.text2, fontWeight: 600, whiteSpace: 'nowrap' }}>{m.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* DATA CATEGORIES AND HISTORICAL AUDIT LIST TABLES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        
        {/* Source Distribution Card */}
        <Card>
          <SectionTitle>Income Streams Breakdown</SectionTitle>
          {sortedCategories.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 13, marginTop: 10 }}>No recorded income lines found matching criteria.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
              {sortedCategories.map(([category, amount]) => (
                <div key={category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: C.text1 }}>{category}</span>
                    <span style={{ fontWeight: 700, color: C.textW }}>{fmt(amount, data.settings.currency)}</span>
                  </div>
                  <ProgressBar pct={(amount / maxCategoryValue) * 100} color={C.green} height={6} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Audit Log Card */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <SectionTitle>Inflow Audit Ledgers</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
            {periodInflows.length === 0 ? (
              <p style={{ color: C.muted, fontSize: 13 }}>No transaction records match current parameters.</p>
            ) : (
              periodInflows.map((e: any) => {
                const earnerLabel = e.account === 'Joint' ? 'Joint Account' : `${e.account} Personal`;
                return (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: `${C.bg}80`,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div>
                      <div style={{ color: C.textW, fontSize: 13, fontWeight: 600 }}>{e.note || 'Uncategorized Salary Deposit'}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                        {e.date} • {earnerLabel} • <span style={{ color: C.text2 }}>{e.category}</span>
                      </div>
                    </div>
                    <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>+{fmt(e.amount, data.settings.currency)}</span>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ data, onAddExpense }: any) {
  const [showAudit, setShowAudit] = useState(false); // ⚡ The Audit Modal Toggle

  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };

  const [rangeMode, setRangeMode] = useState<'month' | 'custom'>('month');
  const d = new Date();
  const currentMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const defaultStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const [customDates, setCustomDates] = useState({ start: defaultStart, end: today() });
  
  const [accountFilter, setAccountFilter] = useState<string>('All');

  const allAvailableMonths = data.expenses
    .map((e: any) => monthKey(e.date))
    .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index)
    .sort()
    .reverse();

  // 1. ALL-TIME CAPITAL METRICS & POOL SANITIZATION
  const uniqueContributions: any[] = Array.from(
    new Map(data.contributions.map((c: any) => [c.month, c])).values()
  ) as any[];

  const allTimePool = uniqueContributions.reduce(
    (sum: number, c: any) => sum + Number(c.partnerA || 0) + Number(c.partnerB || 0), 
    0
  );

  const allTimeJointIncome = data.expenses
    .filter((e: any) => e.account === 'Joint' && e.type === 'income')
    .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  const allTimeJointSpent = data.expenses
    .filter((e: any) => e.account === 'Joint' && e.type !== 'income')
    .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  
  const currentJointBalance = allTimePool + allTimeJointIncome - allTimeJointSpent;

  // Isolated Period Joint Spend Engine
  const periodJointSpent = data.expenses
    .filter((e: any) => {
      if (rangeMode === 'month') {
        if (monthKey(e.date) !== selectedMonth) return false;
      } else {
        if (e.date < customDates.start || e.date > customDates.end) return false;
      }
      return e.account === 'Joint' && e.type !== 'income';
    })
    .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  // Active Scope Joint Account Contribution Extraction Engine
  let contribA = 0;
  let contribB = 0;

  if (rangeMode === 'month') {
    const periodContrib: any = uniqueContributions.find((c: any) => c.month === selectedMonth);
    if (periodContrib) {
      contribA = Number(periodContrib.partnerA || 0);
      contribB = Number(periodContrib.partnerB || 0);
    }
  } else {
    const startM = customDates.start.slice(0, 7);
    const endM = customDates.end.slice(0, 7);
    const overlappingContribs = uniqueContributions.filter((c: any) => c.month >= startM && c.month <= endM);
    contribA = overlappingContribs.reduce((sum: number, c: any) => sum + Number(c.partnerA || 0), 0);
    contribB = overlappingContribs.reduce((sum: number, c: any) => sum + Number(c.partnerB || 0), 0);
  }

  const allTimeInvested = data.expenses
    .filter((e: any) => (e.category === 'Investment' || e.category === 'Investments' || e.category === 'Insurance') && e.type !== 'income')
    .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  // 2. TWIN RUN RATE ROLLING ENGINES
  const last6Months = Array.from({ length: 6 }).map((_, i) => {
    const target = new Date();
    target.setMonth(target.getMonth() - i);
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
  }).reverse();

  const lifestyleTrendData = last6Months.map((mKey) => {
    const totalSpentInMonth = data.expenses
      .filter((e: any) => monthKey(e.date) === mKey && e.type !== 'income' && e.category !== 'Investment' && e.category !== 'Investments' && e.category !== 'Insurance')
      .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    return { monthLabel: monthLabel(mKey), total: totalSpentInMonth };
  });
  const maxLifestyleTrend = lifestyleTrendData.reduce((max, m) => m.total > max ? m.total : max, 1);

  const investmentTrendData = last6Months.map((mKey) => {
    const totalInvestedInMonth = data.expenses
      .filter((e: any) => monthKey(e.date) === mKey && e.type !== 'income' && (e.category === 'Investment' || e.category === 'Investments' || e.category === 'Insurance'))
      .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    return { monthLabel: monthLabel(mKey), total: totalInvestedInMonth };
  });
  const maxInvestmentTrend = investmentTrendData.reduce((max, m) => m.total > max ? m.total : max, 1);

  // 3. APPLY ACTIVE COMBINED ACCOUNT FILTER CRITERIA
  const filteredExp = data.expenses.filter((e: any) => {
    if (rangeMode === 'month') {
      if (monthKey(e.date) !== selectedMonth) return false;
    } else {
      if (e.date < customDates.start || e.date > customDates.end) return false;
    }
    
    if (accountFilter === 'PersonalOnly') {
      if (e.account === 'Joint') return false;
    } else if (accountFilter !== 'All' && e.account !== accountFilter) {
      return false;
    }
    
    if (e.type === 'income') return false;
    return true;
  });

  const periodIncome = data.expenses.filter((e: any) => {
    if (rangeMode === 'month') {
      if (monthKey(e.date) !== selectedMonth) return false;
    } else {
      if (e.date < customDates.start || e.date > customDates.end) return false;
    }
    if (accountFilter === 'PersonalOnly') {
      if (e.account === 'Joint') return false;
    } else if (accountFilter !== 'All' && e.account !== accountFilter) {
      return false;
    }
    return e.type === 'income';
  }).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  const periodInvested = filteredExp
    .filter((e: any) => e.category === 'Investment' || e.category === 'Investments' || e.category === 'Insurance')
    .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  const totalPeriodRawExpenses = filteredExp.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const trueLifestyleExpenses = totalPeriodRawExpenses - periodInvested;

  const allocation: Record<string, number> = {
    'Mutual Funds / SIP': 0,
    'Smallcase': 0,
    'Stocks / US Equity': 0,
    'Gold / Precious Metals': 0,
    'PPF': 0,
    'NPS': 0,
    'Crypto': 0,
    'Insurance Policies': 0,
    'Other Assets': 0
  };

  filteredExp.forEach((e: any) => {
    if (e.category === 'Investment' || e.category === 'Investments' || e.category === 'Insurance') {
      const noteTxt = (e.note || '').toLowerCase();
      if (e.category === 'Insurance' || noteTxt.includes('lic') || noteTxt.includes('insurance')) {
        allocation['Insurance Policies'] += Number(e.amount || 0);
      } else if (noteTxt.includes('smallcase')) {
        allocation['Smallcase'] += Number(e.amount || 0);
      } else if (noteTxt.includes('nj')) {
        allocation['Mutual Funds / SIP'] += Number(e.amount || 0);
      } else if (noteTxt.includes('gold') || noteTxt.includes('sgb') || noteTxt.includes('bluestone') || noteTxt.includes('png') || noteTxt.includes('waman')) {
        allocation['Gold / Precious Metals'] += Number(e.amount || 0);
      } else if (noteTxt.includes('stock') || noteTxt.includes('equity') || noteTxt.includes('share') || noteTxt.includes('zerodha') || noteTxt.includes('indmoney') || noteTxt.includes('ind money')) {
        allocation['Stocks / US Equity'] += Number(e.amount || 0);
      } else if (noteTxt.includes('ppf')) {
        allocation['PPF'] += Number(e.amount || 0);
      } else if (noteTxt.includes('nps')) {
        allocation['NPS'] += Number(e.amount || 0);
      } else if (noteTxt.includes('crypto') || noteTxt.includes('bitcoin') || noteTxt.includes('btc')) {
        allocation['Crypto'] += Number(e.amount || 0);
      } else if (noteTxt.includes('mutual') || noteTxt.includes('mf') || noteTxt.includes('sip')) {
        allocation['Mutual Funds / SIP'] += Number(e.amount || 0);
      } else {
        allocation['Other Assets'] += Number(e.amount || 0);
      }
    }
  });

  const maxAllocationValue = Object.values(allocation).reduce((max: number, val: number) => val > max ? val : max, 1);

  const personalSpentA = filteredExp.filter((e: any) => e.account !== 'Joint' && (e.addedBy === 'Partner A' || e.account === names.a)).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const personalSpentB = filteredExp.filter((e: any) => e.account !== 'Joint' && (e.addedBy === 'Partner B' || e.account === names.b)).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  const savingsDelta = periodIncome - trueLifestyleExpenses;
  const savingsRate = periodIncome > 0 ? Math.max(0, (savingsDelta / periodIncome) * 100) : 0;

  const catMap = {} as Record<string, number>;
  filteredExp.filter((e: any) => e.category !== 'Investment' && e.category !== 'Investments' && e.category !== 'Insurance').forEach((e: any) => {
    catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount || 0);
  });
  
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const maxCat = topCats[0]?.[1] || 1;

  const labelStyle = { color: C.muted, fontSize: 12, fontWeight: 600, marginRight: 4 };
  const toggleBtnStyle = (active: boolean) => ({
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 6,
    background: active ? C.amber : 'transparent',
    color: active ? C.bg : C.text1,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.2s'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      
      {/* FILTER CONTROL PANEL */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Card style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: C.bg, padding: 3, borderRadius: 8, display: 'inline-flex', border: `1px solid ${C.border}` }}>
              <button onClick={() => setRangeMode('month')} style={toggleBtnStyle(rangeMode === 'month' as any)}>Single Month</button>
              <button onClick={() => setRangeMode('custom')} style={toggleBtnStyle(rangeMode === 'custom' as any)}>Custom Range</button>
            </div>
            {rangeMode === 'month' ? (
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text1, padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                {allAvailableMonths.map((m: any) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Inp type="date" value={customDates.start} onChange={(e: any) => setCustomDates({ ...customDates, start: e.target.value })} style={{ width: 130, padding: '4px 8px' }} />
                <span style={{ color: C.muted, fontSize: 12 }}>to</span>
                <Inp type="date" value={customDates.end} onChange={(e: any) => setCustomDates({ ...customDates, end: e.target.value })} style={{ width: 130, padding: '4px 8px' }} />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={labelStyle}>Account Filter:</span>
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text1, padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
              <option value="All">All Accounts Combined</option>
              <option value="Joint">Joint Account Only</option>
              <option value="PersonalOnly">Gaurav & Karishma (Individual Out of Pocket)</option>
              <option value={names.a}>{names.a} Only</option>
              <option value={names.b}>{names.b} Only</option>
            </select>
          </div>
        </Card>
      </div>

      {/* Core Capital Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        {/* ⚡ CLICKABLE JOINT BALANCE CARD */}
        <div 
          onClick={() => setShowAudit(true)} 
          style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <StatCard
            label="Joint Balance (Click to Audit)"
            value={fmt(currentJointBalance, data.settings.currency)}
            accent={currentJointBalance < 5000 ? C.red : C.green}
            icon="💰"
            sub={`Spent this period: ${fmt(periodJointSpent, data.settings.currency)}`}
          />
        </div>
        <StatCard
          label="Lifestyle Spending"
          value={fmt(trueLifestyleExpenses, data.settings.currency)}
          accent={C.amber}
          icon="🛒"
          sub={`Core operational survival costs`}
        />
        <StatCard
          label="Allocated Capital Portfolio"
          value={fmt(periodInvested, data.settings.currency)}
          accent={C.teal}
          icon="📈"
          sub={`Total Cumulative Base: ${fmt(allTimeInvested, data.settings.currency)}`}
        />
      </div>

      {/* PORTFOLIO BREAKDOWN ASSET ALLOCATION */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        <Card>
          <SectionTitle>Asset Allocation Breakdown</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {Object.entries(allocation).map(([assetClass, amount]) => (
              <div key={assetClass}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                  <span style={{ color: C.text1 }}>{assetClass}</span>
                  <span style={{ fontWeight: 700, color: amount > 0 ? C.textW : C.muted }}>{fmt(amount, data.settings.currency)}</span>
                </div>
                <ProgressBar pct={periodInvested > 0 ? (amount / maxAllocationValue) * 100 : 0} color={assetClass === 'Insurance Policies' ? C.blue : C.teal} height={6} />
              </div>
            ))}
          </div>
        </Card>

        {/* Partner Activity & Allocation Card Widget */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <SectionTitle>Partner Activity Breakdown</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
              <div style={{ background: C.bg, padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ color: C.purple, fontWeight: 700, fontSize: 13, marginBottom: 8, borderBottom: `1px solid ${C.border}44`, paddingBottom: 4 }}>{names.a}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ color: C.text2 }}>Out of Pocket Spent:</span>
                  <span style={{ fontWeight: 600, color: C.textW }}>{fmt(personalSpentA, data.settings.currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: C.text2 }}>Joint Pool Contributed:</span>
                  <span style={{ fontWeight: 600, color: C.green }}>{fmt(contribA, data.settings.currency)}</span>
                </div>
              </div>
              <div style={{ background: C.bg, padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ color: C.blue, fontWeight: 700, fontSize: 13, marginBottom: 8, borderBottom: `1px solid ${C.border}44`, paddingBottom: 4 }}>{names.b}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ color: C.text2 }}>Out of Pocket Spent:</span>
                  <span style={{ fontWeight: 600, color: C.textW }}>{fmt(personalSpentB, data.settings.currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: C.text2 }}>Joint Pool Contributed:</span>
                  <span style={{ fontWeight: 600, color: C.green }}>{fmt(contribB, data.settings.currency)}</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ color: C.muted, fontSize: 11, fontStyle: 'italic', padding: '12px 4px 0' }}>
            Reflects personal out-of-pocket spending compared to joint seed transfers.
          </div>
        </Card>
      </div>

      {/* LIFESTYLE RUN RATE CHART WIDGET */}
      <Card>
        <SectionTitle>Household Trend — Monthly Lifestyle Expenses</SectionTitle>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 150, paddingTop: 14, gap: 12 }}>
          {lifestyleTrendData.map((m) => {
            const barHeightPct = (m.total / maxLifestyleTrend) * 100;
            return (
              <div key={m.monthLabel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: m.total > 0 ? C.textW : C.muted }}>
                  {m.total > 0 ? fmt(m.total, data.settings.currency) : '₹0'}
                </div>
                <div style={{ height: 90, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{
                    width: '100%',
                    height: `${Math.max(6, barHeightPct)}%`,
                    background: `linear-gradient(to top, ${C.surface}, ${C.amber})`,
                    border: `1px solid ${C.border}`,
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease'
                  }} />
                </div>
                <div style={{ fontSize: 11, color: C.text2, fontWeight: 600 }}>{m.monthLabel}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* INVESTMENT RUN RATE CHART WIDGET */}
      <Card>
        <SectionTitle>Wealth Growth Trend — Monthly Investments & Policies</SectionTitle>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 150, paddingTop: 14, gap: 12 }}>
          {investmentTrendData.map((m) => {
            const barHeightPct = (m.total / maxInvestmentTrend) * 100;
            return (
              <div key={m.monthLabel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: m.total > 0 ? C.textW : C.muted }}>
                  {m.total > 0 ? fmt(m.total, data.settings.currency) : '₹0'}
                </div>
                <div style={{ height: 90, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{
                    width: '100%',
                    height: `${Math.max(6, barHeightPct)}%`,
                    background: `linear-gradient(to top, ${C.surface}, ${C.teal})`,
                    border: `1px solid ${C.border}`,
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease'
                  }} />
                </div>
                <div style={{ fontSize: 11, color: C.text2, fontWeight: 600 }}>{m.monthLabel}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Household Savings Velocity */}
      <Card style={{ maxWidth: '100%' }}>
        <SectionTitle>Household Wealth Retention Velocity</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 10, marginBottom: 14 }}>
          <div>
            <span style={{ color: C.text2, fontSize: 13 }}>Income for Period:</span>
            <div style={{ color: C.green, fontWeight: 700, fontSize: 18, marginTop: 2 }}>{fmt(periodIncome, data.settings.currency)}</div>
          </div>
          <div>
            <span style={{ color: C.text2, fontSize: 13 }}>Capital Retained (Saved + Invested):</span>
            <div style={{ color: savingsDelta >= 0 ? C.green : C.red, fontWeight: 700, fontSize: 18, marginTop: 2 }}>{fmt(savingsDelta, data.settings.currency)}</div>
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Net Retention Rate:</span>
            <span style={{ fontSize: 12, color: C.textW, fontWeight: 700 }}>{savingsRate.toFixed(0)}%</span>
          </div>
          <ProgressBar pct={savingsRate} color={C.green} height={8} />
        </div>
      </Card>

      {/* Target Budgets & Expense Distribution Cards */}
      <Card>
        <SectionTitle>Lifestyle Category Allocation Breakdown</SectionTitle>
        {topCats.length === 0 && (
          <p style={{ color: C.muted, fontSize: 13 }}>No lifestyle expenses found matching current criteria.</p>
        )}
        {topCats.map(([cat, amt]) => {
          const budget = data.settings.budgets[cat];
          const over = budget && amt > budget;
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: C.text1, fontSize: 13 }}>{cat}</span>
                <span style={{ color: over ? C.red : C.textW, fontSize: 13, fontWeight: 700 }}>
                  {fmt(amt, data.settings.currency)} {over ? ' ⚠️' : ''}
                </span>
              </div>
              <ProgressBar pct={(amt / maxCat) * 100} color={over ? C.red : C.amber} />
            </div>
          );
        })}
      </Card>

      {/* ⚡ THE LEDGER AUDIT MODAL */}
      {showAudit && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex',
          justifyContent: 'center', alignItems: 'center', padding: 20
        }}>
          <Card style={{ width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}>
            <button 
              onClick={() => setShowAudit(false)}
              style={{ position: 'absolute', top: 15, right: 15, background: C.surface, border: `1px solid ${C.border}`, color: C.text1, borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontWeight: 'bold' }}
            >✕</button>
            <SectionTitle>Joint Balance Ledger Audit</SectionTitle>
            <p style={{ fontSize: 13, color: C.text2, marginBottom: 20 }}>
              This is the exact math used to calculate your All-Time Liquid Joint Balance.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 600, color: C.green }}>[+] Total Seeded Contributions</span>
              <span style={{ fontWeight: 700, color: C.textW }}>{fmt(allTimePool, data.settings.currency)}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 600, color: C.green }}>[+] Total Joint Income (Refunds/Interest)</span>
              <span style={{ fontWeight: 700, color: C.textW }}>{fmt(allTimeJointIncome, data.settings.currency)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 16 }}>
              <span style={{ fontWeight: 600, color: C.red }}>[-] Total Joint Expenses</span>
              <span style={{ fontWeight: 700, color: C.textW }}>{fmt(allTimeJointSpent, data.settings.currency)}</span>
            </div>

            <div style={{ background: C.surface, padding: 12, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: C.text1 }}>Calculated Balance:</span>
              <span style={{ fontWeight: 800, fontSize: 20, color: currentJointBalance < 0 ? C.red : C.teal }}>
                {fmt(currentJointBalance, data.settings.currency)}
              </span>
            </div>

            <SectionTitle>Recent Joint Outflows</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {data.expenses
                .filter((e: any) => e.account === 'Joint' && e.type !== 'income')
                .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 15)
                .map((e: any) => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${C.border}55` }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ color: C.text1 }}>{e.category}</span>
                      <span style={{ color: C.muted, fontSize: 11 }}>{e.date} • {e.note || 'No note'}</span>
                    </div>
                    <span style={{ color: C.red, fontWeight: 600 }}>{fmt(e.amount, data.settings.currency)}</span>
                  </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── ADD EXPENSE ──────────────────────────────────────────────────────────────
function AddExpense({ data, session, duplicateData, onAdd, onClose }: any) {
  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };

  // Pre-fills state with the copied transaction parameters or falls back to defaults
  const [form, setForm] = useState(duplicateData || {
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
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  // Smart Identity Detection: Automatically sets logged-in identity for fresh entries
  useEffect(() => {
    if (!duplicateData && session?.user?.email) {
      const email = session.user.email.toLowerCase();
      const pAName = names.a.toLowerCase();
      const pBName = names.b.toLowerCase();

      if (email.includes('gaurav') || email.includes(pAName)) {
        setForm((f: any) => ({ ...f, account: names.a, addedBy: 'Partner A' }));
      } else if (email.includes('karishma') || email.includes(pBName)) {
        setForm((f: any) => ({ ...f, account: names.b, addedBy: 'Partner B' }));
      }
    }
  }, [session, duplicateData, names.a, names.b]);

  // ⚡ DYNAMIC PATTERN RECOGNITION ENGINE BLOCK
  const dynamicPresets = useMemo(() => {
    if (!data || !data.expenses || data.expenses.length === 0) return [];

    const frequencies: Record<string, { count: number; cat: string; acc: string; addedBy: string; note: string; shared: boolean }> = {};

    data.expenses.forEach((e: any) => {
      if (e.type !== 'expense' || !e.note) return;
      
      const cleanNote = e.note.trim();
      if (!cleanNote) return;

      const signature = `${cleanNote}▩${e.category}▩${e.account}▩${!!e.toSettle}▩${e.addedBy}`;

      if (!frequencies[signature]) {
        frequencies[signature] = {
          count: 0,
          cat: e.category,
          acc: e.account,
          addedBy: e.addedBy || 'Partner A',
          note: cleanNote,
          shared: !!e.toSettle
        };
      }
      frequencies[signature].count += 1;
    });

    return Object.values(frequencies)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((p) => ({
        label: p.note.length > 22 ? `${p.note.slice(0, 20)}...` : p.note,
        cat: p.cat,
        acc: p.acc,
        addedBy: p.addedBy,
        note: p.note,
        shared: p.shared
      }));
  }, [data.expenses]);

  const submit = () => {
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) return;
    onAdd({
      ...form,
      amount: Number(form.amount),
      id: uid(),
      settled: false,
      settledFor: null,
    });
    setForm((f: any) => ({ ...f, amount: '', note: '', toSettle: false }));
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };

  const cats = form.type === 'income' ? data.settings.incomeCategories : data.settings.expenseCategories;

  return (
    <div style={{ maxWidth: 560 }}>
      <Card style={{ border: duplicateData ? `1px solid ${C.amber}55` : `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <SectionTitle style={{ margin: 0 }}>
            {duplicateData ? '📋 Duplicating Cost Entry' : 'Add New Transaction'}
          </SectionTitle>
          {onClose && (
            <Btn variant="ghost" onClick={onClose} style={{ padding: '4px 10px', fontSize: 16 }}>✕</Btn>
          )}
        </div>

        {/* Tab Switches (Expense vs Income) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {['expense', 'income'].map((t) => (
            <Btn
              key={t}
              variant={form.type === t ? 'primary' : 'ghost'}
              onClick={() => {
                set('type', t);
                set('category', t === 'income' ? data.settings.incomeCategories[0] : data.settings.expenseCategories[0]);
              }}
              style={{ flex: 1, textAlign: 'center', textTransform: 'capitalize' }}
            >
              {t === 'expense' ? '💸 Expense' : '💰 Income'}
            </Btn>
          ))}
        </div>

        {/* ⚡ SMART DYNAMIC PATTERN QUICK ADD PANEL COMPONENT */}
        {form.type === 'expense' && dynamicPresets.length > 0 && (
          <div style={{ marginBottom: 20, background: `${C.bg}60`, padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.border}` }}>
            <span style={{ color: C.amber, fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ⚡ Smart Quick Add (Top Historical Patterns)
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {dynamicPresets.map((preset: any) => (
                <button
                  key={`${preset.note}-${preset.cat}`}
                  type="button"
                  onClick={() => {
                    set('category', preset.cat);
                    set('account', preset.acc);
                    set('addedBy', preset.addedBy);
                    set('note', preset.note);
                    set('toSettle', preset.shared);
                    set('type', 'expense');
                    
                    const amtInput = document.querySelector('input[type="number"]') as HTMLInputElement;
                    if (amtInput) amtInput.focus();
                  }}
                  style={{
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    color: C.text1,
                    padding: '5px 10px',
                    borderRadius: 16,
                    fontSize: 11,
                    cursor: 'pointer',
                    fontWeight: 500,
                    transition: 'all 0.15s ease-in-out',
                  }}
                  onMouseOver={(ev) => {
                    ev.currentTarget.style.borderColor = C.amber;
                    ev.currentTarget.style.background = `${C.amber}08`;
                  }}
                  onMouseOut={(ev) => {
                    ev.currentTarget.style.borderColor = C.border;
                    ev.currentTarget.style.background = C.bg;
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Form Fields Layout */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Date</Label>
              <Inp type="date" value={form.date} onChange={(e: any) => set('date', e.target.value)} />
            </div>
            <div>
              <Label>Amount (₹)</Label>
              <Inp type="number" placeholder="0" value={form.amount} onChange={(e: any) => set('amount', e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <Sel value={form.category} onChange={(e: any) => set('category', e.target.value)}>
              {cats.map((c: string) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Sel>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Paid From</Label>
              <Sel value={form.account} onChange={(e: any) => set('account', e.target.value)}>
                <option value="Joint">Joint Account</option>
                <option value={names.a}>{names.a}</option>
                <option value={names.b}>{names.b}</option>
              </Sel>
            </div>
            <div>
              <Label>Added By</Label>
              <Sel value={form.addedBy} onChange={(e: any) => set('addedBy', e.target.value)}>
                <option value="Partner A">{names.a}</option>
                <option value="Partner B">{names.b}</option>
              </Sel>
            </div>
          </div>

          <div>
            <Label>Note (optional)</Label>
            <Inp placeholder="What was this for?" value={form.note} onChange={(e: any) => set('note', e.target.value)} />
          </div>

          {/* Settle Parameter Checkbox */}
          {form.type === 'expense' && form.account !== 'Joint' && (
            <div style={{ background: C.bg, borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ color: C.text1, fontSize: 13, fontWeight: 600 }}>To be settled by Joint Account?</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Reimburse personal expense from joint pool</div>
              </div>
              
              <div 
                onClick={() => set('toSettle', !form.toSettle)}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: form.toSettle ? C.amber : `${C.border}aa`,
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  border: `1px solid ${form.toSettle ? C.amber : C.border}`
                }}
              >
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: form.toSettle ? C.surface : C.text2,
                  position: 'absolute',
                  top: 2,
                  left: form.toSettle ? 22 : 2,
                  transition: 'all 0.2s ease'
                }} />
              </div>
            </div>
          )}

          {/* Form Trigger Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Btn variant={flash ? 'success' : 'primary'} onClick={submit} style={{ flex: 1, padding: 13, fontSize: 15 }}>
              {flash ? '✓ Added Successfully!' : (duplicateData ? '✓ Confirm Duplicate' : `Add ${form.type === 'income' ? 'Income' : 'Expense'}`)}
            </Btn>
            {onClose && (
              <Btn variant="ghost" onClick={onClose} style={{ padding: 13, fontSize: 15 }}>Cancel</Btn>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── EXPENSE LIST ─────────────────────────────────────────────────────────────
function ExpenseList({ data, onToggleToSettle, onDelete, onUpdate, onBulkDelete, onDuplicate }: any) {
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sf = (k: string, v: string) => setFilter((f) => ({ ...f, [k]: v }));
  
  const allMonths = data.expenses
    .map((e: any) => monthKey(e.date))
    .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index)
    .sort()
    .reverse();

  const filtered = data.expenses
    .filter((e: any) => {
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
      if (filter.settled === 'personal' && e.toSettle) 
        return false;
      if (filter.settled === 'settledA' && (!e.settled || e.settledFor !== 'Partner A')) 
        return false;
      if (filter.settled === 'settledB' && (!e.settled || e.settledFor !== 'Partner B')) 
        return false;
        
      return true;
    })
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((e: any) => e.id)));
    }
  };

  const startEdit = (e: any) => {
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: C.muted, fontSize: 12 }}>Filter:</span>
          <select style={selStyle} value={filter.month} onChange={(e) => sf('month', e.target.value)}>
            <option value="All">All Months</option>
            {allMonths.map((m: any) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          <select style={selStyle} value={filter.type} onChange={(e) => sf('type', e.target.value)}>
            <option value="All">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>
          <select style={selStyle} value={filter.account} onChange={(e) => sf('account', e.target.value)}>
            <option value="All">All Accounts</option>
            {ACCOUNT_TYPES(names).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select style={selStyle} value={filter.category} onChange={(e) => sf('category', e.target.value)}>
            <option value="All">All Categories</option>
            {[...data.settings.expenseCategories, ...data.settings.incomeCategories].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select style={selStyle} value={filter.settled} onChange={(e) => sf('settled', e.target.value)}>
            <option value="All">All Settlement Statuses</option>
            <option value="pending">⏳ Pending</option>
            <option value="personal">👤 Personal (No Settlement)</option>
            <option value="settledA">✅ Settled with {names.a}</option>
            <option value="settledB">✅ Settled with {names.b}</option>
          </select>
        </div>
      </Card>

      {selectedIds.size > 0 && (
        <Card style={{ background: C.red + '15', border: `1px solid ${C.red}44`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ color: C.red, fontWeight: 700, fontSize: 14 }}>💥 {selectedIds.size} entries selected</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setSelectedIds(new Set())}>Deselect All</Btn>
            <Btn variant="danger" style={{ fontSize: 12, padding: '6px 14px', fontWeight: 700 }} onClick={() => {
              const idsToDelete: string[] = [];
              selectedIds.forEach((id: string) => idsToDelete.push(id));
              onBulkDelete(idsToDelete);
              setSelectedIds(new Set());
            }}>🗑️ Delete Selected</Btn>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {/* 1. Selection Checkbox Slot */}
                <th style={{ padding: '11px 14px', width: 40 }}>
                  <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: C.amber }} />
                </th>
                {/* 2. Copy Button Column Header */}
                <th style={{ padding: '11px 14px', width: 65, color: C.muted, fontWeight: 600, textAlign: 'left' }}>Copy</th>
                {/* 3 through 9. Rest of Headers Re-indexed */}
                {['Date', 'Note', 'Category', 'Amount', 'Account', 'Settlement Status', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '11px 14px', color: C.muted, fontWeight: 600, textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e: any, i: number) => {
                if (editingId === e.id) {
                  return (
                    <tr key={e.id} style={{ background: C.bg + '99', borderTop: `1px solid ${C.amber}` }}>
                      <td /> {/* Checkbox slot padding */}
                      <td /> {/* Copy slot padding */}
                      <td style={{ padding: 8 }}>
                        <Inp type="date" value={editForm.date} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, date: ev.target.value }))} />
                      </td>
                      <td style={{ padding: 8 }}>
                        <Inp placeholder="Add note..." value={editForm.note} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, note: ev.target.value }))} />
                      </td>
                      <td style={{ padding: 8 }}>
                        <Sel value={editForm.category} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, category: ev.target.value }))}>
                          {[...data.settings.expenseCategories, ...data.settings.incomeCategories].map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </Sel>
                      </td>
                      <td style={{ padding: 8 }}>
                        <Inp type="number" value={editForm.amount} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, amount: ev.target.value }))} style={{ width: 80 }} />
                      </td>
                      <td style={{ padding: 8 }}>
                        <Sel value={editForm.account} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, account: ev.target.value }))}>
                          {ACCOUNT_TYPES(names).map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </Sel>
                      </td>
                      <td style={{ padding: 8 }}>
                        {editForm.type === 'income' || editForm.account === 'Joint' ? (
                          <span style={{ color: C.muted, fontSize: 12 }}>N/A</span>
                        ) : (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: C.text1 }}>
                            <input type="checkbox" checked={editForm.toSettle} onChange={(ev: any) => setEditForm((f: any) => ({ ...f, toSettle: ev.target.checked }))} style={{ accentColor: C.amber }} />
                            Shared
                          </label>
                        )}
                      </td>
                      <td style={{ padding: 8, display: 'flex', gap: 6 }}>
                        <Btn variant="success" onClick={saveEdit} style={{ padding: '6px 10px' }}>✓</Btn>
                        <Btn variant="ghost" onClick={() => setEditingId(null)} style={{ padding: '6px 10px' }}>✕</Btn>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={e.id} style={{ borderTop: `1px solid ${C.border}`, background: selectedIds.has(e.id) ? C.red + '08' : (i % 2 === 0 ? 'transparent' : C.bg + '80') }}>
                    {/* 1. Selection Checkbox Slot */}
                    <td style={{ padding: '10px 14px' }}>
                      <input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggleSelect(e.id)} style={{ cursor: 'pointer', accentColor: C.amber }} />
                    </td>
                    {/* 2. Copy Button Slot (Now right next to checkbox at the start) */}
                    <td style={{ padding: '10px 14px' }}>
                      <Btn variant="ghost" style={{ padding: '3px 8px', fontSize: 11, color: C.amber, borderColor: `${C.amber}33` }} onClick={() => onDuplicate(e)}>📋 Copy</Btn>
                    </td>
                    {/* 3. Date Slot */}
                    <td style={{ padding: '10px 14px', color: C.text2, whiteSpace: 'nowrap' }}>{e.date}</td>
                    {/* 4. Note Slot (Moved up front right after date!) */}
                    <td style={{ padding: '10px 14px', color: C.muted, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.note || '—'}</td>
                    {/* 5. Category Slot */}
                    <td style={{ padding: '10px 14px', color: C.text1 }}>{e.category}</td>
                    {/* 6. Amount Slot */}
                    <td style={{ padding: '10px 14px', color: e.type === 'income' ? C.green : C.textW, fontWeight: 700 }}>
                      {e.type === 'income' ? '+' : ''}{fmt(e.amount, data.settings.currency)}
                    </td>
                    {/* 7. Account Used Slot */}
                    <td style={{ padding: '10px 14px' }}>
                      <Badge color={e.account === 'Joint' ? C.green : C.blue}>{e.account}</Badge>
                    </td>
                    {/* 8. Settlement Status Slot */}
                    <td style={{ padding: '10px 14px' }}>
                      {e.type === 'income' ? (
                        <span style={{ color: C.muted }}>—</span>
                      ) : e.settled ? (
                        <Badge color={C.green}>✓ Settled with {e.settledFor === 'Partner A' ? names.a : names.b}</Badge>
                      ) : e.account === 'Joint' ? (
                        <span style={{ color: C.muted, fontSize: 12, fontStyle: 'italic' }}>Direct Shared</span>
                      ) : !e.toSettle ? (
                        <span style={{ color: C.text2, fontSize: 12 }}>Personal (No Settlement)</span>
                      ) : (
                        <Badge color={C.amber}>⏳ Pending</Badge>
                      )}
                    </td>
                    {/* 9. Core Row Inline Mutation Trigger Actions */}
                    <td style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
                      <Btn variant="ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => startEdit(e)}>Edit</Btn>
                      <Btn variant="danger" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => onDelete(e.id)}>✕</Btn>
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
function SettleDashboard({ data, onBulkSettle }: any) {
  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pending = data.expenses.filter(
    (e: any) => e.toSettle && !e.settled && e.account !== 'Joint'
  );
  const pendingA = pending.filter(
    (e: any) => e.account.includes(names.a) || e.account.includes('Partner A')
  );
  const pendingB = pending.filter(
    (e: any) => e.account.includes(names.b) || e.account.includes('Partner B')
  );
  const totalA = pendingA.reduce((s: number, e: any) => s + e.amount, 0);
  const totalB = pendingB.reduce((s: number, e: any) => s + e.amount, 0);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const selectAll = (arr: any[]) =>
    setSelected((s) => {
      const n = new Set(s);
      arr.forEach((e) => n.add(e.id));
      return n;
    });
  const clearGroup = (arr: any[]) =>
    setSelected((s) => {
      const n = new Set(s);
      arr.forEach((e) => n.delete(e.id));
      return n;
    });

const settleSelected = () => {
    const selectedArr: string[] = [];
    selected.forEach((id: string) => selectedArr.push(id));
    onBulkSettle(selectedArr);
    setSelected(new Set());
  };

  const SettleTable = ({ items, partner, color }: any) => (
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
              items.reduce((s: number, e: any) => s + e.amount, 0),
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
            {items.map((e: any) => (
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
                  data.expenses.reduce((s: number, e: any) => selected.has(e.id) ? s + (e.amount || 0) : s, 0),
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

<div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', width: '100%' }}>
  <div style={{ flex: '1 1 340px', minWidth: 300 }}>
    <SettleTable
      items={pendingA}
      partner={`${names.a}'s Expenses`}
      color={C.purple}
    />
  </div>
  <div style={{ flex: '1 1 340px', minWidth: 300 }}>
    <SettleTable
      items={pendingB}
      partner={`${names.b}'s Expenses`}
      color={C.blue}
    />
  </div>
</div>

      <Card>
  <SectionTitle>Recently Settled</SectionTitle>
  {(() => {
    const recent = data.expenses
      .filter((e: any) => e.settled)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    if (!recent.length)
      return (
        <p style={{ color: C.muted, fontSize: 13 }}>
          No settlements yet.
        </p>
      );
    return recent.map((e: any) => (
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
              ↩ {e.settledFor === 'Partner A' ? names.a : names.b}
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
function Contributions({ data, onUpdate }: any) {
  const currentMonth = monthKey(today());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const names = {
    a: data.settings.partnerAName,
    b: data.settings.partnerBName,
  };

  // Generate a list of the last 12 months for the dropdown
  const monthOptions = Array.from({ length: 18 }).map((_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
});

  const existing = data.contributions.find(
    (c: any) => c.month === selectedMonth
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
  }, [selectedMonth, data.contributions, existing.partnerA, existing.partnerB]);

  const save = () => {
    onUpdate(selectedMonth, Number(vals.partnerA), Number(vals.partnerB));
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };

  const pool = (Number(vals.partnerA) || 0) + (Number(vals.partnerB) || 0);
  const history = [...data.contributions].sort((a: any, b: any) =>
    b.month.localeCompare(a.month)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card style={{ maxWidth: 520 }}>
        {/* HEADER WITH DROPDOWN */}
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
              onChange={(e: any) =>
                setVals((v) => ({ ...v, partnerA: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>{names.b} (₹)</Label>
            <Inp
              type="number"
              value={vals.partnerB}
              onChange={(e: any) =>
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
              {history.map((c: any, i: number) => (
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
function Goals({ data, onUpdate, onAdd, onDelete }: any) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
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
                  onChange={(e: any) =>
                    setNewGoal((g) => ({ ...g, name: e.target.value }))
                  }
                  placeholder="e.g. Emergency Fund"
                />
              </div>
              <div>
                <Label>Icon (emoji)</Label>
                <Inp
                  value={newGoal.icon}
                  onChange={(e: any) =>
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
                  onChange={(e: any) =>
                    setNewGoal((g) => ({ ...g, target: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Current Saved</Label>
                <Inp
                  type="number"
                  value={newGoal.current}
                  onChange={(e: any) =>
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
        {data.goals.map((g: any) => {
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
                        onChange={(e: any) =>
                          setForm((f: any) => ({ ...f, name: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Icon</Label>
                      <Inp
                        value={form.icon}
                        onChange={(e: any) =>
                          setForm((f: any) => ({ ...f, icon: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Target</Label>
                    <Inp
                      type="number"
                      value={form.target}
                      onChange={(e: any) =>
                        setForm((f: any) => ({ ...f, target: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Current</Label>
                    <Inp
                      type="number"
                      value={form.current}
                      onChange={(e: any) =>
                        setForm((f: any) => ({ ...f, current: e.target.value }))
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
function LoanTracker({ data, onAdd, onUpdate, onDelete }: any) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const blank = {
    name: '',
    lender: '',
    principal: '',
    outstanding: '',
    emi: '',
    interestRate: '',
    startDate: today(),
    tenureMonths: '',
    paymentDay: 1,
    icon: '🏠',
  };
  const [form, setForm] = useState<any>(blank);
  const cur = data.settings.currency;

  const totalEMI = data.loans.reduce((s: number, l: any) => s + l.emi, 0);
  const totalOutstanding = data.loans.reduce((s: number, l: any) => s + l.outstanding, 0);

  const LoanForm = ({ val, onChange, onSave, onCancel }: any) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <Label>Loan Name</Label>
          <Inp
            value={val.name}
            onChange={(e: any) => onChange('name', e.target.value)}
            placeholder="e.g. Home Loan"
          />
        </div>
        <div>
          <Label>Icon</Label>
          <Inp
            value={val.icon}
            onChange={(e: any) => onChange('icon', e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>Lender</Label>
        <Inp
          value={val.lender}
          onChange={(e: any) => onChange('lender', e.target.value)}
          placeholder="Bank name"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <Label>Principal Amount (₹)</Label>
          <Inp
            type="number"
            value={val.principal}
            onChange={(e: any) => onChange('principal', e.target.value)}
          />
        </div>
        <div>
          <Label>Outstanding (₹)</Label>
          <Inp
            type="number"
            value={val.outstanding}
            onChange={(e: any) => onChange('outstanding', e.target.value)}
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
            onChange={(e: any) => onChange('emi', e.target.value)}
          />
        </div>
        <div>
          <Label>Rate (%)</Label>
          <Inp
            type="number"
            step="0.1"
            value={val.interestRate}
            onChange={(e: any) => onChange('interestRate', e.target.value)}
          />
        </div>
        <div>
          <Label>Tenure (mo)</Label>
          <Inp
            type="number"
            value={val.tenureMonths}
            onChange={(e: any) => onChange('tenureMonths', e.target.value)}
          />
        </div>
        <div>
          <Label>EMI Day (1-31)</Label>
          <Inp
            type="number"
            min="1"
            max="31"
            value={val.paymentDay || ''}
            onChange={(e: any) => onChange('paymentDay', Number(e.target.value))}
          />
        </div>
      </div>
      <div>
        <Label>Start Date</Label>
        <Inp
          type="date"
          value={val.startDate}
          onChange={(e: any) => onChange('startDate', e.target.value)}
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
            onChange={(k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))}
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
        {data.loans.map((l: any) => {
          const paidPct = ((l.principal - l.outstanding) / l.principal) * 100;
          const monthsLeft = Math.ceil(l.outstanding / l.emi);
          return (
            <Card key={l.id}>
              {editing === l.id ? (
                <>
                  <SectionTitle>Edit — {l.name}</SectionTitle>
                  <LoanForm
                    val={form}
                    onChange={(k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))}
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
function AIInsights({ data }: any) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    const monthExp = data.expenses.filter((e: any) => monthKey(e.date) === mk);
    const catTotals = {} as Record<string, number>;
    monthExp.forEach((e: any) => {
      catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
    });
    const contrib = data.contributions.find((c: any) => c.month === mk) || {
      partnerA: 0,
      partnerB: 0,
    };
    const totalEMI = data.loans.reduce((s: number, l: any) => s + l.emi, 0);

    const prompts: Record<string, string> = {
      monthly: `You are a personal finance advisor for a couple in India. Analyze their spending data and write a warm, practical monthly summary. Couple: ${
        names.a
      } and ${names.b}. Month: ${monthLabel(mk)}. Joint contributions: ${
        names.a
      }: ₹${contrib.partnerA}, ${names.b}: ₹${
        contrib.partnerB
      }. Spending by category: ${JSON.stringify(
        catTotals
      )}. Total monthly EMI commitment: ₹${totalEMI}. Goals progress: ${data.goals
        .map((g: any) => `${g.name}: ${((g.current / g.target) * 100).toFixed(0)}%`)
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
          (l: any) => `${l.name}: ₹${l.outstanding} outstanding @ ${l.interestRate}%`
        )
        .join('; ')}. Financial goals: ${data.goals
        .map(
          (g: any) => `${g.name}: ${((g.current / g.target) * 100).toFixed(0)}% done`
        )
        .join(
          '; '
        )}. Give advice that is practical for an Indian household. Reference their specific numbers. Write in clear paragraphs.`,
      loans: `You are a debt management expert. Analyze this couple's loan portfolio and give strategic advice. Loans: ${data.loans
        .map(
          (l: any) =>
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

      // 🚀 UPGRADED: URL path routed seamlessly to the current gemini-2.0-flash standard
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
    } catch (e: any) {
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
          Get personalised insights generated by Gemini based on your actual
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
            Gemini is analysing your finances…
          </div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </Card>
      )}

      {error && (
        <Card
          style={{ border: `1px solid ${C.red}44`, background: C.red + '11' }}
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
}: any) {
  const [s, setS] = useState(JSON.parse(JSON.stringify(data.settings)));
  const [flash, setFlash] = useState(false);
  const [importMsg, setImportMsg] = useState<any>(null);
  const [newExpCat, setNewExpCat] = useState('');
  const [newIncCat, setNewIncCat] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const save = () => {
    onSave(s);
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };
  const addExpCat = () => {
    if (newExpCat.trim()) {
      setS((x: any) => ({
        ...x,
        expenseCategories: [...x.expenseCategories, newExpCat.trim()],
      }));
      setNewExpCat('');
    }
  };
  const addIncCat = () => {
    if (newIncCat.trim()) {
      setS((x: any) => ({
        ...x,
        incomeCategories: [...x.incomeCategories, newIncCat.trim()],
      }));
      setNewIncCat('');
    }
  };
  const removeExpCat = (c: string) =>
    setS((x: any) => ({
      ...x,
      expenseCategories: x.expenseCategories.filter((e: string) => e !== c),
    }));
  const removeIncCat = (c: string) =>
    setS((x: any) => ({
      ...x,
      incomeCategories: x.incomeCategories.filter((e: string) => e !== c),
    }));

  const handleImport = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    parseImport(file, (result: any, err: any) => {
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
              onChange={(e: any) =>
                setS((x: any) => ({ ...x, partnerAName: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Partner B Name</Label>
            <Inp
              value={s.partnerBName}
              onChange={(e: any) =>
                setS((x: any) => ({ ...x, partnerBName: e.target.value }))
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
          {/* Share Code */}
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

          {/* Join Partner */}
          <div style={{ background: C.bg, padding: 14, borderRadius: 10 }}>
            <Label>{"Join a Partner's Household"}</Label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Inp
                id="join-code-input"
                placeholder="Paste their code here..."
                style={{ fontFamily: 'monospace' }}
              />
              <Btn
                variant="primary"
                onClick={() => {
                  const el = document.getElementById('join-code-input') as HTMLInputElement;
                  const val = el?.value;
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
          {s.expenseCategories.map((c: string) => (
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
            onChange={(e: any) => setNewExpCat(e.target.value)}
            placeholder="Add new category…"
            onKeyDown={(e: any) => e.key === 'Enter' && addExpCat()}
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
          {s.incomeCategories.map((c: string) => (
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
            onChange={(e: any) => setNewIncCat(e.target.value)}
            placeholder="Add income category…"
            onKeyDown={(e: any) => e.key === 'Enter' && addIncCat()}
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
          {s.expenseCategories.map((c: string) => (
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
                onChange={(e: any) => {
                  const v = e.target.value;
                  setS((x: any) => ({
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
            onChange={(v: boolean) =>
              setS((x: any) => ({
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
                onChange={(v: boolean) =>
                  setS((x: any) => ({
                    ...x,
                    notifications: { ...x.notifications, newExpense: v },
                  }))
                }
                label="Notify when partner adds an expense"
              />
              <Toggle
                checked={s.notifications.settlement}
                onChange={(v: boolean) =>
                  setS((x: any) => ({
                    ...x,
                    notifications: { ...x.notifications, settlement: v },
                  }))
                }
                label="Notify on settlement actions"
              />
              <Toggle
                checked={s.notifications.budgetAlert}
                onChange={(v: boolean) =>
                  setS((x: any) => ({
                    ...x,
                    notifications: { ...x.notifications, budgetAlert: v },
                  }))
                }
                label="Alert when approaching budget limit"
              />
              {s.notifications.budgetAlert && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Label>Alert at</Label>
                  <Inp
                    type="number"
                    value={s.notifications.budgetThreshold}
                    onChange={(e: any) =>
                      setS((x: any) => ({
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
  const [session, setSession] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  

  const [view, setView] = useState('dashboard');
  const [prevView, setPrevView] = useState('dashboard'); 
  const [sidebarOpen, setSidebarOpen] = useState(true); 
  const [isMobile, setIsMobile] = useState(false);

  const [duplicateData, setDuplicateData] = useState<any>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
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

  // Load data ONLY if a session exists
  useEffect(() => {
    if (session) {
      loadData(session.user.id).then((d) => {
        setData(d);
        setLoading(false);
      });
    }
  }, [session]);

  const persist = useCallback((nd: any) => {
    setData(nd);
  }, []);

  const notify = (title: string, body: string, settings: any) => {
    if (
      settings?.notifications?.enabled &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification(title, { body });
    }
  };

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
    addExpense: async (e: any) => {
      // ⚡ FIX: Uses safe functional update to preserve paginated arrays!
      setData((prev: any) => ({ 
        ...prev, 
        expenses: [e, ...prev.expenses] // Puts the newest expense at the top of the list
      }));
      
      // ⚡ The Translation Engine
      const toSystemKey = (val: string) => {
        if (val === data.settings.partnerAName) return 'Partner A';
        if (val === data.settings.partnerBName) return 'Partner B';
        return val; 
      };

      const { error } = await supabase.from('transactions').insert([
        {
          id: e.id,
          household_id: data.householdId,
          date: e.date,
          amount: e.amount,
          category: e.category,
          type: e.type,
          account_used: toSystemKey(e.account),
          added_by: toSystemKey(e.addedBy),
          note: e.note,
          to_settle: e.toSettle,
          settled: e.settled,
          settled_with: toSystemKey(e.settledFor),
        },
      ]);
      if (error) alert('Failed to save to cloud: ' + error.message);
      else notify('New Transaction Added', `Added ₹${e.amount} for ${e.category}`, data.settings);
    },
    
    updateExpense: async (id: string, updated: any) => {
      setData((prev: any) => ({
        ...prev,
        expenses: prev.expenses.map((e: any) => (e.id === id ? updated : e)),
      }));

      // ⚡ The Translation Engine
      const toSystemKey = (val: string) => {
        if (val === data.settings.partnerAName) return 'Partner A';
        if (val === data.settings.partnerBName) return 'Partner B';
        return val;
      };

      const { error } = await supabase
        .from('transactions')
        .update({
          date: updated.date,
          amount: updated.amount,
          category: updated.category,
          type: updated.type,
          account_used: toSystemKey(updated.account),
          added_by: toSystemKey(updated.addedBy),
          note: updated.note,
          to_settle: updated.toSettle,
          settled: updated.settled,
          settled_with: toSystemKey(updated.settledFor),
        })
        .eq('id', id);
        
      if (error) alert('Failed to update: ' + error.message);
    },

    deleteExpense: async (id: string) => {
      setData((prev: any) => ({
        ...prev,
        expenses: prev.expenses.filter((e: any) => e.id !== id),
      }));
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) alert('Failed to delete: ' + error.message);
    },
    // ⚡ ADD THIS NEW BATCH DROP COMMAND HERE:
    bulkDeleteExpense: async (ids: string[]) => {
      if (!confirm(`Are you sure you want to permanently clear these ${ids.length} entries from the database?`)) return;

      // 1. Instantly pull them out of the current layout interface
      setData((prev: any) => ({
        ...prev,
        expenses: prev.expenses.filter((e: any) => !ids.includes(e.id)),
      }));

      // 2. Transmit an array delete constraint block to Supabase
      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('id', ids);

      if (error) {
        alert('Local view cleared, but cloud synchronization bounced: ' + error.message);
      }
    },
    toggleToSettle: async (id: string) => {
      const expense = data.expenses.find((e: any) => e.id === id);
      const newValue = !expense.toSettle;
      setData((prev: any) => ({
        ...prev,
        expenses: prev.expenses.map((e: any) =>
          e.id === id ? { ...e, toSettle: newValue } : e
        ),
      }));
      const { error } = await supabase
        .from('transactions')
        .update({ to_settle: newValue })
        .eq('id', id);
      if (error) alert('Failed to update status: ' + error.message);
    },
    bulkSettle: async (ids: string[]) => {
      const idSet = new Set(ids);
      
      // 1. Determine local state updates
      const updatedExpenses = data.expenses.map((e: any) => {
        if (!idSet.has(e.id)) return e;
        const partner = e.account.includes(names.a) || e.account.includes('Partner A')
          ? 'Partner A'
          : 'Partner B';
        return { ...e, settled: true, settledFor: partner, account: 'Joint' };
      });

      // 2. Update local UI state layout instantly for responsiveness
      setData((prev: any) => ({ ...prev, expenses: updatedExpenses }));

      // 3. Issue asynchronous batch update execution blocks straight to Supabase
      try {
        const promises = ids.map((id) => {
          const e = data.expenses.find((x: any) => x.id === id);
          const partner = e?.account.includes(names.a) || e?.account.includes('Partner A')
            ? 'Partner A'
            : 'Partner B';
          
          return supabase
            .from('transactions')
            .update({
              settled: true,
              settled_with: partner,
              account_used: 'Joint'
            })
            .eq('id', id);
        });

        const results = await Promise.all(promises);
        const primaryError = results.find(r => r.error);
        if (primaryError) throw primaryError.error;

        notify('Settlements Processed', `${ids.length} expenses successfully synchronized to cloud!`, data.settings);
      } catch (err: any) {
        alert('UI updated locally, but cloud settlement failed to persist: ' + err.message);
      }
    },
    updateContrib: async (month: string, pA: number, pB: number) => {
      // 1. Locate if this month already exists in local browser memory cache
      const existing = data.contributions.find((c: any) => c.month === month);
      
      // 2. Validate UUID integrity: check if the existing ID is a standard 36-character UUID string
      const isCleanUUID = existing && existing.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existing.id);
      
      // 3. Auto-Heal: Re-use valid UUID or automatically generate a clean crypto UUID string to purge "2024-12"
      const dbId = isCleanUUID ? existing.id : uid();

      // 4. Update local responsive layout view state with the safe UUID format
      setData((prev: any) => ({
        ...prev,
        contributions: [
          ...prev.contributions.filter((c: any) => c.month !== month),
          { id: dbId, month, partnerA: pA, partnerB: pB },
        ],
      }));
      
      // 5. Fire upsert payload straight to your Supabase contributions table
      const { error } = await supabase.from('contributions').upsert({
        id: dbId, // Passes strict PostgreSQL UUID type checks seamlessly
        household_id: data.householdId,
        month: month,
        partner_a_amount: pA, // Matches your column schema header
        partner_b_amount: pB, // Matches your column schema header
      }, { onConflict: 'household_id,month' });

      if (error) {
        alert('Cloud contribution sync failed: ' + error.message);
      }
    },
    addGoal: async (g: any) => {
      const newGoal = {
        ...g,
        id: uid(),
        target: Number(g.target),
        current: Number(g.current),
      };
      setData((prev: any) => ({ ...prev, goals: [...prev.goals, newGoal] }));
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
    updateGoal: async (id: string, f: any) => {
      setData((prev: any) => ({
        ...prev,
        goals: prev.goals.map((g: any) =>
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
    deleteGoal: async (id: string) => {
      setData((prev: any) => ({
        ...prev,
        goals: prev.goals.filter((g: any) => g.id !== id),
      }));
      await supabase.from('goals').delete().eq('id', id);
    },
    addLoan: async (l: any) => {
      setData((prev: any) => ({ ...prev, loans: [...prev.loans, l] }));
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
    updateLoan: async (id: string, f: any) => {
      setData((prev: any) => ({
        ...prev,
        loans: prev.loans.map((l: any) => (l.id === id ? { ...l, ...f } : l)),
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
    deleteLoan: async (id: string) => {
      setData((prev: any) => ({
        ...prev,
        loans: prev.loans.filter((l: any) => l.id !== id),
      }));
      await supabase.from('loans').delete().eq('id', id);
    },
    saveSettings: async (s: any) => {
      setData((prev: any) => ({ ...prev, settings: s }));
      const { error } = await supabase.from('household_settings').upsert({
        household_id: data.householdId,
        settings_data: s,
      });
      if (error) {
        alert('Supabase rejected settings change: ' + error.message);
      }
    },
    joinHousehold: async (newHouseholdId: string) => {
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
importData: async ({ expenses, contributions }: any) => {
      // 1. Sanitize expenses and filter out any accidental empty rows
      const sanitizedExpenses = (expenses || [])
        .filter((e: any) => e && e.date && e.amount) // ⚡ Safety check: drops blank transaction rows
        .map((e: any) => {
          const isValidUUID = e.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.id);
          return {
            ...e,
            id: isValidUUID ? e.id : uid()
          };
        });

      const existingIds = new Set(data.expenses.map((e: any) => e.id));
      const newExp = sanitizedExpenses.filter((e: any) => !existingIds.has(e.id));
      
      // ⚡ FIXED: Clean validation filter to skip empty trailing ghost rows from the Excel sheet
      const validImportedContribs = (contributions || []).filter(
        (c: any) => c && c.month && String(c.month).trim()
      );

      const sanitizedImportedContribs = validImportedContribs.map((c: any) => {
        const cleanMonth = String(c.month).trim();
        const existing = data.contributions.find((x: any) => x.month === cleanMonth);
        return {
          id: existing ? existing.id : uid(), // Reuses your valid database UUID row or falls back to standard crypto UUID
          month: cleanMonth,
          partnerA: c.partnerA,
          partnerB: c.partnerB
        };
      });

      const mergedContribs = contributions
        ? [
            ...data.contributions.filter(
              (c: any) => !sanitizedImportedContribs.find((nc: any) => nc.month === c.month)
            ),
            ...sanitizedImportedContribs,
          ]
        : data.contributions;

      // 2. Synchronize local UI view state instantly
      setData((prev: any) => ({
        ...prev,
        expenses: [...prev.expenses, ...newExp],
        contributions: mergedContribs,
      }));

      // 3. Batch insert new expense lines into cloud database
      if (newExp.length > 0) {
        const rowsToInsert = newExp.map((e: any) => ({
          id: e.id,
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
          settled_with: e.settledFor
        }));

        const { error: txError } = await supabase.from('transactions').insert(rowsToInsert);
        if (txError) alert('Cloud expense synchronization failed: ' + txError.message);
      }

      // 4. Batch upsert imported spreadsheet contributions using pure verified UUIDs
      if (sanitizedImportedContribs.length > 0) {
        const contribRowsToUpsert = sanitizedImportedContribs.map((c: any) => ({
          id: c.id,
          household_id: data.householdId,
          month: c.month,
          partner_a_amount: c.partnerA || 0,
          partner_b_amount: c.partnerB || 0
        }));

        const { error: cbError } = await supabase.from('contributions').upsert(contribRowsToUpsert, { onConflict: 'household_id,month' }); // ⚡ FIX: Directs bulk updates to overwrite by matching month keys
        if (cbError) {
          alert('Local state updated, but cloud contribution synchronization bounced: ' + cbError.message);
        } else {
          alert(`Successfully synced ${newExp.length} transactions and ${sanitizedImportedContribs.length} monthly funding configurations to cloud database!`);
        }
      } else if (newExp.length > 0) {
        alert(`Successfully synced ${newExp.length} transaction rows to your cloud profile!`);
      } else {
        alert('No new unique records found to import.');
      }
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
      {/* DESKTOP SIDEBAR */}
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

          <div style={{ padding: '0 20px 10px', fontSize: 11, color: C.text2, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
  👤 Logged in as: {session.user.email}
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

      {/* MAIN AREA */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          height: isMobile ? 'calc(100vh - 70px)' : '100vh',
          overflowY: 'auto',
        }}
      >
        {/* MOBILE TOP HEADER */}
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={{ fontSize: 10, color: C.text2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.user.email}</span>
      <button
        onClick={() => supabase.auth.signOut()}
        style={{
          background: 'transparent',
          border: `1px solid ${C.border}`,
          color: C.text2,
          borderRadius: 6,
          padding: '2px 6px',
          fontSize: 10,
        }}
      >
        Log Out
      </button>
    </div>
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
      session={session} // ⚡ Passes login token down
      duplicateData={duplicateData} // ⚡ Passes copy data down
      onAdd={actions.addExpense}
      onClose={() => {
        setDuplicateData(null); // Clear copy data on exit
        setView(prevView);
      }}
    />
  )}

          {view === 'income' && <IncomeTracker data={data} />}

  {view === 'expenses' && (
    <ExpenseList
      data={data}
      onToggleToSettle={actions.toggleToSettle}
      onDelete={actions.deleteExpense}
      onUpdate={actions.updateExpense}
      onBulkDelete={actions.bulkDeleteExpense}
      onDuplicate={(e: any) => {
        // Sets up a prefilled structure with today's date automatically assigned
        setDuplicateData({
          ...e,
          date: today(), 
          amount: e.amount.toString(), // Keep string formatting for form fields
          id: null // Triggers a new UUID generation on save
        });
        setPrevView(view);
        setView('add');
      }}
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

        {/* FLOATING ACTION BUTTON */}
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

      {/* MOBILE BOTTOM NAVIGATION */}
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
