/**
 * Pure helpers for /api/financials — reading SEC EDGAR's XBRL "company
 * facts" into statement rows, kept out of the handler so they can be unit-
 * tested without a request/response pair or a mocked fetch. Same split as
 * _lib/eodhd.ts.
 *
 * THE SOURCE. EDGAR publishes every US-GAAP fact a filer has ever tagged, at
 * https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json — free, no
 * key, US-listed companies only (a foreign private issuer files under IFRS
 * and is not read here). A ticker is turned into a CIK through the SEC's own
 * ticker file (see the route).
 *
 * THE SHAPE, and why it needs care. Each concept ("NetIncomeLoss") carries a
 * flat list of facts, each with a period (`start`/`end`, or just `end` for a
 * balance-sheet instant), the form and filing date it came from, and the
 * value. One 10-K files the current year AND the prior years as comparatives,
 * a 10-Q files the quarter AND the year-to-date, and a restatement re-files
 * an old period with a new value. So the same period appears many times, and
 * "the figure for FY2025" is a choice this module has to make explicitly:
 *
 *   - a period is classified by its DURATION — about a year is annual, about
 *     a quarter is quarterly, and a six- or nine-month year-to-date span is
 *     neither and is dropped;
 *   - for one period end, the fact from the LATEST filing wins, so a restated
 *     figure replaces the original rather than sitting beside it;
 *   - a company that changed tags (Revenues → RevenueFromContract…) is read
 *     through an ordered list of concepts, first one with a value wins, per
 *     period — so a series does not break at the year the tag changed.
 *
 * DATA HONESTY: nothing is derived. Q4 is not computed from the year less
 * three quarters, gross profit is not revenue less cost, and a missing
 * concept is null. The reader is shown what was filed, with the form and
 * date it was filed in.
 */

/** One XBRL fact as EDGAR reports it, after validation. */
export interface Fact {
  /** Period start, raw YYYY-MM-DD; null for a balance-sheet instant. */
  start: string | null;
  /** Period end (or the instant), raw YYYY-MM-DD. */
  end: string;
  val: number;
  fy: number | null;
  fp: string | null;
  form: string;
  /** Filing date, raw YYYY-MM-DD. */
  filed: string;
}

export type Metric =
  | 'revenue'
  | 'grossProfit'
  | 'operatingIncome'
  | 'netIncome'
  | 'eps'
  | 'operatingCashFlow'
  | 'assets'
  | 'liabilities'
  | 'equity'
  | 'cash';

/**
 * The US-GAAP concepts read for each metric, in order of preference, with
 * the unit each is filed in. Ordered lists because filers change tags:
 * revenue moved from `Revenues` to `RevenueFromContractWithCustomer…` for
 * most companies in 2018, and a company's older years still sit under the
 * old one.
 */
export const CONCEPTS: Record<Metric, { tags: string[]; unit: string; kind: 'duration' | 'instant' }> = {
  revenue: {
    tags: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'],
    unit: 'USD',
    kind: 'duration',
  },
  grossProfit: { tags: ['GrossProfit'], unit: 'USD', kind: 'duration' },
  operatingIncome: { tags: ['OperatingIncomeLoss'], unit: 'USD', kind: 'duration' },
  netIncome: { tags: ['NetIncomeLoss'], unit: 'USD', kind: 'duration' },
  eps: { tags: ['EarningsPerShareDiluted', 'EarningsPerShareBasic'], unit: 'USD/shares', kind: 'duration' },
  operatingCashFlow: {
    tags: ['NetCashProvidedByUsedInOperatingActivities'],
    unit: 'USD',
    kind: 'duration',
  },
  assets: { tags: ['Assets'], unit: 'USD', kind: 'instant' },
  liabilities: { tags: ['Liabilities'], unit: 'USD', kind: 'instant' },
  equity: {
    tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
    unit: 'USD',
    kind: 'instant',
  },
  cash: { tags: ['CashAndCashEquivalentsAtCarryingValue'], unit: 'USD', kind: 'instant' },
};

export const METRICS = Object.keys(CONCEPTS) as Metric[];

/** The forms read. Amendments included: an amended figure is the one that stands. */
const FORMS = new Set(['10-K', '10-K/A', '10-Q', '10-Q/A']);

export type Span = 'annual' | 'quarterly';

/** One period's statement figures, as filed. */
export interface StatementRow {
  periodStart: string | null;
  periodEnd: string;
  fy: number | null;
  fp: string | null;
  form: string;
  filed: string;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  eps: number | null;
  operatingCashFlow: number | null;
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
  cash: number | null;
}

/** What the route reads out of one company-facts payload. */
export interface CompanyFacts {
  cik: string;
  entityName: string | null;
  /** Facts per concept tag, validated, forms filtered. */
  facts: Map<string, Fact[]>;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One raw fact, or null when it lacks what a statement row needs. */
export function mapFact(raw: unknown): Fact | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const f = raw as Record<string, unknown>;
  const end = str(f.end);
  const filed = str(f.filed);
  const form = str(f.form);
  const val = num(f.val);
  if (!end || !DATE.test(end) || !filed || !DATE.test(filed) || !form || val === null) return null;
  if (!FORMS.has(form)) return null;
  const start = str(f.start);
  return {
    start: start && DATE.test(start) ? start : null,
    end,
    val,
    fy: num(f.fy),
    fp: str(f.fp),
    form,
    filed,
  };
}

/**
 * Read a company-facts payload. Null for a shape this module does not
 * recognise — reported by the route as `bad_response`, never flattened to
 * "no statements", because "we could not read it" and "nothing was filed"
 * must not look alike.
 */
export function readCompanyFacts(body: unknown): CompanyFacts | null {
  if (typeof body !== 'object' || body === null) return null;
  const root = body as Record<string, unknown>;
  const cikRaw = root.cik;
  const cik =
    typeof cikRaw === 'number' && Number.isInteger(cikRaw)
      ? String(cikRaw)
      : typeof cikRaw === 'string' && /^\d+$/.test(cikRaw)
        ? String(Number(cikRaw))
        : null;
  if (cik === null) return null;
  const gaap = (root.facts as Record<string, unknown> | undefined)?.['us-gaap'];
  // A filer with no US-GAAP facts at all (an IFRS filer, a fund) is a real
  // answer: an empty map, not a bad shape.
  if (gaap === undefined || gaap === null) {
    return { cik, entityName: str(root.entityName), facts: new Map() };
  }
  if (typeof gaap !== 'object') return null;

  const facts = new Map<string, Fact[]>();
  for (const spec of Object.values(CONCEPTS)) {
    for (const tag of spec.tags) {
      const concept = (gaap as Record<string, unknown>)[tag];
      if (typeof concept !== 'object' || concept === null) continue;
      const units = (concept as Record<string, unknown>).units;
      if (typeof units !== 'object' || units === null) continue;
      const rows = (units as Record<string, unknown>)[spec.unit];
      if (!Array.isArray(rows)) continue;
      facts.set(
        tag,
        rows.map(mapFact).filter((f): f is Fact => f !== null),
      );
    }
  }
  return { cik, entityName: str(root.entityName), facts };
}

/** Whole days from `from` to `to`, both raw YYYY-MM-DD. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Which span a duration fact covers, from its length alone.
 *
 * A fiscal year is 52 or 53 weeks and a quarter 13 or 14, so the windows are
 * generous around 365 and 91 days. A six- or nine-month year-to-date figure
 * — which every 10-Q also files — falls in neither and is dropped: showing a
 * nine-month total in a column labelled Q3 would be the kind of wrong that
 * looks right.
 */
export function spanOf(fact: Fact): Span | null {
  if (fact.start === null) return null;
  const days = daysBetween(fact.start, fact.end);
  if (days >= 340 && days <= 380) return 'annual';
  if (days >= 75 && days <= 105) return 'quarterly';
  return null;
}

/**
 * The fact that stands for each period end: the one from the latest filing.
 *
 * A 10-K refiles the prior years as comparatives and a restatement refiles
 * an old period outright; in both the newest filing is the figure the
 * company currently stands behind. Ties on filing date keep the later row,
 * which is the order EDGAR lists them in.
 */
function latestByEnd(facts: readonly Fact[]): Map<string, Fact> {
  const out = new Map<string, Fact>();
  for (const fact of facts) {
    const have = out.get(fact.end);
    if (!have || fact.filed >= have.filed) out.set(fact.end, fact);
  }
  return out;
}

/**
 * The value a metric has at one period end, through its ordered concept
 * list. Duration metrics are matched on span; instants have none.
 */
function valueAt(
  company: CompanyFacts,
  metric: Metric,
  span: Span,
  end: string,
  index: Map<string, Map<string, Fact>>,
): Fact | null {
  const spec = CONCEPTS[metric];
  for (const tag of spec.tags) {
    const key = `${tag}|${spec.kind === 'duration' ? span : 'instant'}`;
    let byEnd = index.get(key);
    if (!byEnd) {
      const rows = (company.facts.get(tag) ?? []).filter((f) =>
        spec.kind === 'duration' ? spanOf(f) === span : f.start === null,
      );
      byEnd = latestByEnd(rows);
      index.set(key, byEnd);
    }
    const fact = byEnd.get(end);
    if (fact) return fact;
  }
  return null;
}

/**
 * Statement rows for one span, newest first, at most `limit` of them.
 *
 * The periods are the ends at which revenue or net income was filed for that
 * span — the two lines every income statement has — so a period exists only
 * because a filing did, never because a calendar says there should be one.
 * Provenance (form, filing date, fiscal labels) comes from the revenue fact
 * where there is one and the net-income fact otherwise.
 */
export function buildStatements(company: CompanyFacts, span: Span, limit: number): StatementRow[] {
  const index = new Map<string, Map<string, Fact>>();
  const ends = new Set<string>();
  for (const metric of ['revenue', 'netIncome'] as const) {
    for (const tag of CONCEPTS[metric].tags) {
      for (const fact of company.facts.get(tag) ?? []) {
        if (spanOf(fact) === span) ends.add(fact.end);
      }
    }
  }
  const ordered = [...ends].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)).slice(0, limit);

  return ordered.map((end) => {
    const anchor =
      valueAt(company, 'revenue', span, end, index) ?? valueAt(company, 'netIncome', span, end, index);
    // `ends` was built from these two, so an anchor always exists; the
    // fallback only satisfies the type.
    const provenance = anchor ?? { start: null, end, fy: null, fp: null, form: '', filed: '' };
    const row: StatementRow = {
      periodStart: provenance.start,
      periodEnd: end,
      fy: provenance.fy,
      fp: provenance.fp,
      form: provenance.form,
      filed: provenance.filed,
      revenue: null,
      grossProfit: null,
      operatingIncome: null,
      netIncome: null,
      eps: null,
      operatingCashFlow: null,
      assets: null,
      liabilities: null,
      equity: null,
      cash: null,
    };
    for (const metric of METRICS) {
      row[metric] = valueAt(company, metric, span, end, index)?.val ?? null;
    }
    return row;
  });
}

/**
 * The SEC's ticker→CIK file, read into a map keyed by ticker as this app
 * spells it. The file spells a class share "BRK-B"; the app, like the
 * exchanges, spells it "BRK.B" — both are accepted on lookup.
 */
export function readTickerMap(body: unknown): Map<string, { cik: string; title: string | null }> | null {
  if (typeof body !== 'object' || body === null) return null;
  const out = new Map<string, { cik: string; title: string | null }>();
  for (const entry of Object.values(body as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const ticker = str(e.ticker)?.toUpperCase();
    const cik = num(e.cik_str);
    if (!ticker || cik === null) continue;
    out.set(ticker, { cik: String(cik), title: str(e.title) });
  }
  return out.size > 0 ? out : null;
}

/** A ticker as the SEC file spells it: dots become hyphens. */
export function secTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replaceAll('.', '-');
}

/** The company-facts URL for a CIK, zero-padded to the ten digits EDGAR expects. */
export function companyFactsUrl(cik: string): URL {
  return new URL(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10, '0')}.json`);
}

export const TICKER_FILE_URL = new URL('https://www.sec.gov/files/company_tickers.json');
