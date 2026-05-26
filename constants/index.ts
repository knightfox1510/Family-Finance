// ─── constants/index.ts ───────────────────────────────────────────────────────
// All static data: categories, defaults, nav, design tokens.
// Nothing here should import from other app modules.

import type { Settings, NavItem, HouseholdMode } from '@/types';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const DEFAULT_EXPENSE_CATS: string[] = [
  'Groceries', 'Dining Out', 'Coffee & Snacks',
  'Rent / Mortgage', 'Electricity', 'Water & Gas',
  'Internet', 'Mobile Plans', 'Streaming Services',
  'Insurance', 'Medical / Health', 'Gym & Fitness',
  'Clothing & Apparel', 'Personal Care', 'Home Maintenance',
  'Furniture & Decor', 'Transport / Fuel', 'Parking & Tolls',
  'Public Transport', 'Flights & Hotels',
  'Education', 'Books & Courses', 'Kids & School',
  'Gifts & Celebrations', 'Entertainment', 'Subscriptions',
  'Investment', 'Investments', 'Miscellaneous', 'Other',
];

export const DEFAULT_INCOME_CATS: string[] = [
  'Salary', 'Freelance', 'Rental Income',
  'Investment Returns', 'Bonus', 'Gift', 'Other Income',
];

// Categories treated as "investments" for dashboard split calculations
export const INVESTMENT_CATS = new Set([
  'Investment', 'Investments', 'Insurance',
]);

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------
export const DEFAULT_SETTINGS: Settings = {
  householdMode: 'joint',
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
  telegramUsername: '',
  whatsappNumber:  '',
  setupComplete: false,
};

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------
export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

// ---------------------------------------------------------------------------
// Navigation
// 'hideIn' controls which nav items are suppressed per household mode.
// ---------------------------------------------------------------------------
export const NAV: NavItem[] = [
  { id: 'dashboard',     label: 'Dashboard',    icon: '🏠' },
  { id: 'add',           label: 'Add Expense',  icon: '➕' },
  { id: 'income',        label: 'Income',       icon: '💰' },
  { id: 'expenses',      label: 'Expenses',     icon: '📋' },
  // 'settle' is only useful when there are two partners
  { id: 'settle',        label: 'Settlements',  icon: '🔄', hideIn: ['solo'] },
  // 'contributions' only makes sense with a shared joint pool
  { id: 'contributions', label: 'Contributions',icon: '🏦', hideIn: ['solo', 'separate'] },
  { id: 'goals',         label: 'Goals',        icon: '🎯' },
  { id: 'loans',         label: 'EMI Tracker',  icon: '🏧' },
  { id: 'insights',      label: 'AI Insights',  icon: '✨' },
  { id: 'settings',      label: 'Settings',     icon: '⚙️' },
];

/** Returns the nav items visible for the given household mode */
export function navForMode(mode: HouseholdMode): NavItem[] {
  return NAV.filter((n) => !n.hideIn?.includes(mode));
}

// ---------------------------------------------------------------------------
// Design tokens (single source — import C from here everywhere)
// ---------------------------------------------------------------------------
// C maps to CSS custom properties defined in globals.css per [data-theme].
// Swapping data-theme on <html> instantly repaints every component.
export const C = {
  bg:      'var(--bg)',
  surface: 'var(--surface)',
  border:  'var(--border)',
  muted:   'var(--muted)',
  text2:   'var(--text2)',
  text1:   'var(--text1)',
  textW:   'var(--textW)',
  amber:   'var(--amber)',
  green:   'var(--green)',
  red:     'var(--red)',
  purple:  'var(--purple)',
  blue:    'var(--blue)',
  teal:    'var(--teal)',
} as const;

// Raw hex values for contexts that need actual colours (e.g. SVG charts).
// Update these if you change the default dark-navy theme.
export const HEX = {
  bg:      '#0b0f1a',
  surface: '#131928',
  border:  '#1e2840',
  amber:   '#f59e0b',
  green:   '#10b981',
  red:     '#ef4444',
  teal:    '#06b6d4',
  purple:  '#8b5cf6',
  blue:    '#3b82f6',
} as const;

// ---------------------------------------------------------------------------
// Household mode meta (labels shown in the setup wizard and settings)
// ---------------------------------------------------------------------------
export const HOUSEHOLD_MODE_META: Record<
  HouseholdMode,
  { label: string; description: string; icon: string; detail: string[]; bestFor: string }
> = {
  joint: {
    label: 'Joint Household',
    icon: '🏠',
    description:
      'Two partners share a joint pool. Contributions, settlements, and shared expenses are all tracked.',
    bestFor: 'Couples who pool salaries and pay shared bills from one account',
    detail: [
      '💳 A shared Joint Account tracks groceries, rent, utilities and other common expenses',
      '🏦 Both partners log their monthly contribution to the joint pool each month',
      '🔄 Personal expenses paid from your own account can be flagged for Joint reimbursement',
      '🤝 Direct partner splits for expenses one person covers on behalf of the other',
      '📊 Dashboard shows joint balance, individual activity, and retention velocity for both',
    ],
  },
  separate: {
    label: 'Separate Finances',
    icon: '🔀',
    description:
      'Two partners track their own spending independently but can still split shared expenses.',
    bestFor: 'Couples who keep finances separate but occasionally share costs',
    detail: [
      '👤 Each partner tracks their own income and expenses independently',
      '🤝 Shared costs (dinner, trips, gifts) can be split directly between partners',
      '📊 Dashboard shows each partner\'s individual spending and retention side by side',
      '❌ No joint pool or contribution tracking — each person manages their own account',
      '⚖️ Settlements happen directly between partners, not via a shared pool',
    ],
  },
  solo: {
    label: 'Solo Manager',
    icon: '🧾',
    description:
      'One person manages all household finances alone. No partner tracking or settlements.',
    bestFor: 'Single individuals or one person managing the whole household',
    detail: [
      '👤 All expenses tracked under a single account — no partner needed',
      '📊 Full dashboard with spending categories, investment tracking, and retention velocity',
      '🎯 Goals and EMI tracker work without any partner involvement',
      '❌ No settlements, no joint pool, no partner activity breakdown',
      '🔄 Can upgrade to Separate or Joint mode any time if your situation changes',
    ],
  },
};
