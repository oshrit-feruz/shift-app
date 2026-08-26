/* Shift — Hebrew beginner demo. One continuous composition, camera-driven. */

const C = {
  bg: '#161826', g1: '#242840', surf: '#272a3c', surf2: '#31354b', line: '#3f424d',
  grid: '#2b2d3a', text: '#e9e9ed', muted: '#8b8fa3', acc: '#9184d9', accL: '#b5abfc',
  acc900: '#241f3d', up: '#4ec98d', dn: '#e8615c'
};
const FONT = "Rubik, system-ui, sans-serif";
const HEB = { direction: 'rtl', fontFamily: FONT };
const SCREEN = { direction: 'rtl', fontFamily: FONT, height: '100%', display: 'flex', flexDirection: 'column' };
const BODY = {
  flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
  justifyContent: 'space-evenly', paddingBottom: 84
};
const NUM = { direction: 'ltr', unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums' };

const MOTION = {
  enter: (start, dur) => animate({ from: 0, to: 1, start, end: start + (dur || 0.7), ease: Easing.easeOutCubic }),
  draw: (start, dur) => animate({ from: 0, to: 1, start, end: start + (dur || 1.1), ease: Easing.easeInOutQuart }),
  pop: (start, dur) => animate({ from: 0, to: 1, start, end: start + (dur || 0.5), ease: Easing.easeOutBack })
};

/* ── camera ───────────────────────────────────────────────── */
function camAt(keys, T) {
  let a = keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i], n = keys[i + 1];
    if (T >= k.t && T < n.t) {
      if (n.t === k.t) return n;
      const e = (k.ease || Easing.easeInOutCubic)((T - k.t) / (n.t - k.t));
      return { x: k.x + (n.x - k.x) * e, y: k.y + (n.y - k.y) * e, s: k.s + (n.s - k.s) * e };
    }
    a = n;
  }
  return keys[keys.length - 1];
}

/* ── primitives ───────────────────────────────────────────── */
function Phone({ x, y, w = 380, children, glow, op = 1, sc = 1, rot = 0 }) {
  const h = w * 2.06;
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: w, height: h,
      transform: `translate(-50%,-50%) scale(${sc}) rotate(${rot}deg)`, opacity: op,
      borderRadius: w * 0.13, background: '#0c0d16', padding: w * 0.026,
      boxShadow: glow ? `0 0 ${w * 0.5}px ${C.acc}44, 0 40px 90px #0008` : '0 30px 70px #0009'
    }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: w * 0.13,
        border: `${w * 0.006}px solid #2c2e3d`, pointerEvents: 'none', zIndex: 5
      }} />
      <div style={{
        width: '100%', height: '100%', borderRadius: w * 0.107, overflow: 'hidden',
        background: `radial-gradient(120% 60% at 15% -6%, ${C.g1} 0%, ${C.bg} 55%)`,
        position: 'relative', color: C.text
      }}>{children}</div>
    </div>
  );
}

function StatusBar({ w = 380 }) {
  const p = w / 380;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: `${16 * p}px ${20 * p}px ${4 * p}px`,
      fontSize: 12 * p, color: C.text, ...NUM
    }}>
      <span style={{ fontWeight: 500 }}>9:41</span>
      <span style={{ flex: 1 }} />
      <span style={{ display: 'flex', gap: 3 * p, alignItems: 'flex-end' }}>
        {[4, 6, 8, 10].map((h, i) => <span key={i} style={{ width: 3 * p, height: h * p, borderRadius: 1, background: i < 3 ? C.text : C.muted }} />)}
      </span>
      <span style={{ marginLeft: 6 * p, width: 20 * p, height: 10 * p, borderRadius: 2, border: `1px solid ${C.muted}`, padding: 1.5 * p }}>
        <span style={{ display: 'block', width: '72%', height: '100%', background: C.text, borderRadius: 1 }} />
      </span>
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{
    background: C.surf, borderRadius: 14, padding: 14, display: 'flex',
    flexDirection: 'column', gap: 8, boxShadow: '0 1px 0 #ffffff08 inset', ...style
  }}>{children}</div>;
}

function Spark({ w, h, up = true, prog = 1, seed = 3 }) {
  const n = 26, pts = [];
  let v = 50;
  for (let i = 0; i < n; i++) {
    v += (up ? 1.6 : -1.6) + Math.sin(seed + i * 1.7) * 3.4;
    pts.push([i / (n - 1) * w, h - 3 - (v - 30) / 60 * (h - 6)]);
  }
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <path d={d} fill="none" stroke={up ? C.up : C.dn} strokeWidth="2"
        strokeDasharray={w * 2} strokeDashoffset={w * 2 * (1 - prog)} />
    </svg>
  );
}

function Tap({ x, y, at, T, size = 54 }) {
  const p = MOTION.pop(at, 0.55)(T);
  if (p <= 0 || T > at + 1.1) return null;
  const f = Math.max(0, 1 - (T - at) / 1.0);
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
      borderRadius: '50%', border: `3px solid ${C.accL}`, opacity: f * 0.9,
      transform: `scale(${0.4 + p * 1.1})`, zIndex: 9, pointerEvents: 'none'
    }} />
  );
}

/* ── scene 1: five apps ───────────────────────────────────── */
const CHAOS = [
  { label: 'גרפים', x: -430, y: -230, rot: -8, kind: 'chart' },
  { label: 'חדשות', x: 30, y: -300, rot: 5, kind: 'news' },
  { label: 'סקרינר', x: 470, y: -190, rot: 10, kind: 'table' },
  { label: 'תיק', x: -270, y: 300, rot: 7, kind: 'pie' },
  { label: 'התראות', x: 300, y: 340, rot: -6, kind: 'alerts' }
];

function MiniApp({ kind, label, T, at }) {
  const p = MOTION.enter(at, 0.8)(T);
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, opacity: p, ...HEB }}>
      <StatusBar w={300} />
      <div style={{ fontSize: 15, fontWeight: 600, padding: '0 4px' }}>{label}</div>
      {kind === 'chart' && <>
        <div style={{ background: C.surf, borderRadius: 10, padding: 8 }}>
          <Spark w={250} h={90} up prog={1} seed={2} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>{['1D', '1W', '1M', '1Y'].map(x =>
          <span key={x} style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, background: C.grid, ...NUM }}>{x}</span>)}</div>
      </>}
      {kind === 'news' && [0, 1, 2, 3].map(i =>
        <div key={i} style={{ background: C.surf, borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ height: 6, width: `${88 - i * 9}%`, background: C.line, borderRadius: 3 }} />
          <span style={{ height: 5, width: `${64 - i * 7}%`, background: C.grid, borderRadius: 3 }} />
        </div>)}
      {kind === 'table' && <div style={{ background: C.surf, borderRadius: 10, overflow: 'hidden' }}>
        {Array.from({ length: 9 }).map((_, i) =>
          <div key={i} style={{ display: 'flex', gap: 6, padding: '6px 8px', borderTop: i ? `1px solid ${C.grid}` : 0 }}>
            {[34, 28, 24, 20].map((w, j) =>
              <span key={j} style={{ height: 5, width: w, borderRadius: 3, background: j === 3 ? (i % 3 ? C.up : C.dn) : C.line, opacity: 0.8 }} />)}
          </div>)}
      </div>}
      {kind === 'pie' && <div style={{ background: C.surf, borderRadius: 10, padding: 14, display: 'grid', placeItems: 'center' }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          {[[0, 130, C.acc], [130, 90, C.accL], [220, 80, C.up], [300, 60, C.line]].map(([s, len, col], i) =>
            <circle key={i} cx="60" cy="60" r="42" fill="none" stroke={col} strokeWidth="16"
              strokeDasharray={`${len / 360 * 264} 264`} strokeDashoffset={-s / 360 * 264} transform="rotate(-90 60 60)" />)}
        </svg>
      </div>}
      {kind === 'alerts' && [0, 1, 2].map(i =>
        <div key={i} style={{ background: C.surf, borderRadius: 8, padding: 9, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 20, height: 20, borderRadius: 6, background: C.acc900, color: C.accL, display: 'grid', placeItems: 'center', fontSize: 10 }}>▲</span>
          <span style={{ flex: 1, height: 6, background: C.line, borderRadius: 3 }} />
        </div>)}
    </div>
  );
}

/* ── phone screens ────────────────────────────────────────── */
function ScreenHeader({ title, kicker }) {
  return (
    <div style={{ padding: '10px 18px 8px', ...HEB }}>
      <div style={{ fontSize: 20.8, letterSpacing: '.12em', color: C.muted, textTransform: 'uppercase' }}>{kicker}</div>
      <div style={{ fontSize: 41.6, fontWeight: 500, marginTop: 3 }}>{title}</div>
    </div>
  );
}

const TABS = [
  ['בית', 'M4 11l8-7 8 7v8a1 1 0 01-1 1h-5v-6h-4v6H5a1 1 0 01-1-1z'],
  ['מניה', 'M4 18l4-6 3 2 4-7 3 3M4 4v16h16'],
  ['ווטצ׳', 'M6 9a6 6 0 1112 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9zM10 18a2 2 0 004 0'],
  ['תיק', 'M3 7h18v12H3zM8 7V5h8v2'],
  ['עוד', 'M5 12h.01M12 12h.01M19 12h.01']
];
function TabBar({ active = 0 }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', direction: 'rtl',
      padding: '10px 12px 26px', borderTop: `1px solid ${C.grid}`, background: '#161826ee'
    }}>
      {TABS.map(([label, d], i) => {
        const on = i === active;
        return (
          <div key={label} style={{
            flex: 1, textAlign: 'center', fontFamily: FONT, fontSize: 21.6,
            color: on ? C.accL : C.muted
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={on ? C.accL : C.muted}
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
              style={{ display: 'block', margin: '0 auto 3px' }}>
              <path d={d} />
            </svg>
            {label}
          </div>
        );
      })}
    </div>
  );
}

function OnboardScreen({ T, at }) {
  const e = MOTION.enter(at + 0.2, 0.8)(T);
  const picked = T > at + 3.4;
  const cards = [
    { n: 'מתחילים', b: 'רעיון אחד לכל כרטיס, משפט הסבר, בלי טבלאות.', dense: false },
    { n: 'מקצועי', b: 'כל המדדים בבת אחת: נרות, RSI, MACD, סקרינר.', dense: true }
  ];
  return (
    <div style={{ ...SCREEN, opacity: e }}>
      <StatusBar />
      <div style={{ ...BODY, padding: '0 18px 84px' }}>
      <div>
        <div style={{ fontSize: 20.8, letterSpacing: '.12em', color: C.muted }}>הפעלה ראשונה</div>
        <div style={{ fontSize: 43.2, fontWeight: 500, marginTop: 8, lineHeight: 1.25 }}>כמה מידע את רוצה לראות?</div>
        <div style={{ fontSize: 22.4, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          זה קובע את הצפיפות בכל המסכים. אפשר להחליף בכל רגע.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {cards.map((c, i) => {
          const on = i === 0 ? picked : false;
          return (
            <div key={c.n} style={{
              borderRadius: 14, padding: 15,
              border: `1.5px solid ${on ? C.acc : C.line}`,
              background: on ? C.acc900 : 'transparent',
              transform: `scale(${on ? 1.02 : 1})`, transition: 'none'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 27.2, fontWeight: 600 }}>{c.n}</span>
                {on && <span style={{ fontSize: 20.8, color: C.accL, border: `1px solid ${C.acc}`, borderRadius: 20, padding: '2px 8px' }}>נבחר</span>}
              </div>
              <div style={{ fontSize: 23.2, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>{c.b}</div>
              <svg viewBox="0 0 260 44" style={{ width: '100%', height: 40, marginTop: 10 }}>
                {(c.dense
                  ? Array.from({ length: 9 }, (_, k) => ({ x: (k % 3) * 88, y: Math.floor(k / 3) * 15, w: 74, h: 4 }))
                  : Array.from({ length: 4 }, (_, k) => ({ x: 0, y: k * 11, w: 150 + (k * 47) % 100, h: 6 }))
                ).map((r, k) => <rect key={k} x={r.x} y={r.y} width={r.w} height={r.h} rx="2" fill={k === 0 ? C.acc : C.line} />)}
              </svg>
            </div>
          );
        })}
      </div>
      </div>
      <Tap x={190} y={470} at={at + 3.2} T={T} />
    </div>
  );
}

function GuideScreen({ T, at }) {
  const steps = [
    ['בואי נתחיל מהיסודות', 'מה זו בכלל מניה, ולמה המחיר זז כל יום.', true],
    ['לקרוא למה משהו זז', 'שתי כותרות מתחת לגרף — ותביני מה חשוב ומה רעש.', true],
    ['להגדיר התראה אחת', 'ואז אפשר לסגור את האפליקציה במקום לבדוק אותה.', false],
    ['להתאמן בלי כסף', 'תיק Sandbox רושם את העסקאות שהיית עושה.', false],
    ['לפתוח חשבון כשמוכנים', 'חמש שאלות קצרות על מה שהברוקר יבקש.', false]
  ];
  const prog = clamp((T - at - 0.6) / 5, 0, 1);
  return (
    <div style={{ ...SCREEN }}>
      <StatusBar />
      <ScreenHeader kicker="מדריך" title="הצעדים הראשונים" />
      <div style={{ ...BODY, padding: '0 18px 84px', gap: 9 }}>
        <div style={{ height: 5, borderRadius: 3, background: C.grid, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${20 + prog * 40}%`, background: C.acc, borderRadius: 3 }} />
        </div>
        {steps.map((s, i) => {
          const o = MOTION.enter(at + 0.5 + i * 0.42, 0.6)(T);
          const done = s[2];
          return (
            <div key={i} style={{
              opacity: o, transform: `translateY(${(1 - o) * 14}px)`,
              borderRadius: 13, padding: 13, background: C.surf,
              border: `1px solid ${done ? C.acc + '77' : 'transparent'}`,
              display: 'flex', gap: 11, alignItems: 'flex-start'
            }}>
              <span style={{
                width: 26, height: 26, flex: 'none', borderRadius: 9, marginTop: 2,
                background: done ? C.acc : C.grid, color: done ? '#1a1626' : C.muted,
                display: 'grid', placeItems: 'center', fontSize: 23.2, fontWeight: 600
              }}>{done ? '✓' : i + 1}</span>
              <span>
                <span style={{ display: 'block', fontSize: 24, fontWeight: 500 }}>{s[0]}</span>
                <span style={{ display: 'block', fontSize: 22.4, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>{s[1]}</span>
              </span>
            </div>
          );
        })}
      </div>
      <TabBar active={4} />
    </div>
  );
}

function EtfScreen({ T, at }) {
  const one = MOTION.enter(at + 0.5, 0.7)(T);
  const many = MOTION.pop(at + 2.0, 0.9)(T);
  const dots = Array.from({ length: 12 });
  return (
    <div style={{ ...SCREEN }}>
      <StatusBar />
      <ScreenHeader kicker="מדריך" title="מה זו קרן סל?" />
      <div style={{ ...BODY, padding: '4px 18px 84px', gap: 13 }}>
        <div style={{ opacity: one, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 96, height: 96, flex: 'none', borderRadius: 14, border: `1.5px solid ${C.dn}`, background: C.dn + '22', display: 'grid', placeItems: 'center' }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', background: C.dn }} />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 500 }}>מניה אחת</div>
            <div style={{ fontSize: 22.4, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>הכול תלוי בחברה אחת. אם היא נופלת, את נופלת איתה.</div>
          </div>
        </div>
        <div style={{ opacity: clamp(many, 0, 1), display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{
            width: 96, height: 96, flex: 'none', borderRadius: 14, border: `1.5px solid ${C.acc}`, background: C.acc900,
            display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, padding: 10, alignContent: 'center'
          }}>
            {dots.map((_, i) => {
              const o = clamp((many - i * 0.055) * 4, 0, 1);
              return <span key={i} style={{ width: '100%', aspectRatio: '1', borderRadius: '50%', background: i % 3 ? C.acc : C.accL, opacity: o, transform: `scale(${0.5 + o * 0.5})` }} />;
            })}
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 500 }}>קרן סל — ETF</div>
            <div style={{ fontSize: 22.4, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>קנייה אחת שמחזיקה מאות חברות ביחד. חברה אחת שנופלת כמעט לא מרגישה.</div>
          </div>
        </div>
        <div style={{ opacity: MOTION.enter(at + 4.4, 0.7)(T), background: C.surf, borderRadius: 13, padding: 13, fontSize: 23.2, lineHeight: 1.55, color: C.text }}>
          בגלל זה קרן סל היא בדרך כלל הקנייה הראשונה. לא כי היא משעממת — כי היא פורשת את הסיכון.
        </div>
        <div style={{ opacity: MOTION.enter(at + 5.4, 0.7)(T), background: C.surf, borderRadius: 13, padding: 13, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontSize: 22.4, color: C.muted }}>מה יש בפועל בתוך קרן סל אחת</div>
          {[['טכנולוגיה', 32, C.acc], ['פיננסים', 14, C.accL], ['בריאות', 12, C.up], ['עוד 8 סקטורים', 42, C.grid]].map(([n, w, col], i) => {
            const g = clamp((T - at - 5.6 - i * 0.14) * 2.2, 0, 1);
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 19.2 }}>
                <span style={{ width: 92, color: C.text }}>{n}</span>
                <span style={{ flex: 1, height: 7, borderRadius: 4, background: C.grid, overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: (w * g) + '%', background: col, borderRadius: 4 }} />
                </span>
                <span style={{ width: 34, textAlign: 'end', color: C.muted, ...NUM }}>{w}%</span>
              </div>
            );
          })}

        </div>
      </div>
      <TabBar active={4} />
    </div>
  );
}

function OpenAcctScreen({ T, at }) {
  const docs = [
    ['תעודת זהות', 0.9], ['אישור כתובת', 1.9], ['פרטי חשבון בנק', 2.9], ['מספר תיק במס', 3.9]
  ];
  return (
    <div style={{ ...SCREEN }}>
      <StatusBar />
      <ScreenHeader kicker="שלב 2 מתוך 5" title="מה צריך להכין" />
      <div style={{ ...BODY, padding: '2px 18px 84px', gap: 10 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[0, 1, 2, 3, 4].map(i =>
            <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= 1 ? C.acc : C.grid }} />)}
        </div>
        <div style={{ fontSize: 21.6, color: C.muted, lineHeight: 1.55 }}>
          הפתיחה אונליין לוקחת בערך רבע שעה, ברגע שארבעת הדברים האלה בהישג יד.
        </div>
        {docs.map(([label, d], i) => {
          const on = T > at + d;
          const o = MOTION.enter(at + 0.4 + i * 0.3, 0.5)(T);
          return (
            <div key={label} style={{
              opacity: o, display: 'flex', alignItems: 'center', gap: 11, padding: 13,
              borderRadius: 13, background: on ? C.acc900 : C.surf,
              border: `1px solid ${on ? C.acc : 'transparent'}`
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: 7, flex: 'none',
                border: `1.5px solid ${on ? C.acc : C.line}`, background: on ? C.acc : 'transparent',
                color: '#1a1626', display: 'grid', placeItems: 'center', fontSize: 23.2, fontWeight: 700
              }}>{on ? '✓' : ''}</span>
              <span style={{ fontSize: 24 }}>{label}</span>
              <span style={{ flex: 1 }} />
              {on && <span style={{ fontSize: 21.6, color: C.accL }}>מוכן</span>}
            </div>
          );
        })}
        <div style={{ opacity: MOTION.enter(at + 4.4, 0.6)(T), fontSize: 22.4, color: C.muted, lineHeight: 1.5 }}>
          SHIFT לא פותח את החשבון בשבילך — הוא רק מסביר בדיוק מה יבקשו ממך.
        </div>
      </div>
      <TabBar active={4} />
    </div>
  );
}

function ConnectScreen({ T, at }) {
  const brokers = [['Blink', 'assets/broker-blink.webp', 'ברוקר'], ['Interactive Brokers', 'assets/broker-ibkr.png', 'ברוקר'], ['בנק לאומי', null, 'חשבון בנק']];
  return (
    <div style={{ ...SCREEN }}>
      <StatusBar />
      <ScreenHeader kicker="חיבורים" title="הברוקר והבנק שלך" />
      <div style={{ ...BODY, padding: '2px 18px 84px', gap: 9 }}>
        {brokers.map(([n, logo, kind], i) => {
          const o = MOTION.enter(at + 0.4 + i * 0.5, 0.6)(T);
          const linked = T > at + 1.4 + i * 0.7;
          return (
            <div key={n} style={{
              opacity: o, transform: `translateY(${(1 - o) * 12}px)`,
              display: 'flex', alignItems: 'center', gap: 11, padding: 13, borderRadius: 13, background: C.surf
            }}>
              <span style={{
                width: 34, height: 34, flex: 'none', borderRadius: 9,
                background: logo ? '#fff' : C.acc900, color: C.accL,
                display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 600,
                backgroundImage: logo ? `url(${logo})` : 'none', backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center'
              }}>{logo ? '' : '₪'}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 23.2 }}>{n}</span>
                <span style={{ display: 'block', fontSize: 21.6, color: C.muted, marginTop: 2 }}>{kind} · לקריאה בלבד</span>
              </span>
              <span style={{
                fontSize: 21.6, padding: '4px 10px', borderRadius: 20,
                background: linked ? C.up + '26' : C.grid, color: linked ? C.up : C.muted
              }}>{linked ? 'מחובר' : 'מתחבר…'}</span>
            </div>
          );
        })}
        <div style={{ opacity: MOTION.enter(at + 3.4, 0.7)(T), background: C.acc900, borderRadius: 13, padding: 13, fontSize: 23.2, lineHeight: 1.55 }}>
          ברוקרים ובנק, תמונה אחת. SHIFT רואה יתרות והחזקות — ולא יכול לשלוח פקודה.
        </div>
        <div style={{ opacity: MOTION.enter(at + 4.4, 0.7)(T), background: C.surf, borderRadius: 13, padding: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 21.6, color: C.muted }}>התמונה המשולבת</div>
          <div style={{ fontSize: 48, fontWeight: 500, lineHeight: 1.05 }}>
            <span style={NUM}>$70,979.96</span>
          </div>
          <div style={{ fontSize: 21.6, color: C.up }}><span style={NUM}>+0.94% היום · +26.8% מאז ההתחלה</span></div>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1, marginTop: 4 }}>
            {[[58.4, C.acc], [15.6, C.accL], [26.0, C.up]].map(([w, col], i) => (
              <span key={i} style={{ flex: w, background: col, opacity: clamp((T - at - 4.8 - i * 0.18) * 2.4, 0, 1) }} />
            ))}
          </div>
          <div style={{ fontSize: 21.6, color: C.muted, lineHeight: 1.5 }}>
            תיק Sandbox התיאורטי נשאר בחוץ — הוא לא כסף אמיתי.
          </div>
        </div>
      </div>
      <TabBar active={3} />
    </div>
  );
}

function PortfolioScreen({ T, at }) {
  const grow = MOTION.draw(at + 0.7, 1.9)(T);
  const rows = [['VOO', 'קרן סל · S&P 500', '$1,240', '+2.1%'], ['NVDA', 'שבבים ל-AI', '$620', '+4.8%']];
  return (
    <div style={{ ...SCREEN }}>
      <StatusBar />
      <ScreenHeader kicker="Sandbox · תיאורטי" title="התיק הראשון שלך" />
      <div style={{ ...BODY, padding: '2px 18px 84px', gap: 12 }}>
        <Card>
          <div style={{ fontSize: 21.6, color: C.muted }}>שווי התיק</div>
          <div style={{ fontSize: 54.4, fontWeight: 500, lineHeight: 1.05 }}>
            <span style={NUM}>$1,860.00</span>
          </div>
          <div style={{ fontSize: 22.4, color: C.up }}><span style={NUM}>+$54.20 · +3.0%</span></div>
          <div style={{ marginTop: 6 }}><Spark w={300} h={76} up prog={grow} seed={5} /></div>
        </Card>
        {rows.map(([t, sub, val, chg], i) => {
          const o = MOTION.enter(at + 2.2 + i * 0.45, 0.6)(T);
          return (
            <div key={t} style={{ opacity: o, display: 'flex', alignItems: 'center', gap: 11, padding: '10px 4px', borderTop: `1px solid ${C.grid}` }}>
              <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 9, background: C.acc900, color: C.accL, display: 'grid', placeItems: 'center', fontSize: 20.8, fontWeight: 600, ...NUM }}>{t}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 23.2, fontWeight: 600, ...NUM }}>{t}</span>
                <span style={{ display: 'block', fontSize: 21.6, color: C.muted, marginTop: 2 }}>{sub}</span>
              </span>
              <span style={{ textAlign: 'end' }}>
                <span style={{ display: 'block', fontSize: 22.4, ...NUM }}>{val}</span>
                <span style={{ display: 'block', fontSize: 21.6, color: C.up, ...NUM }}>{chg}</span>
              </span>
            </div>
          );
        })}
      </div>
      <TabBar active={3} />
    </div>
  );
}

function DenseScreen({ T, at }) {
  /* the same watchlist, advanced density — appears as the mode flips */
  const flip = clamp((T - at - 0.5) / 1.2, 0, 1);
  const rows = [
    ['NVDA', '182.44', '+2.31%', '148M', '4.45T', '52.1', 61],
    ['AAPL', '226.79', '+0.42%', '41.6M', '3.36T', '34.8', 55],
    ['MSFT', '508.12', '−0.67%', '18.9M', '3.78T', '36.2', 48],
    ['AMD', '171.35', '+4.86%', '62.4M', '277B', '88.4', 72],
    ['TSLA', '334.62', '−3.18%', '96.1M', '1.08T', '197', 38],
    ['JPM', '291.04', '+0.88%', '9.2M', '812B', '14.6', 58],
    ['LLY', '742.18', '+1.96%', '3.4M', '705B', '61.9', 63],
    ['XOM', '112.47', '−1.24%', '15.7M', '486B', '14.1', 44]
  ];
  return (
    <div style={{ ...SCREEN }}>
      <StatusBar />
      <div style={{ padding: '8px 14px 6px', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        <div style={{ fontSize: 32, fontWeight: 500, flex: 1 }}>ווטצ׳ליסט</div>
        <div style={{ display: 'flex', padding: 3, gap: 2, borderRadius: 20, border: `1px solid ${C.line}`, background: '#0003' }}>
          {['מתחילים', 'מקצועי'].map((m, i) => {
            const on = i === 1 ? flip > 0.5 : flip <= 0.5;
            return <span key={m} style={{
              fontSize: 16.8, padding: '4px 9px', borderRadius: 20,
              background: on ? C.acc : 'transparent', color: on ? '#1a1626' : C.muted, fontWeight: on ? 600 : 400
            }}>{m}</span>;
          })}
        </div>
      </div>
      <div style={{ ...BODY, padding: '0 10px 84px', direction: 'ltr', justifyContent: 'space-between', gap: 0 }}>
        <div style={{ display: 'flex', gap: 4, padding: '0 4px 5px', fontSize: 14.4, color: C.muted, ...NUM }}>
          <span style={{ width: 44 }}>SYM</span><span style={{ flex: 1, textAlign: 'right' }}>LAST</span>
          <span style={{ width: 50, textAlign: 'right' }}>CHG%</span>
          <span style={{ width: 42, textAlign: 'right', opacity: flip }}>VOL</span>
          <span style={{ width: 40, textAlign: 'right', opacity: flip }}>MCAP</span>
          <span style={{ width: 30, textAlign: 'right', opacity: flip }}>P/E</span>
          <span style={{ width: 24, textAlign: 'right', opacity: flip }}>RSI</span>
        </div>
        {rows.map(([t, last, chg, vol, mc, pe, rsi], i) => {
          const shown = i < 4 || flip > 0.35;
          const o = i < 4 ? 1 : clamp((flip - 0.35) * 3, 0, 1);
          const up = chg[0] === '+';
          return (
            <div key={t} style={{
              display: shown ? 'flex' : 'none', gap: 4, alignItems: 'center', opacity: o,
              padding: `${8 - flip * 3}px 4px`, borderTop: `1px solid ${C.grid}`, fontSize: 21.6, ...NUM
            }}>
              <span style={{ width: 44, fontWeight: 600 }}>{t}</span>
              <span style={{ flex: 1, textAlign: 'right' }}>{last}</span>
              <span style={{ width: 50, textAlign: 'right', color: up ? C.up : C.dn }}>{chg}</span>
              <span style={{ width: 42, textAlign: 'right', color: C.muted, opacity: flip }}>{vol}</span>
              <span style={{ width: 40, textAlign: 'right', color: C.muted, opacity: flip }}>{mc}</span>
              <span style={{ width: 30, textAlign: 'right', color: C.muted, opacity: flip }}>{pe}</span>
              <span style={{ width: 24, textAlign: 'right', color: rsi > 70 ? C.dn : C.accL, opacity: flip }}>{rsi}</span>
              <span style={{ width: 46, opacity: flip, display: 'flex', alignItems: 'center' }}>
                <svg width="46" height="10" viewBox="0 0 46 10" style={{ display: 'block' }}>
                  <rect y="4" width="46" height="2" rx="1" fill={C.line} />
                  <circle cx={6 + ((rsi - 30) / 50) * 34} cy="5" r="3" fill={up ? C.up : C.dn} />
                </svg>
              </span>
            </div>
          );
        })}
        <div style={{ opacity: flip, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: C.grid, borderRadius: 10, overflow: 'hidden' }}>
            {[['S&P 500', '6,482', '+0.54%'], ['Nasdaq', '21,706', '+0.91%'], ['VIX', '14.82', '−3.40%']].map(([k, v, c]) => (
              <div key={k} style={{ background: C.surf, padding: '8px 9px' }}>
                <div style={{ fontSize: 14.4, color: C.muted, letterSpacing: '.06em' }}>{k}</div>
                <div style={{ fontSize: 23.2, ...NUM }}>{v}</div>
                <div style={{ fontSize: 16.8, color: c[0] === '+' ? C.up : C.dn, ...NUM }}>{c}</div>
              </div>
            ))}
          </div>
          <div style={{ background: C.surf, borderRadius: 10, padding: 10, direction: 'rtl' }}>
            <div style={{ fontSize: 16, color: C.acc, letterSpacing: '.08em', marginBottom: 6 }}>חום סקטורים</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 3 }}>
              {[['שבבים', 2.18], ['טכנולוגיה', 1.42], ['אנרגיה', -0.94], ['צריכה', -0.38]].map(([n, v], i) => {
                const o = clamp((T - at - 1.6 - i * 0.08) * 3, 0, 1);
                const mag = Math.min(46, 12 + Math.abs(v) * 16).toFixed(0);
                return (
                  <div key={n} style={{
                    opacity: o, padding: '6px 5px', borderRadius: 6,
                    background: (v >= 0 ? C.up : C.dn) + (mag > 30 ? '55' : '30')
                  }}>
                    <div style={{ fontSize: 15.2 }}>{n}</div>
                    <div style={{ fontSize: 20.8, ...NUM }}>{(v >= 0 ? '+' : '') + v.toFixed(2) + '%'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <TabBar active={2} />
      <Tap x={92} y={70} at={at + 0.3} T={T} size={44} />
    </div>
  );
}

/* ── desktop ──────────────────────────────────────────────── */
function Desktop({ T, at }) {
  const e = MOTION.enter(at, 1)(T);
  const draw = MOTION.draw(at + 0.8, 2.2)(T);
  const candles = Array.from({ length: 46 }, (_, i) => {
    const s = Math.sin(i * 0.7) * 22 + Math.cos(i * 1.9) * 12;
    const o = 150 - s, c = 150 - s - Math.sin(i * 2.3) * 16;
    return { x: 20 + i * 20, o, c, hi: Math.min(o, c) - 12, lo: Math.max(o, c) + 12, up: c < o };
  });
  const cols = ['SYMBOL', 'LAST', 'CHG%', 'MKT CAP', 'P/E', 'FWD P/E', 'EPS', 'DIV', 'VOLUME', 'RSI', 'SECTOR'];
  const srows = [
    ['NVDA', '182.44', '+2.31', '4.45T', '52.1', '38.4', '3.51', '—', '148M', '61'],
    ['AAPL', '226.79', '+0.42', '3.36T', '34.8', '29.7', '6.52', '0.44%', '41.6M', '55'],
    ['MSFT', '508.12', '−0.67', '3.78T', '36.2', '31.1', '14.0', '0.68%', '18.9M', '48'],
    ['AVGO', '341.77', '+1.63', '1.59T', '42.7', '33.9', '8.01', '0.91%', '22.4M', '59'],
    ['JPM', '291.04', '+0.88', '812B', '14.6', '13.2', '19.9', '2.10%', '9.2M', '58'],
    ['LLY', '742.18', '+1.96', '705B', '61.9', '44.8', '12.0', '0.62%', '3.4M', '63']
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: 1760, height: 700, opacity: e,
      transform: `translate(-50%,-50%) scale(${0.97 + e * 0.03})`, borderRadius: 18,
      background: `radial-gradient(120% 80% at 12% -8%, ${C.g1} 0%, ${C.bg} 55%)`,
      boxShadow: '0 50px 120px #000a', overflow: 'hidden', color: C.text, border: `1px solid ${C.line}`
    }}>
      <div style={{ height: 54, display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px', borderBottom: `1px solid ${C.grid}`, background: '#0004' }}>
        {['#e8615c', '#e8c05c', '#4ec98d'].map(c => <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />)}
        <span style={{ marginLeft: 14, fontSize: 19, color: C.muted, fontFamily: FONT }}>SHIFT — Screener</span>
      </div>
      <div style={{ display: 'flex', height: 'calc(100% - 54px)' }}>
        <div style={{ width: 268, borderRight: `1px solid ${C.grid}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 6, ...HEB }}>
          <div style={{ fontSize: 14, letterSpacing: '.1em', color: C.acc, textTransform: 'uppercase', marginBottom: 4 }}>ניווט</div>
          {['סקירה', 'מניה', 'תיקים', 'ווטצ׳ליסט', 'מובילי שוק', 'סקרינר', 'חדשות'].map((n, i) =>
            <div key={n} style={{
              fontSize: 19, padding: '10px 12px', borderRadius: 8,
              background: i === 5 ? C.acc900 : 'transparent', color: i === 5 ? C.accL : C.text
            }}>{n}</div>)}
        </div>
        <div style={{ flex: 1, padding: '16px 16px 16px 60px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, background: C.surf, borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, ...NUM }}>
                {['1D', '1W', '1M', '3M', '1Y', 'MA', 'RSI', 'MACD'].map((x, i) =>
                  <span key={x} style={{ fontSize: 15, padding: '5px 11px', borderRadius: 6, background: i > 4 ? C.acc900 : C.grid, color: i > 4 ? C.accL : C.muted }}>{x}</span>)}
              </div>
              <svg width="960" height="196" style={{ display: 'block', maxWidth: '100%' }}>
                {[34, 78, 120, 164].map(y => <line key={y} x1="0" y1={y} x2="960" y2={y} stroke={C.grid} />)}
                {candles.map((k, i) => {
                  const vis = i / candles.length < draw;
                  if (!vis) return null;
                  return <g key={i}>
                    <line x1={k.x} y1={k.hi} x2={k.x} y2={k.lo} stroke={k.up ? C.up : C.dn} strokeWidth="1.4" />
                    <rect x={k.x - 5} y={Math.min(k.o, k.c)} width="10" height={Math.max(3, Math.abs(k.c - k.o))} fill={k.up ? C.up : C.dn} />
                  </g>;
                })}
              </svg>
              <svg width="960" height="54" style={{ display: 'block', maxWidth: '100%', marginTop: 4, borderTop: `1px solid ${C.grid}` }}>
                <line x1="0" y1="14" x2="960" y2="14" stroke={C.line} strokeDasharray="3 3" />
                <line x1="0" y1="42" x2="960" y2="42" stroke={C.line} strokeDasharray="3 3" />
                <path d={candles.map((k, i) => (i ? 'L' : 'M') + k.x + ' ' + (30 + Math.sin(i * 0.55) * 15)).join(' ')}
                  fill="none" stroke={C.accL} strokeWidth="1.5" strokeDasharray="1000" strokeDashoffset={1000 * (1 - draw)} />
                <text x="6" y="14" fill={C.muted} fontSize="15" fontFamily="Rubik">RSI(14) 61</text>
              </svg>
            </div>
            <div style={{ width: 360, background: C.surf, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 5, ...HEB }}>
              <div style={{ fontSize: 14, letterSpacing: '.1em', color: C.acc, textTransform: 'uppercase' }}>מסננים</div>
              {[['שווי שוק', 'גדול'], ['מכפיל רווח', '8 – 45'], ['מחזור מינימלי', '2M'], ['תשואת דיבידנד', 'מעל 1%'], ['סקטור', 'טכנולוגיה'], ['RSI', 'מתחת 70']].map(([k, v], i) => {
                const o = MOTION.enter(at + 1.4 + i * 0.22, 0.5)(T);
                return <div key={k} style={{ opacity: o, display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 18, padding: '9px 0', borderTop: `1px solid ${C.grid}`, whiteSpace: 'nowrap' }}>
                  <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>{k}</span><span style={{ whiteSpace: 'nowrap' }}>{v}</span>
                </div>;
              })}
            </div>
          </div>
          <div style={{ flex: 1, background: C.surf, borderRadius: 12, padding: '10px 12px', direction: 'ltr', minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 14, fontSize: 14, color: C.muted, paddingBottom: 8, ...NUM }}>
              {cols.map((c, i) => <span key={c} style={{ width: i === 0 ? 104 : i === 10 ? 132 : 98, textAlign: i ? 'right' : 'left' }}>{c}</span>)}
            </div>
            {srows.map((r, i) => {
              const o = MOTION.enter(at + 2.4 + i * 0.16, 0.5)(T);
              const up = r[2][0] === '+';
              return <div key={r[0]} style={{ opacity: o, display: 'flex', gap: 14, fontSize: 20, padding: '10px 0', borderTop: `1px solid ${C.grid}`, ...NUM }}>
                {r.map((v, j) => <span key={j} style={{
                  width: j === 0 ? 104 : 98, textAlign: j ? 'right' : 'left', fontWeight: j === 0 ? 600 : 400,
                  color: j === 2 ? (up ? C.up : C.dn) : j > 2 ? C.muted : C.text
                }}>{v}</span>)}
                <span style={{ width: 132, textAlign: 'right', color: C.muted }}>Technology</span>
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── title cards ──────────────────────────────────────────── */
function TitleCard({ x, y, kicker, title, sub, T, at }) {
  const k = MOTION.enter(at + 0.15, 0.6)(T);
  const t1 = MOTION.enter(at + 0.45, 0.9)(T);
  const s = MOTION.enter(at + 1.15, 0.9)(T);
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: 1500, transform: 'translate(-50%,-50%)',
      textAlign: 'center', ...HEB
    }}>
      <div style={{ fontSize: 22, letterSpacing: '.22em', color: C.acc, opacity: k, textTransform: 'uppercase' }}>{kicker}</div>
      <div style={{
        fontSize: 92, fontWeight: 500, lineHeight: 1.18, marginTop: 20, color: C.text,
        opacity: t1, transform: `translateY(${(1 - t1) * 26}px)`, textWrap: 'pretty'
      }}>{title}</div>
      {sub && <div style={{
        fontSize: 34, lineHeight: 1.5, marginTop: 26, color: C.muted, opacity: s,
        transform: `translateY(${(1 - s) * 16}px)`, maxWidth: 1120, marginInline: 'auto'
      }}>{sub}</div>}
    </div>
  );
}

function Logo({ size = 1, T, at }) {
  const e = MOTION.enter(at, 1.0)(T);
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <img src="assets/shift-wordmark.svg" alt="SHIFT"
        style={{
          width: 470 * size, height: 'auto', display: 'block',
          opacity: e, transform: `scale(${0.94 + e * 0.06})`
        }} />
    </div>
  );
}

/* ── the piece ────────────────────────────────────────────── */
function ShiftVideo(props) {
  const showCaps = props.captions !== false;
  const { T, CUES } = useComposition();

  const S = {
    chaos: CUES['הבעיה'],
    problem: CUES['אף אחת לא בשבילה'],
    intro: CUES['מרידיאן'],
    first: CUES['פתיחה ראשונה'],
    guide: CUES['המדריך'],
    etf: CUES['קרן סל'],
    acct: CUES['פתיחת חשבון'],
    connect: CUES['חיבור ברוקרים'],
    buy: CUES['הקנייה הראשונה'],
    mode: CUES['מצב מקצועי'],
    desk: CUES['דסקטופ'],
    close: CUES['סיום']
  };

  /* world positions */
  const P = { chaos: [0, 0], title1: [3000, 0], phone: [6000, 0], desk: [9400, 0], end: [12600, 0] };

  const FIT = 0.88; /* world fit inside the letterboxed band above the caption strip */
  const cam = camAt([
    { t: 0, x: 0, y: -20, s: 0.60 },
    { t: S.problem - 0.35, x: 60, y: 10, s: 0.70 },
    { t: S.problem - 0.35, x: P.title1[0], y: 0, s: 1 },
    { t: S.intro - 0.35, x: P.title1[0] + 30, y: 0, s: 1.04 },
    { t: S.intro - 0.35, x: P.phone[0], y: 0, s: 0.52 },
    { t: S.first - 0.3, x: P.phone[0], y: 0, s: 0.62 },

    { t: S.first, x: P.phone[0], y: 0, s: 0.96 },
    { t: S.guide - 0.25, x: P.phone[0], y: 0, s: 1.00 },
    { t: S.guide, x: P.phone[0], y: 0, s: 0.96 },
    { t: S.etf - 0.25, x: P.phone[0], y: 0, s: 1.00 },
    { t: S.etf, x: P.phone[0], y: 0, s: 0.96 },
    { t: S.acct - 0.25, x: P.phone[0], y: 0, s: 1.00 },
    { t: S.acct, x: P.phone[0], y: 0, s: 0.96 },
    { t: S.connect - 0.25, x: P.phone[0], y: 0, s: 1.00 },
    { t: S.connect, x: P.phone[0], y: 0, s: 0.96 },
    { t: S.buy - 0.25, x: P.phone[0], y: 0, s: 1.00 },
    { t: S.buy, x: P.phone[0], y: 0, s: 0.96 },
    { t: S.mode - 0.25, x: P.phone[0], y: 0, s: 1.00 },
    { t: S.mode, x: P.phone[0], y: 0, s: 0.96 },
    { t: S.desk - 0.4, x: P.phone[0], y: 0, s: 1.01 },

    { t: S.desk - 0.4, x: P.desk[0], y: 0, s: 0.52 },
    { t: S.desk + 2.4, x: P.desk[0], y: 0, s: 0.55 },
    { t: S.desk + 6.4, x: 9570, y: 27, s: 1.53 },
    { t: S.close - 0.4, x: 9570, y: 27, s: 1.55 },

    { t: S.close - 0.4, x: P.end[0], y: 0, s: 1 },
    { t: 1e6, x: P.end[0], y: 0, s: 1.06 }
  ], T);

  /* the chaos cluster drifts, then collapses toward the single phone */
  const collapse = clamp((T - (S.intro - 0.2)) / 1.4, 0, 1);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: C.bg }}>
      {/* soft vignette that lives above the world */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none',
        background: 'radial-gradient(120% 100% at 50% 40%, transparent 45%, #0b0c14 100%)', opacity: 0.55
      }} />

      <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: '82%', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: 0, height: 0,
        transform: `translate(${-cam.x * cam.s * FIT}px, ${-cam.y * cam.s * FIT}px) scale(${cam.s * FIT})`,
        transformOrigin: '0 0'
      }}>
        {/* ── set 1: five apps ── */}
        <Shot from={0} to={S.intro + 1.6}>
          {CHAOS.map((c, i) => {
            const drift = Math.sin(T * 0.5 + i * 1.7) * 14;
            const cx = c.x + (0 - c.x) * collapse;
            const cy = c.y + (0 - c.y) * collapse;
            return (
              <Phone key={c.label} x={cx} y={cy + drift} w={300} rot={c.rot * (1 - collapse)}
                sc={1 - collapse * 0.25} op={collapse > 0.55 ? clamp(1 - (collapse - 0.55) / 0.3, 0, 1) : 1}>
                <MiniApp kind={c.kind} label={c.label} T={T} at={0.3 + i * 0.45} />
              </Phone>
            );
          })}
          <div style={{
            position: 'absolute', left: 0, top: -640, width: 1500, transform: 'translateX(-50%)',
            textAlign: 'center', opacity: MOTION.enter(2.6, 1)(T) * clamp(1 - collapse * 3, 0, 1), ...HEB
          }}>
            <div style={{ fontSize: 64, fontWeight: 500, color: C.text }}>חמש אפליקציות. אף תשובה אחת.</div>
          </div>
        </Shot>

        {/* ── set 2: title card ── */}
        <Shot from={S.problem - 1.1} to={S.intro - 0.2}>
          <TitleCard x={P.title1[0]} y={P.title1[1]} T={T} at={S.problem - 1.0}
            kicker="הבעיה"
            title="אף אחת מהן לא נבנתה בשביל מי שמתחיל."
            sub="הכלים המקצועיים מניחים שאת יודעת מה זה מכפיל רווח. האפליקציות הפשוטות לא נותנות לך לגדול." />
        </Shot>

        {/* ── set 3: the one phone (scenes 3–10) ── */}
        <Shot from={S.intro - 0.55} to={S.desk - 0.2}>
          <Phone x={P.phone[0]} y={P.phone[1]} w={430} glow
            op={MOTION.enter(S.intro - 0.5, 0.5)(T)}>
            <Shot from={S.intro - 0.55} to={S.first - 0.15}>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 22, ...HEB
              }}>
                <Logo size={0.42} T={T} at={S.intro - 0.3} />
                <div style={{
                  fontSize: 17, color: C.muted, textAlign: 'center',
                  opacity: MOTION.enter(S.intro + 1.2, 0.9)(T)
                }}>כלי אחד. שני מצבים.</div>
              </div>
            </Shot>
            <Shot from={S.first - 0.15} to={S.guide - 0.15}><OnboardScreen T={T} at={S.first} /></Shot>
            <Shot from={S.guide - 0.15} to={S.etf - 0.15}><GuideScreen T={T} at={S.guide} /></Shot>
            <Shot from={S.etf - 0.15} to={S.acct - 0.15}><EtfScreen T={T} at={S.etf} /></Shot>
            <Shot from={S.acct - 0.15} to={S.connect - 0.15}><OpenAcctScreen T={T} at={S.acct} /></Shot>
            <Shot from={S.connect - 0.15} to={S.buy - 0.15}><ConnectScreen T={T} at={S.connect} /></Shot>
            <Shot from={S.buy - 0.15} to={S.mode - 0.15}><PortfolioScreen T={T} at={S.buy} /></Shot>
            <Shot from={S.mode - 0.15} to={S.desk}><DenseScreen T={T} at={S.mode} /></Shot>
          </Phone>
        </Shot>

        {/* ── set 4: desktop ── */}
        <Shot from={S.desk - 0.6} to={S.close - 0.1}>
          <div style={{ position: 'absolute', left: P.desk[0], top: 0 }}>
            <Desktop T={T} at={S.desk - 0.4} />
          </div>
        </Shot>

        {/* ── set 5: close ── */}
        <Shot from={S.close - 0.5} to={1e6}>
          <div style={{
            position: 'absolute', left: P.end[0], top: 0, width: 1600,
            transform: 'translate(-50%,-50%)', textAlign: 'center', ...HEB
          }}>
            <Logo size={1} T={T} at={S.close - 0.35} />
            <div style={{
              fontSize: 44, color: C.text, marginTop: 46, lineHeight: 1.45,
              opacity: MOTION.enter(S.close + 0.9, 1)(T),
              transform: `translateY(${(1 - MOTION.enter(S.close + 0.9, 1)(T)) * 18}px)`
            }}>מתחילים בשפה פשוטה.<br />נשארים כשזה נעשה מקצועי.</div>
            <div style={{
              width: 140, height: 2, background: C.acc, margin: '44px auto 0',
              transform: `scaleX(${MOTION.draw(S.close + 2.0, 1)(T)})`
            }} />
          </div>
        </Shot>
      </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '82%', bottom: 0, background: C.bg, zIndex: 25 }} />

      {showCaps && <Captions style={{
        fontFamily: FONT, direction: 'rtl', fontSize: 34, fontWeight: 400, color: '#f2f0f6',
        bottom: '5.5%', left: '10%', right: '10%', lineHeight: 1.4,
        textShadow: '0 2px 22px rgba(0,0,0,.75)', zIndex: 30
      }} items={[
        { at: 0.6, until: 3.0, text: 'נועה, 29, רוצה להתחיל להשקיע.' },
        { at: 3.2, until: 6.4, text: 'היא הורידה חמש אפליקציות. כל אחת עושה דבר אחד.' },
        { at: 6.6, until: S.problem - 0.6, text: 'אף אחת מהן לא אומרת לה מה לעשות עכשיו.' },

        { at: S.intro + 0.6, until: S.intro + 4.2, text: 'SHIFT מאחד את כולן לכלי אחד.' },
        { at: S.intro + 4.4, until: S.first + 0.5, text: 'ומוסיף את מה שחסר: מצב למתחילים.' },

        { at: S.first + 0.8, until: S.first + 5.2, text: 'ההפעלה הראשונה שואלת שאלה אחת בלבד.' },
        { at: S.first + 5.4, until: S.guide + 0.4, text: 'נועה בוחרת "מתחילים" — פחות מספרים, שפה פשוטה.' },

        { at: S.guide + 0.8, until: S.guide + 5.0, text: 'המדריך מפרק את ההתחלה לחמישה צעדים.' },
        { at: S.guide + 5.2, until: S.etf + 0.4, text: 'לא מאמר. צעד אחד בכל פעם, עם סימון של מה שנעשה.' },

        { at: S.etf + 0.8, until: S.etf + 5.0, text: 'כל מושג מוסבר בציור, לא בפסקה.' },
        { at: S.etf + 5.2, until: S.acct + 0.4, text: 'קרן סל: קנייה אחת שמחזיקה מאות חברות.' },

        { at: S.acct + 0.8, until: S.acct + 5.2, text: 'ואז החלק שאף אפליקציה לא עושה — פתיחת החשבון עצמו.' },
        { at: S.acct + 5.4, until: S.connect + 0.4, text: 'חמישה שלבים: מה להכין, איזה חשבון, ומה שואלים.' },

        { at: S.connect + 0.8, until: S.connect + 4.4, text: 'כשיש חשבון, מחברים אותו — לקריאה בלבד.' },
        { at: S.connect + 4.6, until: S.buy + 0.4, text: 'ברוקרים ובנק, תמונה אחת. בלי אפשרות לשלוח פקודה.' },

        { at: S.buy + 0.8, until: S.buy + 4.6, text: 'הקנייה הראשונה שלה: קרן סל, ואחריה מניה אחת.' },
        { at: S.buy + 4.8, until: S.mode + 0.4, text: 'מ״אין לי מושג" ל״יש לי תיק" — בתוך האפליקציה.' },

        { at: S.mode + 0.9, until: S.mode + 4.6, text: 'וכשהיא מוכנה ליותר — מתג אחד.' },
        { at: S.mode + 4.8, until: S.desk - 0.3, text: 'אותו מסך, כל המדדים. בלי לעבור אפליקציה.' },

        { at: S.desk + 0.9, until: S.desk + 5.0, text: 'בדסקטופ זה נפתח לסקרינר, נרות ואינדיקטורים.' },
        { at: S.desk + 5.2, until: S.close - 0.4, text: 'אותו חשבון, אותם נתונים, צפיפות אחרת.' }
      ]} />}
    </div>
  );
}

function ShiftDemo() {
  const [tw, setTweak] = useTweaks(window.TWEAK_DEFAULTS || {});
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
      <CompositionStage width={1920} height={1080} bg={C.bg}
        scenes={window.OM_SCENES} playback={window.OM_PLAYBACK}>
        <ShiftVideo captions={tw.captions !== false} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="עריכה" />
        <TweakToggle label="Motion editor" value={tw.motionEditor !== false}
          onChange={v => setTweak('motionEditor', v)} />
        <TweakToggle label="כתוביות" value={tw.captions !== false}
          onChange={v => setTweak('captions', v)} />
      </TweaksPanel>
    </div>
  );
}

window.ShiftVideo = ShiftVideo;
window.ShiftDemo = ShiftDemo;
