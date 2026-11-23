import { isValidISODate } from '../shared/dates';

export const CATEGORIES = ['Groceries', 'Dining', 'Travel', 'Office', 'Electronics', 'Home', 'Health', 'Clothing', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const METHODS = ['Card', 'Cash', 'Bank transfer', 'Mobile wallet'] as const;
export type Method = (typeof METHODS)[number];
export type Claim = 'none' | 'to-claim' | 'claimed' | 'reimbursed';
export const CLAIM_LABEL: Record<Claim, string> = { none: 'Personal', 'to-claim': 'To claim', claimed: 'Claimed', reimbursed: 'Reimbursed' };

export interface Receipt {
  id: string;
  merchant: string;
  date: string;
  total: number;
  tax: number;
  category: Category;
  method: Method;
  tags: string[];
  note: string;
  claim: Claim;
  /** Downscaled JPEG data URL, if a photo was attached. */
  image?: string;
  demo?: boolean;
}

export const round = (n: number) => Math.round(n * 100) / 100;

export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[,#]/)) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (t) seen.add(t);
  }
  return [...seen].slice(0, 8);
}

export interface Draft {
  merchant: string;
  date: string;
  total: string;
  tax: string;
  category: Category;
  method: Method;
  tags: string;
  note: string;
  claim: Claim;
}

export function validate(d: Draft, today: string): { errors: Partial<Record<keyof Draft, string>>; value?: Omit<Receipt, 'id' | 'image'> } {
  const e: Partial<Record<keyof Draft, string>> = {};
  if (!d.merchant.trim()) e.merchant = 'Enter the shop or company.';
  if (!isValidISODate(d.date)) e.date = 'Enter the receipt date.';
  else if (d.date > today) e.date = 'A receipt can’t be dated in the future.';
  const total = Number(d.total);
  if (!d.total.trim() || !Number.isFinite(total) || total <= 0) e.total = 'Enter the total paid.';
  const tax = d.tax.trim() ? Number(d.tax) : 0;
  if (!Number.isFinite(tax) || tax < 0) e.tax = 'Tax must be 0 or more.';
  else if (!e.total && tax > total) e.tax = 'Tax can’t be more than the total.';
  if (Object.keys(e).length) return { errors: e };
  return { errors: e, value: { merchant: d.merchant.trim(), date: d.date, total: round(total), tax: round(tax), category: d.category, method: d.method, tags: parseTags(d.tags), note: d.note.trim(), claim: d.claim } };
}

/** Same merchant (case-insensitive), same date and same total — very likely the same receipt entered twice. */
export function duplicatesOf(r: Pick<Receipt, 'id' | 'merchant' | 'date' | 'total'>, all: Receipt[]): Receipt[] {
  const m = r.merchant.trim().toLowerCase();
  return all.filter((x) => x.id !== r.id && x.date === r.date && Math.abs(x.total - r.total) < 0.005 && x.merchant.trim().toLowerCase() === m);
}

export function duplicateGroups(all: Receipt[]): Receipt[][] {
  const groups = new Map<string, Receipt[]>();
  for (const r of all) {
    const k = `${r.merchant.trim().toLowerCase()}|${r.date}|${r.total.toFixed(2)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

export interface Filters {
  q: string;
  category: string;
  claim: string;
  from: string;
  to: string;
  tag: string;
}

export function applyFilters(all: Receipt[], f: Filters): Receipt[] {
  const q = f.q.trim().toLowerCase();
  return all.filter(
    (r) =>
      (!f.category || r.category === f.category) &&
      (!f.claim || r.claim === f.claim) &&
      (!f.from || r.date >= f.from) &&
      (!f.to || r.date <= f.to) &&
      (!f.tag || r.tags.includes(f.tag)) &&
      (!q || `${r.merchant} ${r.note} ${r.tags.join(' ')}`.toLowerCase().includes(q)),
  );
}

export function totals(list: Receipt[]) {
  return { count: list.length, total: round(list.reduce((s, r) => s + r.total, 0)), tax: round(list.reduce((s, r) => s + r.tax, 0)) };
}

export function byCategory(list: Receipt[]) {
  return CATEGORIES.map((c) => ({ category: c, ...totals(list.filter((r) => r.category === c)) })).filter((x) => x.count > 0).sort((a, b) => b.total - a.total);
}

/** Totals for each YYYY-MM from `fromMonth` to `toMonth` inclusive (empty months included). */
export function byMonth(list: Receipt[], fromMonth: string, toMonth: string) {
  const out: { month: string; total: number; count: number }[] = [];
  let [y, m] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const inMonth = list.filter((r) => r.date.startsWith(key));
    out.push({ month: key, total: round(inMonth.reduce((s, r) => s + r.total, 0)), count: inMonth.length });
    m === 12 ? ((y += 1), (m = 1)) : (m += 1);
  }
  return out;
}

export function claimSummary(list: Receipt[]) {
  const pick = (c: Claim) => totals(list.filter((r) => r.claim === c));
  return { toClaim: pick('to-claim'), claimed: pick('claimed'), reimbursed: pick('reimbursed') };
}

/** Moves claims forward one step: to-claim → claimed → reimbursed. */
export function advanceClaim(c: Claim): Claim {
  return c === 'to-claim' ? 'claimed' : c === 'claimed' ? 'reimbursed' : c;
}

export const CSV_HEADERS = ['Date', 'Merchant', 'Category', 'Payment method', 'Total', 'Tax', 'Claim status', 'Tags', 'Note'];
export const csvRows = (list: Receipt[]) => list.map((r) => [r.date, r.merchant, r.category, r.method, r.total.toFixed(2), r.tax.toFixed(2), CLAIM_LABEL[r.claim], r.tags.join(' '), r.note]);
