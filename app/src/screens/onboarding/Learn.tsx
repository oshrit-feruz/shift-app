import { useState } from 'react';
import { Button } from '../../components/Button';
import { Chip, ChipRail } from '../../components/Chip';
import { useDispatch } from '../../state/appState';
import { useTheme } from '../../theme/ThemeProvider';
import { useT } from '../../i18n/useT';
import type { ScreenProps } from '../../App';

const PAGES = [
  { chip: { en: 'Share', he: 'מנייה' }, title: { en: 'A share is a slice of a company', he: 'מנייה היא פרוסה מחברה' }, body: { en: 'Own one share and you own a very small piece of a real business. If the business does better over the years, the piece is usually worth more.', he: 'מי שמחזיק מנייה אחת מחזיק חלק קטנטן בעסק אמיתי. אם העסק מרוויח יותר עם השנים, החלק הזה בדרך כלל שווה יותר.' } },
  { chip: { en: 'Swings', he: 'תנודות' }, title: { en: 'Daily moves say almost nothing', he: 'תנודות יומיות כמעט לא אומרות כלום' }, body: { en: 'Green and red days are noise. What matters is the direction across months and years, and that line is much calmer.', he: 'ימים אדומים וירוקים הם רעש. מה שחשוב זה הכיוון על פני חודשים ושנים, והקו הזה הרבה יותר רגוע.' } },
  { chip: { en: 'Spread', he: 'פיזור' }, title: { en: 'Never put it all in one place', he: 'לא לשים הכול במקום אחד' }, body: { en: 'If everything you own does the same thing, one bad quarter hits all of it. Several unrelated companies means no single mistake decides your result.', he: 'אם כל מה שאת מחזיקה עושה את אותו דבר, רבעון גרוע אחד פוגע בהכול. כמה חברות שאינן קשורות זו לזו — וטעות אחת לא קובעת את התוצאה.' } },
  { chip: { en: 'Time', he: 'זמן' }, title: { en: 'Time does most of the work', he: 'הזמן עושה את רוב העבודה' }, body: { en: 'Gains earn their own gains. Slow at first, then fast — which is why money you might need next year should not be here.', he: 'רווחים מייצרים רווחים משל עצמם. לאט בהתחלה, ואז מהר — ולכן כסף שאולי תצטרכי בשנה הקרובה לא אמור להיות פה.' } },
  { chip: { en: 'Mistakes', he: 'טעויות' }, title: { en: 'Being wrong is part of it', he: 'לטעות זה חלק מהעניין' }, body: { en: 'Everyone is wrong sometimes. The trick is keeping each position small enough that it never really hurts.', he: 'כולם טועים לפעמים. הטריק הוא להשאיר כל פוזיציה קטנה מספיק כדי שהטעות לא תכאב באמת.' } },
  { chip: { en: 'ETF', he: 'קרן סל' }, title: { en: 'An ETF buys the whole basket', he: 'קרן סל קונה את כל הסל' }, body: { en: 'A קרן סל / ETF is one thing you buy that holds hundreds of companies at once. One purchase, instantly spread out — which is why most people start here rather than picking single names.', he: 'קרן סל (ETF) היא דבר אחד שקונים והוא מחזיק מאות חברות בבת אחת. קנייה אחת, פיזור מיידי — ולכן רוב האנשים מתחילים כאן ולא בבחירת מניות בודדות.' } },
  { chip: { en: 'Safety', he: 'ביטחון' }, title: { en: 'What "safe" actually means', he: 'מה זה באמת "בטוח"' }, body: { en: 'Not a promise of no losses. It means money you need soon stays in cash, the bulk sits in broad ETFs, and single stocks are the small slice on top.', he: 'זו לא הבטחה שלא תהיה הפסד. זה אומר שכסף שתצטרכי בקרוב נשאר במזומן, עיקר הכסף יושב בקרנות סל רחבות, ומניות בודדות הן הפרוסה הקטנה שמעל.' } },
  { chip: { en: 'Glossary', he: 'מילון' }, title: { en: 'Words you will keep seeing', he: 'מילים שתראי שוב ושוב' }, body: { en: 'Short definitions for the words the app uses everywhere.', he: 'הגדרות קצרות למילים שהאפליקציה משתמשת בהן בכל מקום.' } },
];

const GLOSSARY = {
  en: [
    ['Ticker', 'A company’s short code — NVDA is NVIDIA.'],
    ['Portfolio', 'Everything you hold, seen together.'],
    ['Watchlist', 'Companies you follow without owning.'],
    ['Earnings', 'The quarterly report card.'],
    ['Dividend', 'Cash some companies pay you for holding.'],
    ['ETF', 'One purchase that holds many companies (קרן סל).'],
    ['Alert', 'A nudge when something you chose happens.'],
  ],
  he: [
    ['טיקר', 'הקוד הקצר של חברה — NVDA היא NVIDIA.'],
    ['תיק', 'כל מה שאת מחזיקה, במקום אחד.'],
    ['ווטצ׳ליסט', 'חברות שאת עוקבת אחריהן בלי להחזיק.'],
    ['דוחות', 'הדוח הרבעוני של החברה.'],
    ['דיבידנד', 'מזומן שחברות מסוימות משלמות למחזיקים.'],
    ['קרן סל', 'קנייה אחת שמחזיקה הרבה חברות (ETF).'],
    ['התראה', 'הודעה כשקורה משהו שבחרת.'],
  ],
} as const;

/** Learning library — always accessible, never gated; each card stands alone.
 *  Simple token-drawn illustrations per topic (visual-first for beginners). */
export function LearnScreen(_: ScreenProps) {
  const dispatch = useDispatch();
  const { language } = useTheme();
  const t = useT();
  const [idx, setIdx] = useState(0);
  const page = PAGES[idx];
  const isGlossary = idx === PAGES.length - 1;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          background: 'var(--color-surface)',
          padding: 12,
          borderRadius: 'var(--radius-md)',
        }}
      >
        <span className="text-muted" style={{ fontSize: 'var(--fs-xs)', flex: 1 }}>
          {t('learn.sub')}
        </span>
        <Button variant="ghost" fontSize={14} onClick={() => dispatch({ type: 'go', screen: 'home' })}>
          ✕
        </Button>
      </div>

      <ChipRail>
        {PAGES.map((p, i) => (
          <Chip key={i} active={i === idx} onClick={() => setIdx(i)}>
            {p.chip[language]}
          </Chip>
        ))}
      </ChipRail>

      {isGlossary ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {GLOSSARY[language].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 11, alignItems: 'baseline' }}>
              <span style={{ width: 82, flex: 'none', fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)' }}>{k}</span>
              <span style={{ flex: 1, fontSize: 'var(--fs-sm)', opacity: 0.82, lineHeight: 1.45 }}>{v}</span>
            </div>
          ))}
        </div>
      ) : (
        <TopicArt idx={idx} />
      )}

      <div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--fs-2xl)', lineHeight: 1.25, whiteSpace: 'normal' }}>{page.title[language]}</div>
        <p style={{ fontSize: 'var(--fs-md)', lineHeight: 1.55, margin: '9px 0 0', opacity: 0.85 }}>{page.body[language]}</p>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        {idx > 0 && (
          <Button variant="secondary" minHeight={44} onClick={() => setIdx(idx - 1)}>
            {t('tour.back')}
          </Button>
        )}
        <Button
          minHeight={44}
          style={{ flex: 1 }}
          onClick={() => (idx >= PAGES.length - 1 ? dispatch({ type: 'go', screen: 'steps' }) : setIdx(idx + 1))}
        >
          {idx === PAGES.length - 1 ? t('learn.showMe') : t('learn.next')}
        </Button>
      </div>

      <Button
        variant="ghost"
        alignSelf="center"
        fontSize={13}
        onClick={() => dispatch({ type: 'advGoto', screen: 'advConnect', solo: true })}
      >
        {t('learn.openAccount')}
      </Button>
    </div>
  );
}

/** Per-topic illustration, drawn from tokens (ported from the prototype). */
function TopicArt({ idx }: { idx: number }) {
  const common = { width: '100%', height: 150 } as const;
  switch (idx) {
    case 0:
      return (
        <svg viewBox="0 0 300 150" style={common} aria-hidden="true">
          <circle cx="120" cy="75" r="58" fill="var(--color-accent-900)" stroke="var(--color-accent)" strokeWidth="1.5" />
          <path d="M120 75 L120 17 A58 58 0 0 1 170 46 Z" fill="var(--color-accent)" transform="translate(9 -7)" />
        </svg>
      );
    case 1:
      return (
        <svg viewBox="0 0 300 150" style={common} aria-hidden="true">
          <path d="M12 108 L34 92 L52 118 L74 84 L96 104 L118 70 L140 96 L162 62 L184 82 L206 50 L228 68 L250 38 L272 52" fill="none" stroke="var(--muted)" strokeWidth="1.6" />
          <path d="M12 112 L272 44" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 2:
      return (
        <svg viewBox="0 0 300 150" style={common} aria-hidden="true">
          <circle cx="70" cy="75" r="42" fill="var(--down)" opacity=".28" stroke="var(--down)" strokeWidth="1.5" />
          <circle cx="180" cy="46" r="17" fill="var(--color-accent-900)" stroke="var(--color-accent)" />
          <circle cx="222" cy="46" r="17" fill="var(--color-accent-900)" stroke="var(--color-accent)" />
          <circle cx="180" cy="88" r="17" fill="var(--down)" opacity=".3" stroke="var(--down)" />
          <circle cx="222" cy="88" r="17" fill="var(--color-accent-900)" stroke="var(--color-accent)" />
        </svg>
      );
    case 3:
      return (
        <svg viewBox="0 0 300 150" style={common} aria-hidden="true">
          <rect x="24" y="104" width="46" height="24" rx="4" fill="var(--color-accent)" opacity=".45" />
          <rect x="94" y="80" width="46" height="48" rx="4" fill="var(--color-accent)" opacity=".65" />
          <rect x="164" y="42" width="46" height="86" rx="4" fill="var(--color-accent)" opacity=".85" />
          <rect x="234" y="16" width="46" height="112" rx="4" fill="var(--acc-lite)" />
        </svg>
      );
    case 4:
      return (
        <svg viewBox="0 0 300 150" style={common} aria-hidden="true">
          <rect x="20" y="40" width="118" height="70" rx="8" fill="var(--color-accent-900)" stroke="var(--color-accent)" strokeWidth="1.5" />
          <rect x="162" y="40" width="118" height="70" rx="8" fill="none" stroke="var(--down)" strokeWidth="1.5" strokeDasharray="5 4" />
        </svg>
      );
    case 5:
      return (
        <svg viewBox="0 0 300 150" style={common} aria-hidden="true">
          <rect x="14" y="30" width="112" height="94" rx="12" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
          {[56, 82, 106].map((cy, r) =>
            [42, 70, 98].map((cx, c) => (
              <circle key={`${r}${c}`} cx={cx} cy={cy} r="9" fill={(r + c) % 2 ? 'var(--acc-lite)' : 'var(--color-accent)'} opacity={0.5 + ((r + c) % 4) * 0.12} />
            )),
          )}
          <path d="M136 77 L166 77" stroke="var(--muted)" strokeWidth="1.5" />
          <path d="M160 71 L168 77 L160 83" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 300 150" style={common} aria-hidden="true">
          <rect x="30" y="106" width="240" height="26" rx="6" fill="var(--up)" opacity=".55" />
          <rect x="60" y="70" width="180" height="26" rx="6" fill="var(--color-accent)" opacity=".7" />
          <rect x="96" y="34" width="108" height="26" rx="6" fill="var(--acc-lite)" opacity=".85" />
        </svg>
      );
  }
}
