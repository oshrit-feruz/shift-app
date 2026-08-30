import type { TagVariant } from '../../components/Tag';
import type { StringKey } from '../../i18n/strings';
import type { NewsSentiment } from '../../data/types';

/**
 * How a story's tone is shown: which Tag colour, and which bilingual label.
 *
 * Shared by the news feed and a stock page's news tab so the two cannot drift
 * into showing the same score in different words or colours.
 *
 * Returns null when the provider sent no score. That is not an oversight to
 * paper over with a "neutral" chip: EODHD ships sentiment on some plans and
 * some rows only, and a tag reading "ניטרלי" would be this app claiming the
 * story was scored and found neutral. No tag says the true thing — we were
 * not told — and costs the reader nothing.
 *
 * The colours are the app's existing up/down semantics rather than new ones,
 * so a positive story reads the same green as a rising price everywhere else.
 */
export function sentimentTag(
  sentiment: NewsSentiment | null,
): { variant: TagVariant; key: StringKey } | null {
  switch (sentiment) {
    case 'positive':
      return { variant: 'up', key: 'news.sentimentPositive' };
    case 'negative':
      return { variant: 'down', key: 'news.sentimentNegative' };
    case 'neutral':
      return { variant: 'neutral', key: 'news.sentimentNeutral' };
    default:
      return null;
  }
}
