import { Card, CardTitle } from '../../components/Card';
import { DataState, EmptyState } from '../../components/DataState';
import { SkeletonCard } from '../../components/Skeleton';
import { Tag } from '../../components/Tag';
import { useT, type TFn } from '../../i18n/useT';
import { sentimentTag } from '../news/sentimentTag';
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
  // `language` is a dependency as well as an argument: the headlines come
  // back translated, so switching language must refetch rather than leave the
  // previous language's text on screen.
  const news = useLoadable(() => fetchStockNews(ticker, language), [ticker, language]);

  return (
    <DataState state={news.state} onRetry={news.retry} skeleton={<SkeletonCard height={210} lines={4} />}>
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
              <Article key={a.url} article={a} language={language} readLabel={t('stock.newsRead')} t={t} />
            ))}
            <p
              className="text-muted"
              style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5, margin: '2px 0 0' }}
            >
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
  t,
}: {
  article: StockNewsArticle;
  language: 'en' | 'he';
  readLabel: string;
  t: TFn;
}) {
  const published = publishedLabel(article.publishedAt, language);
  // The provider's tone score, or nothing at all when it did not send one.
  const tone = sentimentTag(article.sentiment);

  return (
    <div style={{ paddingTop: 8, borderTop: '1px solid var(--color-divider)' }}>
      {/* Source and date are separate elements rather than one joined string:
          the source is a Latin name and the Hebrew date carries numerals, so
          a single mixed run gets reordered by bidi and renders as
          "2026 באוג׳ Reuters · 26". Isolating the source keeps each part
          intact and the separator where it was written. */}
      {(article.source || published || tone) && (
        <div
          className="text-muted"
          style={{
            fontSize: 'var(--text-caption)',
            display: 'flex',
            gap: 5,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {article.source && <bdi>{article.source}</bdi>}
          {article.source && published && <span>·</span>}
          {published && <span>{published}</span>}
          {tone && (
            <Tag variant={tone.variant} fontSize={14.5}>
              {t(tone.key)}
            </Tag>
          )}
        </div>
      )}
      {/* dir="auto" on the provider's own text: headlines and summaries come
          from an English-language feed, translated to Hebrew when the app is
          in Hebrew — and left in English if that translation was unavailable.
          So the language of this string is not fixed, and without dir="auto"
          the paragraph's RTL context throws the sentence-ending period to the
          wrong side (".in ahead of consensus"). Auto lets each string take its
          direction from its own first strong character, so an English article
          reads as English and a Hebrew one as Hebrew. */}
      <div
        dir="auto"
        style={{
          fontSize: 'var(--text-body)',
          fontFamily: 'var(--font-heading)',
          marginTop: 4,
          lineHeight: 1.35,
          whiteSpace: 'normal',
        }}
      >
        {article.headline}
      </div>
      {article.summary && (
        <p
          dir="auto"
          style={{ fontSize: 'var(--text-body)', margin: '3px 0 0', opacity: 0.76, lineHeight: 1.45 }}
        >
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
          fontSize: 'var(--text-caption)',
          color: 'var(--color-accent-200)',
          textDecoration: 'none',
        }}
      >
        {readLabel} ↗
      </a>
    </div>
  );
}
