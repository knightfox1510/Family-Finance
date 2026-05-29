// ─── types/index.ts ───────────────────────────────────────────────────────────
// Single source of truth for all ChillarFlow types.
// Every named export here is used by at least one component.

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


export interface NavItem {
  id: ViewId;
  label: string;
  icon: string;
  hideIn?: HouseholdMode[];
}

// ─── Household ────────────────────────────────────────────────────────────────
// 'separate' = two partners, no joint pool
// 'joint'    = two partners + shared joint account
// 'solo'     = single user
// 'split'    = legacy alias used in some components
export type HouseholdMode = 'joint' | 'separate' | 'solo' | 'split';

// ─── Expenses ─────────────────────────────────────────────────────────────────

// 'none'  = personal, no settlement
// 'joint' = reimburse from joint pool
// 'partner' = direct split with partner
// 'group'   = group expense
export type SettleTrack = 'none' | 'joint' | 'partner' | 'group' | null;
export type SplitMode = 'equal' | 'fixed' | 'percentage' | 'ratio';
export type RecurrenceInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Expense {
  id: string;
  date: string;
  type: 'expense' | 'income';
  category: string;
  amount: number;              // always numeric once persisted
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
  [key: string]: any;          // allow extra DB fields without breaking
}

// ─── Contributions ────────────────────────────────────────────────────────────

export interface Contribution {
  id?: string;
  month: string;               // "YYYY-MM"
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
  icon?: string;
  color?: string;
  strategy?: string;
  targetDate?: string;
  partnerATarget?: number;
  partnerBTarget?: number;
  partnerACurrent?: number;
  partnerBCurrent?: number;
  paceStatus?: string;
  monthsRemaining?: number;
  shortfall?: number;
  velocityA?: number;
  velocityB?: number;
  [key: string]: any;
}

// ─── Loans ────────────────────────────────────────────────────────────────────

export interface Loan {
  id: string;
  name: string;
  lender: string;
  principal: number;
  outstanding: number;
  emi: number;
  interestRate: number;
  startDate?: string;
  tenureMonths?: number;
  paymentDay?: number;
  icon?: string;
  note?: string;
  [key: string]: any;
}

// ─── Notification settings ────────────────────────────────────────────────────

export interface NotificationSettings {
  enabled: boolean;
  budgetAlert: boolean;
  settlement: boolean;
  newExpense: boolean;
  budgetThreshold: number;
}

// ─── Settings (household configuration) ──────────────────────────────────────
// Exported as both `Settings` (used in Settings.tsx) and `HouseholdSettings`
// (used elsewhere) — they are the same shape.

export interface Settings {
  householdMode: HouseholdMode | null;
  partnerAName: string;
  partnerBName: string;
  setupComplete: boolean;
  currency: string;
  telegramUsername?: string;
  whatsappNumber?: string;
  expenseCategories: string[];
  incomeCategories: string[];
  budgets: Record<string, number | undefined>;
  notifications: NotificationSettings;
  [key: string]: any;          // allow extra fields from DB
}

// Alias — some components import as HouseholdSettings, others as Settings
export type HouseholdSettings = Settings;

// ─── Groups ───────────────────────────────────────────────────────────────────

export interface GroupMember {
  id: string;
  display_name?: string | null;
  ghost_name?: string | null;
  is_ghost?: boolean;
  name?: string;
  email?: string;
}

export interface Group {
  id: string;
  name: string;
  members: GroupMember[];
  description?: string | null;
  currency?: string;
  created_by?: string;
  created_at?: string;
  last_activity?: string;
  member_count?: number;
  net_balance?: number;
  is_archived?: boolean;
  inviteCode?: string;
}

// ─── Partner calculations (used by SettleDashboard) ──────────────────────────

export interface PartnerCalculations {
  p2pNetBalance: number;
  pendingPartnerItems: any[];
}

// ─── Root data shape ──────────────────────────────────────────────────────────

export interface AppData {
  householdId: string;
  settings: Settings;
  expenses: Expense[];
  contributions: Contribution[];
  goals: Goal[];
  loans: Loan[];
  groups?: Group[];
  currentUserRole?: 'Partner A' | 'Partner B';
}
