import { Sheet } from '../components/Sheet';
import { Tag } from '../components/Tag';
import { Num } from '../components/Num';
import { Button } from '../components/Button';
import { useDispatch } from '../state/appState';
import { useT } from '../i18n/useT';
import { pct, signalColor } from '../lib/format';
import type { NewsItem } from '../data/types';

/**
 * The full story behind a news card, opened in place rather than jumping the
 * user to the stock page — tapping a headline is "read the article", not
 * "go look at the ticker". A button inside still offers that jump for anyone
 * who wants it.
 */
export function ArticleSheet({ item, onClose }: { item: NewsItem | null; onClose: () => void }) {
  const dispatch = useDispatch();
  const t = useT();

  return (
    <Sheet
      open={item != null}
      onClose={onClose}
      title={item?.ticker ?? ''}
      meta={
        item && (
          <>
            {item.source} · <Num>{item.time} ET</Num>
          </>
        )
      }
      maxHeight="82%"
    >
      {item && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Tag variant="accent" fontSize={15}>
              {item.tag}
            </Tag>
            <Num size={16} style={{ color: signalColor(item.changePct) }}>
              {pct(item.changePct)}
            </Num>
          </span>
          <span
            style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 19, lineHeight: 1.3 }}
          >
            {item.headline}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 17, lineHeight: 1.55 }}>
            {item.body.split('\n\n').map((para, i) => (
              <p key={i} style={{ margin: 0, whiteSpace: 'pre-line' }}>
                {para}
              </p>
            ))}
          </div>
          <Button
            variant="secondary"
            fontSize={16.5}
            alignSelf="flex-start"
            onClick={() => {
              dispatch({ type: 'openStock', ticker: item.ticker });
              onClose();
            }}
          >
            {t('news.viewTicker', { ticker: item.ticker })}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
