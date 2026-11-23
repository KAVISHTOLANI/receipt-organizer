import { describe, expect, it } from 'vitest';
import { advanceClaim, applyFilters, byCategory, byMonth, claimSummary, csvRows, duplicateGroups, duplicatesOf, parseTags, totals, validate, type Draft, type Receipt } from './receipts';

const today = '2026-11-23';
const r = (p: Partial<Receipt>): Receipt => ({ id: Math.random().toString(), merchant: 'Corner Shop', date: '2026-11-01', total: 10, tax: 1, category: 'Groceries', method: 'Card', tags: [], note: '', claim: 'none', ...p });

describe('input', () => {
  it('parses tags from commas or hashes, de-duplicated and slugged', () => {
    expect(parseTags('Work, #Client A, work,  ')).toEqual(['work', 'client-a']);
  });
  it('validates required fields, future dates and tax', () => {
    const d: Draft = { merchant: '', date: '2026-12-01', total: '0', tax: '', category: 'Other', method: 'Card', tags: '', note: '', claim: 'none' };
    expect(Object.keys(validate(d, today).errors).sort()).toEqual(['date', 'merchant', 'total']);
    expect(validate({ ...d, merchant: 'X', date: today, total: '10', tax: '12' }, today).errors.tax).toMatch(/more than the total/);
    expect(validate({ ...d, merchant: ' Café ', date: today, total: '4.555', tax: '', tags: 'coffee' }, today).value).toMatchObject({ merchant: 'Café', total: 4.56, tax: 0, tags: ['coffee'] });
  });
});

describe('duplicates', () => {
  const a = r({ id: 'a' }), b = r({ id: 'b', merchant: 'corner shop ' }), c = r({ id: 'c', total: 10.01 });
  it('matches merchant, date and total', () => {
    expect(duplicatesOf(a, [a, b, c]).map((x) => x.id)).toEqual(['b']);
    expect(duplicateGroups([a, b, c]).map((g) => g.map((x) => x.id))).toEqual([['a', 'b']]);
  });
});

describe('filters and totals', () => {
  const list = [
    r({ merchant: 'Bean There', category: 'Dining', total: 4.5, tax: 0.4, tags: ['coffee'], date: '2026-10-03' }),
    r({ merchant: 'Rail Co', category: 'Travel', total: 120, tax: 0, claim: 'to-claim', tags: ['work'], date: '2026-11-04' }),
    r({ merchant: 'Paper Place', category: 'Office', total: 35.25, tax: 5.88, claim: 'claimed', tags: ['work'], date: '2026-11-10' }),
    r({ merchant: 'Hotel Demo', category: 'Travel', total: 210, tax: 35, claim: 'reimbursed', date: '2026-09-20' }),
  ];
  it('filters by text, category, claim, tag and date range', () => {
    const base = { q: '', category: '', claim: '', from: '', to: '', tag: '' };
    expect(applyFilters(list, { ...base, q: 'coffee' })).toHaveLength(1);
    expect(applyFilters(list, { ...base, category: 'Travel' })).toHaveLength(2);
    expect(applyFilters(list, { ...base, tag: 'work', claim: 'claimed' })).toHaveLength(1);
    expect(applyFilters(list, { ...base, from: '2026-10-01', to: '2026-10-31' })).toHaveLength(1);
  });
  it('totals overall, by category and by month', () => {
    expect(totals(list)).toEqual({ count: 4, total: 369.75, tax: 41.28 });
    expect(byCategory(list).map((x) => [x.category, x.total])).toEqual([['Travel', 330], ['Office', 35.25], ['Dining', 4.5]]);
    expect(byMonth(list, '2026-08', '2026-11').map((x) => x.total)).toEqual([0, 210, 4.5, 155.25]);
  });
  it('summarises and advances claims', () => {
    expect(claimSummary(list)).toEqual({ toClaim: { count: 1, total: 120, tax: 0 }, claimed: { count: 1, total: 35.25, tax: 5.88 }, reimbursed: { count: 1, total: 210, tax: 35 } });
    expect(['none', 'to-claim', 'claimed', 'reimbursed'].map((c) => advanceClaim(c as never))).toEqual(['none', 'claimed', 'reimbursed', 'reimbursed']);
  });
  it('writes CSV rows', () => {
    expect(csvRows([list[1]])[0]).toEqual(['2026-11-04', 'Rail Co', 'Travel', 'Card', '120.00', '0.00', 'To claim', 'work', '']);
  });
});
