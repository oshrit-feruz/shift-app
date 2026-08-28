import { Card, CardTitle } from '../../components/Card';
import { DataState, EmptyState } from '../../components/DataState';
import { SkeletonCard } from '../../components/Skeleton';
import { useT } from '../../i18n/useT';
import { useTheme } from '../../theme/ThemeProvider';
import { useLoadable } from '../../data/useLoadable';
import { fetchStockNews } from '../../data/stockNews';
import { isoDate } from '../../lib/format';
import type { StockNewsArticle } from '../../data/types';

/**
 * The "חדשות" tab: real headlines for one ticker, via this app's /api/news
 * function.
 *
 * Three states, kept genuinely distinct:
 * - unavailable → the provider failed; DataState renders the honest message
 *   with a retry.
 * - ok, empty   → a real answer meaning "no recent coverage". Rendered as an
 *   empty state, NOT an error: a quiet week for a stock is not a
 *   malfunction, and calling it one would train people to distrust a working
 *   screen.
 * - ok, articles → the real list, at whatever length the provider returned.
 *
 * Only the excerpt is ever rendered. The full article lives at its source and
 * is reached by the link — the /api/news function never sends a body, for
 * copyright reasons, so there is nothing here that could leak one.
 */
export function NewsTab({ ticker }: { ticker: string }) {
  const t = useT();
  const { language } = useTheme();
  const news = useLoadable(() => fetchStockNews(ticker), [ticker]);

  return (
    <DataState
      state={news.state}
      onRetry={news.retry}
      skeleton={<SkeletonCard height={210} lines={4} />}
    >
      {(articles) =>
        articles.length === 0 ? (
          <Card padding={12} gap={8}>
            <CardTitle>{t('stock.tabNews')}</CardTitle>
            <EmptyState>{t('stock.newsEmpty')}</EmptyState>
          </Card>
        ) : (
          <Card padding={12} gap={8}>
            <CardTitle>{t('stock.tabNews')}</CardTitle>
            {articles.map((a) => (
              <Article key={a.url} article={a} language={language} readLabel={t('stock.newsRead')} />
            ))}
            <p className="text-muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '2px 0 0' }}>
              {t('stock.newsExcerptNote')}
            </p>
          </Card>
        )
      }
    </DataState>
  );
}

/** Published date rendered from the provider's ISO timestamp, or '' if it
 *  sent something unparseable — an absent date is left absent rather than
 *  guessed at. */
function publishedLabel(publishedAt: string, language: 'en' | 'he'): string {
  if (!publishedAt) return '';
  // The provider sends a full ISO timestamp; isoDate wants the date part,
  // and returns its input unchanged if that is not a real calendar date.
  return isoDate(publishedAt.slice(0, 10), language);
}

function Article({
  article,
  language,
  readLabel,
}: {
  article: StockNewsArticle;
  language: 'en' | 'he';
  readLabel: string;
}) {
  const published = publishedLabel(article.publishedAt, language);

  return (
    <div style={{ paddingTop: 8, borderTop: '1px solid var(--color-divider)' }}>
      {/* Source and date are separate elements rather than one joined string:
          the source is a Latin name and the Hebrew date carries numerals, so
          a single mixed run gets reordered by bidi and renders as
          "2026 באוג׳ Reuters · 26". Isolating the source keeps each part
          intact and the separator where it was written. */}
      {(article.source || published) && (
        <div className="text-muted" style={{ fontSize: 12.5, display: 'flex', gap: 5 }}>
          {article.source && <bdi>{article.source}</bdi>}
          {article.source && published && <span>·</span>}
          {published && <span>{published}</span>}
        </div>
      )}
      {/* dir="auto" on the provider's own text: headlines and summaries come
          from an English-language feed into a Hebrew-first page, and without
          it the paragraph's RTL context throws the sentence-ending period to
          the wrong side (".in ahead of consensus"). Auto lets each string
          take its direction from its own first strong character, so an
          English article reads as English and a Hebrew one would read as
          Hebrew. */}
      <div
        dir="auto"
        style={{
          fontSize: 13.5,
          fontFamily: 'var(--font-heading)',
          marginTop: 4,
          lineHeight: 1.35,
          whiteSpace: 'normal',
        }}
      >
        {article.headline}
      </div>
      {article.summary && (
        <p dir="auto" style={{ fontSize: 13, margin: '3px 0 0', opacity: 0.76, lineHeight: 1.45 }}>
          {article.summary}
        </p>
      )}
      <a
        href={article.url}
        target="_blank"
        // noopener/noreferrer because these are third-party links opened in a
        // new tab: without it the opened page gets a handle on this one.
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          marginTop: 5,
          fontSize: 12.5,
          color: 'var(--color-accent-200)',
          textDecoration: 'none',
        }}
      >
        {readLabel} ↗
      </a>
    </div>
  );
}
