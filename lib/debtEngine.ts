// lib/debtEngine.ts
// Debt simplification engine for group expense settlement.
//
// Two modes:
//   simplify = false → bilateral netting only (A owes B, B owes A → net one direction)
//   simplify = true  → greedy multilateral simplification (minimises total transactions)
//
// Example with 3 people:
//   Raw:      Gaurav→You ₹500, You→ABC ₹300, Gaurav→ABC ₹200
//   Bilateral: same (no bilateral pairs to cancel)
//   Simplified: Gaurav→You ₹300, Gaurav→ABC ₹400 (2 txns instead of 3)

export interface NetPair {
  creditor: string;
  debtor:   string;
  amount:   number;
}

/**
 * Compute net debt pairs from raw balance rows.
 *
 * @param balances  Rows from group_net_balances view:
 *                  { creditor_id, debtor_id, total_owed }
 * @param simplify  Whether to run multilateral simplification.
 */
export function computeNetDebts(balances: any[], simplify: boolean): NetPair[] {
  if (!balances || balances.length === 0) return [];

  if (!simplify) {
    // ── Bilateral netting ──────────────────────────────────────────────────
    // For each (A,B) pair, cancel A→B against B→A and keep the net direction.
    const pairMap: Record<string, Record<string, number>> = {};

    for (const b of balances) {
      const amt = Number(b.total_owed);
      if (amt <= 0) continue;
      if (!pairMap[b.creditor_id]) pairMap[b.creditor_id] = {};
      pairMap[b.creditor_id][b.debtor_id] =
        (pairMap[b.creditor_id][b.debtor_id] ?? 0) + amt;
    }

    const netPairs: NetPair[] = [];
    const processed           = new Set<string>();

    for (const [creditorId, debtors] of Object.entries(pairMap)) {
      for (const [debtorId, amount] of Object.entries(debtors)) {
        const pairKey = [creditorId, debtorId].sort().join('|');
        if (processed.has(pairKey)) continue;
        processed.add(pairKey);

        const reverse = pairMap[debtorId]?.[creditorId] ?? 0;
        const net     = amount - reverse;

        if (net > 0.005) {
          netPairs.push({
            creditor: creditorId,
            debtor:   debtorId,
            amount:   Math.round(net * 100) / 100,
          });
        } else if (net < -0.005) {
          netPairs.push({
            creditor: debtorId,
            debtor:   creditorId,
            amount:   Math.round(-net * 100) / 100,
          });
        }
      }
    }

    return netPairs;
  }

  // ── Greedy multilateral simplification ─────────────────────────────────────
  // Step 1: Compute each person's absolute net position across ALL transactions.
  //         Positive = net creditor (others owe them money)
  //         Negative = net debtor   (they owe money)
  const netPositions: Record<string, number> = {};

  for (const b of balances) {
    const amt = Number(b.total_owed);
    netPositions[b.creditor_id] = (netPositions[b.creditor_id] ?? 0) + amt;
    netPositions[b.debtor_id]   = (netPositions[b.debtor_id]   ?? 0) - amt;
  }

  // Step 2: Separate into creditors (net > 0) and debtors (net < 0).
  //         Sort largest first so we settle big debts in fewer transactions.
  const creditors = Object.entries(netPositions)
    .filter(([, v]) => v > 0.005)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);

  const debtors = Object.entries(netPositions)
    .filter(([, v]) => v < -0.005)
    .sort(([, a], [, b]) => a - b)   // most negative first
    .map(([id]) => id);

  // Step 3: Greedy matching — pair largest creditor with largest debtor,
  //         settle as much as possible, advance the exhausted pointer.
  const optimized: NetPair[] = [];
  let cIdx = 0;
  let dIdx = 0;

  // Work on a mutable copy
  const pos = { ...netPositions };

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor   = debtors[dIdx];

    const available = pos[creditor];
    const owed      = Math.abs(pos[debtor]);
    const settle    = Math.min(available, owed);

    if (settle > 0.005) {
      optimized.push({
        creditor,
        debtor,
        amount: Math.round(settle * 100) / 100,
      });
    }

    pos[creditor] -= settle;
    pos[debtor]   += settle;

    // Advance whichever side is now exhausted (≤ 0.5 paisa tolerance)
    if (pos[creditor] <= 0.005) cIdx++;
    if (Math.abs(pos[debtor]) <= 0.005) dIdx++;
  }

  return optimized;
}
