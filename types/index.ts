// ─── types/index.ts ───────────────────────────────────────────────────────────
// Central type definitions for ChillarFlow.
// All types are named exports — import them as:
//   import type { AppData, ViewId, HouseholdMode } from '@/types';

// ─── Navigation ───────────────────────────────────────────────────────────────

export type ViewId =
  | 'home'
  | 'dashboard'
  | 'add'
  | 'expenses'
  | 'income'
  | 'settle'
  | 'groups'
  | 'contributions'
  | 'goals'
  | 'loans'
  | 'insights'
  | 'settings';

// ─── Household ────────────────────────────────────────────────────────────────

export type HouseholdMode = 'joint' | 'solo' | 'split';

// ─── Expenses ─────────────────────────────────────────────────────────────────

export type SplitMode = 'equal' | 'fixed' | 'percentage' | 'ratio';
export type SettleTrack = 'partner' | 'group' | null;
export type RecurrenceInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Expense {
  id: string;
  date: string;
  type: 'expense' | 'income';
  category: string;
  amount: number | string;
  account: string;
  addedBy?: string;
  note?: string;
  toSettle?: boolean;
  settled?: boolean;
  settledFor?: string | null;
  settleTrack?: SettleTrack;
  partnerAShare?: number;
  partnerBShare?: number;
  splitMode?: SplitMode;
  isRecurring?: boolean;
  recurrenceInterval?: RecurrenceInterval;
  groupId?: string | null;
}

// ─── Contributions ────────────────────────────────────────────────────────────

export interface Contribution {
  id?: string;
  month: string;        // "YYYY-MM"
  partnerA: number;
  partnerB: number;
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  completed?: boolean;
  note?: string;
}

// ─── Loans ────────────────────────────────────────────────────────────────────

export interface Loan {
  id: string;
  name: string;
  amount: number;
  emi?: number;
  monthlyPayment?: number;
  interestRate?: number;
  startDate?: string;
  endDate?: string;
  lender?: string;
  note?: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface HouseholdSettings {
  householdMode: HouseholdMode | null;
  partnerAName: string;
  partnerBName: string;
  setupComplete: boolean;
  currency: string;
  telegramUsername?: string;
  [key: string]: any;   // allow extra fields from DB without breaking
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export interface GroupMember {
  id: string;
  name: string;
  email?: string;
}

export interface Group {
  id: string;
  name: string;
  members: GroupMember[];
  createdAt?: string;
  inviteCode?: string;
}

// ─── Root data shape ──────────────────────────────────────────────────────────

export interface AppData {
  householdId: string;
  settings: HouseholdSettings;
  expenses: Expense[];
  contributions: Contribution[];
  goals: Goal[];
  loans: Loan[];
  groups?: Group[];
}
