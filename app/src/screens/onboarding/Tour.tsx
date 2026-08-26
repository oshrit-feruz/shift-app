import { useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { ProgressDots } from '../../components/Progress';
import { useDispatch } from '../../state/appState';
import { useTheme } from '../../theme/ThemeProvider';
import { useT } from '../../i18n/useT';
import type { ScreenProps } from '../../App';

const TOUR = [
  { icon: 'M4 11l8-7 8 7v8a1 1 0 01-1 1H5a1 1 0 01-1-1z', title: { en: 'Five tabs at the bottom', he: 'חמישה טאבים למטה' }, body: { en: 'Home, watchlist, movers, portfolio and More. Every screen starts from one of these five.', he: 'בית, ווטצ׳ליסט, מובילים, תיק ו״עוד״. כל מסך באפליקציה מתחיל מאחד מחמשת אלה.' } },
  { icon: 'M12 15a3 3 0 100-6 3 3 0 000 6M4 12h2M18 12h2M12 4v2M12 18v2', title: { en: 'Beginner or Advanced', he: 'מתחילים או מקצועי' }, body: { en: 'In Settings you choose between Beginner and Advanced. Same data, more or less detail — nothing is lost when you switch.', he: 'בהגדרות בוחרים בין מתחילים למקצועי. אותם נתונים, יותר או פחות פירוט — שום דבר לא הולך לאיבוד כשמחליפים.' } },
  { icon: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35', title: { en: 'Search from anywhere', he: 'חיפוש מכל מקום' }, body: { en: 'The magnifier in the header finds any company by name or ticker, from any screen.', he: 'הזכוכית המגדלת בכותרת מוצאת כל חברה לפי שם או סימבול, מכל מסך.' } },
  { icon: 'M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0', title: { en: 'Alerts instead of checking', he: 'התראות במקום לבדוק' }, body: { en: 'On any stock page — Add alert. The app watches the price so you do not have to.', he: 'בכל דף מניה — הוספת התראה. האפליקציה עוקבת אחרי המחיר במקומך.' } },
  { icon: 'M9 11l3 3 9-9M21 12v6a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h11', title: { en: 'Everything is tappable', he: 'הכול לחיץ' }, body: { en: 'Rows open the company behind them, cards expand, and the back arrow always returns you one step.', he: 'שורות פותחות את החברה שמאחוריהן, כרטיסים נפתחים, וחץ החזרה תמיד מחזיר צעד אחד.' } },
];

/** App tour — short, UI-only, skippable. Independent of the other onboarding
 *  pieces. */
export function TourScreen(_: ScreenProps) {
  const dispatch = useDispatch();
  const { language } = useTheme();
  const t = useT();
  const [i, setI] = useState(0);
  const card = TOUR[i];

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <ProgressDots total={TOUR.length} current={i} />
        <span style={{ flex: 1 }} />
        <Button variant="ghost" fontSize={13} onClick={() => dispatch({ type: 'go', screen: 'home' })}>
          {t('tour.skip')}
        </Button>
      </div>
      <Card padding="22px 18px" gap={11} style={{ alignItems: 'center', textAlign: 'center' }}>
        <span
          style={{
            width: 54,
            height: 54,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--color-accent-900)',
            color: 'var(--color-accent-200)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d={card.icon} />
          </svg>
        </span>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--fs-2xl)', lineHeight: 1.25, whiteSpace: 'normal' }}>{card.title[language]}</div>
        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, margin: 0, opacity: 0.85 }}>{card.body[language]}</p>
      </Card>
      <div style={{ display: 'flex', gap: 8 }}>
        {i > 0 && (
          <Button variant="secondary" minHeight={46} onClick={() => setI(i - 1)}>
            {t('tour.back')}
          </Button>
        )}
        <Button
          style={{ flex: 1 }}
          minHeight={48}
          onClick={() => (i >= TOUR.length - 1 ? dispatch({ type: 'go', screen: 'home' }) : setI(i + 1))}
        >
          {i === TOUR.length - 1 ? t('tour.done') : t('tour.next')}
        </Button>
      </div>
    </div>
  );
}
