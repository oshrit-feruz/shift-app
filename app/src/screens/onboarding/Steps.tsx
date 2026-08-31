import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useAppState, useDispatch, type Screen } from '../../state/appState';
import { useTheme } from '../../theme/ThemeProvider';
import { useT } from '../../i18n/useT';
import type { ScreenProps } from '../../App';

interface Step {
  key: string;
  target: Screen;
  solo?: boolean;
  title: { en: string; he: string };
  how: { en: string; he: string };
  cta: { en: string; he: string };
}

const STEPS: Step[] = [
  {
    key: 'view',
    target: 'more',
    title: { en: 'Choose how much detail you see', he: 'לבחור כמה פירוט את רואה' },
    how: {
      en: 'You are in Beginner mode: plain language, one idea per card. Settings switches to Advanced whenever you are curious.',
      he: 'את במצב מתחילים: שפה פשוטה, רעיון אחד לכל כרטיס. בהגדרות עוברים למקצועי מתי שתרצי.',
    },
    cta: { en: 'Compare the two modes', he: 'להשוות בין שני המצבים' },
  },
  {
    key: 'watch',
    target: 'watch',
    title: { en: 'Follow three companies you know', he: 'לעקוב אחרי שלוש חברות שאת מכירה' },
    how: {
      en: 'Pick businesses you already use — your phone, your bank, the shop you buy from. Watching them costs nothing and teaches you how prices behave.',
      he: 'תבחרי עסקים שאת כבר משתמשת בהם — הטלפון, הבנק, החנות. מעקב לא עולה כלום ומלמד איך מחירים מתנהגים.',
    },
    cta: { en: 'Open the watchlist', he: 'לפתוח את הווטצ׳ליסט' },
  },
  {
    key: 'news',
    target: 'news',
    title: { en: 'Read why one of them moved', he: 'לקרוא למה אחת מהן זזה' },
    how: {
      en: 'Open a company and read the two or three headlines under the chart. Soon you will spot which news matters and which is noise.',
      he: 'תפתחי חברה ותקראי את שתי-שלוש הכותרות מתחת לגרף. עוד מעט תזהי מה חשוב ומה רעש.',
    },
    cta: { en: 'Open the news feed', he: 'לפתוח את החדשות' },
  },
  {
    key: 'learn',
    target: 'learn',
    title: { en: 'Browse the learning library', he: 'לעיין בספריית הלמידה' },
    how: {
      en: 'Short cards in plain words on the ideas you keep running into — diversification, volatility, time in the market. Read one whenever a term trips you up.',
      he: 'כרטיסים קצרים בשפה פשוטה על מושגים שחוזרים — פיזור, תנודתיות, זמן בשוק. אפשר לקרוא אחד בכל פעם שמונח מבלבל.',
    },
    cta: { en: 'Open the library', he: 'לפתוח את הספרייה' },
  },
  {
    key: 'alert',
    target: 'watch',
    title: { en: 'Set one alert', he: 'להגדיר התראה אחת' },
    how: {
      en: 'Choose a price worth knowing about, or ask to be told when the company reports. Then you can close the app instead of checking it.',
      he: 'בחרי מחיר ששווה לדעת עליו, או בקשי לדעת כשהחברה מפרסמת דוחות. אחר כך אפשר לסגור את האפליקציה.',
    },
    cta: { en: 'Create an alert', he: 'ליצור התראה' },
  },
  {
    key: 'paper',
    target: 'pf',
    title: { en: 'Practise with no money', he: 'להתאמן בלי כסף' },
    // Names no specific portfolio. Sandbox is no longer a fixture that is
    // simply there — a theoretical portfolio is something the reader creates,
    // and copy promising one that does not exist yet reads as a broken app.
    how: {
      en: 'A theoretical portfolio records the trades you would have made. Give it a few weeks and see how it did before anything is real.',
      he: 'תיק תיאורטי רושם את העסקאות שהיית עושה. תני לזה כמה שבועות ותראי מה יצא, לפני שמשהו אמיתי.',
    },
    cta: { en: 'Open a theoretical portfolio', he: 'לפתוח תיק תיאורטי' },
  },
  {
    key: 'open',
    target: 'open',
    title: { en: 'Open a real account when you are ready', he: 'לפתוח חשבון אמיתי כשמרגיש נכון' },
    how: {
      en: 'Choose a broker inside Shift and it hands you straight to them — the account is opened on their site, then linked back here read-only.',
      he: 'בוחרים ברוקר בתוך Shift והוא מפנה אותך ישירות אליו — החשבון נפתח אצל הברוקר, ואז מתחבר לכאן לקריאה בלבד.',
    },
    cta: { en: 'Choose a broker', he: 'לבחירת ברוקר' },
  },
  {
    key: 'broker',
    target: 'connections',
    title: { en: 'Then link it here, read-only', he: 'ואז לחבר אותו כאן, לקריאה בלבד' },
    how: {
      en: 'Linking imports what you already hold so everything sits in one picture. SHIFT can see positions and nothing else — it can never place an order.',
      he: 'החיבור מייבא את מה שאת כבר מחזיקה כדי שהכול יהיה בתמונה אחת. SHIFT רואה פוזיציות ולא יותר — הוא לא יכול לבצע פקודות.',
    },
    cta: { en: 'See broker connections', he: 'לראות חיבורי ברוקר' },
  },
];

/** "Your first steps" checklist — the onboarding spine. Every step skippable;
 *  step CTAs open the real screens with a floating way back. */
export function StepsScreen(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { language } = useTheme();
  const t = useT();
  const doneN = STEPS.filter((x) => s.stepsDone[x.key]).length;
  const cur = STEPS.find((x) => !s.stepsDone[x.key]);
  const curIdx = cur ? STEPS.indexOf(cur) : -1;

  return (
    <div
      className="anim-fade-up"
      style={{ display: 'flex', flexDirection: 'column', gap: 13, paddingTop: 4 }}
    >
      {/* `progress-seg` rather than bare spans: this is the same bar
          Progress.tsx's SegmentDots draws, and it was the one copy without
          the class that transitions it — so the app's own onboarding spine
          was the single progress bar in the app that jumped between two
          frames. Not swapped for SegmentDots itself, whose fill rule
          (`i <= current`) is not this one: a step here can be ticked off out
          of order, so a segment is filled by its own done flag. */}
      <div style={{ display: 'flex', gap: 4 }}>
        {STEPS.map((x, i) => (
          <span
            key={x.key}
            className="progress-seg"
            style={{
              height: 4,
              borderRadius: 3,
              flex: i === curIdx ? 2 : 1,
              background: s.stepsDone[x.key] || i === curIdx ? 'var(--color-accent)' : 'var(--line)',
            }}
          />
        ))}
      </div>
      <div className="text-muted" style={{ fontSize: 'var(--text-body)' }}>
        {t('steps.progress', { done: doneN, total: STEPS.length })}
      </div>

      {cur ? (
        <Card padding={18} gap={0} highlight>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 30,
                height: 30,
                flex: 'none',
                borderRadius: '50%',
                background: 'var(--color-accent)',
                color: 'var(--g2)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 'var(--text-row)',
                fontWeight: 600,
              }}
            >
              {curIdx + 1}
            </span>
            <span
              className="text-muted"
              style={{ fontSize: 'var(--text-caption)', letterSpacing: '.09em', textTransform: 'uppercase' }}
            >
              {t('steps.now')}
            </span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-heading)',
              letterSpacing: 'var(--track-heading)',
              lineHeight: 'var(--lead-heading)',
              marginTop: 11,
              whiteSpace: 'normal',
            }}
          >
            {cur.title[language]}
          </div>
          <p style={{ fontSize: 'var(--text-body)', lineHeight: 1.55, margin: '8px 0 0', opacity: 0.85 }}>
            {cur.how[language]}
          </p>
          <Button
            block
            minHeight={46}
            fontSize={16.5}
            style={{ marginTop: 14 }}
            onClick={() => {
              dispatch({ type: 'stepDone', key: cur.key, done: true });
              if (cur.target === 'connections' || cur.key === 'open') {
                dispatch({ type: 'advGoto', screen: 'advConnect', solo: true });
              } else {
                dispatch({ type: 'go', screen: cur.target, fromSteps: true });
              }
            }}
          >
            {cur.cta[language]}
          </Button>
          <Button
            variant="ghost"
            alignSelf="center"
            fontSize={16}
            style={{ marginTop: 6 }}
            onClick={() => dispatch({ type: 'stepDone', key: cur.key, done: true })}
          >
            {t('steps.markDone')}
          </Button>
        </Card>
      ) : (
        <Card padding={18} gap={8} highlight>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-heading)',
              letterSpacing: 'var(--track-heading)',
              lineHeight: 'var(--lead-heading)',
            }}
          >
            {t('steps.allDone')}
          </div>
          <p style={{ fontSize: 'var(--text-body)', margin: 0, opacity: 0.85 }}>{t('steps.allDoneBody')}</p>
          <Button
            block
            minHeight={46}
            fontSize={16.5}
            onClick={() => dispatch({ type: 'go', screen: 'home' })}
          >
            {t('steps.goApp')}
          </Button>
        </Card>
      )}

      <Card padding="4px 0" gap={0}>
        {STEPS.map((st, i) => {
          if (i === curIdx) return null;
          const done = !!s.stepsDone[st.key];
          return (
            <button
              key={st.key}
              type="button"
              onClick={() => dispatch({ type: 'stepDone', key: st.key, done: !done })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                width: '100%',
                minHeight: 46,
                padding: '9px 13px',
                border: 0,
                borderTop: '1px solid var(--color-divider)',
                background: 'transparent',
                color: 'inherit',
                font: 'inherit',
                cursor: 'pointer',
                textAlign: 'start',
              }}
            >
              <span
                className="step-mark"
                style={{
                  width: 22,
                  height: 22,
                  flex: 'none',
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 'var(--text-caption)',
                  // backgroundColor, not the `background` shorthand, for the
                  // reason Card.tsx uses the longhand too: the shorthand
                  // resets every other background longhand along with it, and
                  // naming the one property .step-mark transitions keeps the
                  // style and the transition talking about the same thing.
                  border: `1px solid ${done ? 'transparent' : 'var(--color-divider)'}`,
                  backgroundColor: done ? 'var(--color-accent-800)' : 'transparent',
                  color: done ? 'var(--color-accent-200)' : 'inherit',
                }}
              >
                {/* Keyed on the state, so React replaces the node instead of
                    patching the character in place — a remount is what gives
                    the new glyph an entrance to animate. */}
                <span key={done ? 'done' : 'todo'} className="step-tick">
                  {done ? '✓' : i + 1}
                </span>
              </span>
              <span
                className="step-title"
                style={{
                  flex: 1,
                  fontSize: 'var(--text-row)',
                  opacity: done ? 0.5 : 0.78,
                  textDecoration: done ? 'line-through' : undefined,
                }}
              >
                {st.title[language]}
              </span>
            </button>
          );
        })}
      </Card>
    </div>
  );
}
