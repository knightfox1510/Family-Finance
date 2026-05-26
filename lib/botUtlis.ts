// ─── lib/botUtils.ts ──────────────────────────────────────────────────────────
// Shared logic used by both Telegram and WhatsApp webhook routes.
// Import from here — never duplicate between route files.

import { createClient } from '@supabase/supabase-js';

export const supabaseBot = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ─── Category descriptions ────────────────────────────────────────────────────
export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'Alcohol':                 'Wine shops, Living Liquidz, pub/bar drinks, beer, whiskey, gin, vodka',
  'Dining Out':              'Restaurants, cafes, dine-in, fine dining, coffee shops, physically eating out',
  'Education':               'Course fees, certifications, books, training programs, upskilling materials',
  'Entertainment':           'Movie tickets, BookMyShow, gaming arcades, concerts, events, fun outings',
  'Groceries':               'Offline kirana stores, Metro, fruits, physical vegetable/fruit markets',
  'Healthcare':              'Pharmacies, Apollo, doctor visits, checkups, lab tests, dental, medicines',
  'Gifting':                 'Gifts for friends/family; shagun/cash envelopes for weddings or birthdays',
  'Housing':                 'Monthly house rent, society maintenance bills, home loan EMI',
  'Insurance':               'Health, car/bike, term life insurance premiums',
  'Investments':             'Mutual fund SIPs, Smallcase, Zerodha, Gold, US stocks, PPF, Index funds',
  'Miscellaneous':           'Unclassifiable payments, ATM cash withdrawals, random one-off items',
  'Offline Shopping':        'Physical retail, apparel or footwear bought at a mall or store',
  'Online Shopping':         'Amazon, Flipkart, Myntra, Ajio, Tata CLiQ, retail websites',
  'Personal Care':           'Salon, haircut, beauty parlour, grooming, spa, cosmetics, skincare',
  'Personal Transportation': 'Petrol, bike EMI, car/motorcycle service, toll, fastag, parking',
  'Savings':                 'Manual transfers to emergency savings, sinking fund, long-term reserves',
  'Subscriptions':           'Netflix, Prime, Spotify, iCloud, YouTube Premium, gym memberships',
  'Health & Fitness':        'Protein, gym supplements, Yoga classes, workout gear, organic health food',
  'Taxes':                   'Income tax, property tax, government filings',
  'Technology':              'Software, digital tools, cloud hosting, gadgets, accessories',
  'Travel':                  'Flights, hotels, Airbnb, IRCTC, vacation bookings, luggage',
  'Utilities':               'Mobile recharges, broadband, electricity, piped gas, maid/cook salary',
  'Online Food Orders':      'Zomato, Swiggy, Dominos, pizza/burger delivery, cloud kitchen orders',
  'Household Items':         'Cleaning liquids, detergents, mop, house decor, bedsheets',
  'Cab Services':            'Uber, Ola, Rapido, InDrive, auto, rickshaw rides',
  'Hosting Day':             'Bulk food/alcohol/snacks when friends or family visit at home',
  'Online Groceries':        'Zepto, Blinkit, Swiggy Instamart, BigBasket, daily produce apps',
  'Interest Earned':         'Bank savings account interest payouts, FD interest pay-ins',
  'Spouse Gifting':          'Anniversary, birthday surprises or gifts bought for your partner',
  'Family payments':         'Money sent to parents/siblings -- mom, dad, Kari mom, Kari dad, sohan',
};

export const DEFAULT_CAT_DESC = 'Expenses in this category';

// ─── Build the category list string for the AI prompt ────────────────────────
export const buildCategoryPrompt = (cats: string[]): string =>
  cats.map((c) => `  - "${c}" (${CATEGORY_DESCRIPTIONS[c] || DEFAULT_CAT_DESC})`).join('\n');

// ─── Settle track label ───────────────────────────────────────────────────────
export const settleTrackLabel = (track: string, toSettle: boolean): string => {
  if (track === 'partner') return 'Partner Split';
  if (track === 'joint' || toSettle) return 'Joint Reimbursement';
  return 'Personal (No Settlement)';
};

// ─── Load household settings ──────────────────────────────────────────────────
export const loadHouseholdSettings = async (householdId: string) => {
  const STANDARD_QUICK = [
    'Dining Out', 'Online Food Orders', 'Online Groceries', 'Groceries',
    'Cab Services', 'Personal Transportation', 'Online Shopping', 'Miscellaneous',
  ];

  let nameA = 'Partner A';
  let nameB = 'Partner B';
  let householdMode = 'joint';
  let expenseCats: string[] = Object.keys(CATEGORY_DESCRIPTIONS);
  let quickCats: string[] = STANDARD_QUICK;

  if (!householdId) return { nameA, nameB, householdMode, expenseCats, quickCats };

  const { data: st } = await supabaseBot
    .from('household_settings')
    .select('settings_data')
    .eq('household_id', householdId)
    .single();

  if (st?.settings_data) {
    const s = typeof st.settings_data === 'string'
      ? JSON.parse(st.settings_data)
      : st.settings_data;

    nameA         = s.partnerAName  || nameA;
    nameB         = s.partnerBName  || nameB;
    householdMode = s.householdMode || householdMode;

    if (Array.isArray(s.expenseCategories) && s.expenseCategories.length > 0) {
      expenseCats = s.expenseCategories;
      if (!expenseCats.includes('Miscellaneous')) expenseCats = [...expenseCats, 'Miscellaneous'];
      const theirQuick = STANDARD_QUICK.filter((c) => expenseCats.includes(c));
      const extras     = expenseCats.filter((c) => !STANDARD_QUICK.includes(c));
      quickCats        = [...theirQuick, ...extras].slice(0, 8);
    }
  }

  return { nameA, nameB, householdMode, expenseCats, quickCats };
};

// ─── Validate user by channel ─────────────────────────────────────────────────
export const validateByTelegram = async (tgUser: string) => {
  const handle = tgUser.replace(/@/g, '').trim().toLowerCase();
  if (!handle) return null;
  const { data } = await supabaseBot
    .from('profiles')
    .select('household_id, display_name, telegram_username');
  if (!data) return null;
  const match = data.find(
    (p) => (p.telegram_username || '').replace(/@/g, '').trim().toLowerCase() === handle
  );
  if (!match) return null;
  return {
    householdId:    match.household_id,
    senderIdentity: match.display_name === 'Partner B' ? 'Partner B' : 'Partner A',
  };
};

export const validateByWhatsApp = async (phone: string) => {
  // phone comes in as E.164 format from Meta: "919876543210" (no +)
  const cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return null;
  const { data } = await supabaseBot
    .from('profiles')
    .select('household_id, display_name, whatsapp_number');
  if (!data) return null;
  const match = data.find(
    (p) => (p.whatsapp_number || '').replace(/\D/g, '') === cleaned
  );
  if (!match) return null;
  return {
    householdId:    match.household_id,
    senderIdentity: match.display_name === 'Partner B' ? 'Partner B' : 'Partner A',
  };
};

// ─── Gemini AI parsing ────────────────────────────────────────────────────────
export interface ParsedTransaction {
  amount:       number;
  category:     string;
  note:         string;
  type:         string;
  account:      string;
  settle_track: string;
}

export const parseWithGemini = async (
  rawText: string,
  senderIdentity: string,
  nameA: string,
  nameB: string,
  householdMode: string,
  expenseCats: string[]
): Promise<ParsedTransaction[]> => {
  const isJoint    = householdMode === 'joint';
  const isSolo     = householdMode === 'solo';
  const hasPartner = !isSolo;

  const categoryBlock = buildCategoryPrompt(expenseCats);

  const systemPrompt =
    'You are a personal finance clerk extracting transactions from a message.\n' +
    'Extract EVERY transaction and return a JSON array.\n\n' +
    'SETTLEMENT RULES:\n' +
    'RULE 1 - DEFAULT: settle_track = "none", account = whoever mentioned or "' + senderIdentity + '"\n' +
    (isJoint
      ? 'RULE 2 - "to settle" in message: settle_track = "joint", account = "' + senderIdentity + '"\n'
      : 'RULE 2 - DISABLED (no joint pool)\n') +
    (hasPartner
      ? 'RULE 3 - "settle with ' + nameA + '" or "settle with ' + nameB + '": settle_track = "partner"\n'
      : 'RULE 3 - DISABLED (solo)\n') +
    'ACCOUNTS: ' +
    (isSolo
      ? '"' + senderIdentity + '" only'
      : '"Partner A" = ' + nameA + ', "Partner B" = ' + nameB +
        (isJoint ? ', "Joint" = joint account' : '') +
        '. Default: "' + senderIdentity + '"') + '\n' +
    'added_by is always "' + senderIdentity + '".\n' +
    'TYPE: "income" for salary/bonus/refund/interest, else "expense".\n' +
    'NOTE: merchant or item only. Strip names, settlement phrases, amounts.\n\n' +
    'CATEGORIES (use ONLY these):\n' + categoryBlock + '\n\nIf no match, use "Miscellaneous".';

  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        amount:       { type: 'NUMBER', description: 'Transaction amount' },
        category:     { type: 'STRING', description: 'One of the household categories' },
        note:         { type: 'STRING', description: 'Merchant or item name only' },
        type:         { type: 'STRING', description: '"expense" or "income"' },
        account:      { type: 'STRING', description: '"Partner A", "Partner B", or "Joint"' },
        settle_track: { type: 'STRING', description: '"none", "joint", or "partner"' },
      },
      required: ['amount', 'category', 'note', 'type', 'account', 'settle_track'],
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\nUser Input: "' + rawText + '"' }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      }),
    }
  );

  const data = await res.json();
  let rawJson = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
    .replace(/```json/gi, '').replace(/```/g, '').trim();

  if (!rawJson) return [];

  const parsed = JSON.parse(rawJson);
  return Array.isArray(parsed) ? parsed : [];
};

// ─── Save a parsed transaction to Supabase ────────────────────────────────────
export const saveTransaction = async (
  tx: ParsedTransaction,
  householdId: string,
  senderIdentity: string,
  validCatSet: Set<string>
) => {
  const track    = ['none','joint','partner'].includes(tx.settle_track) ? tx.settle_track : 'none';
  const category = validCatSet.has(tx.category) ? tx.category : 'Miscellaneous';

  const row = {
    id:            crypto.randomUUID(),
    household_id:  householdId,
    date:          new Date().toISOString().slice(0, 10),
    amount:        Number(tx.amount),
    category,
    type:          tx.type || 'expense',
    account_used:  tx.account || senderIdentity,
    added_by:      senderIdentity,
    note:          tx.note || 'AI log',
    settle_track:  track,
    to_settle:     track === 'joint',
    split_mode:    'equal',
    partner_a_share: 0.5,
    partner_b_share: 0.5,
    settled:       false,
    settled_with:  null,
  };

  const { data } = await supabaseBot.from('transactions').insert([row]).select();
  return data?.[0] || row;
};

// ─── Format a saved transaction as a summary string ───────────────────────────
export const formatTxSummary = (
  tx: any,
  nameA: string,
  nameB: string
): string => {
  const acct =
    tx.account_used === 'Partner A' ? nameA :
    tx.account_used === 'Partner B' ? nameB : 'Joint';
  return (
    'Transaction logged!\n\n' +
    'Amount: Rs.' + tx.amount + '\n' +
    'Category: ' + tx.category + '\n' +
    'Account: ' + acct + '\n' +
    'Settlement: ' + settleTrackLabel(tx.settle_track, tx.to_settle) + '\n' +
    'Type: ' + (tx.type === 'expense' ? 'Expense' : 'Income') + '\n' +
    'Note: ' + (tx.note || '--')
  );
};
