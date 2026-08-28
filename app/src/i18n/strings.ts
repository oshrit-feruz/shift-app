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
  'kicker.pf': p('Four accounts', 'ארבעה חשבונות'),
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
  'title.advChat': p('Get a recommendation', 'קבלי המלצה'),
  'kicker.advChat': p('Four questions', 'ארבע שאלות'),
  'title.advDisc': p('Disclosure', 'גילוי נאות'),
  'kicker.advDisc': p('Recommendation', 'קבלי המלצה'),
  'title.advDash': p('Your recommendation', 'ההמלצה שלך'),
  'kicker.advDash': p('Core-Satellite', 'Core-Satellite'),
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
    'חברי ברוקר או פתחי חשבון חדש כדי לראות כאן את ההחזקות שלך.',
  ),
  'home.trackSelf': p('Do it yourself', 'לבד, בקצב שלי'),
  'home.trackSelfSub': p('Browse, pick your own, log your own trades.', 'לחקור, לבחור בעצמך, לרשום עסקאות.'),
  'home.trackHere': p('You are here', 'את כאן'),
  'home.trackAdvisor': p('Get a recommendation', 'קבלי המלצה'),
  'home.trackAdvisorSub': p('Four questions, then a suggested portfolio.', 'ארבע שאלות, ואז הצעה לתיק.'),
  'home.startHere': p('New to investing? Start here', 'חדשה בהשקעות? מתחילים כאן'),
  'home.startHereSub': p('A short guide, then the steps', 'מדריך קצר, ואחריו הצעדים'),
  'home.watchlist': p('Watchlist', 'ווטצ׳ליסט'),
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
  'setup.banner': p('Complete your setup', 'השלימי את ההגדרה'),
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
  'adv.pickOne': p('Pick one', 'בחרי אחת'),
  'adv.yourProfile': p('Your profile', 'הפרופיל שלך'),
  'adv.confirmProfile': p('Confirm profile', 'אשר פרופיל'),
  'adv.restart': p('Start over', 'להתחיל מחדש'),
  'adv.redoChat': p('Redo the questions', 'לענות מחדש'),
  'adv.back': p('Back', 'חזרה'),
  'adv.later': p('Continue later', 'אמשיך אחר כך'),
  'adv.skipStep': p('Skip this step', 'דלגי על השלב הזה'),
  'adv.stepPrev': p('Back', 'הקודם'),
  'adv.stepNext': p('Next', 'הבא'),
  'adv.fromLibrary': p('From the library', 'מהספרייה'),
  'adv.openLibrary': p('Open the library', 'לספרייה המלאה'),
  'adv.eduChatTitle': p('An ETF buys the whole basket', 'קרן סל קונה את כל הסל'),
  'adv.eduChatBody': p(
    'One thing you buy that holds hundreds of companies at once — which is why the Core below is built from ETF categories, not single stocks.',
    'דבר אחד שקונים והוא מחזיק מאות חברות בבת אחת — ולכן הליבה שתראי בהמשך בנויה מקטגוריות של קרנות סל, לא ממניות בודדות.',
  ),

  'adv.q1': p('How long can this money stay invested?', 'לכמה זמן הכסף הזה יכול להישאר מושקע?'),
  'adv.q1a1': p('Under 2 years', 'פחות משנתיים'),
  'adv.q1a2': p('Two to seven years', 'שנתיים עד 7 שנים'),
  'adv.q1a3': p('More than seven years', 'יותר מ-7 שנים'),
  'adv.q2': p('The market drops 20% in a month. What do you do?', 'השוק יורד 20% בחודש. מה את עושה?'),
  'adv.q2a1': p('I would sell — a 10% drop already worries me', 'הייתי מוכרת — גם ירידה של 10% מלחיצה אותי'),
  'adv.q2a2': p('I would hold and stop looking', 'הייתי מחזיקה ומפסיקה להסתכל'),
  'adv.q2a3': p('I would buy more', 'הייתי קונה עוד'),
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
    'Capital preservation first. Mostly bonds and a broad developed-market index, no satellite sleeve.',
    'שמירה על הכסף קודם כול. בעיקר אג״ח ומדד עולמי רחב, בלי רכיב Satellite.',
  ),
  'profile.bal.blurb': p(
    'A broad index core with a bond cushion, plus a small rules-based satellite sleeve.',
    'ליבה של מדדים רחבים עם כרית אג״ח, ועוד רכיב Satellite קטן שמנוהל לפי כללים.',
  ),
  'profile.growth.blurb': p(
    'Equity-heavy core across regions, with the largest satellite sleeve the rules allow.',
    'ליבה מנייתית רחבה על פני אזורים, עם רכיב Satellite בגודל המקסימלי שהכללים מתירים.',
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
    'The satellite sleeve follows one published rule set, identical for every client, and is capped at 15% of the portfolio.',
    'רכיב ה-Satellite פועל לפי מערכת כללים אחת, זהה לכל לקוח, ומוגבל ל-15% מהתיק.',
  ),
  'disc.p4': p(
    'Past behaviour of these rules is not a promise about the future. You can lose money.',
    'התנהגות הכללים בעבר אינה הבטחה לעתיד. אפשר להפסיד כסף.',
  ),
  'disc.cta': p('Show the recommendation', 'להצגת ההמלצה'),

  // ── Recommendation dashboard ──────────────────────────────────────────
  'rec.coreSatIntro': p(
    'A Core-Satellite split: a broad index core, and — where the profile allows it — a small rules-based satellite sleeve.',
    'חלוקת Core-Satellite: ליבה של מדדים רחבים, ובמקום שהפרופיל מתיר — רכיב Satellite קטן שמנוהל לפי כללים.',
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
  'rec.satellite': p('Satellite', 'Satellite (רכיב לווין)'),
  'rec.ofPortfolio': p('of the portfolio', 'מהתיק'),
  'rec.satHelp': p(
    'Recovery Detector is a deterministic strategy — no discretion, no per-person tuning.',
    'Recovery Detector היא אסטרטגיה דטרמיניסטית — בלי שיקול דעת ובלי התאמה אישית.',
  ),
  'rec.satRule1': p('S&P 500 large caps only', 'מניות גדולות במדד S&P 500 בלבד'),
  'rec.satRule2': p(
    'Entry when the price is 40–60% below its 52-week high',
    'כניסה כשהמחיר נמוך ב-40%–60% מהשיא של 52 שבועות',
  ),
  'rec.satRule3': p(
    'Held for a fixed 180 days, then closed by rule',
    'החזקה קבועה של 180 יום, ואז סגירה לפי הכלל',
  ),
  'rec.satRule4': p(
    'The same rules for every client — nothing is customised per person',
    'אותם כללים לכל לקוח — אין התאמה אישית',
  ),
  'rec.satRule5': p('Capped at 15% of the portfolio', 'מוגבל ל-15% מהתיק'),
  'rec.satOpenPositions': p(
    'Recovery Detector — open positions right now',
    'Recovery Detector — פוזיציות פתוחות כרגע',
  ),
  'rec.satPositions': p("Today's candidates", 'המועמדות של היום'),
  'rec.livePrices': p('Live prices', 'מחירים חיים'),
  'rec.satInfoOnly': p(
    'Information only — your profile has no satellite sleeve, so these are not part of your recommendation.',
    'מידע בלבד — בפרופיל שלך אין רכיב Satellite, ולכן אלה לא חלק מההמלצה שלך.',
  ),
  'rec.noPositions': p('No candidates today', 'אין מועמדות היום'),
  'rec.fromHigh': p('from high', 'מהשיא'),
  'rec.score': p('score', 'ציון'),
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
  'conn.choose': p('Choose who to connect', 'בחרי את מי לחבר'),
  'conn.connected': p('✓ Connected', '✓ מחובר'),
  'conn.connect': p('Connect', 'לחבר'),
  'conn.close': p('Close', 'סגירה'),
  'conn.continue': p('Continue', 'המשך'),
  'conn.done': p('Done', 'סיימתי'),
  'conn.broker': p('Broker', 'ברוקר'),
  'conn.bank': p('Bank account', 'חשבון בנק'),
  'conn.pension': p('Pension fund', 'קרן פנסיה'),
  'conn.hisht': p('Keren Hishtalmut', 'קרן השתלמות'),

  // ── First purchase ────────────────────────────────────────────────────
  'buy.title': p('Your first purchase — a simulation', 'הקנייה הראשונה — סימולציה'),
  'buy.help': p(
    'This is what the recommendation looks like as an order list. Nothing is bought here — when you are ready, it happens at your broker.',
    'כך ההמלצה נראית כרשימת קנייה. שום דבר לא נקנה כאן — כשתהיי מוכנה, זה קורה אצל הברוקר שלך.',
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
    'Shift לא שולח פקודות. הכפתורים פותחים את הברוקר שלך, ושם את מחליטה ומבצעת בעצמך.',
  ),
  'buy.noDeepLink': p(
    'A direct per-stock link is not set up yet, so the broker opens on its home page with the ticker copied.',
    'קישור ישיר לכל מניה עדיין לא מוגדר, ולכן הברוקר נפתח בעמוד הבית עם הסימול מועתק.',
  ),
  'buy.example': p('Example with $10,000', 'דוגמה עם $10,000'),
  'buy.finish': p('Done — to the dashboard', 'סיימנו — לדשבורד'),

  // ── Stock page ────────────────────────────────────────────────────────
  'stock.afterHrs': p('Aug 21, 4:00 PM ET · after hrs', '21 באוג׳, 16:00 ET · אחרי המסחר'),
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
  'stock.engineTitle': p('Recovery Detector view', 'מבט Recovery Detector'),
  'stock.drawdown': p('Below 52-week high', 'מתחת לשיא 52 שבועות'),
  'stock.high52w': p('52-week high', 'שיא 52 שבועות'),
  'stock.score': p('Composite score', 'ציון משוקלל'),
  'stock.notRanked': p(
    'This stock is not in the current Recovery Detector ranking, so there are no engine figures for it today.',
    'מניה זו אינה מופיעה בדירוג הנוכחי של Recovery Detector, ולכן אין עבורה נתוני מנוע היום.',
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
    'אין חדשות אחרונות על המניות שאת עוקבת אחריהן.',
  ),
  'news.watchlistNone': p(
    'Your watchlist is empty, so there is nothing to pull news for.',
    'הווטצ׳ליסט שלך ריק, אז אין עבור מה למשוך חדשות.',
  ),
  'news.openSource': p('Open at the source', 'לפתוח במקור'),
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
  'demo.pricesNote': p(
    'Prices, charts and portfolio figures on this screen are sample data, not live market data.',
    'מחירים, גרפים ונתוני תיק במסך הזה הם נתוני דוגמה, לא נתוני שוק אמיתיים.',
  ),
  'demo.showcase': p(
    'Illustrative data — this is how these screens look on a paid data plan that includes reported results.',
    'נתוני הדגמה — כך המסכים נראים עם מנוי נתונים בתשלום שכולל גם תוצאות שדווחו.',
  ),
  'set.showcaseRow': p('Demo: full earnings data', 'הדגמה: נתוני דוחות מלאים'),
  'set.showcaseHelp': p(
    'Fills the calendar and each stock’s history with illustrative figures, to show what a paid data plan adds. Clearly marked wherever it shows, and never used when live data fails.',
    'ממלא את היומן ואת ההיסטוריה של כל מניה בנתוני הדגמה, כדי להראות מה מנוי בתשלום מוסיף. מסומן בבירור בכל מקום שהוא מופיע, ולעולם לא משמש כשנתונים חיים נכשלים.',
  ),
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
  'stock.chartHelp': p(
    "Up about {pct} over three months. The line is each day's closing price — where the stock finished the day.",
    'עלייה של בערך {pct} בשלושה חודשים. הקו הוא מחיר הסגירה של כל יום — איפה המניה סיימה את היום.',
  ),

  // ── Portfolio ─────────────────────────────────────────────────────────
  'pf.addTx': p('Add transaction', 'להוסיף עסקה'),
  'pf.portfolio': p('Portfolio', 'תיק'),
  'pf.totalValue': p('· total value', '· שווי כולל'),
  'pf.today': p('today', 'היום'),
  'pf.allocation': p('Allocation', 'חלוקה'),
  'pf.holdings': p('Holdings', 'החזקות'),
  'pf.byAccount': p('By account', 'לפי חשבון'),
  'pf.aggPickHelp': p(
    'Tap an account to include or exclude it from the total.',
    'לחצי על חשבון כדי לכלול או להוציא אותו מהסך הכולל.',
  ),
  'pf.excluded': p('excluded', 'לא נכלל'),
  'pf.allAccounts': p('All accounts', 'כל החשבונות'),
  'pf.allLinked': p('All linked accounts', 'כל החשבונות המחוברים'),
  'pf.aggDetail': p(
    'Pick below which accounts are included — Sandbox stays out',
    'בחרי למטה אילו חשבונות נכללים — Sandbox נשאר בחוץ',
  ),
  'pf.synced': p('Synced {when} · read-only', 'סונכרן {when} · לקריאה בלבד'),
  'pf.sandboxTitle': p('Sandbox · theoretical', 'Sandbox · תיאורטי'),
  'pf.sandboxDetail': p('No broker — you record the transactions', 'בלי ברוקר — את רושמת את העסקאות'),
  'pf.manage': p('Manage', 'לנהל'),
  'pf.link': p('Link', 'לחבר'),
  'pf.concentration': p(
    'Two thirds of this portfolio sits in semiconductors. Concentration amplifies good days and bad ones alike.',
    'שני שלישים מהתיק הזה יושבים בשבבים. ריכוז מגדיל גם את הימים הטובים וגם את הרעים.',
  ),
  'pf.longTerm': p('Long-term savings', 'חיסכון ארוך טווח'),
  'pf.readOnly': p('Read-only', 'קריאה בלבד'),
  'pf.longTermEmpty': p(
    'Pension, Keren Hishtalmut and bank balances show up here once you connect them.',
    'קרן הפנסיה, קרן ההשתלמות והבנק יופיעו כאן ברגע שתחברי אותם.',
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
  'pf.startCash': p('Starting cash', 'מזומן פתיחה'),
  'pf.divIncome': p('Dividend income', 'הכנסה מדיבידנדים'),
  'pf.syncedAgo': p('synced 12 min ago', 'סונכרן לפני 12 דק׳'),
  'pf.benchmark': p('- - S&P 500', '- - S&P 500'),

  // ── Watchlist / alerts ────────────────────────────────────────────────
  'watch.sub': p('4 active alerts · 8 tracked', '4 התראות פעילות · 8 במעקב'),
  'watch.newAlert': p('New alert', 'התראה חדשה'),
  'watch.tracking': p('Tracking', 'במעקב'),
  'watch.activeAlerts': p('Active alerts', 'התראות פעילות'),
  'watch.remove': p('Remove', 'להסיר'),
  'watch.alertNudge': p(
    'An alert is just a nudge — it never buys or sells anything.',
    'התראה היא רק תזכורת — היא לא קונה ולא מוכרת כלום.',
  ),

  // ── Alert sheet ───────────────────────────────────────────────────────
  'alert.create': p('Create alert', 'ליצור התראה'),
  'alert.priceType': p('Price threshold', 'רף מחיר'),
  'alert.priceHelp': p('When it crosses a level you set', 'כשהמחיר חוצה רף שקבעת'),
  'alert.newsType': p('News mention', 'אזכור בחדשות'),
  'alert.newsHelp': p('When a keyword shows up in coverage', 'כשמילת מפתח מופיעה בכיסוי התקשורתי'),
  'alert.earnType': p('Earnings report', 'דוח רבעוני'),
  'alert.earnHelp': p('Before or when results land', 'לפני הפרסום או ברגע שהוא יוצא'),
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
  'thresh.up': p('Alert me if I rise above', 'התרע לי אם עליתי מעל'),
  'thresh.down': p('Alert me if I fall below', 'התרע לי אם ירדתי מתחת ל'),
  'thresh.fired': p(
    '{ticker} crossed your {thresh} alert (currently {now} from entry)',
    '{ticker} חצתה את ההתראה שלך של {thresh} (כרגע {now} מנקודת הכניסה)',
  ),
  'thresh.disclaimer': p(
    "This is an alert only — no action is needed or taken. The position continues per the strategy's fixed holding rule.",
    'זו התראה בלבד — לא נדרשת ולא מתבצעת שום פעולה. הפוזיציה ממשיכה לפי כלל ההחזקה הקבוע של האסטרטגיה.',
  ),
  'thresh.markRead': p('Mark as read', 'סמן כנקרא'),

  // ── Notifications ─────────────────────────────────────────────────────
  'notif.title': p('Notifications', 'התראות'),
  'notif.new': p('{n} new', '{n} חדשות'),
  'notif.caughtUp': p('all caught up', 'הכול מעודכן'),
  'notif.markAll': p('Mark all read', 'לסמן הכול כנקרא'),
  'notif.manageRules': p('Manage alert rules', 'לנהל כללי התראה'),

  // ── Search ────────────────────────────────────────────────────────────
  'search.placeholder': p('Search ticker or company', 'חיפוש סימבול או חברה'),
  'search.recent': p('Recent', 'אחרונים'),
  'search.matches': p('{n} matches', '{n} תוצאות'),
  'search.noMatch': p('No match for', 'אין תוצאה עבור'),
  'search.noMatchHelp': p(
    'Try a ticker like NVDA, or a company name.',
    'נסי סימבול כמו NVDA, או שם של חברה.',
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
    'שפה פשוטה, רעיון אחד לכל כרטיס, והסקרינר מוסתר עד שתרצי אותו.',
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
  'more.advChat': p('Get a recommendation', 'קבלי המלצה'),
  'more.advChatHelp': p('Four questions, then a suggested portfolio', 'ארבע שאלות, ואז הצעה לתיק'),
  'more.settings': p('Settings', 'הגדרות'),
  'more.settingsHelp': p('Notifications, data, account', 'התראות, נתונים, חשבון'),
  'more.screener': p('Screener', 'סקרינר'),
  'more.screenerHelp': p(
    "Filtering 6,412 symbols across twenty metrics needs a wide screen. Open SHIFT on desktop and it's in the sidebar.",
    'סינון של 6,412 סימבולים לפי עשרים מדדים דורש מסך רחב. פתחי את SHIFT בדסקטופ והוא בסרגל הצד.',
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
  'connScreen.theoHelp': p(
    'Sandbox has no broker behind it — you record its transactions yourself. Useful for testing an idea before it costs anything.',
    'ל-Sandbox אין ברוקר מאחוריו — את רושמת בו את העסקאות בעצמך. שימושי לבדוק רעיון לפני שהוא עולה כסף.',
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

  // ── Onboarding: first-run overlay ─────────────────────────────────────
  'firstRun.kicker': p('First run', 'הפעלה ראשונה'),
  'firstRun.q': p('How much detail do you want on screen?', 'כמה מידע את רוצה לראות על המסך?'),
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
  'steps.howItWorks': p('How the app works', 'איך האפליקציה בנויה'),
  'steps.now': p('Do this now', 'הצעד הבא'),
  'steps.markDone': p('Mark as done', 'סמני כבוצע'),
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
  'learn.showMe': p('Show me what to do', 'תראי לי מה לעשות'),
  'open.backToGuide': p('Back to the guide', 'חזרה למדריך'),
  'open.ready': p('I am ready to do this for real', 'אני מוכנה לעשות את זה באמת'),
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
  'auth.title': p('Welcome to Shift', 'ברוכים הבאים ל-Shift'),
  'auth.sub': p(
    'Sign in to keep your progress and settings on every device.',
    'התחברות שומרת את ההתקדמות וההגדרות שלך בכל מכשיר.',
  ),
  'auth.google': p('Continue with Google', 'המשך עם Google'),
  'auth.apple': p('Continue with Apple', 'המשך עם Apple'),
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
} as const;

export type StringKey = keyof typeof STRINGS;
