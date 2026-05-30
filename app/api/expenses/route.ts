// app/api/expenses/route.ts
// Server-side paginated expense endpoint.
// Replaces the client-side filter-over-thousands pattern in ExpenseList.tsx.
//
// GET /api/expenses
//   ?householdId  — required
//   &page         — 0-indexed page number (default: 0)
//   &limit        — rows per page (default: 50, max: 100)
//   &month        — YYYY-MM filter (default: all)
//   &account      — 'All' | 'Joint' | 'PersonalOnly' | specific account string
//   &category     — 'All' | specific category name
//   &type         — 'All' | 'expense' | 'income'
//   &settled      — 'All' | 'pendingJoint' | 'pendingPartner' | 'personal' | 'settled' | 'settledA' | 'settledB'
//   &search       — free-text search against note + category (ILIKE)
//   &year         — 'current' as an alternative to month (searches current year)
//   &sortDir      — 'desc' (default) | 'asc'
//
// Response:
//   { expenses: Expense[], total: number, page: number, hasMore: boolean, nextCursor: string | null }

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Resolve the calling user from Bearer token
async function resolveUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(auth.slice(7));
    return user?.id ?? null;
  }
  return null;
}

export async function GET(req: Request) {
  const url  = new URL(req.url);
  const sp   = url.searchParams;

  const householdId = sp.get('householdId');
  if (!householdId) {
    return NextResponse.json({ error: 'householdId is required' }, { status: 400 });
  }

  // Verify caller belongs to this household (security check)
  const userId = await resolveUserId(req);
  if (userId) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('household_id')
      .eq('id', userId)
      .single();

    if (profile?.household_id && profile.household_id !== householdId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
  }

  // Pagination params
  const page    = Math.max(0, parseInt(sp.get('page')  ?? '0',  10));
  const limit   = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
  const sortDir = sp.get('sortDir') === 'asc' ? true : false;

  // Filter params
  const month    = sp.get('month')    ?? '';
  const year     = sp.get('year')     ?? '';
  const account  = sp.get('account')  ?? 'All';
  const category = sp.get('category') ?? 'All';
  const type     = sp.get('type')     ?? 'All';
  const settled  = sp.get('settled')  ?? 'All';
  const search   = sp.get('search')   ?? '';

  // Partner names for account mapping (needed for settledA/settledB filters)
  const partnerAName = sp.get('partnerAName') ?? 'Partner A';
  const partnerBName = sp.get('partnerBName') ?? 'Partner B';

  try {
    let query = supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('household_id', householdId);

    // ── Date filters ─────────────────────────────────────────────────────────
    if (month && month !== 'All' && month !== 'year') {
      // Exact month match e.g. "2025-03"
      query = query.like('date', `${month}%`);
    } else if (year === 'current') {
      query = query.like('date', `${new Date().getFullYear()}%`);
    }
    // else: 'All' → no date filter

    // ── Account filter ───────────────────────────────────────────────────────
    if (account !== 'All') {
      if (account === 'Joint') {
        query = query.eq('account_used', 'Joint');
      } else if (account === 'PersonalOnly') {
        query = query.neq('account_used', 'Joint');
      } else {
        // Specific partner name — match display name OR system key
        const isA = account === partnerAName || account === 'Partner A';
        const isB = account === partnerBName || account === 'Partner B';
        if (isA) {
          query = query.in('account_used', ['Partner A', partnerAName]);
        } else if (isB) {
          query = query.in('account_used', ['Partner B', partnerBName]);
        } else {
          query = query.eq('account_used', account);
        }
      }
    }

    // ── Category filter ──────────────────────────────────────────────────────
    if (category && category !== 'All') {
      query = query.eq('category', category);
    }

    // ── Type filter ──────────────────────────────────────────────────────────
    if (type && type !== 'All') {
      query = query.eq('type', type);
    }

    // ── Settlement status filter ─────────────────────────────────────────────
    switch (settled) {
      case 'pendingJoint':
        query = query
          .eq('to_settle', true)
          .eq('settled', false)
          .neq('settle_track', 'partner');
        break;
      case 'pendingPartner':
        query = query
          .eq('settle_track', 'partner')
          .eq('settled', false);
        break;
      case 'personal':
        query = query
          .eq('to_settle', false)
          .neq('settle_track', 'partner')
          .eq('settled', false);
        break;
      case 'settled':
        query = query.eq('settled', true);
        break;
      case 'settledA':
        query = query
          .eq('settled', true)
          .in('settled_with', ['Partner A', partnerAName]);
        break;
      case 'settledB':
        query = query
          .eq('settled', true)
          .in('settled_with', ['Partner B', partnerBName]);
        break;
    }

    // ── Free-text search ─────────────────────────────────────────────────────
    if (search.trim()) {
      // Supabase OR filter: match note OR category (case-insensitive)
      query = query.or(
        `note.ilike.%${search.trim()}%,category.ilike.%${search.trim()}%`
      );
    }

    // ── Ordering and pagination ───────────────────────────────────────────────
    query = query
      .order('date', { ascending: sortDir })
      .order('id',   { ascending: sortDir })
      .range(page * limit, (page + 1) * limit - 1);

    const { data: rows, error, count } = await query;

    if (error) {
      console.error('[GET /api/expenses] DB error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map DB row → Expense shape expected by the client
    // (mirrors what loadData does in supabaseHelpers.ts)
    const expenses = (rows ?? []).map((r: any) => {
      const rawSettleTrack = r.settle_track;
      const settleTrack =
        rawSettleTrack === 'joint'   ? 'joint'   :
        rawSettleTrack === 'partner' ? 'partner' :
        rawSettleTrack === 'none'    ? 'none'    :
        r.to_settle === true         ? 'joint'   : 'none';

      const isSettled = r.settled === true || r.settled === 'true';

      const toSettle =
        !isSettled &&
        settleTrack !== 'partner' &&
        (settleTrack === 'joint' || r.to_settle === true);

      // Resolve account display name
      const resolveDisplay = (val: string) => {
        if (val === 'Partner A') return partnerAName;
        if (val === 'Partner B') return partnerBName;
        return val;
      };

      return {
        id:                 r.id,
        date:               r.date,
        amount:             r.amount,
        category:           r.category,
        type:               r.type,
        account:            resolveDisplay(r.account_used),
        addedBy:            resolveDisplay(r.added_by),
        note:               r.note ?? '',
        settled:            isSettled,
        settledFor:         r.settled_with ? resolveDisplay(r.settled_with) : null,
        isRecurring:        r.is_recurring ?? false,
        recurrenceInterval: r.recurrence_interval ?? 'monthly',
        settleTrack,
        splitMode:          r.split_mode ?? 'equal',
        partnerAShare:      Number(r.partner_a_share ?? 0.5),
        partnerBShare:      Number(r.partner_b_share ?? 0.5),
        toSettle,
      };
    });

    const total   = count ?? 0;
    const hasMore = total > (page + 1) * limit;

    return NextResponse.json({
      expenses,
      total,
      page,
      hasMore,
      nextCursor: hasMore ? String(page + 1) : null,
    });
  } catch (err: any) {
    console.error('[GET /api/expenses] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
