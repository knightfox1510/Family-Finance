// ─── lib/parseImport.ts ───────────────────────────────────────────────────────
// Reads an Excel/CSV file and returns a normalized { expenses, contributions }
// payload for importData() in useActions.ts.
// This is a direct extraction from the original monolith with no logic changes.

import * as XLSX from 'xlsx';

function today() { return new Date().toISOString().slice(0, 10); }

function normalizeDate(val: any): string {
  if (!val) return today();
  // Excel date serial (e.g. 45658)
  if (!isNaN(val) && Number(val) > 30000) {
    return new Date((Number(val) - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
    if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  }
  try { const d = new Date(str); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); } catch {}
  return str;
}

export function parseImport(file: File, callback: (result: any, err?: string) => void) {
  const reader = new FileReader();
  reader.onload = (e: any) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const getSheet = (name: string) => { const sh = wb.Sheets[name]; return sh ? XLSX.utils.sheet_to_json(sh) : []; };

      const expenses = getSheet('Expenses').map((r: any) => {
        const row: Record<string, any> = {};
        Object.keys(r).forEach((k) => { row[k.toLowerCase().replace(/\s+/g, '')] = r[k]; });
        const rawType = row.type ? String(row.type).toLowerCase().trim() : 'expense';
        const activeAccountVal = row.accountused || row.account || 'Joint';
        let formattedAccount = 'Joint';
        if (['partner a', 'partnera'].includes(activeAccountVal.toLowerCase())) formattedAccount = 'Partner A';
        if (['partner b', 'partnerb'].includes(activeAccountVal.toLowerCase())) formattedAccount = 'Partner B';
        return {
          id: row.id || null,
          date: normalizeDate(row.date),
          type: rawType === 'income' ? 'income' : 'expense',
          category: row.category || 'Other',
          amount: Number(row.amount) || 0,
          account: formattedAccount,
          addedBy: row.addedby || 'Partner A',
          note: row.note || '',
          toSettle: row.tosettle === 'Yes' || row.tosettle === 'true' || row.tosettle === true,
          settled: row.settled === 'Yes' || row.settled === 'true' || row.settled === true,
          settledFor: row.settledfor || null,
        };
      });

      const contributions = getSheet('Contributions').map((r: any) => {
        const row: Record<string, any> = {};
        Object.keys(r).forEach((k) => { row[k.toLowerCase().replace(/\s+/g, '')] = r[k]; });
        return { id: row.month || null, month: row.month ? String(row.month).trim() : null, partnerA: Number(row.partnera) || 0, partnerB: Number(row.partnerb) || 0 };
      });

      callback({ expenses, contributions: contributions.length ? contributions : null });
    } catch (err: any) {
      callback(null, 'Failed to parse file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}