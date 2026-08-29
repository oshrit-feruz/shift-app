import { Card, CardTitle } from '../../components/Card';
import { DataState, EmptyState } from '../../components/DataState';
import { SkeletonCard } from '../../components/Skeleton';
import { Tag } from '../../components/Tag';
import { useT, type TFn } from '../../i18n/useT';
import { sentimentTag } from './sentimentTag';
import { useTheme } from '../../theme/ThemeProvider';
import { useDispatch } from '../../state/appState';
import { useLoadable } from '../../data/useLoadable';
import { fetchMarketNews, fetchStockNews, publishedAtMs } from '../../data/stockNews';
import { isoDate } from '../../lib/format';
import { ok, unavailable, type Loadable, type StockNewsArticle } from '../../data/types';

/**
 * Real headlines for the news screen — the general market feed, or the
 * stocks the user follows.
 *
 * WHY THE FEED IS NOT A FAN-OUT:
 * EODHD charges 5 API credits for the general feed and 10 per ticker, and its
 * `s` parameter takes one symbol at a time. So the market tab reads the one
 * general call, and only the watchlist tab fans out — where the per-stock
 * scoping is the entire point and the list is short.
 *
 * WHY CLICKING OPENS THE SOURCE:
 * The demo feed this replaced carried a full `body` and opened it in a sheet.
 * Real articles deliberately carry no body — /api/news returns a 1-2 sentence
 * excerpt only, for copyright reasons — so there is nothing to open in-app
 * and the card links out instead. Keeping the sheet would have meant either
 * an empty sheet or re-introducing the full text this whole path avoids.
 */
export function MarketFeed() {
  const { language } = useTheme();
  // `language` is a dependency, not just an argument: switching the app to
  // English must refetch, or the screen would keep showing the Hebrew
  // translation of a feed the user just asked to see in the source language.
  const news = useLoadable(() => fetchMarketNews(language), [language]);
  const t = useT();
  return <FeedBody state={news.state} onRetry={news.retry} emptyText={t('news.feedEmpty')} showTicker />;
}

/**
 * News for every ticker on the watchlist, merged into one reverse-chronological
 * feed.
 *
 * One request per stock, because upstream has no multi-symbol call. They run
 * concurrently and the whole set is treated as one Loadable: if every request
 * fails the feed is unavailable, but a partial failure still shows what did
 * arrive rather than blanking the screen over one bad ticker.
 */
export function WatchlistFeed({ tickers }: { tickers: string[] }) {
  const t = useT();
  const { language } = useTheme();
  // Sorted + joined so the effect re-runs when the set changes, not on every
  // render that happens to rebuild the array. The comparator is explicit:
  // bare .sort() coerces to string and compares UTF-16 code units, which is
  // unreliable in general — and here the key's stability is the whole point,
  // so leaving the ordering to a default is exactly the wrong trade.
  const key = [...tickers].sort((a, b) => a.localeCompare(b)).join(',');
  const news = useLoadable<StockNewsArticle[]>(() => fetchWatchlistNews(tickers, language), [key, language]);

  if (tickers.length === 0) {
    return (
      <Card padding={12} gap={8}>
        <EmptyState>{t('news.watchlistNone')}</EmptyState>
      </Card>
    );
  }
  return (
    <FeedBody
      state={news.state}
      onRetry={news.retry}
      emptyText={t('news.watchlistEmpty')}
      showTicker={false}
    />
  );
}

/**
 * Fan out over the watchlist and merge.
 *
 * Unavailable only when EVERY request failed — that is a real outage. If some
 * succeeded, the ones that did are shown: blanking a whole feed because one
 * ticker's request failed would hide real news the user could have read, and
 * an empty-but-successful ticker is a legitimate "no coverage" rather than an
 * error to propagate.
 */
export async function fetchWatchlistNews(
  tickers: string[],
  language: 'en' | 'he',
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<StockNewsArticle[]>> {
  if (tickers.length === 0) return ok([]);
  const results = await Promise.all(tickers.map((tk) => fetchStockNews(tk, language, fetchImpl)));
  const good = results.filter((r) => r.status === 'ok');
  if (good.length === 0) {
    return unavailable({
      en: 'News is unavailable right now.',
      he: 'החדשות אינן זמינות כרגע.',
    });
  }

  const seen = new Set<string>();
  const merged: StockNewsArticle[] = [];
  for (const r of good) {
    if (r.status !== 'ok') continue;
    for (const a of r.data) {
      // The same story often carries several tickers, so it comes back from
      // more than one request. De-duplicate by URL so it appears once.
      if (seen.has(a.url)) continue;
      seen.add(a.url);
      merged.push(a);
    }
  }
  // Newest first, by the instant each timestamp denotes rather than by its
  // text: these articles come from several requests and providers stamp
  // them with different UTC offsets, so a string comparison would order
  // them by how they were written instead of when they were published.
  // Articles with no usable date sort last rather than being dropped — the
  // headline is still real, only its timestamp is missing — and ties break
  // on URL so the order is stable rather than left to the sort's whim.
  merged.sort(
    (a, b) => publishedAtMs(b.publishedAt) - publishedAtMs(a.publishedAt) || a.url.localeCompare(b.url),
  );
  return ok(merged);
}

function FeedBody({
  state,
  onRetry,
  emptyText,
  showTicker,
}: {
  state: Loadable<StockNewsArticle[]>;
  onRetry: () => void;
  emptyText: string;
  showTicker: boolean;
}) {
  const t = useT();
  const { language } = useTheme();
  return (
    <DataState
      state={state}
      onRetry={onRetry}
      skeleton={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} height={118} padding={14} />
          ))}
        </div>
      }
    >
      {(articles) =>
        articles.length === 0 ? (
          <Card padding={12} gap={8}>
            <EmptyState>{emptyText}</EmptyState>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {articles.map((a) => (
              <ArticleCard
                key={a.url}
                article={a}
                language={language}
                showTicker={showTicker}
                openLabel={t('news.openSource')}
                t={t}
              />
            ))}
          </div>
        )
      }
    </DataState>
  );
}

function ArticleCard({
  article,
  language,
  showTicker,
  openLabel,
  t,
}: {
  article: StockNewsArticle;
  language: 'en' | 'he';
  showTicker: boolean;
  openLabel: string;
  t: TFn;
}) {
  const dispatch = useDispatch();
  // Only the general feed needs the chip — on the watchlist the user already
  // knows which stocks these are, and a chip per card would be noise.
  const ticker = showTicker ? article.symbols[0] : undefined;
  const date = article.publishedAt ? isoDate(article.publishedAt.slice(0, 10), language) : '';
  // Absent whenever the provider sent no score — no chip rather than a
  // guessed one. See sentimentTag.
  const tone = sentimentTag(article.sentiment);

  return (
    <Card padding={14} gap={5}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        {/* Absent for a story about a sector, an index or a rate decision —
            most market news is not about one company, and inventing a ticker
            to fill the slot would be a fabrication. */}
        {/* The chip is the way into the stock: tapping it opens that stock's
            page, the same `openStock` every other list in the app dispatches.
            It is deliberately the CHIP and not the whole card — the headline's
            job is to reach the full article at its source, since the excerpt
            is all this app is allowed to hold, and a card that did both would
            have to pick one on a tap. */}
        {ticker && (
          <Tag
            variant="accent"
            fontSize={15}
            onClick={() => dispatch({ type: 'openStock', ticker })}
            // The visible text is four letters; this says where they lead.
            label={t('news.viewTicker', { ticker })}
          >
            {ticker}
          </Tag>
        )}
        {tone && (
          <Tag variant={tone.variant} fontSize={15}>
            {t(tone.key)}
          </Tag>
        )}
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)', display: 'flex', gap: 5 }}>
          {article.source && <bdi>{article.source}</bdi>}
          {article.source && date && <span>·</span>}
          {date && <span>{date}</span>}
        </span>
      </span>
      {/* dir="auto" because this text's language is not fixed: the provider's
          feed is English, and in Hebrew it is served translated. Each string
          takes its direction from its own first strong character, so the
          sentence-ending period lands on the correct side either way — and
          still does if a translation falls back to the English original. */}
      <span
        dir="auto"
        style={{
          display: 'block',
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-row)',
          lineHeight: 1.3,
          whiteSpace: 'normal',
        }}
      >
        {article.headline}
      </span>
      {article.summary && (
        <span dir="auto" style={{ display: 'block', fontSize: 'var(--text-body)', opacity: 0.78, lineHeight: 1.45 }}>
          {article.summary}
        </span>
      )}
      {/* Two destinations, said plainly rather than left to a guess about what
          a tap does: the article lives at its source, the stock lives in this
          app. The chip above opens the same stock page; this is the version
          that reads as an action. */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 'var(--text-caption)', color: 'var(--color-accent-200)', textDecoration: 'none' }}
        >
          {openLabel} ↗
        </a>
        {ticker && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'openStock', ticker })}
            style={{
              // A link-shaped button: same affordance as the anchor beside it,
              // but it navigates inside the app rather than leaving it.
              background: 'none',
              border: 'none',
              padding: 0,
              fontFamily: 'inherit',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-accent-200)',
              cursor: 'pointer',
            }}
          >
            {t('news.viewTicker', { ticker })}
          </button>
        )}
      </span>
    </Card>
  );
}

/** Re-exported so the calendar tab can share the card title styling. */
export { CardTitle };
