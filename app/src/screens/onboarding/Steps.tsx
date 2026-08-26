import { Card } from '../../components/Card';
import { IconTile } from '../../components/IconTile';
import { ListRow } from '../../components/ListRow';
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
  { key: 'view', target: 'more', title: { en: 'Choose how much detail you see', he: 'לבחור כמה פירוט את רואה' }, how: { en: 'You are in Beginner mode: plain language, one idea per card. Settings switches to Advanced whenever you are curious.', he: 'את במצב מתחילים: שפה פשוטה, רעיון אחד לכל כרטיס. בהגדרות עוברים למקצועי מתי שתרצי.' }, cta: { en: 'Compare the two modes', he: 'להשוות בין שני המצבים' } },
  { key: 'watch', target: 'watch', title: { en: 'Follow three companies you know', he: 'לעקוב אחרי שלוש חברות שאת מכירה' }, how: { en: 'Pick businesses you already use — your phone, your bank, the shop you buy from. Watching them costs nothing and teaches you how prices behave.', he: 'תבחרי עסקים שאת כבר משתמשת בהם — הטלפון, הבנק, החנות. מעקב לא עולה כלום ומלמד איך מחירים מתנהגים.' }, cta: { en: 'Open the watchlist', he: 'לפתוח את הווטצ׳ליסט' } },
  { key: 'news', target: 'news', title: { en: 'Read why one of them moved', he: 'לקרוא למה אחת מהן זזה' }, how: { en: 'Open a company and read the two or three headlines under the chart. Soon you will spot which news matters and which is noise.', he: 'תפתחי חברה ותקראי את שתי-שלוש הכותרות מתחת לגרף. עוד מעט תזהי מה חשוב ומה רעש.' }, cta: { en: 'Open the news feed', he: 'לפתוח את החדשות' } },
  { key: 'learn', target: 'learn', title: { en: 'Browse the learning library', he: 'לעיין בספריית הלמידה' }, how: { en: 'Short cards in plain words on the ideas you keep running into — diversification, volatility, time in the market. Read one whenever a term trips you up.', he: 'כרטיסים קצרים בשפה פשוטה על מושגים שחוזרים — פיזור, תנודתיות, זמן בשוק. אפשר לקרוא אחד בכל פעם שמונח מבלבל.' }, cta: { en: 'Open the library', he: 'לפתוח את הספרייה' } },
  { key: 'alert', target: 'watch', title: { en: 'Set one alert', he: 'להגדיר התראה אחת' }, how: { en: 'Choose a price worth knowing about, or ask to be told when the company reports. Then you can close the app instead of checking it.', he: 'בחרי מחיר ששווה לדעת עליו, או בקשי לדעת כשהחברה מפרסמת דוחות. אחר כך אפשר לסגור את האפליקציה.' }, cta: { en: 'Create an alert', he: 'ליצור התראה' } },
  { key: 'paper', target: 'pf', title: { en: 'Practise with no money', he: 'להתאמן בלי כסף' }, how: { en: 'The Sandbox portfolio records the trades you would have made. Give it a few weeks and see how it did before anything is real.', he: 'תיק ה-Sandbox רושם את העסקאות שהיית עושה. תני לזה כמה שבועות ותראי מה יצא, לפני שמשהו אמיתי.' }, cta: { en: 'Open Sandbox', he: 'לפתוח את Sandbox' } },
  { key: 'open', target: 'open', title: { en: 'Open a real account when you are ready', he: 'לפתוח חשבון אמיתי כשמרגיש נכון' }, how: { en: 'Choose a broker inside Shift and it hands you straight to them — the account is opened on their site, then linked back here read-only.', he: 'בוחרים ברוקר בתוך Shift והוא מפנה אותך ישירות אליו — החשבון נפתח אצל הברוקר, ואז מתחבר לכאן לקריאה בלבד.' }, cta: { en: 'Choose a broker', he: 'לבחירת ברוקר' } },
  { key: 'broker', target: 'connections', title: { en: 'Then link it here, read-only', he: 'ואז לחבר אותו כאן, לקריאה בלבד' }, how: { en: 'Linking imports what you already hold so everything sits in one picture. SHIFT can see positions and nothing else — it can never place an order.', he: 'החיבור מייבא את מה שאת כבר מחזיקה כדי שהכול יהיה בתמונה אחת. SHIFT רואה פוזיציות ולא יותר — הוא לא יכול לבצע פקודות.' }, cta: { en: 'See broker connections', he: 'לראות חיבורי ברוקר' } },
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
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 13, paddingTop: 4 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {STEPS.map((x, i) => (
          <span
            key={x.key}
            style={{
              height: 4,
              borderRadius: 'var(--radius-xs)',
              flex: i === curIdx ? 2 : 1,
              background: s.stepsDone[x.key] || i === curIdx ? 'var(--color-accent)' : 'var(--line)',
            }}
          />
        ))}
      </div>
      <div className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>
        {t('steps.progress', { done: doneN, total: STEPS.length })}
      </div>

      {cur ? (
        <Card padding={18} gap={0} highlight>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconTile size={30} circle variant="solid" fontSize={14}>
              <b>{curIdx + 1}</b>
            </IconTile>
            <span className="text-muted" style={{ fontSize: 'var(--fs-xs)', letterSpacing: '.09em', textTransform: 'uppercase' }}>
              {t('steps.now')}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--fs-xl)', lineHeight: 1.3, marginTop: 11, whiteSpace: 'normal' }}>
            {cur.title[language]}
          </div>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, margin: '8px 0 0', opacity: 0.85 }}>{cur.how[language]}</p>
          <Button
            block
            minHeight={46}
            fontSize={13.5}
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
            fontSize={13}
            style={{ marginTop: 6 }}
            onClick={() => dispatch({ type: 'stepDone', key: cur.key, done: true })}
          >
            {t('steps.markDone')}
          </Button>
        </Card>
      ) : (
        <Card padding={18} gap={8} highlight>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--fs-xl)' }}>{t('steps.allDone')}</div>
          <p style={{ fontSize: 'var(--fs-sm)', margin: 0, opacity: 0.85 }}>{t('steps.allDoneBody')}</p>
          <Button block minHeight={46} fontSize={13.5} onClick={() => dispatch({ type: 'go', screen: 'home' })}>
            {t('steps.goApp')}
          </Button>
        </Card>
      )}

      <Card padding="4px 0" gap={0}>
        {STEPS.map((st, i) => {
          if (i === curIdx) return null;
          const done = !!s.stepsDone[st.key];
          return (
            <ListRow
              key={st.key}
              onClick={() => dispatch({ type: 'stepDone', key: st.key, done: !done })}
              minHeight={46}
              padding="9px 13px"
              leading={
                <IconTile size={22} circle variant={done ? 'accent' : 'outline'} fontSize={12}>
                  {done ? '✓' : i + 1}
                </IconTile>
              }
              title={
                <span
                  style={{
                    fontSize: 'var(--fs-md)',
                    fontWeight: 'var(--fw-regular)',
                    opacity: done ? 0.5 : 0.78,
                    textDecoration: done ? 'line-through' : undefined,
                  }}
                >
                  {st.title[language]}
                </span>
              }
            />
          );
        })}
      </Card>
    </div>
  );
}
