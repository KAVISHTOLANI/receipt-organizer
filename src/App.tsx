import { useMemo, useState, type ReactNode } from 'react';
import { DemoTag, EmptyState, Field, Landing, NotFound, Notice, PageHead, Shell, downloadText, uid, useFlash, usePersistentState, useRoute } from './shared/ui';
import { DataTable, useTable, type Column } from './shared/table';
import { toCSV } from './shared/csv';
import { addDays, addMonths, formatDay, fromISO, todayISO } from './shared/dates';
import {
  CATEGORIES,
  CLAIM_LABEL,
  CSV_HEADERS,
  METHODS,
  advanceClaim,
  applyFilters,
  byCategory,
  byMonth,
  claimSummary,
  csvRows,
  duplicateGroups,
  duplicatesOf,
  totals,
  validate,
  type Category,
  type Claim,
  type Draft,
  type Filters,
  type Method,
  type Receipt,
} from './lib/receipts';

const KEY = 'receipt-shelf:store';
const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/receipts', label: 'Receipts' },
  { to: '/claims', label: 'Expense claims' },
  { to: '/reports', label: 'Reports' },
];
const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STORAGE_SOFT_LIMIT = 4_000_000; // characters; browsers typically allow ~5 MB per site
const CLAIM_BADGE: Record<Claim, string> = { none: '', 'to-claim': 'badge-warn', claimed: 'badge-accent', reimbursed: 'badge-ok' };

interface Store {
  receipts: Receipt[];
}

export function demoReceipts(today: string): Receipt[] {
  const d = (n: number) => addDays(today, -n);
  const x = (id: string, merchant: string, days: number, total: number, tax: number, category: Category, method: Method, tags: string[] = [], claim: Claim = 'none', note = ''): Receipt => ({ id: `demo-${id}`, merchant, date: d(days), total, tax, category, method, tags, note, claim, demo: true });
  return [
    x('1', 'Demo Supermarket', 2, 64.18, 3.12, 'Groceries', 'Card'),
    x('2', 'Bean There Café', 3, 4.6, 0.38, 'Dining', 'Mobile wallet', ['coffee']),
    x('3', 'Rail Co (demo)', 6, 86.5, 0, 'Travel', 'Card', ['work', 'client-visit'], 'to-claim', 'Return ticket for the client workshop'),
    x('4', 'Hotel Demo Central', 7, 189, 18.9, 'Travel', 'Card', ['work', 'client-visit'], 'to-claim', 'One night, breakfast included'),
    x('5', 'Paper Place', 12, 35.25, 5.88, 'Office', 'Card', ['work'], 'claimed'),
    x('6', 'Demo Electronics', 20, 129.99, 21.67, 'Electronics', 'Card', ['warranty'], 'none', 'Wireless keyboard — keep for the 2-year warranty'),
    x('7', 'Demo Pharmacy', 25, 18.4, 0, 'Health', 'Cash'),
    x('8', 'Noodle Bar', 27, 31.2, 2.6, 'Dining', 'Card', ['work'], 'reimbursed', 'Team lunch'),
    x('9', 'Demo Hardware', 33, 47.85, 7.98, 'Home', 'Card', ['diy']),
    x('10', 'Demo Supermarket', 36, 71.03, 3.4, 'Groceries', 'Card'),
    x('11', 'Bean There Café', 40, 9.2, 0.77, 'Dining', 'Mobile wallet', ['coffee']),
    x('12', 'Taxi Demo', 41, 23.5, 0, 'Travel', 'Card', ['work'], 'reimbursed'),
    x('13', 'Clothing Co. (demo) — seasonal sale, two jumpers and a waterproof jacket', 55, 148, 24.67, 'Clothing', 'Card', [], 'none', 'Long merchant name on purpose'),
    x('14', 'Demo Supermarket', 63, 58.77, 2.9, 'Groceries', 'Cash'),
    x('15', 'Co-working Demo', 70, 25, 4.17, 'Office', 'Card', ['work'], 'reimbursed', 'Day pass'),
    x('16', 'Demo Supermarket', 2, 64.18, 3.12, 'Groceries', 'Card', [], 'none', 'Entered twice by mistake — shows duplicate detection'),
    x('17', 'Demo Garden Centre', 95, 62.5, 10.42, 'Home', 'Card', ['garden']),
    x('18', 'Demo Pharmacy', 120, 12.99, 0, 'Health', 'Card'),
  ];
}

/** Downscales an image file to a JPEG data URL no wider/taller than `max` px. */
async function downscale(file: File, max = 720): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function App() {
  const [route, navigate] = useRoute();
  const today = todayISO();
  const [store, setStore] = usePersistentState<Store>(KEY, () => ({ receipts: demoReceipts(today) }));
  const ctx = { store, setStore, today, navigate };
  const edit = route.match(/^\/receipt\/(.+)$/);
  let page: ReactNode;
  if (route === '/') page = <Home />;
  else if (route === '/receipts') page = <List {...ctx} />;
  else if (route === '/add') page = <Editor {...ctx} />;
  else if (edit) page = <Editor {...ctx} id={edit[1]} />;
  else if (route === '/claims') page = <Claims {...ctx} />;
  else if (route === '/reports') page = <Reports {...ctx} />;
  else page = <NotFound />;
  return (
    <Shell name="Receipt Shelf" wordmark={['Receipt', 'Shelf']} nav={NAV} route={route} cta={{ to: '/add', label: 'Add a receipt' }} footerNote="Receipts and photos stay in this browser. Keep originals where your tax authority requires them.">
      {page}
    </Shell>
  );
}

type Ctx = { store: Store; setStore: (s: Store) => void; today: string; navigate: (to: string) => void };

function Stub({ r, i }: { r: Receipt; i: number }) {
  return (
    <div className="stub" style={{ ['--i' as string]: i }}>
      <div className="stub-top"><span className="stub-merchant">{r.merchant}</span><span className="mono stub-total">{money(r.total)}</span></div>
      <div className="stub-meta small"><span>{formatDay(r.date, { day: 'numeric', month: 'short' })}</span><span>·</span><span>{r.category}</span>{r.claim !== 'none' && <span className={`badge ${CLAIM_BADGE[r.claim]}`}>{CLAIM_LABEL[r.claim]}</span>}</div>
    </div>
  );
}

function HeroPreview() {
  const today = todayISO();
  const list = demoReceipts(today);
  const month = list.filter((r) => r.date >= addDays(today, -30));
  const cats = byCategory(month).slice(0, 4);
  const max = Math.max(...cats.map((c) => c.total));
  return (
    <div className="hero-rs">
      <div className="stubs">{list.slice(0, 4).map((r, i) => <Stub key={r.id} r={r} i={i} />)}</div>
      <div className="hero-cats">
        <p className="eyebrow">Last 30 days · {money(totals(month).total)}</p>
        {cats.map((c) => <div key={c.category} className="hc-row"><span>{c.category}</span><span className="hc-track"><span style={{ width: `${(c.total / max) * 100}%` }} /></span><span className="mono small">{money(c.total)}</span></div>)}
      </div>
    </div>
  );
}

function Home() {
  return (
    <Landing
      eyebrow="Receipt organiser"
      title={<>Every receipt, <em>findable in seconds.</em></>}
      lead="Log receipts with the merchant, amount, tax and a photo. Find any of them by name, tag or date, catch accidental duplicates, and turn work expenses into a claim you can export."
      primary={{ href: '#/receipts', label: 'Open your receipts' }}
      secondary={{ href: '#/claims', label: 'See expense claims' }}
      previewLabel="Recent receipts — demo data"
      preview={<HeroPreview />}
      steps={[
        { title: 'Snap and save', body: 'Enter the merchant, date, total and tax, and attach a photo. It’s shrunk in your browser so it fits in local storage.' },
        { title: 'Tag and find', body: 'Tags such as “work” or “warranty”, categories and date ranges make any receipt quick to find.' },
        { title: 'Claim and report', body: 'Mark work receipts “to claim”, export them for your employer, then track claimed and reimbursed totals.' },
      ]}
      stepsIntro="Receipt Shelf opens with eighteen labelled demo receipts, including one accidental duplicate. Clear them whenever you like."
      features={[
        { title: 'Duplicate check', body: 'Same merchant, date and total? You’re warned before saving and can review duplicates in the list.' },
        { title: 'Photo attached', body: 'A downscaled copy of the receipt image lives with the record — no upload, no account.' },
        { title: 'Expense claims', body: 'A to-claim → claimed → reimbursed pipeline with totals and a CSV for each claim.' },
        { title: 'Reports', body: 'Spending per month and per category with labelled charts and tax totals.' },
      ]}
      note="Receipt Shelf is a personal organiser, not tax or accounting advice."
      closing={{ title: <>Clear the <em>wallet pocket.</em></>, action: { href: '#/add', label: 'Add a receipt' } }}
    />
  );
}

/* ---------- List ---------- */
function List({ store, setStore, today }: Ctx) {
  const [flash, setFlash] = useFlash();
  const [f, setF] = useState<Filters>({ q: '', category: '', claim: '', from: '', to: '', tag: '' });
  const [onlyDupes, setOnlyDupes] = useState(false);
  const dupes = duplicateGroups(store.receipts);
  const dupeIds = new Set(dupes.flat().map((r) => r.id));
  const rows = useMemo(() => applyFilters(store.receipts, f).filter((r) => !onlyDupes || dupeIds.has(r.id)), [store, f, onlyDupes]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = totals(rows);
  const tags = [...new Set(store.receipts.flatMap((r) => r.tags))].sort();
  const columns: Column<Receipt>[] = [
    { key: 'merchant', label: 'Merchant', sort: (r) => r.merchant, render: (r) => <><a href={`#/receipt/${r.id}`}>{r.merchant}</a>{r.image && <span className="badge" title="Photo attached">Photo</span>}{dupeIds.has(r.id) && <span className="badge badge-warn">Possible duplicate</span>}{r.demo && <> <DemoTag /></>}{r.tags.length > 0 && <div className="small muted">{r.tags.map((x) => `#${x}`).join(' ')}</div>}</> },
    { key: 'date', label: 'Date', sort: (r) => r.date, render: (r) => formatDay(r.date) },
    { key: 'cat', label: 'Category', sort: (r) => r.category, render: (r) => r.category },
    { key: 'claim', label: 'Claim', sort: (r) => r.claim, render: (r) => (r.claim === 'none' ? <span className="muted small">Personal</span> : <span className={`badge ${CLAIM_BADGE[r.claim]}`}>{CLAIM_LABEL[r.claim]}</span>) },
    { key: 'tax', label: 'Tax', num: true, sort: (r) => r.tax, render: (r) => money(r.tax) },
    { key: 'total', label: 'Total', num: true, sort: (r) => r.total, render: (r) => <strong>{money(r.total)}</strong> },
  ];
  const table = useTable(rows, columns, { initialSort: 'date', initialDir: 'desc', pageSize: 10 });
  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => setF({ ...f, [k]: v });
  return (
    <div className="stack">
      <PageHead eyebrow="Receipts" title={<>The <em>shelf.</em></>} actions={<><button type="button" className="btn" disabled={!rows.length} onClick={() => downloadText('receipts.csv', toCSV(CSV_HEADERS, csvRows(rows)), 'text/csv')}>Export CSV</button><a className="btn btn-primary" href="#/add">Add receipt</a></>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {dupes.length > 0 && <Notice kind="warn">{dupes.length} possible duplicate{dupes.length === 1 ? '' : 's'} found (same merchant, date and total). <button type="button" className="btn btn-sm btn-ghost" aria-pressed={onlyDupes} onClick={() => setOnlyDupes(!onlyDupes)}>{onlyDupes ? 'Show all receipts' : 'Show duplicates only'}</button></Notice>}
      {store.receipts.length === 0 ? (
        <EmptyState title="No receipts yet" actions={<><a className="btn btn-primary" href="#/add">Add your first receipt</a><button type="button" className="btn" onClick={() => setStore({ receipts: demoReceipts(today) })}>Load demo receipts</button></>}>Start with today’s receipts while they’re still in your pocket.</EmptyState>
      ) : (
        <div className="card stack">
          <div className="filters">
            <Field label="Search" className="grow">{(p) => <input {...p} type="search" value={f.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Merchant, note or tag" />}</Field>
            <Field label="Category">{(p) => <select {...p} value={f.category} onChange={(e) => setFilter('category', e.target.value)}><option value="">All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
            <Field label="Claim status">{(p) => <select {...p} value={f.claim} onChange={(e) => setFilter('claim', e.target.value)}><option value="">All</option>{(Object.keys(CLAIM_LABEL) as Claim[]).map((c) => <option key={c} value={c}>{CLAIM_LABEL[c]}</option>)}</select>}</Field>
            <Field label="Tag">{(p) => <select {...p} value={f.tag} onChange={(e) => setFilter('tag', e.target.value)}><option value="">Any</option>{tags.map((x) => <option key={x} value={x}>#{x}</option>)}</select>}</Field>
            <Field label="From">{(p) => <input {...p} type="date" value={f.from} onChange={(e) => setFilter('from', e.target.value)} />}</Field>
            <Field label="To">{(p) => <input {...p} type="date" value={f.to} onChange={(e) => setFilter('to', e.target.value)} />}</Field>
          </div>
          <p className="small" data-testid="totals"><strong>{t.count} receipt{t.count === 1 ? '' : 's'} · {money(t.total)}</strong> <span className="muted">including {money(t.tax)} tax</span></p>
          <DataTable caption="Receipts" columns={columns} table={table} rowKey={(r) => r.id} empty={<>No receipts match. <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setF({ q: '', category: '', claim: '', from: '', to: '', tag: '' }); setOnlyDupes(false); }}>Clear filters</button></>} />
          {store.receipts.some((r) => r.demo) && <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStore({ receipts: store.receipts.filter((r) => !r.demo) }); setFlash({ kind: 'success', text: 'Demo receipts removed.' }); }}>Clear demo receipts</button></div>}
        </div>
      )}
    </div>
  );
}

/* ---------- Add / edit ---------- */
function Editor({ store, setStore, today, navigate, id }: Ctx & { id?: string }) {
  const ex = id ? store.receipts.find((r) => r.id === id) : undefined;
  const [d, setD] = useState<Draft>({ merchant: ex?.merchant ?? '', date: ex?.date ?? today, total: ex ? ex.total.toFixed(2) : '', tax: ex ? ex.tax.toFixed(2) : '', category: ex?.category ?? 'Groceries', method: ex?.method ?? 'Card', tags: ex?.tags.join(', ') ?? '', note: ex?.note ?? '', claim: ex?.claim ?? 'none' });
  const [image, setImage] = useState<string | undefined>(ex?.image);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmDupe, setConfirmDupe] = useState(false);
  if (id && !ex) return <EmptyState title="Receipt not found" actions={<a className="btn btn-primary" href="#/receipts">Back to receipts</a>}>It may have been deleted.</EmptyState>;
  const errors = submitted ? validate(d, today).errors : {};
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD({ ...d, [k]: v }); setConfirmDupe(false); };
  const v = validate(d, today).value;
  const dupes = v ? duplicatesOf({ id: ex?.id ?? '', merchant: v.merchant, date: v.date, total: v.total }, store.receipts) : [];

  async function onFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setImgErr('Choose an image file (JPEG, PNG or HEIC exported as JPEG).');
    if (file.size > 15 * 1024 * 1024) return setImgErr('That image is over 15 MB. Choose a smaller one.');
    setBusy(true);
    setImgErr(null);
    try {
      setImage(await downscale(file));
    } catch {
      setImgErr('Couldn’t read that image. Try a JPEG or PNG.');
    } finally {
      setBusy(false);
    }
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const r = validate(d, today);
    if (!r.value) return;
    if (dupes.length && !confirmDupe) return setConfirmDupe(true);
    const rec: Receipt = { ...r.value, id: ex?.id ?? uid('rcpt'), image };
    const next = ex ? store.receipts.map((x) => (x.id === ex.id ? rec : x)) : [rec, ...store.receipts];
    if (JSON.stringify(next).length > STORAGE_SOFT_LIMIT) return setImgErr('This browser’s storage is nearly full. Remove the photo or delete old receipts with photos.');
    setStore({ receipts: next });
    navigate('/receipts');
  }
  return (
    <div className="stack">
      <PageHead eyebrow={ex ? 'Receipt' : 'Add receipt'} title={ex ? <>{ex.merchant}</> : <>New <em>receipt.</em></>} actions={ex && <button type="button" className="btn btn-danger" onClick={() => { if (window.confirm('Delete this receipt and its photo?')) { setStore({ receipts: store.receipts.filter((x) => x.id !== ex.id) }); navigate('/receipts'); } }}>Delete</button>} />
      {ex?.demo && <p><DemoTag /> <span className="small muted">A fictional demo receipt.</span></p>}
      <form className="layout-main" onSubmit={save} noValidate>
        <div className="card stack">
          {Object.keys(errors).length > 0 && <Notice kind="error">Please fix the highlighted fields.</Notice>}
          {confirmDupe && <Notice kind="warn">This looks like a duplicate of a receipt from {dupes[0].merchant} on {formatDay(dupes[0].date)} for {money(dupes[0].total)}. Press save again to keep both.</Notice>}
          <div className="form-grid">
            <Field label="Merchant" error={errors.merchant}>{(p) => <input {...p} value={d.merchant} onChange={(e) => set('merchant', e.target.value)} />}</Field>
            <Field label="Date" error={errors.date}>{(p) => <input {...p} type="date" max={today} value={d.date} onChange={(e) => set('date', e.target.value)} />}</Field>
            <Field label="Total (USD)" error={errors.total}>{(p) => <input {...p} inputMode="decimal" value={d.total} onChange={(e) => set('total', e.target.value)} placeholder="0.00" />}</Field>
            <Field label="Tax included" hint="Optional" error={errors.tax}>{(p) => <input {...p} inputMode="decimal" value={d.tax} onChange={(e) => set('tax', e.target.value)} placeholder="0.00" />}</Field>
            <Field label="Category">{(p) => <select {...p} value={d.category} onChange={(e) => set('category', e.target.value as Category)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
            <Field label="Paid by">{(p) => <select {...p} value={d.method} onChange={(e) => set('method', e.target.value as Method)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>}</Field>
            <Field label="Tags" hint="Comma separated, e.g. work, warranty">{(p) => <input {...p} value={d.tags} onChange={(e) => set('tags', e.target.value)} />}</Field>
            <Field label="Expense claim">{(p) => <select {...p} value={d.claim} onChange={(e) => set('claim', e.target.value as Claim)}>{(Object.keys(CLAIM_LABEL) as Claim[]).map((c) => <option key={c} value={c}>{CLAIM_LABEL[c]}</option>)}</select>}</Field>
          </div>
          <Field label="Note">{(p) => <textarea {...p} rows={2} value={d.note} onChange={(e) => set('note', e.target.value)} />}</Field>
          <div className="row"><button className="btn btn-primary" type="submit" disabled={busy}>{ex ? 'Save changes' : 'Save receipt'}</button><a className="btn btn-ghost" href="#/receipts">Cancel</a></div>
        </div>
        <aside className="card stack">
          <p className="eyebrow">Photo</p>
          {image ? <><img src={image} alt={`Photo of the receipt from ${d.merchant || 'this merchant'}`} className="receipt-img" /><button type="button" className="btn btn-sm btn-ghost" onClick={() => setImage(undefined)}>Remove photo</button></> : <div className="photo-empty">{busy ? <span className="spinner" aria-label="Processing image" /> : <span className="small muted">No photo attached</span>}</div>}
          <label className="btn btn-sm">{image ? 'Replace photo' : 'Attach a photo'}<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} /></label>
          {imgErr && <p className="error-text" role="alert">{imgErr}</p>}
          <p className="small muted">Images are resized to 720 px and stored only in this browser.</p>
        </aside>
      </form>
    </div>
  );
}

/* ---------- Claims ---------- */
function Claims({ store, setStore }: Ctx) {
  const [flash, setFlash] = useFlash();
  const sum = claimSummary(store.receipts);
  const stages: { claim: Claim; title: string; next?: string }[] = [
    { claim: 'to-claim', title: 'To claim', next: 'Mark claimed' },
    { claim: 'claimed', title: 'Claimed, awaiting payment', next: 'Mark reimbursed' },
    { claim: 'reimbursed', title: 'Reimbursed' },
  ];
  function advanceAll(c: Claim) {
    const n = store.receipts.filter((r) => r.claim === c).length;
    setStore({ receipts: store.receipts.map((r) => (r.claim === c ? { ...r, claim: advanceClaim(c) } : r)) });
    setFlash({ kind: 'success', text: `${n} receipt${n === 1 ? '' : 's'} moved to “${CLAIM_LABEL[advanceClaim(c)]}”.` });
  }
  return (
    <div className="stack">
      <PageHead eyebrow="Expense claims" title={<>Get your <em>money back.</em></>} description="Mark work receipts as “to claim”, export them for your employer, then track them until reimbursed." />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      <div className="stats" data-testid="claim-stats">
        <div className="stat"><span className="stat-label">To claim</span><span className="stat-value">{money(sum.toClaim.total)}</span></div>
        <div className="stat"><span className="stat-label">Awaiting payment</span><span className="stat-value">{money(sum.claimed.total)}</span></div>
        <div className="stat"><span className="stat-label">Reimbursed</span><span className="stat-value">{money(sum.reimbursed.total)}</span></div>
      </div>
      <div className="claim-cols">
        {stages.map((st) => {
          const list = store.receipts.filter((r) => r.claim === st.claim).sort((a, b) => a.date.localeCompare(b.date));
          return (
            <section key={st.claim} className="card stack" aria-labelledby={`h-${st.claim}`}>
              <div className="card-title-row"><h2 id={`h-${st.claim}`} className="h3">{st.title}</h2><span className="badge">{list.length}</span></div>
              {list.length === 0 ? <p className="muted small">Nothing here.</p> : <ul className="claim-list">{list.map((r) => <li key={r.id}><a href={`#/receipt/${r.id}`}>{r.merchant}</a><span className="small muted">{formatDay(r.date, { day: 'numeric', month: 'short' })} · {money(r.total)}</span></li>)}</ul>}
              {list.length > 0 && (
                <div className="row">
                  <button type="button" className="btn btn-sm" onClick={() => downloadText(`claim-${st.claim}.csv`, toCSV(CSV_HEADERS, [...csvRows(list), ['', 'TOTAL', '', '', totals(list).total.toFixed(2), totals(list).tax.toFixed(2), '', '', '']]), 'text/csv')}>Export CSV</button>
                  {st.next && <button type="button" className="btn btn-sm btn-primary" onClick={() => advanceAll(st.claim)}>{st.next}</button>}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Reports ---------- */
function Reports({ store, today }: Ctx) {
  const [tip, setTip] = useState<string | null>(null);
  const from = addMonths(`${today.slice(0, 7)}-01`, -5).slice(0, 7);
  const months = byMonth(store.receipts, from, today.slice(0, 7));
  const max = Math.max(50, ...months.map((m) => m.total));
  const nice = Math.ceil(max / 100) * 100;
  const recent = store.receipts.filter((r) => r.date >= `${from}-01`);
  const cats = byCategory(recent);
  const catMax = Math.max(1, ...cats.map((c) => c.total));
  if (!store.receipts.length) return <EmptyState title="No receipts yet" actions={<a className="btn btn-primary" href="#/add">Add a receipt</a>}>Reports appear once you add receipts.</EmptyState>;
  const t = totals(recent);
  return (
    <div className="stack">
      <PageHead eyebrow="Reports" title={<>Where it <em>went.</em></>} description={`${fromISO(`${from}-01`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} – ${formatDay(today, { month: 'short', year: 'numeric' })}`} />
      <div className="stats">
        <div className="stat"><span className="stat-label">Spent, 6 months</span><span className="stat-value">{money(t.total)}</span></div>
        <div className="stat"><span className="stat-label">Tax paid</span><span className="stat-value">{money(t.tax)}</span></div>
        <div className="stat"><span className="stat-label">Receipts</span><span className="stat-value">{t.count}</span></div>
        <div className="stat"><span className="stat-label">Average receipt</span><span className="stat-value">{money(t.count ? t.total / t.count : 0)}</span></div>
      </div>
      <div className="grid-2">
        <section className="card stack" aria-labelledby="m-title">
          <h2 id="m-title" className="h3">Spending per month</h2>
          <div className="bars-wrap" onMouseLeave={() => setTip(null)}>
            <div className="bars-axis" aria-hidden="true">{[nice, nice / 2, 0].map((x) => <span key={x}>${x}</span>)}</div>
            <div className="bars" role="img" aria-label={months.map((m) => `${fromISO(`${m.month}-01`).toLocaleDateString(undefined, { month: 'short' })} ${money(m.total)}`).join(', ')}>
              {months.map((m, i) => {
                const text = `${fromISO(`${m.month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}: ${money(m.total)} across ${m.count} receipt${m.count === 1 ? '' : 's'}`;
                return (
                  <div key={m.month} className="bar-col" style={{ ['--i' as string]: i }} tabIndex={0} aria-label={text} onMouseEnter={() => setTip(text)} onFocus={() => setTip(text)} onBlur={() => setTip(null)}>
                    <div className="bar-stack" style={{ height: `${(m.total / nice) * 100}%` }}><span style={{ flexGrow: 1, background: 'var(--accent)' }} /></div>
                    <span className="bar-label mono">{fromISO(`${m.month}-01`).toLocaleDateString(undefined, { month: 'short' })}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="small" aria-live="polite">{tip ?? 'Hover or focus a month for details.'}</p>
          <p className="legend"><span><i style={{ background: 'var(--accent)' }} />Total spent (USD)</span></p>
        </section>
        <section className="card stack" aria-labelledby="c-title">
          <h2 id="c-title" className="h3">By category</h2>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Spending by category, last six months</caption>
              <thead><tr><th scope="col">Category</th><th scope="col">Share</th><th scope="col" className="num">Receipts</th><th scope="col" className="num">Total</th></tr></thead>
              <tbody>{cats.map((c) => <tr key={c.category}><th scope="row">{c.category}</th><td><span className="share"><span style={{ width: `${(c.total / catMax) * 100}%` }} /></span></td><td className="num">{c.count}</td><td className="num">{money(c.total)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
