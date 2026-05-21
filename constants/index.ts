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
export const C = {
  bg:      '#0b0f1a',
  surface: '#131928',
  border:  '#1e2840',
  muted:   '#3d4f6e',
  text2:   '#6b82a8',
  text1:   '#a8b8d4',
  textW:   '#e8eeff',
  amber:   '#f59e0b',
  green:   '#10b981',
  red:     '#ef4444',
  purple:  '#8b5cf6',
  blue:    '#3b82f6',
  teal:    '#06b6d4',
} as const;

// ---------------------------------------------------------------------------
// Household mode meta (labels shown in the setup wizard)
// ---------------------------------------------------------------------------
export const HOUSEHOLD_MODE_META: Record<
  HouseholdMode,
  { label: string; description: string; icon: string }
> = {
  joint: {
    label: 'Joint Household',
    icon: '🏠',
    description:
      'Two partners share a joint pool. Contributions, settlements, and shared expenses are all tracked.',
  },
  separate: {
    label: 'Separate Finances',
    icon: '🔀',
    description:
      'Two partners track their own spending independently but can still split shared expenses.',
  },
  solo: {
    label: 'Solo Manager',
    icon: '🧾',
    description:
      'One person manages all household finances alone. No partner tracking or settlements.',
  },
};