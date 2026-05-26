// ─── types/index.ts ───────────────────────────────────────────────────────────
// Single source of truth for every data shape in ChillarFlow.
// Import from here everywhere: import type { Expense, AppData } from '@/types';

// ---------------------------------------------------------------------------
// Household mode — chosen once at setup, stored in household_settings
// ---------------------------------------------------------------------------
export type HouseholdMode =
  | 'joint'      // Two partners share a joint pool (current behaviour)
  | 'separate'   // Two partners track separately, split expenses, no joint pool
  | 'solo';      // One person manages everything alone

// ---------------------------------------------------------------------------
// Core transaction
// ---------------------------------------------------------------------------
export type SplitMode = 'equal' | 'fixed' | 'percentage';
export type SettleTrack = 'none' | 'joint' | 'partner';
export type TransactionType = 'expense' | 'income';

export interface Expense {
  id: string;
  date: string;               // ISO "YYYY-MM-DD"
  amount: number;
  category: string;
  type: TransactionType;
  account: string;            // 'Joint' | partnerAName | partnerBName
  addedBy: string;            // 'Partner A' | 'Partner B' (system keys)
  note: string;
  settled: boolean;
  settledFor: string | null;
  isRecurring: boolean;
  recurrenceInterval: 'monthly' | 'weekly' | 'yearly';
  settleTrack: SettleTrack;
  splitMode: SplitMode;
  partnerAShare: number;      // 0–1, e.g. 0.5
  partnerBShare: number;
  toSettle: boolean;
}

// ---------------------------------------------------------------------------
// Contributions (monthly joint-pool transfers)
// Only relevant in 'joint' mode, but kept in the type for safety.
// ---------------------------------------------------------------------------
export interface Contribution {
  id: string;
  month: string;   // "YYYY-MM"
  partnerA: number;
  partnerB: number;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
export type GoalStrategy = 'Short-Term' | 'Medium-Term' | 'Long-Term';
export type PaceStatus = 'On Track' | 'Needs Attention' | 'Critical' | 'Completed';

export interface Goal {
  id: string;
  name: string;
  target: number;
  partnerATarget: number;
  partnerBTarget: number;
  partnerACurrent: number;
  partnerBCurrent: number;
  current: number;            // partnerACurrent + partnerBCurrent
  targetDate: string | null;
  strategy: GoalStrategy;
  shortfall: number;
  monthsRemaining: number;
  velocityA: number;          // monthly savings needed (Partner A)
  velocityB: number;
  paceStatus: PaceStatus;
  icon: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Loans / EMI tracker
// ---------------------------------------------------------------------------
export interface Loan {
  id: string;
  name: string;
  lender: string;
  principal: number;
  outstanding: number;
  emi: number;
  interestRate: number;
  startDate: string;
  tenureMonths: number;
  paymentDay: number;
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------
export interface NotificationSettings {
  enabled: boolean;
  newExpense: boolean;
  settlement: boolean;
  budgetAlert: boolean;
  budgetThreshold: number;   // 0–100, percentage
}

// ---------------------------------------------------------------------------
// App-wide settings (stored in household_settings.settings_data)
// ---------------------------------------------------------------------------
export interface Settings {
  householdMode: HouseholdMode;
  partnerAName: string;
  partnerBName: string;       // ignored / hidden in 'solo' mode
  expenseCategories: string[];
  incomeCategories: string[];
  budgets: Record<string, number | undefined>;
  notifications: NotificationSettings;
  currency: string;
  telegramUsername: string;
  whatsappNumber?: string;    // E.164 without +, e.g. "919876543210"
  setupComplete?: boolean;    // true once user has finished the setup wizard
  whatsappNumber?: string;    // E.164 without +, e.g. "919876543210"
}

// ---------------------------------------------------------------------------
// Full app data tree (what lives in React state)
// ---------------------------------------------------------------------------
export interface AppData {
  householdId: string;
  expenses: Expense[];
  contributions: Contribution[];
  goals: Goal[];
  loans: Loan[];
  settings: Settings;
  currentUserRole: string;    // display_name from profiles row
}

// ---------------------------------------------------------------------------
// Partner calculation results (derived, not stored)
// ---------------------------------------------------------------------------
export interface PendingPartnerItem extends Expense {
  debtorName: string;
  amountOwed: number;
  breakdownText: string;
}

export interface PartnerCalculations {
  p2pNetBalance: number;      // + means B owes A, - means A owes B
  pendingPartnerItems: PendingPartnerItem[];
}

// ---------------------------------------------------------------------------
// Import/export helpers
// ---------------------------------------------------------------------------
export interface ImportPayload {
  expenses: Partial<Expense>[];
  contributions: Partial<Contribution>[] | null;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
export type ViewId =
  | 'dashboard'
  | 'add'
  | 'income'
  | 'expenses'
  | 'settle'
  | 'contributions'
  | 'goals'
  | 'loans'
  | 'insights'
  | 'settings';

export interface NavItem {
  id: ViewId;
  label: string;
  icon: string;
  /** If set, this item is hidden in the specified household modes */
  hideIn?: HouseholdMode[];
}
