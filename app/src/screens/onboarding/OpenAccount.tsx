import { useState } from 'react';
import { Card, CardTitle } from '../../components/Card';
import { Button } from '../../components/Button';
import { Num } from '../../components/Num';
import { Chip } from '../../components/Chip';
import { SegmentDots } from '../../components/Progress';
import { useDispatch } from '../../state/appState';
import { useTheme } from '../../theme/ThemeProvider';
import { useT } from '../../i18n/useT';
import type { ScreenProps } from '../../App';

const OPEN = {
  en: [
    [
      'Where will the account live?',
      'You open an investment account with a broker — a company licensed to hold your shares. Three routes, and none of them is wrong.',
    ],
    [
      'What you need in hand',
      'Opening takes about fifteen minutes online once you have these four. Tick them off as you find them.',
    ],
    [
      'Which kind of account',
      'Brokers offer a plain account and, in most countries, at least one with a tax benefit attached.',
    ],
    [
      'Move some money in',
      'Start with an amount you would not miss. You can always add later, and the first transfer is mostly about proving the pipes work.',
    ],
    [
      'Your first purchase',
      'This is the part people overthink. For a first buy, broad usually beats clever.',
    ],
  ],
  he: [
    [
      'איפה החשבון ייפתח?',
      'חשבון השקעות נפתח אצל ברוקר — חברה עם רישיון להחזיק את הניירות שלך. שלושה מסלולים, ואף אחד מהם לא שגוי.',
    ],
    [
      'מה צריך להכין',
      'הפתיחה עצמה לוקחת כרבע שעה אונליין, אחרי שארבעת הדברים האלה מוכנים. סמני כל אחד כשהוא בידיים.',
    ],
    ['איזה סוג חשבון', 'לכל ברוקר יש חשבון רגיל, ובדרך כלל גם חשבון אחד לפחות עם הטבת מס.'],
    [
      'להעביר כסף פנימה',
      'התחילי בסכום שלא יחסר לך. אפשר להוסיף בכל רגע, וההעברה הראשונה בעיקר מוכיחה שהצינור עובד.',
    ],
    ['הקנייה הראשונה', 'זה החלק שאנשים מסבכים. לקנייה ראשונה, רחב עדיף על מתוחכם.'],
  ],
} as const;

const KINDS = {
  en: [
    [
      'bank',
      'Through your bank',
      'Simplest, usually the highest fees. Fine if you value one login for everything.',
    ],
    ['global', 'A global broker', 'Cheapest for buying shares and ETFs abroad. More forms to fill in once.'],
    ['app', 'An investing app', 'Quickest to open, smallest selection. Check what it charges when you sell.'],
  ],
  he: [
    ['bank', 'דרך הבנק שלך', 'הפשוט ביותר, בדרך כלל גם היקר ביותר. מתאים אם חשוב לך הכול בחשבון אחד.'],
    ['global', 'ברוקר בינלאומי', 'הזול ביותר לקניית מניות וקרנות סל בחו״ל. יותר טפסים, פעם אחת.'],
    ['app', 'אפליקציית השקעות', 'הפתיחה הכי מהירה, הבחירה הכי קטנה. בדקי מה העלות כשמוכרים.'],
  ],
} as const;

const DOCS = {
  en: [
    ['id', 'Photo ID', 'Passport or national ID card'],
    ['bank', 'Bank account details', 'The account the money will come from'],
    ['tax', 'Tax number', 'Your national tax or social ID'],
    ['addr', 'Proof of address', 'A recent bill or bank statement'],
  ],
  he: [
    ['id', 'תעודה מזהה', 'דרכון או תעודת זהות'],
    ['bank', 'פרטי חשבון בנק', 'החשבון שממנו יגיע הכסף'],
    ['tax', 'מספר תיק במס', 'מספר זהות או תיק מס'],
    ['addr', 'אישור כתובת', 'חשבון או דף בנק עדכני'],
  ],
} as const;

const ACCTS = {
  en: [
    ['plain', 'A regular investment account', 'No limits, no lock-in. You pay tax on gains when you sell.'],
    [
      'tax',
      'A tax-advantaged account',
      'Lower or deferred tax, in exchange for rules about when you can take the money out. Worth asking your broker which ones you qualify for.',
    ],
  ],
  he: [
    ['plain', 'חשבון השקעות רגיל', 'בלי הגבלות ובלי נעילה. מס על הרווח משולם בעת המכירה.'],
    [
      'tax',
      'חשבון עם הטבת מס',
      'מס נמוך או נדחה, בתמורה לכללים לגבי מתי אפשר להוציא את הכסף. שווה לשאול את הברוקר לאיזה חשבון את זכאית.',
    ],
  ],
} as const;

const BUYS = {
  en: [
    [
      'etf',
      'A broad ETF',
      'One purchase, hundreds of companies. The usual first buy, and the one that needs no opinion about any single business.',
    ],
    [
      'stock',
      'A single company',
      'Fine in small size once you understand that one bad quarter is all of it.',
    ],
  ],
  he: [
    [
      'etf',
      'קרן סל רחבה',
      'קנייה אחת, מאות חברות. הקנייה הראשונה המקובלת, וזו שלא דורשת דעה על אף עסק מסוים.',
    ],
    ['stock', 'חברה בודדת', 'בסדר גמור בסכום קטן, ברגע שברור שרבעון גרוע אחד הוא כל ההשקעה.'],
  ],
} as const;

/** The interactive 5-step "open an account" guide (educational — the actual
 *  opening is a referral to the broker). */
export function OpenAccountScreen(_: ScreenProps) {
  const dispatch = useDispatch();
  const { language } = useTheme();
  const t = useT();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState('global');
  const [docs, setDocs] = useState<Record<string, boolean>>({});
  const [acct, setAcct] = useState('plain');
  const [fund, setFund] = useState(250);
  const [firstBuy, setFirstBuy] = useState('etf');
  const [title, body] = OPEN[language][step];
  const docsReady = Object.values(docs).filter(Boolean).length;

  const pickStyle = (on: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    padding: 15,
    borderRadius: 'var(--radius-md)',
    textAlign: 'start',
    font: 'inherit',
    color: 'inherit',
    cursor: 'pointer',
    background: on ? 'var(--fill-selected)' : 'var(--color-surface)',
    border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-divider)'}`,
  });

  return (
    <div
      className="anim-fade-up"
      style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}
    >
      <SegmentDots total={5} current={step} />
      <div>
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-heading)',
            lineHeight: 1.25,
            marginTop: 5,
            whiteSpace: 'normal',
          }}
        >
          {title}
        </div>
        <p style={{ fontSize: 'var(--text-row)', lineHeight: 1.55, margin: '8px 0 0', opacity: 0.85 }}>
          {body}
        </p>
      </div>

      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {KINDS[language].map(([k, name, note]) => (
            <button key={k} type="button" style={pickStyle(kind === k)} onClick={() => setKind(k)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <RadioDot on={kind === k} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>{name}</span>
                  <span
                    className="text-muted"
                    style={{ display: 'block', fontSize: 'var(--text-body)', marginTop: 2 }}
                  >
                    {note}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DOCS[language].map(([k, name, note]) => {
            const on = !!docs[k];
            return (
              <button
                key={k}
                type="button"
                style={{ ...pickStyle(on), display: 'flex', alignItems: 'center', gap: 10 }}
                onClick={() => setDocs({ ...docs, [k]: !on })}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    flex: 'none',
                    borderRadius: 6,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 'var(--text-body)',
                    border: `1px solid ${on ? 'transparent' : 'var(--color-divider)'}`,
                    background: on ? 'var(--color-accent)' : 'transparent',
                    color: 'var(--g2)',
                  }}
                >
                  {on ? '✓' : ''}
                </span>
                <span style={{ flex: 1, textAlign: 'start' }}>
                  <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>{name}</span>
                  <span
                    className="text-muted"
                    style={{ display: 'block', fontSize: 'var(--text-body)', marginTop: 2 }}
                  >
                    {note}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="text-muted" style={{ fontSize: 'var(--text-body)' }}>
            {t('open.docsReady', { n: docsReady })}
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ACCTS[language].map(([k, name, note]) => (
            <button key={k} type="button" style={pickStyle(acct === k)} onClick={() => setAcct(k)}>
              <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>{name}</span>
              <span
                className="text-muted"
                style={{ display: 'block', fontSize: 'var(--text-body)', marginTop: 3, lineHeight: 1.45 }}
              >
                {note}
              </span>
            </button>
          ))}
        </div>
      )}

      {step === 3 && (
        <Card padding={16} gap={10}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <Num size={31} style={{ fontFamily: 'var(--font-heading)' }}>
              {'$' + fund.toLocaleString('en-US')}
            </Num>
            <span className="text-muted" style={{ fontSize: 'var(--text-body)' }}>
              {t('open.toStart')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {[100, 250, 1000, 5000].map((v) => (
              <Chip key={v} active={fund === v} onClick={() => setFund(v)}>
                <Num>{'$' + v.toLocaleString('en-US')}</Num>
              </Chip>
            ))}
          </div>
          <svg viewBox="0 0 300 60" style={{ width: '100%', height: 56 }} aria-hidden="true">
            <rect x="0" y="26" width="300" height="8" rx="4" fill="var(--line)" />
            <rect x="0" y="26" width={(fund / 5000) * 300} height="8" rx="4" fill="var(--color-accent)" />
            <text x="0" y="52" fill="var(--muted)" fontSize="14">
              {t('open.smallFine')}
            </text>
            <text x="300" y="52" textAnchor="end" fill="var(--muted)" fontSize="14">
              {t('open.moreLater')}
            </text>
          </svg>
          <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0 }}>
            {language === 'he'
              ? 'העברה בנקאית נכנסת בדרך כלל בתוך יום עד שלושה ימי עסקים. כסף שיושב בחשבון הוא עדיין שלך ועדיין לא מושקע, עד שתקני משהו.'
              : 'A bank transfer usually lands in one to three working days. Money sitting in the account is still yours and still uninvested until you buy something.'}
          </p>
        </Card>
      )}

      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {BUYS[language].map(([k, name, note]) => (
            <button key={k} type="button" style={pickStyle(firstBuy === k)} onClick={() => setFirstBuy(k)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <RadioDot on={firstBuy === k} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>{name}</span>
                  <span
                    className="text-muted"
                    style={{ display: 'block', fontSize: 'var(--text-body)', marginTop: 2, lineHeight: 1.45 }}
                  >
                    {note}
                  </span>
                </span>
              </span>
            </button>
          ))}
          <Card padding={14} gap={6} style={{ marginTop: 2 }}>
            <CardTitle size={17}>
              {language === 'he' ? 'מה קורה אחרי שלוחצים קנייה' : 'What happens after you press buy'}
            </CardTitle>
            <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0, lineHeight: 1.5 }}>
              {language === 'he'
                ? 'הפקודה מתבצעת בשניות בשעות המסחר. תראי אותה בפוזיציות, ומשם התפקיד היחיד הוא לא לגעת.'
                : 'The order fills in seconds during market hours. You will see it in your positions, and from then on the only job is leaving it alone.'}
            </p>
          </Card>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {step > 0 && (
          <Button variant="secondary" minHeight={48} fontSize={17} onClick={() => setStep(step - 1)}>
            {t('nav.back')}
          </Button>
        )}
        <Button
          style={{ flex: 1 }}
          minHeight={48}
          fontSize={17}
          onClick={() => {
            if (step >= 4) {
              dispatch({ type: 'stepDone', key: 'open', done: true });
              dispatch({ type: 'go', screen: 'steps' });
            } else setStep(step + 1);
          }}
        >
          {step === 4 ? t('open.ready') : t('learn.next')}
        </Button>
      </div>
      <Button
        variant="ghost"
        alignSelf="center"
        fontSize={16}
        onClick={() => dispatch({ type: 'go', screen: 'learn' })}
      >
        {t('open.backToGuide')}
      </Button>
    </div>
  );
}

function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        flex: 'none',
        borderRadius: '50%',
        border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-divider)'}`,
        background: on ? 'var(--color-accent)' : 'transparent',
      }}
    />
  );
}
