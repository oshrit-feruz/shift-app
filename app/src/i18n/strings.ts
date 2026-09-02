/**
 * Bilingual strings, ported from the design prototype's T(en, he) pairs.
 * Hebrew is the product's primary language (RTL); English is secondary.
 * Every user-facing string lives here — screens never inline copy.
 */

export type Pair = { en: string; he: string };
const p = (en: string, he: string): Pair => ({ en, he });

export const STRINGS = {
  // ── Shell / navigation ────────────────────────────────────────────────
  'nav.home': p('Home', 'בית'),
  'nav.watch': p('Watchlist', 'ווטצ׳ליסט'),
  'nav.news': p('News', 'חדשות'),
  'nav.pf': p('Portfolio', 'תיק'),
  'nav.more': p('More', 'עוד'),
  'nav.back': p('Back', 'חזרה'),

  // Greeted by the name the provider gave us. `title.homeAnon` is not a
  // fallback for a slow load but for a real case: a provider that sends no
  // display name at all (Apple, after the first authorisation). Greeting
  // someone by a name guessed from their email address would be worse than
  // not naming them.
  'title.home': p('Good morning, {name}', 'בוקר טוב, {name}'),
  'title.homeAnon': p('Good morning', 'בוקר טוב'),
  'kicker.home': p('Overview', 'סקירה'),
  'title.pf': p('Portfolios', 'תיקים'),
  // Count-free: with sample data off there may be no accounts at all, and a
  // header that names a number the screen does not show is its own small lie.
  // This also retires the live-account variant this branch used to carry —
  // main solved the same false-count problem for every case at once.
  'kicker.pf': p('Your accounts', 'החשבונות שלך'),
  'title.watch': p('Watchlist', 'ווטצ׳ליסט'),
  'kicker.watch': p('Alerts', 'התראות'),
  'title.movers': p('Market movers', 'מובילי שוק'),
  'kicker.movers': p('US equities', 'מניות בארה״ב'),
  'title.news': p('News', 'חדשות'),
  'kicker.news': p('Feed', 'פיד'),
  'title.earnings': p('Earnings', 'דוחות'),
  'kicker.earnings': p('This week', 'השבוע'),
  'title.compare': p('Compare', 'השוואה'),
  'kicker.compare': p('Up to 3', 'עד 3'),
  'title.settings': p('Settings', 'הגדרות'),
  'kicker.settings': p('Account', 'חשבון'),
  'title.connections': p('Connections', 'חיבורים'),
  'kicker.connections': p('Bank, pension, broker', 'בנק, פנסיה, ברוקר'),
  'title.more': p('Settings', 'הגדרות'),
  'kicker.more': p('More', 'עוד'),
  'title.advChat': p('Get a recommendation', 'לקבל המלצה'),
  'kicker.advChat': p('Four questions', 'ארבע שאלות'),
  'title.advDisc': p('Disclosure', 'גילוי נאות'),
  'kicker.advDisc': p('Recommendation', 'לקבל המלצה'),
  'title.advDash': p('Your recommendation', 'ההמלצה שלך'),
  'kicker.advDash': p('Updated daily', 'מתעדכן כל יום'),
  'title.advConnect': p('Broker & accounts', 'ברוקר וחיבור חשבונות'),
  'kicker.advConnect': p('Read-only', 'קריאה בלבד'),
  'title.advBuy': p('First purchase', 'הקנייה הראשונה'),
  'kicker.advBuy': p('Simulation', 'סימולציה'),
  'title.learn': p('Learning library', 'ספריית הלמידה'),
  'kicker.learn': p('Short cards', 'כרטיסים קצרים'),
  'title.steps': p('Your first steps', 'הצעדים הראשונים'),
  'kicker.steps': p('Guide', 'מדריך'),
  'title.open': p('Open an account', 'לפתוח חשבון'),
  'kicker.open': p('Guide', 'מדריך'),

  // ── Home ──────────────────────────────────────────────────────────────
  'home.pfToday': p('Your portfolio today', 'התיק שלך היום'),
  'home.pfBlurb': p(
    "Most of today's gain came from NVDA, your largest holding. One day rarely means much — the months are what matter.",
    'רוב הרווח היום הגיע מ-NVDA, ההחזקה הגדולה שלך. יום אחד כמעט לא אומר כלום — מה שקובע זה החודשים.',
  ),
  'home.noPfTitle': p('No portfolio yet', 'עדיין אין תיק'),
  'home.noPfHelp': p(
    'Connect a broker or open a new account to see your holdings here.',
    'אפשר לחבר ברוקר או לפתוח חשבון חדש כדי לראות כאן את ההחזקות שלך.',
  ),
  'home.trackSelf': p('Do it yourself', 'לבד, בקצב שלי'),
  'home.trackSelfSub': p('Browse, pick your own, log your own trades.', 'לחקור, לבחור בעצמך, לרשום עסקאות.'),
  'home.trackHere': p('You are here', 'המסלול הנוכחי'),
  'home.trackAdvisor': p('Get a recommendation', 'לקבל המלצה'),
  'home.trackAdvisorSub': p('Four questions, then a suggested portfolio.', 'ארבע שאלות, ואז הצעה לתיק.'),
  /* The home band's own copy — the recommendation track's place on the home
   * screen, before the flow has been run and after it has. */
  'home.recYours': p('Your recommendation', 'ההמלצה שלך'),
  'home.recDeveloped': p('Developed', 'מפותחים'),
  'home.recSp500': p('S&P 500', 'S&P 500'),
  'home.recBonds': p('Gov bonds', 'אג״ח ממשלתי'),
  'home.recCorporate': p('Corporate', 'אג״ח קונצרני'),
  'home.recCash': p('Cash', 'מזומן'),
  'home.recEmerging': p('Emerging', 'מתעוררים'),
  'home.recRadar': p('Radar', 'ראדר'),
  /* The radar's mention on the home band. Two wordings, because the same count
   * means two different things: to a client with a sleeve it is her own
   * radar's result, and to one who has not run the flow it is simply what the
   * daily check found — the list is the same for everyone, and what a profile
   * decides is how much of a portfolio, if any, goes behind it. */
  'home.radarYours': p('Stock Radar · {n} passed today', 'ראדר מניות · {n} עברו היום'),
  'home.startHere': p('New to investing? Start here', 'בלי ניסיון בהשקעות? מתחילים כאן'),
  'home.startHereSub': p('A short guide, then the steps', 'מדריך קצר, ואחריו הצעדים'),
  'home.watchlist': p('Watchlist', 'ווטצ׳ליסט'),
  'home.watchlistEmpty': p('You are not following any stocks yet', 'עדיין אין מניות במעקב'),
  'home.watchlistAdd': p('Add your first stock', 'להוסיף מניה ראשונה'),
  'home.seeAll': p('See all', 'לראות הכול'),
  'home.moversBeg': p("What's moving today", 'מה זז היום'),
  'home.moversAdv': p('Top movers', 'המובילים'),
  'home.moversHelp': p(
    'Big one-day moves usually follow news. Tap one to read why.',
    'תנועות גדולות ביום אחד באות בעקבות חדשות. אפשר להקיש כדי לקרוא למה.',
  ),
  'home.allMovers': p('All market movers →', 'כל מובילי השוק →'),
  'home.earnWeek': p('Earnings ahead', 'דוחות בשבוע הקרוב'),
  'home.earnHelp': p(
    'A quarterly report card. Prices often swing the day it lands.',
    'תעודת ציונים רבעונית. המחיר בדרך כלל זז ביום הפרסום.',
  ),
  'home.afterClose': p('After close', 'אחרי הנעילה'),
  'home.beforeOpen': p('Before open', 'לפני הפתיחה'),
  'home.allEarnings': p('All earnings', 'כל הדוחות'),

  // ── Setup banner / resume ─────────────────────────────────────────────
  'setup.banner': p('Complete your setup', 'להשלים את ההגדרה'),
  'setup.resume': p('Continue', 'להמשיך'),
  'setup.section': p('Setup', 'הגדרה ראשונית'),
  'setup.stepOf': p('Step {n} of 5', 'שלב {n} מתוך 5'),
  'setup.instRow': p(
    'Connect institutions — bank, pension, hishtalmut',
    'חיבור מוסדות — בנק, פנסיה, קרן השתלמות',
  ),
  'setup.tourRow': p('App tour', 'סיור באפליקציה'),

  // ── Advisory chat ─────────────────────────────────────────────────────
  'adv.tag': p('Informational only', 'מידע בלבד'),
  'adv.noAction': p('No action taken in your account', 'טרם בוצעה פעולה בחשבון'),
  'adv.chatIntro': p(
    'Four questions about horizon, risk, goal and your safety net. The answers map to one of three fixed profiles — the same answers always give the same profile.',
    'ארבע שאלות על אופק, סיכון, מטרה וכרית הביטחון. התשובות ממופות לאחד משלושה פרופילים קבועים — אותן תשובות תמיד יתנו את אותו פרופיל.',
  ),
  'adv.pickOne': p('Pick one', 'לבחור אחת'),
  'adv.yourProfile': p('Your profile', 'הפרופיל שלך'),
  'adv.confirmProfile': p('Confirm profile', 'לאשר פרופיל'),
  'adv.restart': p('Start over', 'להתחיל מחדש'),
  'adv.redoChat': p('Redo the questions', 'לענות מחדש'),
  'adv.back': p('Back', 'חזרה'),
  'adv.later': p('Continue later', 'אמשיך אחר כך'),
  'adv.skipStep': p('Skip this step', 'לדלג על השלב הזה'),
  'adv.stepPrev': p('Back', 'הקודם'),
  'adv.stepNext': p('Next', 'הבא'),
  'adv.fromLibrary': p('From the library', 'מהספרייה'),
  'adv.openLibrary': p('Open the library', 'לספרייה המלאה'),
  'adv.eduChatTitle': p('An ETF buys the whole basket', 'קרן סל קונה את כל הסל'),
  'adv.eduChatBody': p(
    'One thing you buy that holds hundreds of companies at once — which is why the Core below is built from ETF categories, not single stocks.',
    'דבר אחד שקונים והוא מחזיק מאות חברות בבת אחת — ולכן הליבה שמוצגת בהמשך בנויה מקטגוריות של קרנות סל, לא ממניות בודדות.',
  ),

  'adv.q1': p('How long can this money stay invested?', 'לכמה זמן הכסף הזה יכול להישאר מושקע?'),
  'adv.q1a1': p('Under 2 years', 'פחות משנתיים'),
  'adv.q1a2': p('Two to seven years', 'שנתיים עד 7 שנים'),
  'adv.q1a3': p('More than seven years', 'יותר מ-7 שנים'),
  'adv.q2': p('The market drops 20% in a month. What do you do?', 'השוק יורד 20% בחודש. מה עושים?'),
  'adv.q2a1': p('I would sell — a 10% drop already worries me', 'למכור — גם ירידה של 10% מלחיצה אותי'),
  'adv.q2a2': p('I would hold and stop looking', 'להחזיק ולהפסיק להסתכל'),
  'adv.q2a3': p('I would buy more', 'לקנות עוד'),
  'adv.q3': p('What is this money for?', 'למה הכסף הזה מיועד?'),
  'adv.q3a1': p('Keeping what I have', 'לשמור על מה שיש'),
  'adv.q3a2': p('Growing at the pace of the market', 'לצמוח בקצב השוק'),
  'adv.q3a3': p('Beating the market over years', 'להשיג יותר מהשוק לאורך שנים'),
  'adv.q4': p(
    'If something unexpected happens — do you have cash set aside?',
    'אם יקרה משהו לא צפוי — יש לך מזומן בצד?',
  ),
  'adv.q4a1': p('No — this is all the money I have', 'לא — זה כל הכסף שיש לי'),
  'adv.q4a2': p('A month or two of expenses', 'חודש-חודשיים של הוצאות'),
  'adv.q4a3': p('Several months, untouched', 'כמה חודשים, שלא נוגעים בהם'),
  'adv.ansHorizon': p('Horizon', 'אופק'),
  'adv.ansRisk': p('Risk', 'סיכון'),
  'adv.ansGoal': p('Goal', 'מטרה'),
  'adv.ansSafety': p('Safety net', 'כרית ביטחון'),

  'profile.cons': p('Conservative', 'סולידי'),
  'profile.bal': p('Balanced', 'מאוזן'),
  'profile.growth': p('Growth', 'צמיחה'),
  'profile.cons.blurb': p(
    'Capital preservation first. Mostly bonds and a broad developed-market index, with no individual stocks.',
    'שמירה על הכסף קודם כול. בעיקר אג״ח ומדד עולמי רחב, בלי מניות בודדות.',
  ),
  'profile.bal.blurb': p(
    'A broad index core with a bond cushion, plus a small share in individual stocks chosen by fixed rules.',
    'ליבה של מדדים רחבים עם כרית אג״ח, ולצידה חלק קטן במניות בודדות שנבחרות לפי כללים קבועים.',
  ),
  'profile.growth.blurb': p(
    'Equity-heavy core across regions, with the largest share in individual stocks the rules allow.',
    'ליבה מנייתית רחבה על פני אזורים, עם החלק הגדול ביותר במניות בודדות שהכללים מתירים.',
  ),
  'profile.hardNote': p(
    '(A horizon under 2 years or no safety net always maps to Conservative.)',
    '(אופק מתחת לשנתיים או בלי כרית ביטחון תמיד ממופה לסולידי.)',
  ),

  'core.globalGovBonds': p('Global government bonds', 'אג״ח ממשלתי גלובלי'),
  'core.developedIndex': p('Developed-market index', 'מדד שווקים מפותחים'),
  'core.corporateBonds': p('Corporate bonds', 'אג״ח קונצרני'),
  'core.cashEquivalents': p('Cash equivalents', 'שווי מזומן'),
  'core.sp500': p('S&P 500 index', 'מדד S&P 500'),
  'core.emergingIndex': p('Emerging markets index', 'מדד שווקים מתעוררים'),

  // ── Disclosure ────────────────────────────────────────────────────────
  'disc.title': p('Before you see the recommendation', 'לפני שמוצגת ההמלצה'),
  'disc.lead': p(
    'Read these four points. They describe exactly what this track does and does not do.',
    'ארבע נקודות שמתארות בדיוק מה המסלול הזה עושה ומה לא.',
  ),
  'disc.p1': p(
    'This is a recommendation, not a managed account. Shift never places an order and never moves money.',
    'זו המלצה, לא ניהול תיק. Shift לא שולח פקודות ולא מזיז כסף.',
  ),
  'disc.p2': p(
    'The profile comes from a fixed mapping of your four answers. There is no human advisor and no discretion.',
    'הפרופיל נגזר ממיפוי קבוע של ארבע התשובות. אין כאן יועץ אנושי ואין שיקול דעת.',
  ),
  'disc.p3': p(
    'The individual stocks come from one published rule set, identical for every client, rechecked every trading day and capped at 15% of the portfolio.',
    'המניות הבודדות נבחרות לפי מערכת כללים אחת, זהה לכל לקוח, שנבדקת מחדש בכל יום מסחר ומוגבלת ל-15% מהתיק.',
  ),
  'disc.p4': p(
    'Past behaviour of these rules is not a promise about the future. You can lose money.',
    'התנהגות הכללים בעבר אינה הבטחה לעתיד. אפשר להפסיד כסף.',
  ),
  'disc.cta': p('Show the recommendation', 'להצגת ההמלצה'),

  // ── Recommendation dashboard ──────────────────────────────────────────
  'rec.coreSatIntro': p(
    'Two parts: a broad index core, and — where the profile allows it — a small share in individual stocks picked by fixed rules that are rechecked every trading day.',
    'שני חלקים: ליבה של מדדים רחבים, ובמקום שהפרופיל מתיר — חלק קטן במניות בודדות שנבחרות לפי כללים קבועים, שנבדקים מחדש בכל יום מסחר.',
  ),
  'rec.core': p('Core', 'ליבה (Core)'),
  'rec.coreHelp': p(
    'Index-fund categories only. No single stock is picked for you here.',
    'קטגוריות של קרנות מחקות בלבד. אין כאן בחירה של מניה בודדת בשבילך.',
  ),
  'rec.eduCoreBody': p(
    'Never put it all in one place: several unrelated markets means no single mistake decides your result.',
    'לא לשים הכול במקום אחד: כמה שווקים שאינם קשורים זה לזה — וטעות אחת לא קובעת את התוצאה.',
  ),
  'rec.satellite': p('Individual stocks', 'מניות בודדות'),
  /* The sleeve's name where it is a section of the product, alongside
   * rec.satellite, which stays the plain description and is what the
   * explanatory lines keep saying ("your profile holds no individual
   * stocks"). A screen that called it only "Stock Radar" would have named the
   * thing without ever saying what it is. */
  'rec.radar': p('Stock Radar', 'ראדר מניות'),
  'rec.radarLive': p('LIVE', 'LIVE'),
  /* Rendered around the wordmark: {start} <GlitchMark /> {end}. Split rather
   * than interpolated because the mark is an image, and because the two
   * languages want it in different places in the sentence. */
  'rec.radarLineStart': p('The names picked up today by', 'המניות שעלו על הראדר היומי של'),
  /* Only a few of the day's names get a tile. On a day when more clear the
   * checks, this says so rather than letting the tiles read as the whole
   * list — and as the whole sleeve, which they no longer add up to. */
  'rec.radarPassed': p('{n} names cleared today’s radar', '{n} מניות עברו את הראדר היומי'),
  'rec.radarShowing': p(
    'Showing {shown} of {total} that passed today',
    'מוצגות {shown} מתוך {total} שעברו היום',
  ),
  'rec.radarLineEnd': p("'s daily radar", ''),
  'rec.ofPortfolio': p('of the portfolio', 'מהתיק'),
  'rec.dailyTag': p('Checked daily', 'בדיקה יומית'),
  'rec.satHelp': p(
    'Fixed rules, the same for every client — no personal tuning and no one deciding case by case.',
    'כללים קבועים, זהים לכל לקוח — בלי התאמה אישית ובלי החלטה נקודתית של מישהו.',
  ),
  'rec.satRule1': p('Only large, well-known S&P 500 companies', 'רק חברות גדולות ומוכרות ממדד S&P 500'),
  'rec.satRule2': p(
    'Bought only after a deep, prolonged fall in the share price',
    'קנייה רק אחרי ירידה עמוקה וממושכת במחיר המניה',
  ),
  'rec.satRule3': p(
    'Held for a fixed period and then closed — by rule, not by feel',
    'החזקה לתקופה קבועה ואז סגירה — לפי הכלל, לא לפי תחושה',
  ),
  'rec.satRule4': p(
    'The list is rechecked every trading day and capped at 15% of the portfolio',
    'הרשימה נבדקת מחדש בכל יום מסחר ומוגבלת ל-15% מהתיק',
  ),
  'rec.satPositions': p("Passed today's checks", 'עברו את הבדיקות של היום'),
  'rec.livePrices': p('Live prices', 'מחירים חיים'),
  'rec.updatedDaily': p(
    'Every trading day, 100 large S&P 500 companies are put through the same checks — how deep and how long the fall in the share price has been, where the price is heading, and how heavily the stock is traded. These are the few names that passed every check today.',
    'בכל יום מסחר עוברות 100 חברות גדולות ממדד S&P 500 את אותן בדיקות — כמה עמוקה וממושכת הייתה הירידה במחיר המניה, לאן המחיר מתקדם, ובאיזה היקף נסחרת המניה. אלה השמות הבודדים שעברו היום את כל הבדיקות.',
  ),
  'rec.notAnOrder': p(
    'A shortlist to look into yourself — not an instruction to buy. After the next trading day it can look different.',
    'זו רשימה קצרה להתעמק בה בעצמך — לא הוראת קנייה. ביום המסחר הבא היא יכולה להיראות אחרת.',
  ),
  'rec.satInfoOnly': p(
    'Shown for information only: your profile holds no individual stocks, so none of this is part of your recommendation.',
    'מוצג למידע בלבד: הפרופיל שלך לא מחזיק מניות בודדות, ולכן שום דבר מכאן אינו חלק מההמלצה שלך.',
  ),
  'rec.noPositions': p('No stock passed every check today', 'אף מניה לא עברה היום את כל הבדיקות'),
  /* Gender-neutral, like the rest of the Hebrew since #39: the screen states
   * a sum rather than addressing the reader as one gender. */
  'rec.ifInvested': p('If you invested', 'בהשקעה של'),
  'rec.illustration': p(
    'An illustration of the split only — arithmetic on the allocation, not a forecast of any result.',
    'המחשה של החלוקה בלבד — חישוב על ההקצאה, לא תחזית לתוצאה כלשהי.',
  ),
  'rec.noFund': p('Fund not yet assigned', 'עוד לא נבחרה קרן'),
  'rec.nextStep': p('Next: where the account lives', 'הצעד הבא: איפה החשבון ייפתח'),
  'rec.nextStepHelp': p(
    'Nothing is executed inside Shift. Acting on this means choosing a broker and connecting it read-only — the next two steps, both skippable.',
    'שום פקודה לא מתבצעת בתוך Shift. לפעול על ההמלצה אומר לבחור ברוקר ולחבר אותו לקריאה בלבד — שני הצעדים הבאים, ושניהם ניתנים לדילוג.',
  ),
  'rec.chooseBroker': p('Connect your accounts', 'לחיבור החשבונות'),

  // ── Broker + institutions ─────────────────────────────────────────────
  'conn.title': p('Connect your accounts — read-only', 'חיבור החשבונות שלך — לקריאה בלבד'),
  'conn.help': p(
    'Optional, every one of them. Shift only reads balances and positions — it can never move money. You can come back to this any time from Settings → Setup.',
    'הכול אופציונלי. Shift רק קורא יתרות ופוזיציות — הוא לא יכול להזיז כסף. אפשר לחזור לכאן בכל רגע מהגדרות ← הגדרה ראשונית.',
  ),
  'conn.helpSolo': p(
    'Optional, every one of them. Shift only reads balances and positions — it can never move money. Connect what you like, whenever you like.',
    'הכול אופציונלי. Shift רק קורא יתרות ופוזיציות — הוא לא יכול להזיז כסף. אפשר לחבר מה שרוצים ומתי שרוצים.',
  ),
  'conn.note': p(
    'Skipped something? It waits here — connecting a pension fund later does not repeat the flow.',
    'דילגת על משהו? זה מחכה כאן — חיבור קרן פנסיה אחר כך לא מחזיר אותך לתחילת התהליך.',
  ),
  'conn.brokerTitle': p('Where will the account live?', 'איפה החשבון ייפתח?'),
  'conn.brokerHelp': p(
    'Three routes — none of them is wrong, just different. You can change your mind later.',
    'שלושה מסלולים — אף אחד מהם לא שגוי, רק שונה. אפשר לשנות אחר כך.',
  ),
  'conn.handoffTitle': p('Opening happens at the broker', 'הפתיחה עצמה נעשית אצל הברוקר'),
  'conn.handoffHelp': p(
    'Shift sends you to their signup with your details ready. When the account exists, come back and link it here read-only.',
    'Shift מפנה אותך לטופס ההרשמה שלהם. כשהחשבון קיים, חוזרים לכאן ומחברים אותו לקריאה בלבד.',
  ),
  'conn.openAt': p('Open an account at {broker}', 'לפתיחת חשבון ב-{broker}'),
  'conn.existing': p('Accounts you already have', 'חשבונות שכבר יש לך'),
  'conn.choose': p('Choose who to connect', 'לבחור את מי לחבר'),
  'conn.connected': p('✓ Connected', '✓ מחובר'),
  'conn.connect': p('Connect', 'לחבר'),
  'conn.close': p('Close', 'סגירה'),
  'conn.continue': p('Continue', 'להמשיך'),
  'conn.done': p('Done', 'סיימתי'),
  'conn.broker': p('Broker', 'ברוקר'),
  'conn.bank': p('Bank account', 'חשבון בנק'),
  'conn.pension': p('Pension fund', 'קרן פנסיה'),
  'conn.hisht': p('Keren Hishtalmut', 'קרן השתלמות'),

  // ── First purchase ────────────────────────────────────────────────────
  'buy.title': p('Your first purchase — a simulation', 'הקנייה הראשונה — סימולציה'),
  'buy.help': p(
    'This is what the recommendation looks like as an order list. Nothing is bought here — when you are ready, it happens at your broker.',
    'כך ההמלצה נראית כרשימת קנייה. שום דבר לא נקנה כאן — כשמגיע הרגע, זה קורה אצל הברוקר שלך.',
  ),
  'buy.connectFirst': p('Connect a broker', 'לחבר ברוקר'),
  'buy.connectFirstHelp': p(
    'Pick a broker to enable buying this instrument there',
    'בחירת ברוקר תפעיל קנייה של נייר הערך הזה אצלו',
  ),
  'buy.atBroker': p('Buy at {broker}', 'לקנות ב-{broker}'),
  'buy.openAt': p('Opens {broker} at this instrument', 'נפתח ב-{broker} על נייר הערך הזה'),
  'buy.copyAndOpen': p(
    'Copies the ticker and opens {broker} — search for it there',
    'מעתיק את הסימול ופותח את {broker} — צריך לחפש אותו שם',
  ),
  'buy.handoffNote': p(
    'Shift places no orders. These buttons open your broker, where you decide and execute yourself.',
    'Shift לא שולח פקודות. הכפתורים פותחים את הברוקר שלך, ושם ההחלטה והביצוע הם שלך.',
  ),
  'buy.noDeepLink': p(
    'A direct per-stock link is not set up yet, so the broker opens on its home page with the ticker copied.',
    'קישור ישיר לכל מניה עדיין לא מוגדר, ולכן הברוקר נפתח בעמוד הבית עם הסימול מועתק.',
  ),
  'buy.example': p('Example with $10,000', 'דוגמה עם $10,000'),
  'buy.finish': p('Done — to the dashboard', 'סיימנו — לדשבורד'),

  // ── Stock page ────────────────────────────────────────────────────────
  'stock.inWatchlist': p('In watchlist', 'במעקב'),
  'stock.toWatchlist': p('Watchlist', 'לווטצ׳ליסט'),
  'stock.addAlert': p('Add alert', 'הוספת התראה'),
  'stock.basics': p('The basics', 'הבסיס'),
  'stock.keyStats': p('Key statistics', 'נתונים עיקריים'),
  'stock.yourHoldings': p('Your holdings', 'ההחזקות שלך'),
  'stock.analyst': p('Analyst ratings', 'דירוגי אנליסטים'),
  'stock.consensus': p('Buy', 'קנייה'),
  'stock.analystMeta': p('53 analysts · PT $214 (+17%)', '53 אנליסטים · מחיר יעד $214 (+17%)'),
  'stock.rateSb': p('Strong buy 31', 'קנייה חזקה 31'),
  'stock.rateB': p('Buy 11', 'קנייה 11'),
  'stock.rateH': p('Hold 8', 'החזקה 8'),
  'stock.rateS': p('Sell 3', 'מכירה 3'),
  'stock.newsBeg': p('Why people are talking about it', 'למה מדברים עליה'),
  'stock.newsAdv': p('News feed', 'פיד חדשות'),
  // Stock detail sub-tabs and the two live-data tabs behind them.
  'stock.tabOverview': p('Overview', 'סקירה'),
  'stock.tabReports': p('Reports', 'דוחות'),
  'stock.tabNews': p('News', 'חדשות'),
  'stock.reportsTitle': p('Latest filed results', 'תוצאות מהדוח האחרון'),
  'stock.revenue': p('Annual revenue', 'הכנסות שנתיות'),
  'stock.yoy': p('vs. previous year', 'לעומת השנה הקודמת'),
  'stock.periodEnd': p('Period ending', 'תקופה שהסתיימה'),
  'stock.filedOn': p('Filed', 'הוגש'),
  'stock.reportsNote': p(
    'Figures as filed with the SEC. Shown for reference — this is the newest filing on record, not a point-in-time view.',
    'נתונים כפי שהוגשו ל-SEC. מוצגים לעיון — זהו הדוח העדכני ביותר הרשום, ולא תמונת מצב לתאריך מסוים.',
  ),
  'stock.newsEmpty': p('No recent articles for this stock.', 'אין כתבות אחרונות על מניה זו.'),
  'stock.newsRead': p('Read the full article', 'לכתבה המלאה'),
  'stock.newsExcerptNote': p(
    'Excerpts only — the full article opens at its source.',
    'תקצירים בלבד — הכתבה המלאה נפתחת באתר המקור.',
  ),
  'stock.engineTitle': p("Today's rules check", 'הבדיקה של היום לפי הכללים'),
  'stock.high52w': p('52-week high', 'שיא 52 שבועות'),
  'stock.checkedDaily': p(
    'This stock goes through the same checks every trading day, so the result can change at the next one.',
    'המניה הזו עוברת את אותן בדיקות בכל יום מסחר, ולכן התוצאה יכולה להשתנות בבדיקה הבאה.',
  ),
  'stock.sigBuy': p('A candidate today', 'מועמדת היום'),
  'stock.sigWatch': p('Being watched', 'במעקב'),
  'stock.sigSkip': p('Not a candidate today', 'לא מועמדת היום'),
  'stock.notRanked': p(
    'This stock was not among the 100 companies checked today, so there is nothing to report on it. The list is rebuilt every trading day.',
    'המניה הזו לא הייתה בין 100 החברות שנבדקו היום, ולכן אין עליה מה לדווח. הרשימה נבנית מחדש בכל יום מסחר.',
  ),
  'stock.history': p('Reported quarters', 'רבעונים שדווחו'),
  'stock.historyEmpty': p('No reported quarters on record.', 'אין רבעונים מדווחים ברשומות.'),
  'stock.upcoming': p('Scheduled', 'מתוכנן'),
  'stock.epsActual': p('EPS', 'רווח למניה'),
  'stock.epsEst': p('est.', 'צפי'),
  'stock.beat': p('beat', 'מעל הצפי'),
  'stock.miss': p('miss', 'מתחת לצפי'),
  'stock.inline': p('in line', 'בדיוק כצפי'),
  'news.feedEmpty': p('No market news right now.', 'אין חדשות שוק כרגע.'),
  'news.watchlistEmpty': p(
    'No recent news for the stocks you follow.',
    'אין חדשות אחרונות על המניות שבמעקב.',
  ),
  'news.watchlistNone': p(
    'Your watchlist is empty, so there is nothing to pull news for.',
    'הווטצ׳ליסט שלך ריק, אז אין עבור מה למשוך חדשות.',
  ),
  'news.openSource': p('Open at the source', 'לפתוח במקור'),
  // The provider's own tone score for a story, not this app's reading of it —
  // see screens/news/sentimentTag.ts. An article the provider did not score
  // carries no tag at all rather than one of these.
  'news.sentimentPositive': p('Positive', 'חיובי'),
  'news.sentimentNegative': p('Negative', 'שלילי'),
  'news.sentimentNeutral': p('Neutral', 'ניטרלי'),
  'earn.truncated': p(
    'Showing {shown} of {total} reports in the week ahead.',
    'מוצגים {shown} מתוך {total} דוחות בשבוע הקרוב.',
  ),
  'earn.noneInShown': p(
    'None of the reports shown match — but the week ahead is only partly loaded, so there may be others.',
    'אף אחד מהדוחות המוצגים לא תואם — אבל השבוע הקרוב נטען רק חלקית, ייתכן שיש נוספים.',
  ),
  'earn.weekEmpty': p('No companies report in the week ahead.', 'אין חברות שמדווחות בשבוע הקרוב.'),
  // The market-wide feed lists only reports that have not happened yet, so a
  // reader who sees a company they know reported on Monday must not conclude
  // the app thinks it is still pending. Said plainly, once, above the week.
  // Showcase mode is a deliberate illustration, and the reader is told so
  // wherever it renders — an unlabelled demo is exactly the thing this app
  // exists to not do.
  // Sample prices are still what most screens render. Saying so in place is
  // the difference between a prototype and a screen that misleads.
  // Rewritten when prices went live: it used to call prices sample data, and
  // leaving that would have been the same failure in the other direction —
  // telling a reader to distrust the one number on the screen that is real.
  // Charts came off this list when they started drawing real sessions, and day
  // change came off it when the live quote started carrying one. What is left
  // on the demo side of the price surfaces is volume: the quote has none, so
  // the movers ranking by "most active" is still sample data.
  'more.demoData': p('Sample data', 'נתוני דמו'),
  'more.demoDataHelp': p(
    'Fills the app with sample figures: generated price charts, an illustrative earnings week, and the demo portfolio, market movers, analyst ratings, connected accounts and notifications. With it off, each of those says so in place and everything else uses real market data.',
    'ממלא את האפליקציה בנתוני הדגמה: גרפים מומצאים, שבוע דוחות לדוגמה, וגם תיק הדמו, מובילי השוק, דירוגי האנליסטים, החשבונות המחוברים וההתראות. כשהוא כבוי, כל אחד מהם אומר זאת במקומו, וכל השאר משתמש בנתוני שוק אמיתיים.',
  ),
  // The stand-in for a whole fabricated feature while sample data is off.
  // Verbless in Hebrew on purpose — see the note in components/DemoOnly.tsx
  // about agreement across the feature names.
  'demo.only': p('{feature} is only available in demo', '{feature} — רק בדמו'),
  'earn.scheduledOnly': p(
    'The week ahead: reports still to come. Results already published appear on each stock’s own page.',
    'השבוע הקרוב: דוחות שעוד צפויים. תוצאות שכבר פורסמו מופיעות בדף של כל מניה.',
  ),
  'stock.nextEarn': p('Next earnings', 'הדוח הבא'),
  // Reached by opening a company from the earnings calendar: the sample
  // price table only covers a handful of tickers, but filings and news are
  // live for any symbol, so the page is worth showing rather than blanking.
  'stock.noQuote': p(
    'No sample price data for this symbol — the reports and news below are live.',
    'אין נתוני מחיר לדוגמה לסמל הזה — הדוחות והחדשות למטה הם נתונים חיים.',
  ),
  'stock.nov': p('Nov', 'נוב׳'),
  // Was "Up about 18% over three months" with both the direction and the
  // figure hard-coded — which, once the line became real, could contradict the
  // chart directly above it. The change is now measured off the sessions on
  // screen and carries its own sign, and the period is no longer named because
  // the reader picked it.
  'stock.chartHelp': p(
    "{pct} over the period shown. The line is each day's closing price — where the stock finished the day.",
    '{pct} בתקופה המוצגת. הקו הוא מחיר הסגירה של כל יום — איפה המניה סיימה את היום.',
  ),
  // The mirror publishes a file per covered ticker and nothing for the rest,
  // so this is a fact about the symbol rather than a failure — no retry, and
  // deliberately not the "unavailable" state.
  'stock.noSeries': p(
    'No price history is published for this symbol yet.',
    'עדיין לא פורסמה היסטוריית מחירים לסמל הזה.',
  ),

  // ── Portfolio ─────────────────────────────────────────────────────────
  'pf.addTx': p('Add transaction', 'להוסיף עסקה'),
  'pf.portfolio': p('Portfolio', 'תיק'),
  'pf.totalValue': p('· total value', '· שווי כולל'),
  'pf.today': p('today', 'היום'),
  'pf.performance': p('Performance', 'ביצועים'),
  'pf.allocation': p('Allocation', 'חלוקה'),
  'pf.holdings': p('Holdings', 'החזקות'),
  'pf.byAccount': p('By account', 'לפי חשבון'),
  'pf.aggPickHelp': p(
    'Tap an account to include or exclude it from the total.',
    'אפשר להקיש על חשבון כדי לכלול או להוציא אותו מהסך הכולל.',
  ),
  'pf.excluded': p('excluded', 'לא נכלל'),
  'pf.allAccounts': p('All accounts', 'כל החשבונות'),
  'pf.allLinked': p('All linked accounts', 'כל החשבונות המחוברים'),
  // Names no account: which portfolios exist is now up to the user, so a
  // sentence naming one of them goes stale the moment they rename or add.
  'pf.aggDetail': p('Pick below which accounts are included', 'לבחור למטה אילו חשבונות נכללים'),
  'pf.synced': p('Synced {when} · read-only', 'סונכרן {when} · לקריאה בלבד'),
  /**
   * Why a portfolio total reads "—". Named holdings, not a count alone: a
   * reader who can see WHICH position is unpriced can judge how much of their
   * portfolio the missing figure represents, and can act on it.
   */
  'pf.partiallyPriced': p(
    '{priced} of {held} holdings priced · no price for {tickers}',
    '{priced} מתוך {held} החזקות תומחרו · אין מחיר ל-{tickers}',
  ),
  /**
   * What the shares still held cost, on the holding row. Labelled rather than
   * left as a bare figure: beside a market value and a return percentage, an
   * unlabelled third number is a guess.
   */
  'pf.costLabel': p('cost', 'עלות'),
  'pf.closed': p('Closed positions', 'פוזיציות שנסגרו'),
  'pf.soldOut': p('sold out', 'נמכרה במלואה'),
  // Used for any manual portfolio, not only Sandbox.
  'pf.manualDetail': p('No broker — you record the transactions', 'בלי ברוקר — העסקאות נרשמות ידנית'),
  'pf.manage': p('Manage', 'לנהל'),
  'pf.delete': p('Delete', 'למחוק'),
  'pf.deleted': p('{name} deleted', '{name} נמחק'),
  'pf.link': p('Link', 'לחבר'),
  'pf.concentration': p(
    'Two thirds of this portfolio sits in semiconductors. Concentration amplifies good days and bad ones alike.',
    'שני שלישים מהתיק הזה יושבים בשבבים. ריכוז מגדיל גם את הימים הטובים וגם את הרעים.',
  ),
  'pf.longTerm': p('Long-term savings', 'חיסכון ארוך טווח'),
  'pf.readOnly': p('Read-only', 'קריאה בלבד'),
  'pf.longTermEmpty': p(
    'Pension, Keren Hishtalmut and bank balances show up here once you connect them.',
    'קרן הפנסיה, קרן ההשתלמות והבנק יופיעו כאן ברגע שיחוברו.',
  ),
  'pf.longTermCta': p('Connect an institution', 'לחיבור מוסד'),
  'pf.newPf': p('New portfolio', 'תיק חדש'),
  'pf.createPf': p('Create portfolio', 'ליצור תיק'),
  'pf.addToPf': p('Add to portfolio', 'להוסיף לתיק'),
  'pf.theoretical': p(
    'These portfolios are theoretical — nothing is ordered anywhere.',
    'התיקים האלה תיאורטיים — שום פקודה לא נשלחת לאף מקום.',
  ),
  'pf.name': p('Name', 'שם'),
  // Placeholder, not a default value: it shows what a name could be without
  // filling the field with one nobody chose.
  'pf.namePlaceholder': p('e.g. Dividend income', 'למשל: הכנסה מדיבידנדים'),
  'pf.syncedAgo': p('synced 12 min ago', 'סונכרן לפני 12 דק׳'),
  'pf.benchmark': p('- - S&P 500', '- - S&P 500'),

  // ── Watchlist / alerts ────────────────────────────────────────────────
  // The subtitle counts what the user actually has, so it is built from two
  // halves rather than one frozen sentence.
  'watch.trackedCount': p('{n} tracked', '{n} במעקב'),
  'watch.alertsCount': p('{n} active alerts', '{n} התראות פעילות'),
  'watch.newAlert': p('New alert', 'התראה חדשה'),
  'watch.addStock': p('Add stock', 'להוסיף מניה'),
  'watch.tracking': p('Tracking', 'במעקב'),
  'watch.activeAlerts': p('Active alerts', 'התראות פעילות'),
  'watch.remove': p('Remove', 'להסיר'),
  'watch.empty': p('Your watchlist is empty', 'הווטצ׳ליסט שלך ריק'),
  'watch.emptyHelp': p(
    'Search for a stock and add it. The list is yours — it stays on this device and syncs to your account.',
    'לחפש מניה ולהוסיף אותה. הרשימה שלך — היא נשמרת במכשיר ומסתנכרנת לחשבון שלך.',
  ),
  'watch.removeAria': p('Remove {ticker} from your watchlist', 'להסיר את {ticker} מהווטצ׳ליסט'),
  'watch.alertAria': p('New alert for {ticker}', 'התראה חדשה על {ticker}'),
  'watch.noAlerts': p('No alerts yet', 'אין עדיין התראות'),
  'watch.noAlertsHelp': p(
    'An alert tells you when a stock you follow crosses a price, gets mentioned in the news, or reports.',
    'התראה מודיעה לך כשמניה שבמעקב חוצה מחיר, מוזכרת בחדשות או מפרסמת דוח.',
  ),
  'watch.symbolOnly': p('Symbol only', 'סימבול בלבד'),
  // A row names its one alert, or counts them when there are several, so a
  // stock with nine alerts is one line like every other row.
  'watch.alertsForAria': p('{n} alerts for {ticker}', '{n} התראות על {ticker}'),
  'watch.alertCount': p('{n} alerts', '{n} התראות'),
  'watch.oneAlert': p('1 alert', 'התראה אחת'),
  'watch.alertNudge': p(
    'An alert is just a nudge — it never buys or sells anything.',
    'התראה היא רק תזכורת — היא לא קונה ולא מוכרת כלום.',
  ),

  // ── Alert sheet ───────────────────────────────────────────────────────
  'alert.create': p('Create alert', 'ליצור התראה'),
  'alert.update': p('Update alert', 'לעדכן התראה'),
  'alert.created': p('Alert saved for {ticker}', 'נשמרה התראה על {ticker}'),
  'alert.already': p('{ticker} already had that alert — updated', 'כבר הייתה התראה כזו על {ticker} — עודכנה'),
  'alert.duplicateHint': p(
    'You already have this exact alert. Saving updates how it reaches you instead of adding a second one.',
    'כבר יש לך בדיוק את ההתראה הזו. שמירה תעדכן איך היא מגיעה אליך, במקום להוסיף עוד אחת.',
  ),
  'alert.priceType': p('Price threshold', 'רף מחיר'),
  'alert.priceHelp': p('When it crosses a level you set', 'כשהמחיר חוצה רף שקבעת'),
  'alert.newsType': p('News mention', 'אזכור בחדשות'),
  'alert.newsHelp': p('When a keyword shows up in coverage', 'כשמילת מפתח מופיעה בכיסוי התקשורתי'),
  'alert.earnType': p('Earnings report', 'דוח רבעוני'),
  'alert.earnHelp': p('Before or when results land', 'לפני הפרסום או ברגע שהוא יוצא'),
  'alert.stock': p('Stock', 'מניה'),
  'alert.pickStock': p('Choose a stock', 'לבחור מניה'),
  'alert.noStock': p(
    'Add a stock to your watchlist first — an alert has to be about something.',
    'קודם להוסיף מניה לווטצ׳ליסט — התראה חייבת להיות על משהו.',
  ),
  'alert.condition': p('Condition', 'תנאי'),
  'alert.rises': p('Rises above', 'עולה מעל'),
  'alert.falls': p('Falls below', 'יורד מתחת'),
  'alert.price': p('Price', 'מחיר'),
  'alert.priceHint': p("That's about 9.6% above today's price.", 'זה בערך 9.6% מעל המחיר של היום.'),
  'alert.mentions': p('Mentions of', 'אזכורים של'),
  'alert.keywords': p('data centre, guidance', 'מרכזי נתונים, תחזית'),
  'alert.sources': p('Sources', 'מקורות'),
  'alert.wires': p('Major wires', 'סוכנויות ידיעות'),
  'alert.filings': p('SEC filings', 'דיווחים לרשות'),
  'alert.remindMe': p('Remind me', 'להזכיר לי'),
  'alert.dayBefore': p('1 day before', 'יום לפני'),
  'alert.morningOf': p('Morning of', 'בבוקר הפרסום'),
  'alert.whenLands': p('When it lands', 'ברגע הפרסום'),
  'alert.notifyBy': p('Notify me by', 'לעדכן אותי דרך'),
  'alert.push': p('Push', 'פוש'),
  'alert.email': p('Email', 'אימייל'),
  'alert.cancel': p('Cancel', 'ביטול'),

  // ── Price-alert thresholds (Settings) ─────────────────────────────────
  'thresh.title': p('Price alerts', 'התראות מחיר'),
  'thresh.help': p(
    'Apply to all your positions. Leave blank to disable. Set thresholds higher than you think — "set and forget" works best.',
    'חלות על כל הפוזיציות שלך. אפשר להשאיר ריק כדי לכבות. עדיף לקבוע רף גבוה ממה שנדמה — "שגר ושכח" עובד הכי טוב.',
  ),
  'thresh.up': p('Alert me if I rise above', 'להתריע אם עליתי מעל'),
  'thresh.down': p('Alert me if I fall below', 'להתריע אם ירדתי מתחת ל'),
  'thresh.fired': p(
    '{ticker} crossed your {thresh} alert (currently {now} from entry)',
    '{ticker} חצתה את ההתראה שלך של {thresh} (כרגע {now} מנקודת הכניסה)',
  ),
  'thresh.disclaimer': p(
    "This is an alert only — no action is needed or taken. The position continues per the strategy's fixed holding rule.",
    'זו התראה בלבד — לא נדרשת ולא מתבצעת שום פעולה. הפוזיציה ממשיכה לפי כלל ההחזקה הקבוע של האסטרטגיה.',
  ),
  'thresh.markRead': p('Mark as read', 'לסמן כנקרא'),

  // ── Notifications ─────────────────────────────────────────────────────
  'notif.title': p('Notifications', 'התראות'),
  'notif.new': p('{n} new', '{n} חדשות'),
  'notif.caughtUp': p('all caught up', 'הכול מעודכן'),
  'notif.markAll': p('Mark all read', 'לסמן הכול כנקרא'),
  'notif.manageRules': p('Manage alert rules', 'לנהל כללי התראה'),

  // ── Search ────────────────────────────────────────────────────────────
  'search.placeholder': p('Search ticker or company', 'חיפוש סימבול או חברה'),
  'search.recent': p('Recent', 'אחרונים'),
  'search.add': p('Add', 'להוסיף'),
  // Confirmations. The subject is a stock — מניה, feminine — so the verb
  // agrees with it rather than with the ticker's letters.
  'toast.added': p('{ticker} added to your watchlist', '{ticker} נוספה לווטצ׳ליסט'),
  'toast.removed': p('{ticker} removed from your watchlist', '{ticker} הוסרה מהווטצ׳ליסט'),
  'search.added': p('Added', 'נוסף'),
  'search.addAria': p('Add {ticker} to your watchlist', 'להוסיף את {ticker} לווטצ׳ליסט'),
  'search.removeAria': p('Remove {ticker} from your watchlist', 'להסיר את {ticker} מהווטצ׳ליסט'),
  // Shown for a symbol that is in the engine's daily ranking but has no row
  // in the sample table — we have its price and nothing else, and the row
  // says so rather than leaving a blank where a company name belongs.
  'search.rankedOnly': p("In today's ranking", 'בדירוג היומי'),
  'search.matches': p('{n} matches', '{n} תוצאות'),
  'search.noMatch': p('No match for', 'אין תוצאה עבור'),
  'search.noMatchHelp': p(
    'Try a ticker like NVDA, or a company name.',
    'אפשר לנסות סימבול כמו NVDA, או שם של חברה.',
  ),

  // ── Movers ────────────────────────────────────────────────────────────
  'movers.gainers': p('Gainers', 'עולות'),
  'movers.losers': p('Losers', 'יורדות'),
  'movers.active': p('Most active', 'הנסחרות ביותר'),
  'sector.all': p('All', 'הכול'),
  'sector.tech': p('Technology', 'טכנולוגיה'),
  'sector.consumer': p('Consumer', 'צריכה'),
  'sector.financials': p('Financials', 'פיננסים'),
  'sector.energy': p('Energy', 'אנרגיה'),
  'sector.healthcare': p('Healthcare', 'בריאות'),
  'movers.colSym': p('Sym', 'סימבול'),
  'movers.colLast': p('Last', 'אחרון'),
  'movers.colChg': p('Chg%', 'שינוי%'),
  'movers.colVol': p('Vol', 'מחזור'),

  // ── News / earnings ───────────────────────────────────────────────────
  'news.all': p('All', 'הכול'),
  'news.myWatchlist': p('My watchlist', 'הווטצ׳ליסט שלי'),
  'news.markets': p('Markets', 'שווקים'),
  'news.calendar': p('Financial calendar', 'דוחות כספיים'),
  'news.analyst': p('Analyst', 'אנליסטים'),
  'news.viewTicker': p('View {ticker}', 'לצפייה ב-{ticker}'),
  'earn.allCompanies': p('All companies', 'כל החברות'),
  'earn.highMove': p('High implied move', 'תנועה צפויה גבוהה'),
  'earn.epsEst': p('EPS est', 'צפי EPS'),
  'earn.implied': p('implied', 'תנועה משתמעת'),
  'earn.remind': p('Remind', 'תזכורת'),
  'earn.reports': p('{n} rep.', '{n} דוחות'),
  'earn.myWatchlist': p('My watchlist', 'הווטצ׳ליסט שלי'),
  'earn.revEst': p('Rev est', 'צפי הכנסות'),
  'earn.mktCap': p('Mkt cap', 'שווי שוק'),
  'earn.lastSurprise': p('Last surprise', 'הפתעה אחרונה'),
  'earn.weekOf': p('{n} companies report in the week ahead', '{n} חברות מדווחות בשבוע הקרוב'),
  'earn.noneMatch': p('No reports match this filter', 'אין דוחות שתואמים לסינון הזה'),

  // ── Compare ───────────────────────────────────────────────────────────
  'cmp.indexed': p('Indexed to 100 at the start of the window', 'מנורמל ל-100 בתחילת התקופה'),

  // ── More / settings ───────────────────────────────────────────────────
  'more.viewMode': p('View mode', 'מצב תצוגה'),
  'more.beginner': p('Beginner', 'מתחילים'),
  'more.advanced': p('Advanced', 'מקצועי'),
  'more.begBlurb': p(
    'Plain language, one idea per card, the screener hidden until you want it.',
    'שפה פשוטה, רעיון אחד לכל כרטיס, והסקרינר מוסתר עד שצריך אותו.',
  ),
  'more.advBlurb': p(
    'Every metric on screen, candlesticks with RSI and MACD, analyst ratings, full news feed.',
    'כל המדדים על המסך, נרות עם RSI ו-MACD, דירוגי אנליסטים ופיד חדשות מלא.',
  ),
  'more.switchNote': p(
    'Switching never changes your portfolios, watchlists or alerts.',
    'המעבר לא משנה את התיקים, הווטצ׳ליסט או ההתראות.',
  ),
  'more.movers': p('Movers', 'מובילים'),
  'more.moversHelp': p('Biggest moves in the market today', 'התנועות הגדולות בשוק היום'),
  'more.steps': p('Your first steps', 'הצעדים הראשונים'),
  'more.stepsHelp': p(
    'Onboarding: app tour, learning library, opening and linking a broker — one step at a time',
    'תהליך היכרות: סיור, ספריית למידה, פתיחה וחיבור ברוקר — צעד בכל פעם',
  ),
  'more.learn': p('Learning library', 'ספריית הלמידה'),
  'more.learnHelp': p('Short cards in plain words, browse any time', 'כרטיסים קצרים בשפה פשוטה, בכל רגע'),
  'more.open': p('Open an investment account', 'לפתוח חשבון השקעות'),
  'more.openHelp': p('What a broker asks, in five questions', 'מה ברוקר מבקש, בחמש שאלות'),
  'more.connections': p('Broker connections', 'חיבורי ברוקר'),
  'more.connectionsHelp': p('Three linked accounts, one theoretical', 'שלושה חשבונות מחוברים, אחד תיאורטי'),
  'more.advChat': p('Get a recommendation', 'לקבל המלצה'),
  'more.advChatHelp': p('Four questions, then a suggested portfolio', 'ארבע שאלות, ואז הצעה לתיק'),
  'more.settings': p('Settings', 'הגדרות'),
  'more.settingsHelp': p('Notifications, data, account', 'התראות, נתונים, חשבון'),
  'more.screener': p('Screener', 'סקרינר'),
  'more.screenerHelp': p(
    "Filtering 6,412 symbols across twenty metrics needs a wide screen. Open SHIFT on desktop and it's in the sidebar.",
    'סינון של 6,412 סימבולים לפי עשרים מדדים דורש מסך רחב. אפשר לפתוח את SHIFT בדסקטופ והוא בסרגל הצד.',
  ),

  'set.modeRow': p('Detail level', 'רמת הפירוט'),
  'set.modeHelp': p(
    'Beginner shows plain language and fewer numbers; Advanced shows every metric. Nothing you save depends on it.',
    'מתחילים מציג שפה פשוטה ופחות מספרים; מקצועי מציג את כל המדדים. שום דבר שנשמר לא תלוי בזה.',
  ),
  'set.notifSection': p('Notifications', 'התראות'),
  'set.dataSection': p('Data & display', 'נתונים ותצוגה'),
  'set.accountSection': p('Account', 'חשבון'),
  'set.deleteAcct': p('Delete account', 'מחיקת חשבון'),
  'set.appearance': p('Appearance', 'מראה'),
  'set.theme': p('Theme', 'ערכת נושא'),
  'set.themeDark': p('Dark', 'כהה'),
  'set.themeLight': p('Light', 'בהיר'),
  'set.signal': p('Gain/loss colors', 'צבעי רווח/הפסד'),
  'set.signalHelp': p(
    'Dial down the red/green if saturated colors feel stressful.',
    'אפשר לרכך את האדום/ירוק אם צבעים רוויים מלחיצים.',
  ),
  'set.signalVivid': p('Vivid', 'מלא'),
  'set.signalBalanced': p('Balanced', 'מאוזן'),
  'set.signalMuted': p('Muted', 'מעומעם'),
  'set.language': p('Language', 'שפה'),

  // ── Connections screen ────────────────────────────────────────────────
  'connScreen.linked': p('Connected accounts', 'חשבונות מחוברים'),
  'connScreen.linkedHelp': p(
    'Brokers, bank, pension and hishtalmut in one place. SHIFT reads balances and positions and can never move money.',
    'ברוקרים, בנק, פנסיה וקרן השתלמות במקום אחד. SHIFT קורא יתרות ופוזיציות ולא יכול להזיז כסף.',
  ),
  'connScreen.add': p('Connect an institution', 'לחבר מוסד'),
  'connScreen.live': p('Live', 'מחובר'),
  'connScreen.theo': p('Theoretical portfolios', 'תיקים תיאורטיים'),
  // Names no portfolio: Sandbox is a demo account, so with sample data off it
  // is not there to be described.
  'connScreen.theoHelp': p(
    'A theoretical portfolio has no broker behind it — you record its transactions yourself. Useful for testing an idea before it costs anything.',
    'לתיק תיאורטי אין ברוקר מאחוריו — רושמים בו את העסקאות ידנית. שימושי לבדוק רעיון לפני שהוא עולה כסף.',
  ),
  'connScreen.newTheo': p('New theoretical portfolio', 'תיק תיאורטי חדש'),
  'connScreen.freq': p('Frequency', 'תדירות'),
  'connScreen.freqV': p('Every 15 minutes', 'כל 15 דקות'),
  'connScreen.perms': p('Permissions', 'הרשאות'),
  'connScreen.permsV': p('Read positions only', 'קריאת פוזיציות בלבד'),
  'connScreen.history': p('History imported', 'היסטוריה שיובאה'),
  'connScreen.historyV': p('Back to Jan 2024', 'מינואר 2024'),

  // ── Transactions sheet ────────────────────────────────────────────────
  'tx.title': p('Add transaction', 'הוספת עסקה'),
  'tx.buy': p('Buy', 'קנייה'),
  'tx.sell': p('Sell', 'מכירה'),
  'tx.div': p('Dividend', 'דיבידנד'),
  'tx.symbol': p('Symbol', 'סימבול'),
  'tx.shares': p('Shares', 'מניות'),
  'tx.price': p('Price / share', 'מחיר למניה'),
  'tx.date': p('Date', 'תאריך'),
  'tx.symbolPlaceholder': p('e.g. NVDA', 'למשל NVDA'),
  'tx.saved': p('{ticker} transaction saved', 'העסקה ב-{ticker} נשמרה'),
  'tx.editTitle': p('Edit transaction', 'עריכת עסקה'),
  'tx.updated': p('{ticker} transaction updated', 'העסקה ב-{ticker} עודכנה'),
  'tx.editAria': p('Edit {ticker} transaction', 'לערוך את העסקה ב-{ticker}'),
  'tx.removed': p('Transaction removed', 'העסקה נמחקה'),
  // Says what a valid symbol looks like rather than only that this one is
  // not — a reader who typed "brk b" needs to know about the dot.
  'tx.badTicker': p(
    'Enter a symbol like NVDA or BRK.B — letters, digits, dots and hyphens.',
    'צריך להזין סימבול כמו NVDA או BRK.B — אותיות, ספרות, נקודות ומקפים.',
  ),
  'tx.badShares': p(
    'Enter how many shares, as a number above zero.',
    'צריך להזין כמה מניות, מספר גדול מאפס.',
  ),
  'tx.badPrice': p('Enter the price per share you paid.', 'צריך להזין את המחיר למניה ששולם.'),
  'tx.badDate': p(
    'Pick a date — a trade cannot be in the future.',
    'צריך לבחור תאריך — עסקה לא יכולה להיות בעתיד.',
  ),
  // The number matters: "you cannot sell that many" leaves the reader
  // guessing how many they can.
  'tx.oversell': p(
    'You hold {held} {ticker} in this portfolio — you cannot sell more than that.',
    'יש לך {held} {ticker} בתיק הזה — אי אפשר למכור יותר מזה.',
  ),
  'tx.none': p('No transactions yet', 'עדיין אין עסקאות'),
  'tx.transactions': p('Transactions', 'עסקאות'),
  'tx.removeAria': p('Remove {ticker} transaction', 'למחוק את העסקה ב-{ticker}'),
  'tx.pending': p('Not saved to your account yet', 'עדיין לא נשמר לחשבון'),

  // ── Onboarding: first-run overlay ─────────────────────────────────────
  'firstRun.kicker': p('First run', 'הפעלה ראשונה'),
  'firstRun.q': p('How much detail do you want on screen?', 'כמה מידע להציג על המסך?'),
  'firstRun.help': p(
    'You can switch in the header any time. Nothing you save depends on this.',
    'אפשר להחליף בכותרת בכל רגע. שום דבר שנשמר לא תלוי בזה.',
  ),
  'firstRun.begBadge': p('plain language', 'שפה פשוטה'),
  'firstRun.advBadge': p('maximum density', 'צפיפות מלאה'),
  'firstRun.begBlurb': p(
    'One idea per card, a sentence of explanation, screener kept out of the way.',
    'רעיון אחד לכל כרטיס, משפט הסבר, והסקרינר לא מפריע.',
  ),
  'firstRun.advBlurb': p(
    'Every metric at once: candlesticks with RSI and MACD, ratings, full news feed.',
    'כל המדדים בבת אחת: נרות עם RSI ו-MACD, דירוגים, פיד חדשות מלא.',
  ),
  'firstRun.skip': p('Skip for now', 'לדלג בינתיים'),

  // ── Onboarding: tour / steps / learn / open ───────────────────────────

  'steps.progress': p('{done} of {total} done', '{done} מתוך {total} הושלמו'),
  'steps.now': p('Do this now', 'הצעד הבא'),
  'steps.markDone': p('Mark as done', 'לסמן כבוצע'),
  'steps.allDone': p('Every step done', 'כל הצעדים הושלמו'),
  'steps.allDoneBody': p(
    'From here it is watching, reading and waiting. The app will not ask anything else of you.',
    'מכאן זה בעיקר לצפות, לקרוא ולחכות. האפליקציה לא תבקש ממך שום דבר נוסף.',
  ),
  'steps.goApp': p('Go to the app', 'לאפליקציה'),
  'steps.backTo': p('‹ Back to the steps', '‹ חזרה לצעדים'),
  'learn.sub': p('Always here — every card stands alone', 'תמיד כאן — כל כרטיס עומד בפני עצמו'),
  'learn.openAccount': p('How do I actually open an account?', 'איך בעצם פותחים חשבון?'),
  'learn.next': p('Next', 'הבא'),
  'learn.showMe': p('Show me what to do', 'להראות לי מה לעשות'),
  'open.backToGuide': p('Back to the guide', 'חזרה למדריך'),
  'open.ready': p('I am ready to do this for real', 'אני רוצה לעשות את זה באמת'),
  'open.docsReady': p('{n} of 4 ready', '{n} מתוך 4 מוכנים'),
  'open.toStart': p('to start', 'להתחלה'),
  'open.smallFine': p('small is fine', 'גם קטן זה בסדר'),
  'open.moreLater': p('more later', 'אפשר להוסיף אחר כך'),

  // ── Data honesty ──────────────────────────────────────────────────────
  'data.loading': p('Loading…', 'טוען…'),
  'data.unavailable': p('Data unavailable right now', 'הנתונים אינם זמינים כרגע'),
  'data.unavailableHelp': p(
    'We show nothing rather than a made-up number. Pull to retry, or come back later.',
    'עדיף לא להציג כלום מאשר מספר מומצא. אפשר לנסות שוב או לחזור מאוחר יותר.',
  ),
  'data.retry': p('Retry', 'לנסות שוב'),
  'data.demo': p('Demo data', 'נתוני הדגמה'),

  // ── Auth ──────────────────────────────────────────────────────────────
  'auth.kicker': p('Sign in', 'התחברות'),
  'auth.title': p('Welcome to Shift', 'שמחים שהגעת ל-Shift'),
  'auth.sub': p(
    'Sign in to keep your progress and settings on every device.',
    'התחברות שומרת את ההתקדמות וההגדרות שלך בכל מכשיר.',
  ),
  'auth.google': p('Continue with Google', 'להמשיך עם Google'),
  'auth.apple': p('Continue with Apple', 'להמשיך עם Apple'),
  'auth.appleSoon': p(
    'Apple sign-in isn’t available yet — coming soon.',
    'התחברות עם Apple עדיין לא זמינה — בקרוב.',
  ),
  'auth.redirecting': p('Redirecting…', 'מעביר…'),
  'auth.errorTitle': p('Sign-in didn’t work', 'ההתחברות לא הצליחה'),
  'auth.retry': p('Try again', 'לנסות שוב'),
  'set.signOut': p('Sign out', 'התנתקות'),
  'set.signedInAs': p('Signed in as {email}', 'מחובר/ת כ-{email}'),
  'set.providerGoogle': p('via Google', 'דרך Google'),
  'set.providerApple': p('via Apple', 'דרך Apple'),
  'set.editProfile': p('Edit profile', 'עריכת פרופיל'),
  'set.displayName': p('Display name', 'שם תצוגה'),
  'set.namePlaceholder': p('The name shown in the app', 'השם שמוצג באפליקציה'),
  'set.nameInvalid': p('A name of up to 60 characters', 'שם באורך עד 60 תווים'),
  'set.changePhoto': p('Change picture', 'החלפת תמונה'),
  'set.uploading': p('Uploading…', 'מעלה…'),
  'set.photoHelp': p('JPEG, PNG or WebP, up to 2 MB', 'JPEG, PNG או WebP, עד 2 מגה'),
  'set.useProviderName': p('Use my Google name', 'להשתמש בשם מ-Google'),
  'set.useProviderPhoto': p('Use my Google picture', 'להשתמש בתמונה מ-Google'),
  'set.save': p('Save', 'שמירה'),
  'set.saving': p('Saving…', 'שומר…'),
  'set.saved': p('Saved', 'נשמר'),
  'set.saveFailedTitle': p('Not saved', 'לא נשמר'),
  'set.emailFixed': p(
    'The email comes from the account you signed in with and cannot be changed here.',
    'האימייל מגיע מהחשבון שאיתו נכנסת ולא ניתן לשנות אותו כאן.',
  ),
  'set.deleteTitle': p('Delete account', 'מחיקת חשבון'),
  'set.deleteWarn': p(
    'This permanently deletes your account and everything stored with it — your risk profile, onboarding progress, watchlist and alerts. It cannot be undone, and signing in again creates a fresh account.',
    'הפעולה מוחקת לצמיתות את החשבון שלך ואת כל מה שנשמר איתו — פרופיל הסיכון, ההתקדמות בהקמה, הווטצ׳ליסט וההתראות. אי אפשר לבטל אותה, והתחברות מחדש תיצור חשבון חדש.',
  ),
  'set.deleteConfirm': p('Delete permanently', 'למחוק לצמיתות'),
  'set.deleteCancel': p('Cancel', 'ביטול'),
  'set.deleting': p('Deleting…', 'מוחק…'),
  'set.deleteFailedTitle': p('The account was not deleted', 'החשבון לא נמחק'),
  // ── Connected account (founder demo, SnapTrade Personal) ──────────────
  // A demo-only, single-account, read-only integration. Every string here is
  // written to make that scope unmistakable — nothing may read as a feature
  // an end user can use today.
  'title.snaptrade': p('Connected account', 'חשבון מקושר'),
  'kicker.snaptrade': p('Demo · read-only', 'הדגמה · קריאה בלבד'),
  'live.title': p('Connected account (demo)', 'חשבון מקושר (הדגמה)'),
  'live.badge': p('Real data', 'נתונים אמיתיים'),
  'live.intro': p(
    "One real brokerage account, read live and read-only through SnapTrade. This is a founder demo on SnapTrade's free Personal tier — a single account, not account linking for users.",
    'חשבון ברוקר אמיתי אחד, נקרא בזמן אמת ובקריאה בלבד דרך SnapTrade. זו הדגמה של המייסדת בשכבת Personal החינמית של SnapTrade — חשבון בודד, לא חיבור חשבונות למשתמשים.',
  ),
  'live.notForUsers': p(
    "Not available to users. Multi-user account linking would need SnapTrade's Commercial tier with KYC and billing — a separate decision that has not been made.",
    'לא זמין למשתמשים. חיבור חשבונות לריבוי משתמשים ידרוש את שכבת Commercial של SnapTrade עם KYC וחיוב — החלטה נפרדת שטרם התקבלה.',
  ),
  'live.readOnly': p(
    'Read-only: balances and positions only. No trading endpoint is ever called.',
    'קריאה בלבד: יתרות ופוזיציות בלבד. לא מתבצעת שום קריאה לממשק מסחר.',
  ),
  'live.none': p('No brokerage account connected yet.', 'עדיין לא מקושר חשבון ברוקר.'),
  'live.noneHelp': p(
    "Connect one in SnapTrade's own Connection Portal and it will appear here. Nothing is shown until a real account is linked.",
    'אפשר לקשר חשבון בפורטל החיבורים של SnapTrade והוא יופיע כאן. עד שיקושר חשבון אמיתי לא יוצג דבר.',
  ),
  'live.balances': p('Balances', 'יתרות'),
  'live.positions': p('Positions', 'פוזיציות'),
  'live.noPositions': p('This account holds no positions.', 'בחשבון הזה אין פוזיציות.'),
  'live.cash': p('Cash', 'מזומן'),
  'live.buyingPower': p('Buying power', 'כוח קנייה'),
  'live.total': p('Total value', 'שווי כולל'),
  'live.units': p('Units', 'יחידות'),
  'live.price': p('Price', 'מחיר'),
  'live.value': p('Value', 'שווי'),
  'live.avgCost': p('Avg cost', 'עלות ממוצעת'),
  'live.openPnl': p('Open P&L', 'רווח/הפסד פתוח'),
  'live.unknownFields': p(
    'A dash means the brokerage did not report that field. Nothing here is estimated or filled in.',
    'מקף פירושו שהברוקר לא דיווח על השדה הזה. שום נתון כאן אינו משוער או מושלם מעצמנו.',
  ),
  'live.noHistory': p(
    "No performance history: this is a live read of the account's current state, and the brokerage reports no day change or priced history through this integration.",
    'אין היסטוריית ביצועים: זו קריאה חיה של מצב החשבון כרגע, והברוקר אינו מדווח שינוי יומי או היסטוריה מתומחרת דרך החיבור הזה.',
  ),
  'live.shortExcluded': p(
    'Short positions are left out of the ring: a negative holding has no share of a total. Not shown here: {tickers}.',
    'פוזיציות שורט אינן נכללות בטבעת: להחזקה שלילית אין נתח מתוך סך הכול. לא מוצגות כאן: {tickers}.',
  ),
  'live.noAllocation': p(
    'The brokerage did not price these positions, so no allocation can be shown.',
    'הברוקר לא תמחר את הפוזיציות, ולכן לא ניתן להציג פילוח.',
  ),
  'live.setting': p('Demo: real connected account', 'הדגמה: חשבון מקושר אמיתי'),
  'live.settingHelp': p(
    'Off shows the app exactly as it is today, with demo accounts. On replaces them with the one real brokerage account read through SnapTrade. Founder demo only.',
    'כבוי מציג את האפליקציה בדיוק כפי שהיא היום, עם חשבונות הדגמה. דלוק מחליף אותם בחשבון הברוקר האמיתי היחיד שנקרא דרך SnapTrade. להדגמת המייסדת בלבד.',
  ),
  'live.freshRealtime': p('Read from the brokerage just now', 'נקרא מהברוקר ממש עכשיו'),
  'live.freshDaily': p("SnapTrade's daily snapshot", 'תמונת המצב היומית של SnapTrade'),
  'live.asOf': p('Brokerage data fetched {when}', 'נתוני הברוקר נקראו {when}'),
  'live.connectedNoAccounts': p(
    'Connected to {broker}, but the brokerage is reporting no accounts.',
    'מקושר ל-{broker}, אך הברוקר אינו מדווח על אף חשבון.',
  ),
  'live.connectedNoAccountsHelp': p(
    'The connection is live, so this is what SnapTrade currently holds for it. Some brokerages — Interactive Brokers among them — deliver data through a scheduled report feed rather than a live API, and that feed can take a day or two to start after it is first enabled. Check that the reporting service is switched on at the broker.',
    'החיבור פעיל, ולכן זה מה ש-SnapTrade מחזיקה עבורו כרגע. חלק מהברוקרים — ובהם Interactive Brokers — מעבירים נתונים דרך דוח מתוזמן ולא דרך API חי, והזנת הדוח הזו יכולה להתחיל רק יום-יומיים אחרי שמפעילים אותה לראשונה. כדאי לוודא ששירות הדיווח מופעל אצל הברוקר.',
  ),
  'live.connectedNoAccountsDelayed': p(
    'This connection is served from a cache (delayed), not queried live — so an empty list can mean the cache has not been filled yet rather than that the account is empty. A manual refresh can populate it.',
    'החיבור הזה מוגש ממטמון (delayed) ולא נשאל בזמן אמת — ולכן רשימה ריקה יכולה להעיד שהמטמון טרם התמלא, ולא שהחשבון ריק. רענון ידני יכול למלא אותו.',
  ),
  'live.connDisabledTitle': p('The connection to {broker} is disabled.', 'החיבור ל-{broker} מושבת.'),
  'live.connDisabledHelp': p(
    'Nothing from it is shown. A disabled connection keeps returning its last cached figures, and there is no way to tell how old they are — so showing them would be presenting stale holdings as current. Reconnect it in SnapTrade to restore it.',
    'שום נתון ממנו אינו מוצג. חיבור מושבת ממשיך להחזיר את הנתונים האחרונים שנשמרו במטמון, ואין דרך לדעת בני כמה הם — כך שהצגתם פירושה להציג החזקות ישנות כאילו הן עדכניות. אפשר לחבר מחדש ב-SnapTrade כדי לשחזר אותו.',
  ),
  'live.connState': p('Connection: {state}', 'החיבור: {state}'),
  'live.connActive': p('active', 'פעיל'),
  'live.connDisabled': p('disabled', 'מושבת'),
  // ── Home-screen gate (lib/install.ts, screens/InstallGate.tsx) ─────────
  // Shown instead of the whole app on a phone that opened it in a browser
  // tab. It is a dead end by design, so the copy has to carry the reason and
  // the exact route out — on iOS there is no button that can do it for you.
  'install.kicker': p('Add to home screen', 'הוספה למסך הבית'),
  'install.title': p('Shift runs from your home screen', 'Shift פועלת ממסך הבית'),
  'install.sub': p(
    'On a phone, Shift opens from its own icon — not from a browser tab. One step, nothing to download from a store.',
    'בטלפון Shift נפתחת מהאייקון שלה, לא מלשונית בדפדפן. שלב אחד, בלי להוריד כלום מחנות.',
  ),
  'install.cta': p('Add to home screen', 'הוספה למסך הבית'),
  'install.working': p('Opening the dialog…', 'פותח את החלון…'),
  'install.dismissed': p(
    'Closed without installing — you can open it again.',
    'נסגר בלי להתקין — אפשר לפתוח שוב.',
  ),
  'install.done': p('Added. Open Shift from its new icon.', 'נוסף. אפשר לפתוח את Shift מהאייקון החדש.'),
  'install.stepsTitle': p('Three taps', 'שלוש הקשות'),
  // iOS Safari — the only route, and it is manual.
  'install.ios1': p('Share', 'שיתוף'),
  'install.ios2': p('Add to Home Screen', 'הוספה למסך הבית'),
  'install.ios3': p('Add', 'הוספה'),
  // Everything on iOS that cannot add to the home screen itself: an in-app
  // browser (Instagram, Facebook, Gmail) at any version, and Chrome/Firefox/
  // Edge below iOS 16.4, which is where Apple gave them the item at all.
  'install.iosSafariOnly': p(
    'This browser cannot add to the home screen — open the page in Safari.',
    'הדפדפן הזה לא יכול להוסיף למסך הבית — כדאי לפתוח את הדף ב-Safari.',
  ),
  // Anything else: the item exists but each browser names it differently.
  'install.manual': p('Browser menu → “Install app”', 'תפריט הדפדפן ← ״התקנת אפליקציה״'),
  'install.demoMenu': p('Menu', 'תפריט'),
  'install.demoInstall': p('Install app', 'התקנת אפליקציה'),
  'install.demoDone': p('Open it from the icon', 'פתיחה מהאייקון'),
  'install.copyLink': p('Copy the link', 'העתקת הקישור'),
  'install.copied': p('Copied — now paste it in Safari', 'הועתק — כעת להדביק ב-Safari'),
  'install.already': p(
    'Already added it? Open Shift from the icon.',
    'כבר הוספת? אפשר לפתוח את Shift מהאייקון.',
  ),
  // The optional card in Settings → More, for a browser that is not gated
  // (desktop, or a preview build) but can still install.
  'install.cardTitle': p('Install Shift', 'התקנת Shift'),
  'install.cardHelp': p(
    'Opens in its own window, without browser chrome.',
    'נפתחת בחלון משלה, בלי סרגלי הדפדפן.',
  ),
  'more.snaptrade': p('Connected account (demo)', 'חשבון מקושר (הדגמה)'),
  'more.snaptradeHelp': p('One real account, read-only', 'חשבון אמיתי אחד, קריאה בלבד'),
} as const;

export type StringKey = keyof typeof STRINGS;
