/**
 * Alpha Vantage adapter for the earnings routes.
 *
 * Why this provider: the EODHD key on this project covers the News API only —
 * its calendar and fundamentals endpoints both answer 403 — so the two
 * earnings surfaces had no source at all. Alpha Vantage answers both on a
 * free key, verified against their live API before this was written:
 * EARNINGS returned 122 quarters for IBM with actual, estimate and surprise,
 * and EARNINGS_CALENDAR returned ~1,570 scheduled reports for a 3-month
 * horizon.
 *
 * The one real difference from EODHD's calendar, carried honestly rather
 * than papered over: EARNINGS_CALENDAR lists only reports that have NOT
 * happened yet. A week's calendar therefore shows who is due to report, with
 * no `actual` for anyone who already has. Per-stock history is unaffected —
 * EARNINGS carries the reported figures.
 *
 * Alpha Vantage signals its own errors with HTTP 200 and a JSON object
 * carrying "Information", "Note" or "Error Message", so a caller that only
 * checks the status code reads a rate-limit notice as an empty result. That
 * would turn a quota problem into the sentence "this company has never
 * reported", which is exactly the kind of quiet falsehood this app exists to
 * avoid — hence readApiError() below, applied before anything is mapped.
 */

import { parseIsoDate, toNumber, type EarningsRow } from './earnings.js';

/** Free keys are capped per day, so a spent quota is an expected state, not an exotic one. */
export interface ProviderNotice {
  kind: 'rate_limited' | 'rejected';
  detail: string;
}

/**
 * Alpha Vantage's own error, if this body is one.
 *
 * "Information" is what a spent daily quota returns; "Note" is the
 * per-minute throttle; "Error Message" is a bad symbol or function. All
 * three arrive with HTTP 200.
 */
export function readApiError(body: unknown): ProviderNotice | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const note = typeof b.Note === 'string' ? b.Note : null;
  const info = typeof b.Information === 'string' ? b.Information : null;
  const err = typeof b['Error Message'] === 'string' ? (b['Error Message'] as string) : null;
  const text = note ?? info ?? err;
  if (text === null) return null;
  // Their quota copy varies ("higher API call volume", "rate limit", "25
  // requests per day"), so match the words that persist across the wordings
  // rather than any single sentence.
  const limited = /rate limit|call (?:volume|frequency)|per day|premium/i.test(text);
  return { kind: limited ? 'rate_limited' : 'rejected', detail: text };
}

/** 'pre-market' -> BMO, 'post-market' -> AMC, anything else -> null. */
export function readTiming(v: unknown): 'BMO' | 'AMC' | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'pre-market' || s === 'bmo') return 'BMO';
  if (s === 'post-market' || s === 'amc') return 'AMC';
  return null;
}

/**
 * One row of EARNINGS' quarterlyEarnings, or null if it cannot be placed.
 *
 * A row needs a real report date to be placeable at all; everything else is
 * legitimately absent for some quarters (a company with no analyst coverage
 * has no estimate) and renders as "—" rather than being invented.
 */
export function mapHistoryRow(ticker: string, row: unknown): EarningsRow | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const reportDate = parseIsoDate(r.reportedDate);
  if (reportDate === null) return null;
  return {
    ticker,
    reportDate,
    periodEnd: parseIsoDate(r.fiscalDateEnding),
    timing: readTiming(r.reportTime),
    actual: toNumber(r.reportedEPS),
    estimate: toNumber(r.estimatedEPS),
    surprisePct: toNumber(r.surprisePercentage),
  };
}

/**
 * Split one CSV line, honouring double-quoted fields.
 *
 * Company names in this feed contain commas often enough that splitting on
 * "," alone shifts every later column — which would put a company name where
 * a date belongs and silently drop the row. Written as a single left-to-right
 * scan; a doubled quote inside a quoted field is one literal quote.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      out.push(field.trim());
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  out.push(field.trim());
  return out;
}

/**
 * EARNINGS_CALENDAR's CSV into rows.
 *
 * Columns are read BY HEADER NAME, not by position: a provider that adds a
 * column would otherwise shift every field silently, and a calendar full of
 * plausible wrong dates is worse than no calendar. A missing expected header
 * returns null, which the caller reports as an unreadable response.
 *
 * `actual` and `surprisePct` are always null here — these are reports that
 * have not happened yet. That is a fact about the feed, not a gap to fill.
 */
export function parseCalendarCsv(csv: string): EarningsRow[] | null {
  const lines = csv.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
  if (lines.length === 0) return null;
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const at = (name: string) => header.indexOf(name);
  const iSymbol = at('symbol');
  const iReport = at('reportdate');
  if (iSymbol === -1 || iReport === -1) return null;
  const iPeriod = at('fiscaldateending');
  const iEstimate = at('estimate');
  const iTiming = at('timeoftheday');

  const dataLines = lines.slice(1);
  const rows: EarningsRow[] = [];
  for (const line of dataLines) {
    const cells = splitCsvLine(line);
    const ticker = (cells[iSymbol] ?? '').toUpperCase();
    const reportDate = parseIsoDate(cells[iReport]);
    if (ticker === '' || reportDate === null) continue;
    rows.push({
      ticker,
      reportDate,
      periodEnd: iPeriod === -1 ? null : parseIsoDate(cells[iPeriod]),
      timing: iTiming === -1 ? null : readTiming(cells[iTiming]),
      actual: null,
      estimate: iEstimate === -1 ? null : toNumber(cells[iEstimate]),
      surprisePct: null,
    });
  }
  // Data lines that ALL failed to map is not an empty week — it is a body we
  // did not understand. Found live: when this provider rejects a key on the
  // CSV route it answers 200 with the real header and one junk line, which
  // parsed cleanly to zero rows and would have rendered "no companies report
  // this week" from a rejection. A header with no data lines is still a
  // legitimate empty week, and a few bad rows among good ones still yield the
  // good ones.
  if (rows.length === 0 && dataLines.length > 0) return null;
  return rows;
}

/** Rows whose report date falls inside [from, to], both inclusive. */
export function withinRange(rows: EarningsRow[], from: string, to: string): EarningsRow[] {
  return rows.filter((r) => r.reportDate >= from && r.reportDate <= to);
}
