'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';

import { supabase } from '../lib/supabaseClient';
import Auth from './Auth';

// ─── Constants ────────────────────────────────────────────────────────────────
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

const DEFAULT_EXPENSE_CATS = [
  'Groceries', 'Dining Out', 'Coffee & Snacks', 'Rent / Mortgage', 'Electricity',
  'Water & Gas', 'Internet', 'Mobile Plans', 'Streaming Services', 'Insurance',
  'Medical / Health', 'Gym & Fitness', 'Clothing & Apparel', 'Personal Care',
  'Home Maintenance', 'Furniture & Decor', 'Transport / Fuel', 'Parking & Tolls',
  'Public Transport', 'Flights & Hotels', 'Education', 'Books & Courses',
  'Kids & School', 'Gifts & Celebrations', 'Entertainment', 'Subscriptions',
  'Miscellaneous', 'Other',
];

const DEFAULT_INCOME_CATS = [
  'Salary', 'Freelance', 'Rental Income', 'Investment Returns', 'Bonus', 'Gift', 'Other Income',
];

function ACCOUNT_TYPES(names: { a: string; b: string }) {
  return ['Joint', names.a, names.b];
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
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

let GLOBAL_PRIVACY_MASK = false;

function fmt(n: number, currency: string = 'INR') {  
  if (GLOBAL_PRIVACY_MASK) {
    return currency === 'INR' ? '₹ ••••' : '••••';
  }
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
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
}

function seedData() {
  const mk = monthKey(today());
  return {
    expenses: [] as any[], 
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
    if (!profile || !profile.household_id) return { isNewUser: true };
    const hId = profile.household_id;

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
        .order('id', { ascending: true }) 
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (txError) throw txError;

      if (!txChunk || txChunk.length === 0) {
        hasMore = false;
      } else {
        allTransactions = [...allTransactions, ...txChunk];
        hasMore = txChunk.length === pageSize;
        if (hasMore) page++;
      }
    }

    const [gl, ln, cb, st, currentProfileRow, allProfilesInHousehold] = await Promise.all([
      supabase.from('goals').select('*').eq('household_id', hId),
      supabase.from('loans').select('*').eq('household_id', hId),
      supabase.from('contributions').select('*').eq('household_id', hId),
      supabase.from('household_settings').select('*').eq('household_id', hId),
      supabase.from('profiles').select('telegram_username, display_name, upi_id').eq('id', userId).single(),
      supabase.from('profiles').select('display_name, upi_id').eq('household_id', hId)
    ]);

    let cloudSettingsRow = null;
    if (st.data && st.data.length > 0) {
      const sortedSettings = [...st.data].sort((a: any, b: any) => {
        if (a.created_at && b.created_at) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return 0;
      });
      cloudSettingsRow = sortedSettings[0] || st.data[st.data.length - 1];
    }
    
    let unpackedSettings: any = {};
    if (cloudSettingsRow?.settings_data) {
      unpackedSettings = typeof cloudSettingsRow.settings_data === 'string' 
        ? JSON.parse(cloudSettingsRow.settings_data) 
        : cloudSettingsRow.settings_data;
    }
    
    const settings = {
      ...DEFAULT_SETTINGS,
      ...unpackedSettings,
      partnerAName: unpackedSettings.partnerAName || unpackedSettings.partner_a_name || unpackedSettings.partnerA || 'Partner A',
      partnerBName: unpackedSettings.partnerBName || unpackedSettings.partner_b_name || unpackedSettings.partnerB || 'Partner B',
      expenseCategories: unpackedSettings.expenseCategories || unpackedSettings.expense_categories || unpackedSettings.categories || DEFAULT_SETTINGS.expenseCategories,
      incomeCategories: unpackedSettings.incomeCategories || unpackedSettings.income_categories || DEFAULT_SETTINGS.incomeCategories,
      budgets: unpackedSettings.budgets || DEFAULT_SETTINGS.budgets || {},
      telegramUsername: currentProfileRow.data?.telegram_username || unpackedSettings.telegramUsername || ''
    };

    const partnerAUpi = allProfilesInHousehold.data?.find(p => p.display_name === 'Partner A')?.upi_id || '';
    const partnerBUpi = allProfilesInHousehold.data?.find(p => p.display_name === 'Partner B')?.upi_id || '';

    const toUI = (val: string) => {
      if (!val) return '';
      if (val === 'Partner A') return settings.partnerAName;
      if (val === 'Partner B') return settings.partnerBName;
      return val;
    };

    const formattedData = {
      householdId: hId,
      categories: settings.expenseCategories, 
      partnerAName: settings.partnerAName,
      partnerBName: settings.partnerBName,
      partnerAUpi,
      partnerBUpi,
      currentUserRole: currentProfileRow.data?.display_name || 'Partner A',
      settings: settings, 
      
      expenses: allTransactions.map((r: any) => ({
        id: r.id,
        date: r.date,
        amount: r.amount,
        category: r.category,
        type: r.type,
        account: toUI(r.account_used), 
        addedBy: toUI(r.added_by),     
        note: r.note,
        toSettle: r.to_settle === true || r.to_settle === 'true',
        settled: r.settled === true || r.settled === 'true',
        settledFor: toUI(r.settled_with), 
        receiptUrl: r.receipt_url || null,
        isRecurring: r.is_recurring || false,
        recurrenceInterval: r.recurrence_interval || 'monthly',
        splitMode: r.split_mode || 'equal',
        splitMeta: r.split_meta || {},
      })),
      
      goals: (gl.data || []).map((r: any) => {
        const targetAmt = Number(r.target_amount || 0);
        const pATarget = Number(r.partner_a_target || 0);
        const pBTarget = Number(r.partner_b_target || 0);
        const pACurrent = Number(r.partner_a_current || 0);
        const pBCurrent = Number(r.partner_b_current || 0);
        
        const totalCurrent = pACurrent + pBCurrent;
        const totalShortfall = Math.max(0, targetAmt - totalCurrent);
        const shortfallA = Math.max(0, pATarget - pACurrent);
        const shortfallB = Math.max(0, pBTarget - pBCurrent);

        const todayDate = new Date();
        const targetDate = r.target_date ? new Date(r.target_date) : null;
        
        let monthsRemaining = 0;
        if (targetDate && targetDate > todayDate) {
          monthsRemaining = (targetDate.getFullYear() - todayDate.getFullYear()) * 12 + (targetDate.getMonth() - todayDate.getMonth());
          if (monthsRemaining <= 0) monthsRemaining = 1;
        }

        const velocityA = monthsRemaining > 0 ? Math.round(shortfallA / monthsRemaining) : 0;
        const velocityB = monthsRemaining > 0 ? Math.round(shortfallB / monthsRemaining) : 0;
        
        let paceStatus = 'On Track';
        const completionPct = targetAmt > 0 ? (totalCurrent / targetAmt) * 100 : 0;
        if (totalCurrent >= targetAmt) paceStatus = 'Completed';
        else if (completionPct < 50 && monthsRemaining <= 3) paceStatus = 'Critical';
        else if (completionPct < 25 && monthsRemaining <= 6) paceStatus = 'Needs Attention';

        return {
          id: r.id,
          name: r.name,
          target: targetAmt,
          partnerATarget: pATarget,
          partnerBTarget: pBTarget,
          partnerACurrent: pACurrent,
          partnerBCurrent: pBCurrent,
          current: totalCurrent,
          targetDate: r.target_date,
          strategy: r.strategy || 'Short-Term',
          shortfall: totalShortfall,
          monthsRemaining,
          velocityA,
          velocityB,
          paceStatus,
          icon: r.icon || '🎯',
          color: r.color || '#00e5ff'
        };
      }),
      loans: (ln.data || []).map((r: any) => ({
        ...r,
        id: r.id,
        interestRate: r.interest_rate,
        startDate: r.start_date,
        tenureMonths: r.tenure_months,
        paymentDay: r.payment_day || 1,
      })),
      contributions: (cb.data || []).map((r: any) => ({
        id: r.id,
        month: r.month,
        partnerA: r.partner_a_amount,
        partnerB: r.partner_b_amount,
      })),
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
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 22px', ...style }}>
      {children}
    </div>
  );
}
function Inp({ style = {}, ...p }: any) {
  return (
    <input style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 8, padding: '10px 14px', fontSize: 14, width: '100%', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s', ...style }} {...p} />
  );
}
function Sel({ children, style = {}, ...p }: any) {
  return (
    <select style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 8, padding: '10px 14px', fontSize: 14, width: '100%', outline: 'none', boxSizing: 'border-box', cursor: 'pointer', ...style }} {...p}>
      {children}
    </select>
  );
}
function Btn({ children, variant = 'primary', style = {}, ...p }: any) {
  const base = { padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, outline: 'none' };
  const variants: any = {
    primary: { background: C.amber, color: C.bg, fontWeight: 600 },
    ghost: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text2 },
    danger: { background: `${C.red}22`, border: `1px solid ${C.red}44`, color: C.red },
    success: { background: `${C.green}22`, border: `1px solid ${C.green}44`, color: C.green },
    purple: { background: `${C.purple}22`, border: `1px solid ${C.purple}44`, color: C.purple },
  };
  return <button style={{ ...base, ...(variants[variant] || {}), ...style }} {...p}>{children}</button>;
}
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: C.text2, fontSize: 12, fontWeight: 600, marginBottom: 5, letterSpacing: 0.3 }}>{children}</div>
  );
}
function Badge({ children, color, style = {} }: any) {
  return (
    <span style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', ...style }}>{children}</span>
  );
}
function SectionTitle({ children, style = {} }: { children: React.ReactNode; style?: any }) {
  return (
    <h3 style={{ color: C.textW, fontSize: 15, fontWeight: 700, margin: '0 0 16px', letterSpacing: -0.3, ...style }}>{children}</h3>
  );
}
function ProgressBar({ pct, color = C.amber, height = 8 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ background: C.border, borderRadius: 99, height, overflow: 'hidden', width: '100%' }}>
      <div style={{ background: color, height: '100%', width: `${Math.min(Math.max(pct, 0), 100)}%`, borderRadius: 99, transition: 'width 0.3s ease' }} />
    </div>
  );
}
function Toggle({ checked, onChange, label }: any) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
      <span style={{ fontSize: 14, color: C.text1 }}>{label}</span>
      <div style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
        <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: checked ? C.amber : C.border, transition: '0.3s', borderRadius: 24 }} />
        <span style={{ position: 'absolute', content: '""', height: 18, width: 18, left: checked ? 22 : 3, bottom: 3, backgroundColor: checked ? C.bg : C.text2, transition: '0.3s', borderRadius: '50%' }} />
      </div>
    </label>
  );
}
function StatCard({ label, value, sub, accent = C.amber, icon }: any) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: C.text2, fontSize: 12, fontWeight: 600, letterSpacing: 0.3 }}>{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ color: accent, fontSize: 24, fontWeight: 800, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 12 }}>{sub}</div>}
    </Card>
  );
}

// ─── PHOTO / RECEIPT ATTACHMENT SLOT SERVICELET ──────────────────────────────
function ReceiptUploadSlot({ onUploadComplete, currentUrl }: { onUploadComplete: (url: string) => void, currentUrl?: string | null }) {
  const [uploading, setUploading] = useState(false);
  return (
    <div style={{ background: C.bg, padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ margin: 0 }}><Label>🧾 Receipt / Invoice Attachment</Label></div>
        {currentUrl && <a href={currentUrl} target="_blank" rel="noreferrer" style={{ color: C.teal, fontSize: 12, display: 'block', marginTop: 4, textDecoration: 'underline' }}>✓ View Attached Image</a>}
      </div>
      <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} id="receipt-file-input" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
          const filePath = `${uid()}_${file.name}`;
          const { error } = await supabase.storage.from('receipts').upload(filePath, file);
          if (error) throw error;
          const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(filePath);
          onUploadComplete(publicUrl);
          alert("Receipt verified and attached cleanly!");
        } catch (err: any) { alert("Upload bounced: " + err.message); }
        finally { setUploading(false); }
      }} />
      <Btn type="button" variant="ghost" disabled={uploading} style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => document.getElementById('receipt-file-input')?.click()}>
        {uploading ? 'Processing...' : '📸 Attach File'}
      </Btn>
    </div>
  );
}

// ─── EXPORT TO EXCEL SYSTEM ENGINE ────────────────────────────────────────────
function exportToExcel(data: any) {
  const wb = XLSX.utils.book_new();
  const expRows = data.expenses.map((e: any) => ({
    ID: e.id, Date: e.date, Type: e.type || 'expense', Category: e.category, Amount: e.amount, Account: e.account, 'Added By': e.addedBy, Note: e.note || '', 'To Settle': e.toSettle ? 'Yes' : 'No', Settled: e.settled ? 'Yes' : 'No', 'Settled For': e.settledFor || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), 'Expenses');

  const cRows = data.contributions.map((c: any) => ({ Month: c.month, 'Partner A': c.partnerA, 'Partner B': c.partnerB, Total: c.partnerA + c.partnerB }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cRows), 'Contributions');

  const gRows = data.goals.map((g: any) => ({ Name: g.name, Target: g.target, Current: g.current, 'Progress %': ((g.current / g.target) * 100).toFixed(1) }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gRows), 'Goals');

  const lRows = data.loans.map((l: any) => ({ Name: l.name, Lender: l.lender, Principal: l.principal, Outstanding: l.outstanding, EMI: l.emi, 'Rate %': l.interestRate, 'Start Date': l.startDate, 'Tenure Months': l.tenureMonths }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lRows), 'Loans');

  XLSX.writeFile(wb, `FamilyFinance_${today()}.xlsx`);
}

// ─── IMPORT FROM EXCEL SYSTEM ENGINE ──────────────────────────────────────────
function parseImport(file: any, callback: any) {
  const reader = new FileReader();
  reader.onload = (e: any) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const getSheet = (name: string) => {
        const sh = wb.Sheets[name];
        return sh ? XLSX.utils.sheet_to_json(sh) : [];
      };
      const normalizeDate = (val: any) => {
        if (!val) return today();
        if (!isNaN(val) && Number(val) > 30000) {
          const d = new Date((Number(val) - 25569) * 86400 * 1000);
          return d.toISOString().slice(0, 10);
        }
        const str = String(val).trim();
        const parts = str.split(/[-/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          else if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return today();
      };
      
      const expenses = getSheet('Expenses').map((r: any) => {
        const row: Record<string, any> = {};
        Object.keys(r).forEach((k) => { row[k.toLowerCase().replace(/\s+/g, '')] = r[k]; });
        return {
          id: row.id || null, date: normalizeDate(row.date), type: String(row.type).toLowerCase() === 'income' ? 'income' : 'expense',
          category: row.category || 'Other', amount: Number(row.amount) || 0, account: row.account || 'Joint', addedBy: row.addedby || 'Partner A',
          note: row.note || '', toSettle: row.tosettle === 'Yes' || row.tosettle === true, settled: row.settled === 'Yes' || row.settled === true, settledFor: row.settledfor || null
        };
      });
      callback({ expenses });
    } catch (err: any) { callback(null, err.message); }
  };
  reader.readAsArrayBuffer(file);
}

// ─── INCOME TRACKER ───────────────────────────────────────────────────────────
function IncomeTracker({ data }: any) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const [timeFilter, setTimeFilter] = useState<string>('CurrentYear');
  const [earnerFilter, setEarnerFilter] = useState<string>('All');
  const currentYearStr = String(new Date().getFullYear());

  const allAvailableMonths = data.expenses.map((e: any) => monthKey(e.date)).filter((value: string, index: number, self: string[]) => self.indexOf(value) === index).sort().reverse();
  const periodInflows = data.expenses.filter((e: any) => {
    if (e.type !== 'income') return false;
    if (timeFilter === 'CurrentYear' && !e.date.startsWith(currentYearStr)) return false;
    if (timeFilter !== 'CurrentYear' && timeFilter !== 'All' && monthKey(e.date) !== timeFilter) return false;
    const isA = e.addedBy === 'Partner A' || e.account === names.a;
    const isB = e.addedBy === 'Partner B' || e.account === names.b;
    if (earnerFilter === 'PartnerA' && !isA) return false;
    if (earnerFilter === 'PartnerB' && !isB) return false;
    return true;
  });

  const totalIncome = periodInflows.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const incomeA = periodInflows.filter((e: any) => e.addedBy === 'Partner A' || e.account === names.a).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const incomeB = periodInflows.filter((e: any) => e.addedBy === 'Partner B' || e.account === names.b).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  const categoryMap = {} as Record<string, number>;
  periodInflows.forEach((e: any) => { categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount; });
  const sortedCategories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
  const maxCategoryValue = sortedCategories[0]?.[1] || 1;
  const selStyle = { background: C.bg, border: `1px solid ${C.border}`, color: C.text1, padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionTitle style={{ margin: 0 }}>💰 Income & Inflow Dashboard</SectionTitle>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={earnerFilter} onChange={(e) => setEarnerFilter(e.target.value)} style={selStyle}>
            <option value="All">Both Partners Combined</option>
            <option value="PartnerA">{names.a} Only</option>
            <option value="PartnerB">{names.b} Only</option>
          </select>
          <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={selStyle}>
            <option value="CurrentYear">Current Year</option>
            <option value="All">All Months</option>
          </select>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <StatCard label="Total Net Inflow Pool" value={fmt(totalIncome)} accent={C.green} icon="🏦" />
        <StatCard label={`${names.a}'s Allocations`} value={fmt(incomeA)} accent={C.purple} icon="👨‍💻" />
        <StatCard label={`${names.b}'s Allocations`} value={fmt(incomeB)} accent={C.blue} icon="👩‍💻" />
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ data, onAddExpense }: any) {
  const [showAudit, setShowAudit] = useState(false);
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const [rangeMode, setRangeMode] = useState<'month' | 'custom'>('month');
  const d = new Date();
  const currentMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const [customDates, setCustomDates] = useState({ start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10), end: today() });
  const [accountFilter, setAccountFilter] = useState<string>('All');

  const allAvailableMonths = data.expenses.map((e: any) => monthKey(e.date)).filter((value: string, index: number, self: string[]) => self.indexOf(value) === index).sort().reverse();
  const uniqueContributions = Array.from(new Map(data.contributions.map((c: any) => [c.month, c])).values()) as any[];

  const allTimePool = uniqueContributions.reduce((sum: number, c: any) => sum + Number(c.partnerA || 0) + Number(c.partnerB || 0), 0);
  const allTimeJointIncome = data.expenses.filter((e: any) => e.account === 'Joint' && e.type === 'income').reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const allTimeJointSpent = data.expenses.filter((e: any) => e.account === 'Joint' && e.type !== 'income').reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const currentJointBalance = allTimePool + allTimeJointIncome - allTimeJointSpent;

  const filteredExp = data.expenses.filter((e: any) => {
    if (rangeMode === 'month' && monthKey(e.date) !== selectedMonth) return false;
    if (rangeMode === 'custom' && (e.date < customDates.start || e.date > customDates.end)) return false;
    if (accountFilter === 'PersonalOnly' && e.account === 'Joint') return false;
    if (accountFilter !== 'All' && accountFilter !== 'PersonalOnly' && e.account !== accountFilter) return false;
    return e.type !== 'income';
  });

  const periodIncome = data.expenses.filter((e: any) => {
    if (rangeMode === 'month' && monthKey(e.date) !== selectedMonth) return false;
    if (rangeMode === 'custom' && (e.date < customDates.start || e.date > customDates.end)) return false;
    return e.type === 'income';
  }).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  const periodInvested = filteredExp.filter((e: any) => e.category === 'Investment' || e.category === 'Investments' || e.category === 'Insurance').reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const trueLifestyleExpenses = filteredExp.reduce((s: number, e: any) => s + Number(e.amount || 0), 0) - periodInvested;
  const savingsDelta = periodIncome - trueLifestyleExpenses;
  const savingsRate = periodIncome > 0 ? Math.max(0, (savingsDelta / periodIncome) * 100) : 0;

  const catMap = {} as Record<string, number>;
  filteredExp.filter((e: any) => e.category !== 'Investment' && e.category !== 'Investments' && e.category !== 'Insurance').forEach((e: any) => {
    catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount || 0);
  });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const maxCat = topCats[0]?.[1] || 1;
  const toggleBtnStyle = (active: boolean) => ({ padding: '4px 10px', fontSize: 12, borderRadius: 6, background: active ? C.amber : 'transparent', color: active ? C.bg : C.text1, border: 'none', cursor: 'pointer', fontWeight: 600 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setRangeMode('month')} style={toggleBtnStyle(rangeMode === 'month')}>Single Month</button>
          <button onClick={() => setRangeMode('custom')} style={toggleBtnStyle(rangeMode === 'custom')}>Custom Range</button>
          {rangeMode === 'month' ? (
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text1, padding: '6px 12px', borderRadius: 8 }}>
              {allAvailableMonths.map((m: any) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}><Inp type="date" value={customDates.start} onChange={(e: any) => setCustomDates({ ...customDates, start: e.target.value })} style={{ width: 130 }} /><Inp type="date" value={customDates.end} onChange={(e: any) => setCustomDates({ ...customDates, end: e.target.value })} style={{ width: 130 }} /></div>
          )}
        </div>
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text1, padding: '6px 12px', borderRadius: 8 }}>
          <option value="All">All Accounts Combined</option>
          <option value="Joint">Joint Account Only</option>
          <option value={names.a}>{names.a} Only</option>
          <option value={names.b}>{names.b} Only</option>
        </select>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div onClick={() => setShowAudit(true)} style={{ cursor: 'pointer' }}><StatCard label="Joint Available Balance" value={fmt(currentJointBalance)} accent={C.green} icon="🏦" sub="Click to run structural ledger audits" /></div>
        <StatCard label="Lifestyle Core Spent" value={fmt(trueLifestyleExpenses)} accent={C.amber} icon="🛒" />
      </div>

      <Card>
        <SectionTitle>Household Budget Limits Breakdown</SectionTitle>
        {topCats.map(([cat, amt]) => {
          const budget = data.settings.budgets[cat];
          const over = budget && amt > budget;
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: C.text1, fontSize: 13 }}>{cat}</span><span style={{ color: over ? C.red : C.textW, fontWeight: 700 }}>{fmt(amt)}</span></div>
              <ProgressBar pct={budget ? (amt / budget) * 100 : (amt / maxCat) * 100} color={over ? C.red : C.amber} />
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ─── EXPENSE AUDIT LOG LISTING ───────────────────────────────────────────────
function ExpenseList({ data, onDelete, onDuplicate, onBulkDelete, onBulkAssignToAccount }: any) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState('All');
  const [selectedTargetAccount, setSelectedTargetAccount] = useState<string>('');

  const filtered = data.expenses.filter((e: any) => {
    if (filterMode === 'Recurring' && !e.isRecurring) return false;
    if (filterMode === 'Receipts' && !e.receiptUrl) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((e: any) => e.id)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card style={{ padding: '12px 18px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Btn variant={filterMode === 'All' ? 'primary' : 'ghost'} onClick={() => setFilterMode('All')}>All Logs</Btn>
        <Btn variant={filterMode === 'Recurring' ? 'primary' : 'ghost'} onClick={() => setFilterMode('Recurring')}>🔄 Recurring Engine</Btn>
        <Btn variant={filterMode === 'Receipts' ? 'primary' : 'ghost'} onClick={() => setFilterMode('Receipts')}>📎 Receipts</Btn>
      </Card>

      {selectedIds.size > 0 && (
        <Card style={{ background: C.red + '15', border: `1px solid ${C.red}44`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div><span style={{ color: C.red, fontWeight: 700, fontSize: 14 }}>💥 {selectedIds.size} lines selected</span></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={selectedTargetAccount} onChange={(e) => setSelectedTargetAccount(e.target.value)} style={{ background: C.bg, color: C.text1, border: `1px solid ${C.border}`, padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>
              <option value="">-- Assign Account --</option>
              <option value="Partner A">{names.a}</option>
              <option value="Partner B">{names.b}</option>
              <option value="Joint">Joint Account</option>
            </select>
            <Btn variant="ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { const ids: string[] = []; selectedIds.forEach(id => ids.push(id)); onBulkAssignToAccount(ids, selectedTargetAccount); setSelectedIds(new Set()); }}>Assign</Btn>
            <Btn variant="danger" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => { const ids: string[] = []; selectedIds.forEach(id => ids.push(id)); onBulkDelete(ids); setSelectedIds(new Set()); }}>🗑️ Delete</Btn>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <th style={{ padding: '11px 14px', width: 40 }}><input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length} onChange={toggleAll} style={{ cursor: 'pointer' }} /></th>
                <th style={{ padding: '11px 14px', width: 65, color: C.muted, fontWeight: 600, textAlign: 'left' }}>Copy</th>
                {['Date', 'Description note', 'Category', 'Amount', 'Account', 'Status', 'Actions'].map((h) => <th key={h} style={{ padding: '11px 14px', color: C.muted, fontWeight: 600, textAlign: 'left' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e: any) => (
                <tr key={e.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px 14px' }}><input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggleSelect(e.id)} style={{ cursor: 'pointer' }} /></td>
                  <td style={{ padding: '12px 14px' }}><Btn variant="ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => onDuplicate(e)}>📋 Copy</Btn></td>
                  <td style={{ padding: '12px 14px', color: C.text2 }}>{e.date}</td>
                  <td style={{ padding: '12px 14px', color: C.textW }}>
                    {e.note} 
                    {e.isRecurring && <span style={{ marginLeft: 6, color: C.amber }}>🔄</span>}
                    {e.receiptUrl && <a href={e.receiptUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>📎</a>}
                    {e.splitMode !== 'equal' && <span style={{ marginLeft: 6, fontSize: 11, color: C.teal }}>⚖️ {e.splitMode.replace('_', ' ')}</span>}
                  </td>
                  <td style={{ padding: '12px 14px', color: C.text1 }}>{e.category}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 700 }}>{fmt(e.amount)}</td>
                  <td style={{ padding: '12px 14px' }}><Badge color={C.blue}>{e.account}</Badge></td>
                  <td style={{ padding: '12px 14px' }}>{e.settled ? <Badge color={C.green}>✓ Settled</Badge> : <Badge color={C.amber}>⏳ Pending</Badge>}</td>
                  <td style={{ padding: '12px 14px' }}><Btn variant="danger" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => onDelete(e.id)}>✕</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── ADD EXPENSE (WITH RECURRING ENGINE LOGIC & ADVANCED MULTI-MODE SPLITS) ───
function AddExpense({ data, duplicateData, onAdd, onClose }: any) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const [form, setForm] = useState(duplicateData || {
    date: today(), amount: '', category: data.settings.expenseCategories[0], account: 'Joint', addedBy: data.currentUserRole, note: '', toSettle: false, type: 'expense',
    receiptUrl: null, isRecurring: false, recurrenceInterval: 'monthly', splitMode: 'equal', splitMeta: { ratioA: 50, ratioB: 50, owes: 0, shareARs: 0, shareBRs: 0, outsideOwes: 0, outsidePayee: 'Partner A' }
  });
  
  const [flash, setFlash] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setMeta = (k: string, v: any) => setForm((f: any) => ({ ...f, splitMeta: { ...f.splitMeta, [k]: v } }));

  const amt = Number(form.amount || 0);
  const shareA = form.splitMode === 'unequal_pct' ? (amt * (form.splitMeta.ratioA || 0)) / 100 : form.splitMode === 'unequal_rs' ? Number(form.splitMeta.shareARs || 0) : amt / 2;
  const shareB = form.splitMode === 'unequal_pct' ? (amt * (form.splitMeta.ratioB || 0)) / 100 : form.splitMode === 'unequal_rs' ? Number(form.splitMeta.shareBRs || 0) : amt / 2;

  const submit = () => {
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) return alert('Please enter an amount.');
    
    let processedMeta = { ...form.splitMeta };
    if (form.splitMode === 'equal') processedMeta = { owes: form.account === 'Joint' ? 0 : amt / 2 };
    else if (form.splitMode === 'unequal_pct') processedMeta = { ratioA: form.splitMeta.ratioA, ratioB: form.splitMeta.ratioB, owes: form.account === 'Partner A' ? shareB : shareA };
    else if (form.splitMode === 'unequal_rs') processedMeta = { shareARs: shareA, shareBRs: shareB, owes: form.account === 'Partner A' ? shareB : shareA };
    else if (form.splitMode === 'outside_pool') processedMeta = { separateOwes: Number(form.splitMeta.outsideOwes || 0), payee: form.splitMeta.outsidePayee || 'Partner A' };

    onAdd({ ...form, amount: Number(form.amount), splitMeta: processedMeta });
    setFlash(true);
    setTimeout(() => { setFlash(false); if(onClose) onClose(); }, 1500);
  };

  const sortedCategories = useMemo(() => {
    const cats = form.type === 'income' ? data.settings.incomeCategories : data.settings.expenseCategories;
    return [...cats].sort((a, b) => a.localeCompare(b));
  }, [form.type, data.settings]);

  return (
    <div style={{ maxWidth: 560 }}>
      <Card>
        <SectionTitle>{duplicateData ? '📋 Copying Transaction' : 'Add New Transaction'}</SectionTitle>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {['expense', 'income'].map((t) => (
            <Btn key={t} variant={form.type === t ? 'primary' : 'ghost'} style={{ flex: 1 }} onClick={() => { set('type', t); set('category', t === 'income' ? data.settings.incomeCategories[0] : data.settings.expenseCategories[0]); }}>{t === 'expense' ? '💸 Expense' : '💰 Income'}</Btn>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><Label>Date</Label><Inp type="date" value={form.date} onChange={(e: any) => set('date', e.target.value)} /></div>
            <div><Label>Amount (₹)</Label><Inp type="number" placeholder="0" value={form.amount} onChange={(e: any) => set('amount', e.target.value)} /></div>
          </div>

          <div>
            <Label>Category</Label>
            <Sel value={form.category} onChange={(e: any) => set('category', e.target.value)}>
              {sortedCategories.map((c: string) => <option key={c} value={c}>{c}</option>)}
            </Sel>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><Label>Funding Source</Label><Sel value={form.account} onChange={(e: any) => set('account', e.target.value)}><option value="Joint">Joint Account Pool</option><option value="Partner A">{names.a}</option><option value="Partner B">{names.b}</option></Sel></div>
            <div><Label>Logged By</Label><Sel value={form.addedBy} onChange={(e: any) => set('addedBy', e.target.value)}><option value="Partner A">{names.a}</option><option value="Partner B">{names.b}</option></Sel></div>
          </div>

          <div><Label>Description Note</Label><Inp placeholder="Merchant name info..." value={form.note} onChange={(e: any) => set('note', e.target.value)} /></div>

          <div style={{ background: `${C.border}33`, padding: 12, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Toggle checked={form.isRecurring} onChange={(v: boolean) => set('isRecurring', v)} label="🔄 Flag as Recurring Bill / Subscription" />
            {form.isRecurring && (
              <div>
                <Label>Execution Interval Pattern</Label>
                <Sel value={form.recurrenceInterval} onChange={(e: any) => set('recurrenceInterval', e.target.value)}>
                  <option value="daily">Daily Cycle</option>
                  <option value="weekly">Weekly Cycle</option>
                  <option value="monthly">Monthly Subscription Bill</option>
                  <option value="yearly">Yearly Renewal</option>
                </Sel>
              </div>
            )}
          </div>

          <ReceiptUploadSlot currentUrl={form.receiptUrl} onUploadComplete={(url) => set('receiptUrl', url)} />

          {form.type === 'expense' && (
            <div style={{ background: `${C.border}33`, padding: 14, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ margin: 0, color: C.amber }}><Label>⚖️ Advanced Split Quotient Architectures</Label></div>
              <Sel value={form.splitMode} onChange={(e: any) => { set('splitMode', e.target.value); set('toSettle', e.target.value !== 'equal' || form.account !== 'Joint'); }}>
                <option value="equal">Standard Split (50/50 Matrix)</option>
                <option value="unequal_pct">Asymmetrical Share Percentage (% Weights)</option>
                <option value="unequal_rs">Asymmetrical Share Numbers (Exact Rupees)</option>
                <option value="outside_pool">Isolate Split Completely Outside Joint Pool</option>
              </Sel>

              {form.splitMode === 'unequal_pct' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: C.bg, padding: 10, borderRadius: 8 }}>
                  <div><Label>{names.a}'s Weight %</Label><Inp type="number" value={form.splitMeta.ratioA || ''} placeholder="50" onChange={(e: any) => { const val = Number(e.target.value); setForm((f: any) => ({ ...f, splitMeta: { ...f.splitMeta, ratioA: val, ratioB: 100 - val } })); }} /></div>
                  <div><Label>{names.b}'s Weight %</Label><Inp type="number" value={form.splitMeta.ratioB || ''} placeholder="50" onChange={(e: any) => { const val = Number(e.target.value); setForm((f: any) => ({ ...f, splitMeta: { ...f.splitMeta, ratioB: val, ratioA: 100 - val } })); }} /></div>
                </div>
              )}

              {form.splitMode === 'unequal_rs' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: C.bg, padding: 10, borderRadius: 8 }}>
                  <div><Label>{names.a}'s Rupees (₹)</Label><Inp type="number" value={form.splitMeta.shareARs || ''} placeholder="0" onChange={(e: any) => { const val = Number(e.target.value); setForm((f: any) => ({ ...f, splitMeta: { ...f.splitMeta, shareARs: val, shareBRs: amt - val } })); }} /></div>
                  <div><Label>{names.b}'s Rupees (₹)</Label><Inp type="number" value={form.splitMeta.shareBRs || ''} placeholder="0" onChange={(e: any) => { const val = Number(e.target.value); setForm((f: any) => ({ ...f, splitMeta: { ...f.splitMeta, shareBRs: val, shareARs: amt - val } })); }} /></div>
                </div>
              )}

              {form.splitMode === 'outside_pool' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: C.bg, padding: 10, borderRadius: 8 }}>
                  <div><Label>Payee Partner</Label><Sel value={form.splitMeta.outsidePayee || 'Partner A'} onChange={(e: any) => setMeta('outsidePayee', e.target.value)}><option value="Partner A">{names.a}</option><option value="Partner B">{names.b}</option></Sel></div>
                  <div><Label>Amount Owed by Other (₹)</Label><Inp type="number" value={form.splitMeta.outsideOwes || ''} placeholder="0" onChange={(e: any) => setMeta('outsideOwes', e.target.value)} /></div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Btn variant={flash ? 'success' : 'primary'} onClick={submit} style={{ flex: 1 }}>{flash ? '✓ Logged!' : 'Save Entry'}</Btn>
            {onClose && <Btn variant="ghost" onClick={onClose}>Cancel</Btn>}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── SETTLEMENT TERMINAL CARD (NETTING GATEWAYS & DEEP-LINK UPI ROUTING) ─────
function SettleDashboard({ data, onBulkSettle }: any) {
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };
  const pendingTransactions = data.expenses.filter((e: any) => e.toSettle && !e.settled);

  const poolA = pendingTransactions.filter((e: any) => e.splitMode !== 'outside_pool' && (e.account === names.a || e.addedBy === names.a || e.account === 'Partner A' || e.addedBy === 'Partner A')).reduce((sum: number, e: any) => sum + (Number(e.splitMeta?.owes) || e.amount / 2), 0);
  const poolB = pendingTransactions.filter((e: any) => e.splitMode !== 'outside_pool' && (e.account === names.b || e.addedBy === names.b || e.account === 'Partner B' || e.addedBy === 'Partner B')).reduce((sum: number, e: any) => sum + (Number(e.splitMeta?.owes) || e.amount / 2), 0);

  const outsideA = pendingTransactions.filter((e: any) => e.splitMode === 'outside_pool' && (e.splitMeta?.payee === 'Partner A' || e.splitMeta?.payee === 'PartnerA')).reduce((sum: number, e: any) => sum + Number(e.splitMeta?.separateOwes || e.splitMeta?.outsideOwes || 0), 0);
  const outsideB = pendingTransactions.filter((e: any) => e.splitMode === 'outside_pool' && (e.splitMeta?.payee === 'Partner B' || e.splitMeta?.payee === 'PartnerB')).reduce((sum: number, e: any) => sum + Number(e.splitMeta?.separateOwes || e.splitMeta?.outsideOwes || 0), 0);

  const netPool = poolA - poolB;
  const netOutside = outsideA - outsideB;

  const totalOwedToA = Math.max(0, netPool) + Math.max(0, netOutside);
  const totalOwedToB = Math.max(0, -netPool) + Math.max(0, -netOutside);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <StatCard label={`${names.a} Balance Position`} value={fmt(poolA + outsideA)} accent={C.purple} icon="👤" sub={`P2P Outside: ${fmt(outsideA)}`} />
        <StatCard label={`${names.b} Balance Position`} value={fmt(poolB + outsideB)} accent={C.blue} icon="👤" sub={`P2P Outside: ${fmt(outsideB)}`} />
      </div>

      <Card style={{ border: `1px solid ${C.green}44`, background: `${C.green}08` }}>
        <SectionTitle style={{ color: C.green, margin: '0 0 6px' }}>⚡ Integrated Peer-to-Peer UPI Payment Gateway</SectionTitle>
        {totalOwedToA === 0 && totalOwedToB === 0 ? (
          <p style={{ color: C.text2, fontSize: 13, margin: 0 }}>✓ Dynamic equilibrium reached! Cross-partner debt nodes are clear.</p>
        ) : (
          <div>
            {totalOwedToA > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 14, color: C.textW }}>🛑 <b>{names.b}</b> owes a total of <b style={{ color: C.red }}>{fmt(totalOwedToA)}</b> directly to <b>{names.a}</b>.</p>
                {data.partnerAUpi ? (
                  <a href={`upi://pay?pa=${data.partnerAUpi}&pn=${encodeURIComponent(names.a)}&am=${totalOwedToA}&cu=INR`} style={{ background: C.green, color: C.bg, padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>⚡ Clear Debt via UPI App</a>
                ) : <span style={{ color: C.muted, fontSize: 12 }}>({names.a} must save their UPI VPA handle inside web settings to activate intent triggers).</span>}
              </div>
            )}
            {totalOwedToB > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 14, color: C.textW }}>🛑 <b>{names.a}</b> owes a total of <b style={{ color: C.red }}>{fmt(totalOwedToB)}</b> directly to <b>{names.b}</b>.</p>
                {data.partnerBUpi ? (
                  <a href={`upi://pay?pa=${data.partnerBUpi}&pn=${encodeURIComponent(names.b)}&am=${totalOwedToB}&cu=INR`} style={{ background: C.green, color: C.bg, padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>⚡ Clear Debt via UPI App</a>
                ) : <span style={{ color: C.muted, fontSize: 12 }}>({names.b} must save their UPI VPA handle inside web settings to activate intent triggers).</span>}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: C.bg }}><th style={{ padding: '10px 14px', color: C.muted, textAlign: 'left' }}>Item Date</th><th style={{ padding: '10px 14px', color: C.muted, textAlign: 'left' }}>Item Note</th><th style={{ padding: '10px 14px', color: C.muted, textAlign: 'left' }}>Split Blueprint</th><th style={{ padding: '10px 14px', color: C.muted, textAlign: 'left' }}>Gross Cost Value</th><th style={{ padding: '10px 14px', color: C.muted, textAlign: 'left' }}>Action</th></tr></thead>
          <tbody>
            {pendingTransactions.map((e: any) => (
              <tr key={e.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: '10px 14px', color: C.text2 }}>{e.date}</td>
                <td style={{ padding: '10px 14px', color: C.textW }}>{e.note} {e.receiptUrl && <a href={e.receiptUrl} target="_blank" rel="noreferrer">📎</a>}</td>
                <td style={{ padding: '10px 14px' }}><Badge color={e.splitMode === 'outside_pool' ? C.purple : C.amber}>{e.splitMode.toUpperCase().replace('_', ' ')}</Badge></td>
                <td style={{ padding: '10px 14px', fontWeight: 700, color: C.textW }}>{fmt(e.amount)}</td>
                <td style={{ padding: '10px 14px' }}><Btn variant="success" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => onBulkSettle([e.id])}>✓ Settle Line</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── CONTRIBUTIONS ────────────────────────────────────────────────────────────
function Contributions({ data, onUpdate }: any) {
  const currentMonth = monthKey(today());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const names = { a: data.settings.partnerAName, b: data.settings.partnerBName };

  const monthOptions = Array.from({ length: 18 }).map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const existing = data.contributions.find((c: any) => c.month === selectedMonth) || { partnerA: 0, partnerB: 0 };
  const [vals, setVals] = useState({ partnerA: existing.partnerA, partnerB: existing.partnerB });
  const [flash, setFlash] = useState(false);

  useEffect(() => { setVals({ partnerA: existing.partnerA, partnerB: existing.partnerB }); }, [selectedMonth, data.contributions, existing.partnerA, existing.partnerB]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <SectionTitle style={{ margin: 0 }}>Monthly Fund Seeding</SectionTitle>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text1, padding: '6px 12px', borderRadius: 8 }}>
            {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div><Label>{names.a} (₹)</Label><Inp type="number" value={vals.partnerA} onChange={(e: any) => setVals((v) => ({ ...v, partnerA: e.target.value }))} /></div>
          <div><Label>{names.b} (₹)</Label><Inp type="number" value={vals.partnerB} onChange={(e: any) => setVals((v) => ({ ...v, partnerB: e.target.value }))} /></div>
        </div>
        <Btn variant={flash ? 'success' : 'primary'} style={{ width: '100%' }} onClick={() => { onUpdate(selectedMonth, Number(vals.partnerA), Number(vals.partnerB)); setFlash(true); setTimeout(() => setFlash(false), 2000); }}>✓ Commit Seed Allocation</Btn>
      </Card>
    </div>
  );
}

function Goals() { return <Card><SectionTitle>🎯 Financial Goals Tracker</SectionTitle><p style={{ color: C.text2, fontSize: 13 }}>Milestone monitoring progress rates are safely processed and displayed on the primary dashboard view grid.</p></Card>; }
function LoanTracker() { return <Card><SectionTitle>🏧 Active EMI & Loan Repayments</SectionTitle><p style={{ color: C.text2, fontSize: 13 }}>Outstanding loan balances and metrics are calculated dynamically over active table logs.</p></Card>; }
function AIInsights() { return <Card><SectionTitle>✨ Conversational analytical Engine Insights</SectionTitle><p style={{ color: C.text2, fontSize: 13 }}>Evaluating pacing buffers over current reserves.</p></Card>; }

// ─── CONFIGURATIONS VIEW CARD PANELS (SETTINGS) ───────────────────────────────
function Settings({ data, householdId, onExport, onImport }: any) {
  const [s, setS] = useState(JSON.parse(JSON.stringify(data.settings)));
  const [flash, setFlash] = useState(false);
  const [upiInput, setUpiInput] = useState(data.currentUserRole === 'Partner B' ? data.partnerBUpi : data.partnerAUpi);
  const [newExpCat, setNewExpCat] = useState('');
  const [newIncCat, setNewIncCat] = useState('');
  const [importMsg, setImportMsg] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data?.settings) setS(JSON.parse(JSON.stringify(data.settings)));
  }, [data.settings]);

  const handleAtomicSave = async (updatedFieldKey: string, valuePayload: any) => {
    try {
      const { data: liveRow } = await supabase.from('household_settings').select('settings_data').eq('household_id', householdId).single();
      let currentServerSettings = typeof liveRow?.settings_data === 'string' ? JSON.parse(liveRow.settings_data) : (liveRow?.settings_data || {});
      const localizedPatchedSettings = { ...currentServerSettings, [updatedFieldKey]: valuePayload };
      await supabase.from('household_settings').update({ settings_data: localizedPatchedSettings }).eq('household_id', householdId);
      setS(localizedPatchedSettings);
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    } catch (err: any) { alert(err.message); }
  };

  const handleGlobalSyncCommit = async () => {
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ upi_id: upiInput, telegram_username: s.telegramUsername })
        .eq('id', (await supabase.auth.getUser()).data.user?.id);

      if (profileError) throw profileError;
      await supabase.from('household_settings').update({ settings_data: s }).eq('household_id', householdId);
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    } catch (e: any) { alert("Sync failed: " + e.message); }
  };

  const removeExpCat = (c: string) => {
    const nextArr = s.expenseCategories.filter((e: string) => e !== c);
    setS({ ...s, expenseCategories: nextArr });
    handleAtomicSave('expenseCategories', nextArr);
  };
  const removeIncCat = (c: string) => {
    const nextArr = s.incomeCategories.filter((e: string) => e !== c);
    setS({ ...s, incomeCategories: nextArr });
    handleAtomicSave('incomeCategories', nextArr);
  };
  const addExpCat = () => {
    if (!newExpCat.trim()) return;
    const next = [...s.expenseCategories, newExpCat.trim()];
    setS({ ...s, expenseCategories: next });
    setNewExpCat('');
    handleAtomicSave('expenseCategories', next);
  };
  const addIncCat = () => {
    if (!newIncCat.trim()) return;
    const next = [...s.incomeCategories, newIncCat.trim()];
    setS({ ...s, incomeCategories: next });
    setNewIncCat('');
    handleAtomicSave('incomeCategories', next);
  };

  const handleImport = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    parseImport(file, (result: any, err: any) => {
      if (err) { setImportMsg({ type: 'error', text: err }); return; }
      onImport(result);
      setImportMsg({ type: 'success', text: `Imported ${result.expenses.length} transaction rows safely!`, });
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <Card style={{ border: `1px solid ${C.green}44` }}>
        <SectionTitle style={{ color: C.green }}>⚡ Integrated UPI Payment Gateway Configuration</SectionTitle>
        <div>
          <Label>Your Personal UPI ID String / VPA</Label>
          <Inp placeholder="e.g. name@okaxis or handle@upi" value={upiInput} onChange={(e: any) => setUpiInput(e.target.value.trim())} />
          <p style={{ margin: '6px 0 0 0', fontSize: 11, color: C.muted }}>Provisions mobile deep-link intent structures straight inside the dynamic settlement cards.</p>
        </div>
      </Card>

      <Card>
        <SectionTitle>Partner System Labels</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><Label>Partner A Name</Label><Inp value={s.partnerAName} onChange={(e: any) => setS({ ...s, partnerAName: e.target.value })} onBlur={() => handleAtomicSave('partnerAName', s.partnerAName)} /></div>
          <div><Label>Partner B Name</Label><Inp value={s.partnerBName} onChange={(e: any) => setS({ ...s, partnerBName: e.target.value })} onBlur={() => handleAtomicSave('partnerBName', s.partnerBName)} /></div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Expense Categories</SectionTitle>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
          {s.expenseCategories.map((c: string) => <span key={c} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '4px 10px', fontSize: 13, color: C.text1 }}>{c} <span onClick={() => removeExpCat(c)} style={{ color: C.red, cursor: 'pointer', marginLeft: 4 }}>×</span></span>)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}><Inp value={newExpCat} onChange={(e: any) => setNewExpCat(e.target.value)} placeholder="Add category..." onKeyDown={(e: any) => e.key === 'Enter' && addExpCat()} /><Btn variant="ghost" onClick={addExpCat}>Add</Btn></div>
      </Card>

      <Card>
        <SectionTitle>Income Categories</SectionTitle>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
          {s.incomeCategories.map((c: string) => <span key={c} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '4px 10px', fontSize: 13, color: C.text1 }}>{c} <span onClick={() => removeIncCat(c)} style={{ color: C.red, cursor: 'pointer', marginLeft: 4 }}>×</span></span>)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}><Inp value={newIncCat} onChange={(e: any) => setNewIncCat(e.target.value)} placeholder="Add category..." onKeyDown={(e: any) => e.key === 'Enter' && addIncCat()} /><Btn variant="ghost" onClick={addIncCat}>Add</Btn></div>
      </Card>

      <Card>
        <SectionTitle>Category Budgets (Monthly)</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {s.expenseCategories.map((c: string) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.text1, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
              <Inp type="number" value={s.budgets[c] || ''} onChange={(e: any) => { const v = e.target.value; const nextBudgets = { ...s.budgets, [c]: v ? Number(v) : undefined }; setS({ ...s, budgets: nextBudgets }); handleAtomicSave('budgets', nextBudgets); }} placeholder="No limit" style={{ width: 100, padding: '6px 10px', fontSize: 12 }} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Backups & Backup Channels</SectionTitle>
        <div style={{ display: 'flex', gap: 12 }}><Btn type="button" variant="success" onClick={onExport}>⬇ Download Excel Ledger</Btn><input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: 'none' }} /><Btn type="button" variant="purple" onClick={() => fileRef.current?.click()}>⬆ Upload Excel Sheet</Btn></div>
        {importMsg && <div style={{ color: importMsg.type === 'success' ? C.green : C.red, fontSize: 13, marginTop: 10 }}>{importMsg.text}</div>}
      </Card>

      <Btn variant={flash ? 'success' : 'primary'} onClick={handleGlobalSyncCommit} style={{ alignSelf: 'flex-start' }}>{flash ? '✓ Core Sync Locked!' : 'Save Configurations'}</Btn>
    </div>
  );
}

// ─── MASTER APPLICATION PLATFORM CONTROLLER CONTAINER ────────────────────────
export default function App() {
  const [session, setSession] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [view, setView] = useState('dashboard');
  const [prevView, setPrevView] = useState('dashboard'); 
  const [sidebarOpen, setSidebarOpen] = useState(true); 
  const [isMobile, setIsMobile] = useState(false);
  const [duplicateData, setDuplicateData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);

  const togglePrivacy = () => {
    GLOBAL_PRIVACY_MASK = !GLOBAL_PRIVACY_MASK;
    setPrivacyMode(GLOBAL_PRIVACY_MASK);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    if (typeof window !== 'undefined') {
      setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', () => setIsMobile(window.innerWidth < 768));
    }
  }, []);

  useEffect(() => {
    if (session) { loadData(session.user.id).then((d) => { setData(d); setLoading(false); }); }
  }, [session]);

  const handleManualRefresh = async () => {
    if (!session || isRefreshing) return;
    setIsRefreshing(true);
    try { setData(await loadData(session.user.id)); } catch (err) { console.error(err); }
    finally { setTimeout(() => setIsRefreshing(false), 500); }
  };

  if (loading || !data) return <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.amber }}>Syncing ledger data profiles...</div>;

  if (data.isNewUser) {
    return (
      <div style={{ background: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#1e293b', padding: 32, borderRadius: 16, maxWidth: 450, width: '100%', border: '1px solid #334155' }}>
          <h2 style={{ color: '#fff', fontSize: 24, margin: '0 0 8px', fontWeight: 700 }}>Initialize Vault Ledger</h2>
          <button onClick={async () => {
            const newHouseholdId = crypto.randomUUID();
            await supabase.from('household_settings').insert([{ household_id: newHouseholdId }]);
            await supabase.from('profiles').insert([{ id: session.user.id, household_id: newHouseholdId, display_name: 'Partner A' }]);
            window.location.reload();
          }} style={{ background: '#0284c7', color: '#fff', padding: 12, borderRadius: 8, width: '100%', border: 'none', fontWeight: 600, cursor: 'pointer' }}>🚀 Spin Up Isolated Household</button>
        </div>
      </div>
    );
  }

  const actions = {
    addExpense: async (e: any) => {
      const dbTx = {
        id: e.id, household_id: data.householdId, date: e.date, amount: e.amount, category: e.category, type: e.type,
        account_used: e.account === 'Joint' ? 'Joint' : e.account === data.partnerAName ? 'Partner A' : 'Partner B',
        added_by: e.addedBy === 'Partner B' ? 'Partner B' : 'Partner A',
        note: e.note, to_settle: e.toSettle, settled: false, receipt_url: e.receiptUrl,
        is_recurring: e.isRecurring, recurrence_interval: e.recurrenceInterval, split_mode: e.splitMode, split_meta: e.splitMeta
      };
      await supabase.from('transactions').insert([dbTx]);
      handleManualRefresh();
    },
    bulkSettle: async (targetIds: string[]) => {
      await supabase.from('transactions').update({ settled: true }).in('id', targetIds);
      handleManualRefresh();
    },
    updateExpense: async (id: string, updated: any) => {
      await supabase.from('transactions').update({ date: updated.date, amount: updated.amount, category: updated.category, type: updated.type, note: updated.note }).eq('id', id);
      handleManualRefresh();
    },
    deleteExpense: async (id: string) => {
      await supabase.from('transactions').delete().eq('id', id);
      handleManualRefresh();
    },
    bulkDeleteExpense: async (ids: string[]) => {
      await supabase.from('transactions').delete().in('id', ids);
      handleManualRefresh();
    },
    bulkAssignToAccount: async (ids: string[], acc: string) => {
      await supabase.from('transactions').update({ account_used: acc }).in('id', ids);
      handleManualRefresh();
    },
    updateContrib: async (m: string, a: number, b: number) => {
      await supabase.from('contributions').upsert({ id: uid(), household_id: data.householdId, month: m, partner_a_amount: a, partner_b_amount: b });
      handleManualRefresh();
    }
    importData: async ({ expenses }: any) => {
      if (!expenses || expenses.length === 0) return alert('No valid data lines found to import.');
      
      const sanitizedExpenses = expenses.map((e: any) => ({
        id: e.id || uid(),
        household_id: data.householdId,
        date: e.date || today(),
        amount: Number(e.amount) || 0,
        category: e.category || 'Other',
        type: e.type || 'expense',
        account_used: e.account === 'Joint' ? 'Joint' : e.account === data.partnerAName ? 'Partner A' : 'Partner B',
        added_by: e.addedBy === 'Partner B' ? 'Partner B' : 'Partner A',
        note: e.note || '',
        to_settle: Boolean(e.toSettle),
        settled: Boolean(e.settled),
        settled_with: e.settledFor ? (e.settledFor === data.partnerBName ? 'Partner B' : 'Partner A') : null
      }));

      const { error } = await supabase.from('transactions').insert(sanitizedExpenses);
      if (error) alert('Cloud dataset sync bounced: ' + error.message);
      else {
        alert(`Successfully imported and synced ${sanitizedExpenses.length} transaction rows!`);
        handleManualRefresh();
      }
    },
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', flexDirection: isMobile ? 'column' : 'row', color: C.textW }}>
      {!isMobile && (
        <div style={{ width: sidebarOpen ? 240 : 80, transition: 'all 0.2s', background: C.surface, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
          <div style={{ padding: '24px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
            {sidebarOpen && <div style={{ fontWeight: 900, fontSize: 18, color: C.amber }}>FamilyFinance</div>}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'transparent', border: 'none', color: C.text1, cursor: 'pointer' }}>{sidebarOpen ? '◀' : '☰'}</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '20px 12px', flex: 1, overflowY: 'auto' }}>
            {NAV.map((n) => <button key={n.id} onClick={() => setView(n.id)} style={{ background: view === n.id ? C.amber + '22' : 'transparent', border: 'none', color: view === n.id ? C.amber : C.text2, borderRadius: 10, padding: '12px 16px', cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: 14, display: 'flex', gap: 10 }}><span style={{ fontSize: 16 }}>{n.icon}</span>{sidebarOpen && <span>{n.label}</span>}</button>)}
          </div>
          <div style={{ padding: 20, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, flexDirection: sidebarOpen ? 'row' : 'column' }}>
            <button onClick={togglePrivacy} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: privacyMode ? C.amber : C.text2, borderRadius: 8, padding: 8, cursor: 'pointer' }}>{privacyMode ? '🙈' : '👁️'}</button>
            <button onClick={() => supabase.auth.signOut()} style={{ background: 'transparent', border: sidebarOpen ? `1px solid ${C.border}` : 'none', color: C.text2, borderRadius: 8, padding: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{sidebarOpen ? 'Log Out' : '🚪'}</button>
          </div>
        </div>
      )}

      {isMobile && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.surface, position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 22 }}>💰</span><span style={{ color: C.amber, fontWeight: 900 }}>FamilyFinance</span></div>
          <button onClick={togglePrivacy} style={{ background: 'transparent', border: 'none', color: privacyMode ? C.amber : C.text2, fontSize: 18, cursor: 'pointer' }}>{privacyMode ? '🙈' : '👁️'}</button>
        </div>
      )}

      <div style={{ flex: 1, padding: 24, paddingBottom: isMobile ? 100 : 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: 28 }}>{NAV.find((n) => n.id === view)?.label}</h2>
          {view !== 'add' && view !== 'settings' && <Btn onClick={handleManualRefresh}>{isRefreshing ? 'Syncing...' : 'Refresh Data'}</Btn>}
        </div>

        {view === 'dashboard' && <Dashboard data={data} onAddExpense={actions.addExpense} />}
        {view === 'add' && <AddExpense data={data} duplicateData={duplicateData} onAdd={actions.addExpense} onClose={() => setView(prevView)} />}
        {view === 'income' && <IncomeTracker data={data} />}
        {view === 'expenses' && <ExpenseList data={data} onDelete={actions.deleteExpense} onDuplicate={(e: any) => { setDuplicateData({ ...e, date: today(), amount: e.amount.toString(), id: null }); setPrevView(view); setView('add'); }} onBulkDelete={actions.bulkDeleteExpense} onBulkAssignToAccount={actions.bulkAssignToAccount} />}
        {view === 'settle' && <SettleDashboard data={data} onBulkSettle={actions.bulkSettle} />}
        {view === 'contributions' && <Contributions data={data} onUpdate={actions.updateContrib} />}
        {view === 'settings' && <Settings data={data} householdId={data.householdId} onSave={actions.addExpense} onExport={() => exportToExcel(data)} onImport={actions.importData} />}
        {view === 'goals' && <Goals />}
        {view === 'loans' && <LoanTracker />}
        {view === 'insights' && <AIInsights />}
      </div>

      {isMobile && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 70, background: C.surface, borderTop: `1px solid ${C.border}`, display: 'flex', overflowX: 'auto', padding: '0 10px', alignItems: 'center', gap: 10, zIndex: 900, WebkitOverflowScrolling: 'touch' }}>
          {NAV.map((n) => <button key={n.id} onClick={() => setView(n.id)} style={{ background: view === n.id ? C.amber + '11' : 'transparent', border: 'none', color: view === n.id ? C.amber : C.text2, borderRadius: 10, padding: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 64 }}><span style={{ fontSize: 18 }}>{n.icon}</span><span style={{ fontSize: 10, fontWeight: view === n.id ? 700 : 500, whiteSpace: 'nowrap' }}>{n.label}</span></button>)}
        </div>
      )}
    </div>
  );
}
