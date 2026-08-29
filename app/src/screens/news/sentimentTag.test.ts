import { describe, it, expect } from 'vitest';
import { sentimentTag } from './sentimentTag';
import { STRINGS } from '../../i18n/strings';

describe('sentimentTag', () => {
  it('uses the app’s existing up/down colours for a scored story', () => {
    expect(sentimentTag('positive')).toEqual({ variant: 'up', key: 'news.sentimentPositive' });
    expect(sentimentTag('negative')).toEqual({ variant: 'down', key: 'news.sentimentNegative' });
    expect(sentimentTag('neutral')).toEqual({ variant: 'neutral', key: 'news.sentimentNeutral' });
  });

  // No tag rather than a "neutral" one: the provider ships sentiment on some
  // plans and some rows only, so an unscored story is one we were told nothing
  // about — not one that was scored and found neutral.
  it('shows nothing at all when the provider sent no score', () => {
    expect(sentimentTag(null)).toBeNull();
  });

  it('has a label in both languages, since the tag is user-facing copy', () => {
    for (const s of ['positive', 'negative', 'neutral'] as const) {
      const tag = sentimentTag(s);
      expect(tag).not.toBeNull();
      if (!tag) continue;
      expect(STRINGS[tag.key].en).not.toBe('');
      expect(STRINGS[tag.key].he).not.toBe('');
      // The Hebrew label must actually be Hebrew: a copy-paste of the English
      // would pass a "not empty" check and ship an untranslated chip.
      expect(STRINGS[tag.key].he).toMatch(/[֐-׿]/);
    }
  });
});
