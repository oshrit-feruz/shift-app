import type { EarningsRow } from './earnings.js';
import { isValidTicker, type NewsArticle } from './news.js';

/**
 * The alert engine, as pure functions.
 *
 * Everything that decides WHETHER an alert fires is in this file, and none
 * of it touches a network or a database: the route (api/alerts-run.ts)
 * gathers the rules, the prices, the articles and the calendar, hands them
 * in here, and writes out what comes back. That split is what makes the
 * decisions testable — a crossing, a threshold, a keyword match and a
 * reminder date are each a table of inputs and expected outputs below, with
 * no fetch to stub.
 *
 * THE ONE RULE EVERY EVALUATOR FOLLOWS: an alert fires on a CHANGE, never on
 * a state. "Tell me when NVDA rises above 200" means the moment it crosses,
 * not every five minutes for as long as it stays there — and not the moment
 * the rule is created while the price already sits at 210, either. So each
 * rule remembers which side of its level it was on at the last check
 * (alert_states in supabase/migrations/0006_alerts.sql), the first check only
 * records that side, and a firing needs the side to have flipped since. The
 * cost of that honesty is that a crossing between creation and the first
 * check is not seen; the README says so.
 *
 * Text is composed here in both languages, at firing time, rather than
 * rendered from parameters by the client. A notification is a record of
 * what was observed, and it should read the same next month as it did when
 * it fired, whatever the app's copy becomes in between.
 */

export interface Bilingual {
  en: string;
  he: string;
}

/** The subset of the client's SavedAlert (app/src/state/appState.tsx) the engine reads. */
export interface AlertRule {
  id: string;
  ticker: string;
  kind: 'price' | 'news' | 'earn';
  condition: 'rise' | 'fall';
  value: string;
  remind: 'day' | 'morning' | 'lands';
  notifyBy: { push: boolean; email: boolean };
}

/** One fired alert, as it will be stored and delivered. */
export interface Firing {
  kind: 'price' | 'threshold' | 'news' | 'earn';
  ticker: string;
  title: Bilingual;
  detail: Bilingual;
  /** What makes a second observation of the same event the same row. */
  dedupeKey: string;
}

/** A state the engine wants remembered for the next run. */
export interface StateWrite {
  key: string;
  state: string;
}

export interface Evaluation {
  firings: Firing[];
  states: StateWrite[];
}

const NOTHING: Evaluation = { firings: [], states: [] };

// ── Reading the rules out of the jsonb bag ──────────────────────────────

/**
 * The alert rules inside one user's `user_state.state` bag, validated.
 *
 * Mirrors the client's own `isSavedAlert` guard: a row the app would drop
 * on read is dropped here too, so the engine never evaluates a rule the
 * user cannot see in their list. Tickers are normalised the way the
 * watchlist reducer normalises them, and a ticker the news route would
 * refuse is skipped rather than sent upstream.
 */
export function readRules(bag: unknown): AlertRule[] {
  if (bag === null || typeof bag !== 'object') return [];
  const raw = (bag as { savedAlerts?: unknown }).savedAlerts;
  if (!Array.isArray(raw)) return [];
  const out: AlertRule[] = [];
  for (const v of raw) {
    if (v === null || typeof v !== 'object') continue;
    const a = v as Partial<AlertRule>;
    if (typeof a.id !== 'string' || typeof a.ticker !== 'string' || typeof a.value !== 'string') continue;
    if (a.kind !== 'price' && a.kind !== 'news' && a.kind !== 'earn') continue;
    const ticker = a.ticker.trim().toUpperCase();
    if (!ticker || !isValidTicker(ticker)) continue;
    const notify = a.notifyBy;
    out.push({
      id: a.id,
      ticker,
      kind: a.kind,
      condition: a.condition === 'fall' ? 'fall' : 'rise',
      value: a.value,
      remind: a.remind === 'morning' || a.remind === 'lands' ? a.remind : 'day',
      notifyBy: {
        push: typeof notify === 'object' && notify !== null && notify.push === true,
        email: typeof notify === 'object' && notify !== null && notify.email === true,
      },
    });
  }
  return out;
}

/**
 * The two Settings thresholds, as percentages, or null where blank or
 * unusable. Both are magnitudes: the Settings screen's "fall below" field
 * shows a "−%" placeholder, and someone typing "-10" and someone typing "10"
 * mean the same thing, so the sign is dropped rather than doubled.
 */
export function readThresholds(bag: unknown): { up: number | null; down: number | null } {
  if (bag === null || typeof bag !== 'object') return { up: null, down: null };
  const b = bag as { alertUpThreshold?: unknown; alertDownThreshold?: unknown };
  return { up: readPercent(b.alertUpThreshold), down: readPercent(b.alertDownThreshold) };
}

function readPercent(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Math.abs(Number(s));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The level a price rule watches, or null when the field is not a price. */
export function readLevel(rule: AlertRule): number | null {
  const s = rule.value.trim().replace(/^\$/, '').replace(/,/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Level rules: a price crossing a line ────────────────────────────────

type Side = 'above' | 'below';

/**
 * The state key for a price rule. Deliberately the rule's SUBSTANCE rather
 * than its id: delete "rise above 200" and file it again, and it is the same
 * question with the same answer, so it must not fire on a crossing that
 * already happened. Change the level and it is a new question, freshly
 * armed.
 */
export function priceRuleKey(ticker: string, condition: 'rise' | 'fall', level: number): string {
  return `price|${ticker}|${condition}|${level}`;
}

/**
 * One price rule against one price.
 *
 * `prev` is the side recorded at the last check, or undefined on the first.
 * A firing needs the side to have flipped in the direction the rule watches
 * for; the state is written whenever it differs from what was stored, which
 * includes the first observation.
 */
export function evaluatePriceRule(
  rule: AlertRule,
  price: number,
  prev: string | undefined,
  today: string,
): Evaluation {
  const level = readLevel(rule);
  if (level === null || !(price > 0)) return NOTHING;
  const side: Side = price >= level ? 'above' : 'below';
  const key = priceRuleKey(rule.ticker, rule.condition, level);
  const states: StateWrite[] = prev === side ? [] : [{ key, state: side }];
  const crossed =
    prev !== undefined &&
    prev !== side &&
    ((rule.condition === 'rise' && side === 'above') || (rule.condition === 'fall' && side === 'below'));
  if (!crossed) return { firings: [], states };
  const rose = rule.condition === 'rise';
  return {
    states,
    firings: [
      {
        kind: 'price',
        ticker: rule.ticker,
        title: {
          en: `${rule.ticker} ${rose ? 'rose above' : 'fell below'} ${money(level)} (now ${money(price)})`,
          he: `${rule.ticker} ${rose ? 'עלתה מעל' : 'ירדה מתחת ל־'}${money(level)} (כרגע ${money(price)})`,
        },
        detail: { en: 'Price alert', he: 'התראת מחיר' },
        // One row per rule per day. A price that oscillates around the level
        // all afternoon is one event to the reader, not thirty.
        dedupeKey: `${key}|${today}`,
      },
    ],
  };
}

/** A position as the threshold rules need it: what is held, and at what average cost. */
export interface HeldPosition {
  ticker: string;
  shares: number;
  avgCost: number;
}

/** The state key for one Settings threshold on one ticker. The value is in it so editing the threshold re-arms it. */
export function thresholdKey(ticker: string, which: 'up' | 'down', pct: number): string {
  return `thr|${ticker}|${which}|${pct}`;
}

/**
 * The Settings percent thresholds against every held position.
 *
 * "From entry" is the position's average cost, the same figure the portfolio
 * screen prints, so the number in the notification is the number on screen.
 * A position with no price, or with nothing held, is skipped: there is no
 * return to measure, and a threshold cannot be crossed by a figure that does
 * not exist.
 */
export function evaluateThresholds(
  positions: HeldPosition[],
  thresholds: { up: number | null; down: number | null },
  quotes: Record<string, number>,
  prevStates: Record<string, string>,
  today: string,
): Evaluation {
  const out: Evaluation = { firings: [], states: [] };
  if (thresholds.up === null && thresholds.down === null) return out;
  for (const pos of positions) {
    const price = quotes[pos.ticker];
    if (pos.shares <= 0 || !(pos.avgCost > 0) || !(price > 0)) continue;
    const nowPct = ((price - pos.avgCost) / pos.avgCost) * 100;
    for (const which of ['up', 'down'] as const) {
      const pct = thresholds[which];
      if (pct === null) continue;
      const key = thresholdKey(pos.ticker, which, pct);
      // 'above' means "past the line" for both directions, so the firing
      // condition reads the same way for each: the side flipped to 'above'.
      const side: Side = (which === 'up' ? nowPct >= pct : nowPct <= -pct) ? 'above' : 'below';
      const prev = prevStates[key];
      if (prev !== side) out.states.push({ key, state: side });
      if (prev === undefined || prev === side || side !== 'above') continue;
      const thresh = `${which === 'up' ? '+' : '−'}${trimPct(pct)}%`;
      out.firings.push({
        kind: 'threshold',
        ticker: pos.ticker,
        // The same words as the client's `thresh.fired` string, which was
        // written for this notification and never had a firer.
        title: {
          en: `${pos.ticker} crossed your ${thresh} alert (currently ${signedPct(nowPct)} from entry)`,
          he: `${pos.ticker} חצתה את ההתראה שלך של ${thresh} (כרגע ${signedPct(nowPct)} מנקודת הכניסה)`,
        },
        detail: { en: 'Personal threshold alert', he: 'התראת סף אישית' },
        dedupeKey: `${key}|${today}`,
      });
    }
  }
  return out;
}

// ── News rules: a keyword in fresh coverage ─────────────────────────────

/** How many articles one rule may fire for in one run. A busy news day is a list, not a flood. */
export const MAX_NEWS_FIRINGS_PER_RULE = 3;

/** The comma-separated keywords of a news rule, lowercased and trimmed. Empty means "any article about this stock". */
export function readKeywords(rule: AlertRule): string[] {
  return rule.value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== '');
}

export function newsRuleKey(rule: AlertRule): string {
  return `news|${rule.ticker}|${readKeywords(rule).join(',')}`;
}

/**
 * One news rule against the stock's latest articles.
 *
 * The state is the newest publication instant seen so far. The first check
 * records it and fires nothing — the alternative is ten notifications for
 * last week's coverage the moment a rule is created. From then on an
 * article fires if it is newer than that mark and, when the rule names
 * keywords, mentions one of them in its headline or excerpt.
 *
 * Only the stored mark decides "new": an article with no readable date
 * cannot be placed before or after it and is skipped rather than assumed
 * fresh.
 */
export function evaluateNewsRule(
  rule: AlertRule,
  articles: NewsArticle[],
  prev: string | undefined,
  now: Date,
): Evaluation {
  const key = newsRuleKey(rule);
  const dated = articles
    .map((a) => ({ a, at: Date.parse(a.publishedAt) }))
    .filter((x) => Number.isFinite(x.at))
    .sort((x, y) => y.at - x.at);
  const newest = dated.length > 0 ? dated[0].at : now.getTime();
  const mark = new Date(newest).toISOString();

  if (prev === undefined) return { firings: [], states: [{ key, state: mark }] };
  const since = Date.parse(prev);
  if (!Number.isFinite(since)) return { firings: [], states: [{ key, state: mark }] };

  const keywords = readKeywords(rule);
  const firings: Firing[] = [];
  for (const { a, at } of dated) {
    if (at <= since) break;
    const text = `${a.headline} ${a.summary}`.toLowerCase();
    const hit = keywords.length === 0 ? null : keywords.find((k) => text.includes(k));
    if (keywords.length > 0 && hit === undefined) continue;
    firings.push({
      kind: 'news',
      ticker: rule.ticker,
      title: { en: `${a.source}: ${a.headline}`, he: `${a.source}: ${a.headline}` },
      detail: hit
        ? { en: `News alert · matched "${hit}"`, he: `התראת חדשות · נמצא "${hit}"` }
        : { en: 'News alert', he: 'התראת חדשות' },
      dedupeKey: `news|${rule.ticker}|${a.url}`,
    });
    if (firings.length >= MAX_NEWS_FIRINGS_PER_RULE) break;
  }
  return { firings, states: newest > since ? [{ key, state: mark }] : [] };
}

// ── Earnings rules: a date on the calendar ──────────────────────────────

/**
 * One earnings reminder against the market-wide calendar, once a day.
 *
 * The calendar lists only reports that have not happened yet (see
 * _lib/alphavantage.ts), which shapes the three reminders:
 *
 *  - 'day' fires on the run the day before the report date;
 *  - 'morning' fires on the run of the report date itself;
 *  - 'lands' cannot read "it happened" from a feed that drops the row once
 *    it has. So on the report date the engine REMEMBERS the date, and the
 *    next day's run fires from that memory — the results were due the day
 *    before, and by the morning run both a pre-open and a post-close report
 *    are in. The wording says "was due to report", because that is what the
 *    engine knows; whether the numbers arrived is the earnings tab's to say.
 */
export function evaluateEarningsRule(
  rule: AlertRule,
  calendar: EarningsRow[],
  prev: string | undefined,
  today: string,
): Evaluation {
  const rows = calendar.filter((r) => r.ticker === rule.ticker);
  const on = (date: string) => rows.find((r) => r.reportDate === date);

  if (rule.remind === 'day') {
    const row = on(shiftDay(today, 1));
    return row ? { firings: [reminder(rule, row, 'tomorrow')], states: [] } : NOTHING;
  }
  if (rule.remind === 'morning') {
    const row = on(today);
    return row ? { firings: [reminder(rule, row, 'today')], states: [] } : NOTHING;
  }

  // 'lands'
  const key = `earn|${rule.ticker}|lands`;
  const dueToday = on(today);
  if (dueToday) return { firings: [], states: prev === today ? [] : [{ key, state: today }] };
  if (prev === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(prev) || prev >= today) return NOTHING;
  return {
    firings: [reminder(rule, { reportDate: prev, timing: null }, 'yesterday')],
    // Consumed: the memory has done its job. A dash cannot be a date, so the
    // next run reads it as "nothing pending" rather than firing again.
    states: [{ key, state: `done:${prev}` }],
  };
}

function reminder(
  rule: AlertRule,
  row: Pick<EarningsRow, 'reportDate' | 'timing'>,
  when: 'tomorrow' | 'today' | 'yesterday',
): Firing {
  const timingEn =
    row.timing === 'BMO' ? ' (before the open)' : row.timing === 'AMC' ? ' (after the close)' : '';
  const timingHe = row.timing === 'BMO' ? ' (לפני הפתיחה)' : row.timing === 'AMC' ? ' (אחרי הנעילה)' : '';
  const title: Bilingual =
    when === 'yesterday'
      ? { en: `${rule.ticker} was due to report yesterday`, he: `${rule.ticker} הייתה אמורה לפרסם דוח אתמול` }
      : when === 'today'
        ? { en: `${rule.ticker} reports today${timingEn}`, he: `${rule.ticker} מפרסמת דוח היום${timingHe}` }
        : {
            en: `${rule.ticker} reports tomorrow${timingEn}`,
            he: `${rule.ticker} מפרסמת דוח מחר${timingHe}`,
          };
  return {
    kind: 'earn',
    ticker: rule.ticker,
    title,
    detail: { en: 'Earnings reminder', he: 'תזכורת דוח' },
    dedupeKey: `earn|${rule.ticker}|${rule.remind}|${row.reportDate}`,
  };
}

// ── Delivery text ───────────────────────────────────────────────────────

/** What a push notification carries for one firing, in one language. */
export function pushPayload(
  firing: Firing,
  lang: 'en' | 'he',
): { title: string; body: string; ticker: string } {
  return { title: firing.title[lang], body: firing.detail[lang], ticker: firing.ticker };
}

// ── Small formatters and date helpers ───────────────────────────────────

/** `$1,234.56`. Locale-fixed on purpose: the same string in both languages, like the app's own `money()`. */
export function money(v: number): string {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `+27.1%` / `−3.4%`, with the typographic minus the app prints. */
export function signedPct(v: number): string {
  const s = `${Math.abs(v).toFixed(1)}%`;
  return v < 0 ? `−${s}` : `+${s}`;
}

/** A threshold as typed: `25` → `25`, `12.5` → `12.5`. */
function trimPct(v: number): string {
  return String(v);
}

/** The UTC calendar day of an instant, YYYY-MM-DD. */
export function isoDayUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `day` moved by `n` calendar days, YYYY-MM-DD in, YYYY-MM-DD out. */
export function shiftDay(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}
