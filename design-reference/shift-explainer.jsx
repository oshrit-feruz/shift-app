const { useComposition, Shot, Easing, interpolate, animate, clamp } = window;

const C = {
  bg: '#0F172A', g1: '#1E293B', text: '#FFFFFF', muted: '#B4C2D6',
  acc: '#8B5CF6', accLite: '#A78BFA', accDeep: '#4C1D95',
  up: '#2fd18a', down: '#f2564e',
  line: 'rgba(146,155,172,.30)', card: 'rgba(30,41,59,.78)'
};
const FH = "'Rubik', system-ui, sans-serif";

const MOTION = {
  enter: (start, dur) => animate({ from: 0, to: 1, start, end: start + (dur || 0.7), ease: Easing.easeOutCubic }),
  draw: (start, dur) => animate({ from: 0, to: 1, start, end: start + (dur || 1.2), ease: Easing.easeInOutQuad }),
  pop: (start, dur) => animate({ from: 0, to: 1, start, end: start + (dur || 0.55), ease: Easing.easeOutBack })
};

function Bg({ T }) {
  const d = T * 5;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'radial-gradient(90% 60% at 20% -10%, ' + C.g1 + ' 0%, ' + C.bg + ' 62%)' }}>
      <div style={{ position: 'absolute', width: 1100, height: 1100, borderRadius: '50%', left: -260 + d * 0.5, top: -420, background: 'radial-gradient(circle, rgba(139,92,246,.22), transparent 66%)' }} />
      <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: '50%', right: -220 - d * 0.35, bottom: -380, background: 'radial-gradient(circle, rgba(47,209,138,.10), transparent 66%)' }} />
    </div>
  );
}

function Statement({ T, from, to, lines, sub, align }) {
  if (T < from - 0.6 || T > to + 0.6) return null;
  const inP = MOTION.enter(from, 0.75)(T);
  const outP = 1 - clamp((T - (to - 0.5)) / 0.5, 0, 1);
  const o = inP * outP;
  const drift = animate({ from: 0, to: -26, start: from, end: to, ease: Easing.linear })(T);
  return (
    <div dir="rtl" style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: align === 'start' ? 'flex-start' : 'center', justifyContent: 'center',
      padding: '0 170px', opacity: o, transform: 'translateY(' + (drift + (1 - inP) * 34) + 'px)', textAlign: align === 'start' ? 'right' : 'center'
    }}>
      {lines.map((l, i) => [
        i ? <div key={'s' + i} style={{ height: 30, flex: 'none' }} /> : null,
        <div key={i} style={{
          fontFamily: FH, fontWeight: 500, fontSize: l.size || 82, lineHeight: 1.14,
          color: l.accent ? C.accLite : C.text, letterSpacing: '-0.01em', flex: 'none',
          opacity: clamp((T - (from + i * 0.34)) / 0.6, 0, 1)
        }}>{l.t}</div>
      ])}
      {sub ? [
        <div key="ss" style={{ height: 34, flex: 'none' }} />,
        <div key="sub" style={{ fontFamily: FH, fontSize: 30, lineHeight: 1.5, color: C.muted, maxWidth: 1080, flex: 'none', opacity: clamp((T - (from + 0.9)) / 0.7, 0, 1) }}>{sub}</div>
      ] : null}
    </div>
  );
}

const TOOLS = [
  { name: 'אפליקציית הבנק', note: 'עמלות גבוהות, אפס הסבר', x: -560, rot: -7 },
  { name: 'פלטפורמת מסחר', note: 'נבנתה לסוחרים, לא למתחילות', x: 0, rot: 3 },
  { name: 'גיליון אקסל', note: 'ידני, שביר, לבד', x: 560, rot: 8 }
];

function ToolCards({ T, cues }) {
  const start = cues.Problem, conv = cues.Shift;
  if (T < start - 0.8 || T > conv + 2.2) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {TOOLS.map((t, i) => {
        const appear = MOTION.pop(start + i * 0.28, 0.7)(T);
        const spread = animate({ from: 0, to: 1, start: start + i * 0.28, end: start + 1.6, ease: Easing.easeOutCubic })(T);
        const gather = clamp((T - conv) / 1.1, 0, 1);
        const x = t.x * spread * (1 - gather);
        const y = (i === 1 ? -30 : 24) * spread * (1 - gather);
        const rot = t.rot * spread * (1 - gather);
        const s = (0.86 + 0.14 * appear) * (1 - gather * 0.32);
        const fade = clamp((T - (conv + 0.55)) / 0.7, 0, 1);
        return (
          <div key={t.name} dir="rtl" style={{
            position: 'absolute', width: 400, padding: '30px 30px 34px',
            borderRadius: 20, background: C.card, border: '1px solid ' + C.line,
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 24px 70px rgba(0,0,0,.42)',
            transform: 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg) scale(' + s + ')',
            opacity: appear * (1 - fade)
          }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(139,92,246,.18)', border: '1px solid rgba(167,139,250,.4)', marginBottom: 18 }} />
            <div style={{ fontFamily: FH, fontSize: 30, fontWeight: 500, color: C.text }}>{t.name}</div>
            <div style={{ fontFamily: FH, fontSize: 21, color: C.muted, marginTop: 10, lineHeight: 1.45 }}>{t.note}</div>
          </div>
        );
      })}
    </div>
  );
}

const JARGON = ['RSI 14', 'MACD', 'P/E 34.8', 'β 1.24', 'EPS', 'Sharpe', 'ATR', 'Bollinger', 'YTD', 'Drawdown', 'CAGR', 'Alpha', 'Vol σ', 'Rebalance', 'IV %', 'Delta'];

function JargonWall({ T, cues }) {
  const start = cues.Gap, end = cues.Shift;
  if (T < start - 0.5 || T > end + 0.6) return null;
  const inP = MOTION.enter(start, 1.1)(T);
  const outP = 1 - clamp((T - (end - 0.5)) / 0.6, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: inP * outP * 0.85, overflow: 'hidden' }}>
      {JARGON.map((j, i) => {
        const col = i % 4, row = Math.floor(i / 4);
        const o = clamp((T - (start + i * 0.09)) / 0.5, 0, 1);
        return (
          <div key={j} style={{
            position: 'absolute', left: 150 + col * 430, top: 190 + row * 190,
            fontFamily: FH, fontSize: 34, color: 'rgba(180,194,214,.5)',
            transform: 'translateY(' + (1 - o) * 18 + 'px)', opacity: o
          }}>{j}</div>
        );
      })}
    </div>
  );
}

function Wordmark({ T, cues }) {
  const start = cues.Shift + 0.9;
  if (T < start - 0.4 || T > cues.Home + 0.8) return null;
  const p = MOTION.pop(start, 0.85)(T);
  const out = 1 - clamp((T - (cues.Home - 0.3)) / 0.7, 0, 1);
  const s = 0.82 + 0.18 * p;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: p * out }}>
      <img src="assets/shift-wordmark.svg" alt="SHIFT" style={{ height: 116, flex: 'none', transform: 'scale(' + s + ')' }} />
      <div style={{ height: 38, flex: 'none' }} />
      <div dir="rtl" style={{ fontFamily: FH, fontSize: 34, color: C.muted, flex: 'none', opacity: clamp((T - (start + 0.6)) / 0.7, 0, 1) }}>
        דרך אחת, פשוטה וכנה, להתחיל
      </div>
    </div>
  );
}

function Row({ t, name, price, pct, up }) {
  return (
    <div dir="rtl" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 0', borderTop: '1px solid rgba(146,155,172,.22)' }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(139,92,246,.16)', border: '1px solid rgba(167,139,250,.34)', flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FH, fontSize: 23, fontWeight: 500, color: C.text }}>{t}</div>
        <div style={{ fontFamily: FH, fontSize: 18, color: C.muted }}>{name}</div>
      </div>
      <div style={{ textAlign: 'left', direction: 'ltr' }}>
        <div style={{ fontFamily: FH, fontSize: 22, color: C.text }}>{price}</div>
        <div style={{ fontFamily: FH, fontSize: 18, color: up ? C.up : C.down }}>{pct}</div>
      </div>
    </div>
  );
}

function PhoneScreens({ T, cues }) {
  const areaOn = clamp((T - cues.Home) / 1.4, 0, 1);
  return (
    <div dir="rtl" style={{ position: 'absolute', inset: 0, padding: '46px 30px 30px', display: 'flex', flexDirection: 'column' }}>
      <Shot from={cues.Home} to={cues.Broker}>
        <div style={{ opacity: clamp((T - cues.Home - 0.3) / 0.7, 0, 1) }}>
          <div style={{ fontFamily: FH, fontSize: 19, color: C.muted, letterSpacing: '.08em' }}>סקירה</div>
          <div style={{ fontFamily: FH, fontSize: 32, color: C.text, marginTop: 4 }}>בוקר טוב, נועה</div>
          <div style={{ marginTop: 22, padding: 20, borderRadius: 18, background: 'rgba(30,41,59,.72)', border: '1px solid ' + C.line }}>
            <div style={{ fontFamily: FH, fontSize: 19, color: C.muted, fontWeight: 600 }}>התיק שלך היום</div>
            <div style={{ fontFamily: FH, fontSize: 52, fontWeight: 700, color: C.text, direction: 'ltr', textAlign: 'right', marginTop: 4 }}>
              ${(41000 + 7214.6 * clamp((T - cues.Home - 0.5) / 1.6, 0, 1)).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontFamily: FH, fontSize: 22, color: C.up, direction: 'ltr', textAlign: 'right', marginTop: 6 }}>+$412.18 · +0.86%</div>
            <svg viewBox="0 0 320 90" style={{ width: '100%', height: 90, marginTop: 14 }} preserveAspectRatio="none">
              <defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.acc} stopOpacity=".38" /><stop offset="1" stopColor={C.acc} stopOpacity="0" /></linearGradient></defs>
              <path d="M0 74 L40 66 L80 70 L120 52 L160 56 L200 38 L240 42 L280 24 L320 16 L320 90 L0 90 Z" fill="url(#vg)" style={{ clipPath: 'inset(0 ' + (100 - areaOn * 100) + '% 0 0)' }} />
              <path d="M0 74 L40 66 L80 70 L120 52 L160 56 L200 38 L240 42 L280 24 L320 16" fill="none" stroke={C.accLite} strokeWidth="2.4" strokeDasharray="420" strokeDashoffset={420 * (1 - areaOn)} />
            </svg>
          </div>
          <div style={{ marginTop: 18, padding: '4px 20px 14px', borderRadius: 18, background: 'rgba(30,41,59,.62)', border: '1px solid ' + C.line }}>
            <div style={{ fontFamily: FH, fontSize: 22, color: C.text, padding: '16px 0 2px' }}>הווטצ׳ליסט שלך</div>
            <Row t="NVIDIA" name="השבבים שמריצים AI" price="$182.44" pct="+2.31%" up />
            <Row t="Apple" name="אייפון, מק ושירותים" price="$226.79" pct="+0.42%" up />
            <Row t="Microsoft" name="ווינדוס, אופיס ואז׳ור" price="$508.12" pct="−0.67%" />
          </div>
        </div>
      </Shot>

      <Shot from={cues.Broker} to={cues.Reco}>
        <div style={{ opacity: clamp((T - cues.Broker - 0.2) / 0.6, 0, 1) }}>
          <div style={{ fontFamily: FH, fontSize: 30, color: C.text }}>חיבור החשבונות שלך</div>
          <div style={{ fontFamily: FH, fontSize: 21, color: C.muted, marginTop: 8, lineHeight: 1.45 }}>
            SHIFT רואה יתרות ופוזיציות — ולעולם לא מזיז כסף.
          </div>
          {[['Blink', 'מחובר', C.up], ['Interactive Brokers', 'מחובר', C.up], ['Colmex Pro', 'מחובר', C.up], ['Sandbox', 'תיאורטי', C.accLite]].map((b, i) => {
            const on = clamp((T - (cues.Broker + 0.8 + i * 0.7)) / 0.55, 0, 1);
            return (
              <div key={b[0]} style={{
                display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, padding: '18px 18px',
                borderRadius: 15, background: 'rgba(30,41,59,.7)', border: '1px solid ' + (on > 0.5 ? 'rgba(167,139,250,.45)' : C.line),
                opacity: 0.35 + 0.65 * on, transform: 'translateX(' + (1 - on) * -18 + 'px)'
              }}>
                <div style={{ flex: 1, fontFamily: FH, fontSize: 24, color: C.text }}>{b[0]}</div>
                <div style={{ fontFamily: FH, fontSize: 19, color: b[2], opacity: on }}>{b[1]}</div>
                <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid ' + b[2], display: 'grid', placeItems: 'center', color: b[2], fontSize: 14, opacity: on }}>✓</div>
              </div>
            );
          })}
          <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 13, background: 'rgba(47,209,138,.12)', border: '1px solid rgba(47,209,138,.35)', fontFamily: FH, fontSize: 20, color: C.up, opacity: clamp((T - (cues.Broker + 3.9)) / 0.7, 0, 1) }}>
            לקריאה בלבד · אין הרשאת מסחר
          </div>
        </div>
      </Shot>

      <Shot from={cues.Reco} to={cues.Desktop}>
        <div style={{ opacity: clamp((T - cues.Reco - 0.2) / 0.6, 0, 1) }}>
          <div style={{ fontFamily: FH, fontSize: 30, color: C.text }}>קבלי המלצה</div>
          <div style={{ fontFamily: FH, fontSize: 21, color: C.muted, marginTop: 8 }}>ארבע שאלות. בשפה שלך.</div>
          {[['אופק', 'חמש שנים ומעלה'], ['סיכון', 'בינוני'], ['מטרה', 'לבנות בהדרגה'], ['כרית ביטחון', 'קיימת']].map((q, i) => {
            const on = clamp((T - (cues.Reco + 0.7 + i * 0.55)) / 0.5, 0, 1);
            return (
              <div key={q[0]} style={{ display: 'flex', gap: 12, marginTop: 12, padding: '14px 16px', borderRadius: 13, background: 'rgba(30,41,59,.66)', border: '1px solid ' + C.line, opacity: on, transform: 'translateY(' + (1 - on) * 14 + 'px)' }}>
                <span style={{ fontFamily: FH, fontSize: 20, color: C.muted, width: 116 }}>{q[0]}</span>
                <span style={{ fontFamily: FH, fontSize: 20, color: C.text, flex: 1 }}>{q[1]}</span>
              </div>
            );
          })}
          {(() => {
            const on = clamp((T - (cues.Reco + 3.4)) / 0.9, 0, 1);
            return (
              <div style={{ marginTop: 20, padding: 20, borderRadius: 16, background: 'rgba(139,92,246,.14)', border: '1px solid rgba(167,139,250,.5)', opacity: on, transform: 'scale(' + (0.96 + 0.04 * on) + ')' }}>
                <div style={{ fontFamily: FH, fontSize: 24, color: C.text }}>תיק ליבה + לוויין</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                  <div style={{ height: 12, borderRadius: 6, background: C.acc, flex: 80 * on }} />
                  <div style={{ height: 12, borderRadius: 6, background: C.accLite, flex: 20 * on }} />
                </div>
                <div dir="rtl" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontFamily: FH, fontSize: 19, color: C.muted }}>
                  <span>80% ליבה</span><span>20% לוויין</span>
                </div>
                <div style={{ fontFamily: FH, fontSize: 18, color: C.accLite, marginTop: 14 }}>מידע בלבד · לא ייעוץ</div>
              </div>
            );
          })()}
        </div>
      </Shot>
    </div>
  );
}

function Phone({ T, cues }) {
  if (T < cues.Home - 1.2 || T > cues.Close + 0.4) return null;
  const inP = MOTION.enter(cues.Home - 0.6, 1.2)(T);
  const shrink = clamp((T - cues.Desktop) / 1.2, 0, 1);
  const outP = 1 - clamp((T - (cues.Close - 0.7)) / 0.8, 0, 1);
  const scale = (0.9 + 0.1 * inP) * (1 - shrink * 0.42);
  const x = -520 - 210 * shrink;
  const y = 160 * shrink;
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%', width: 430, height: 880,
      transform: 'translate(-50%,-50%) translate(' + x + 'px,' + y + 'px) scale(' + scale + ')',
      opacity: inP * outP, borderRadius: 54, background: C.bg,
      border: '10px solid #23293a', boxShadow: '0 50px 120px rgba(0,0,0,.6), 0 0 0 1px rgba(167,139,250,.2)',
      overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(80% 50% at 25% 0%, rgba(139,92,246,.16), transparent 60%)' }} />
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 120, height: 26, borderRadius: 14, background: '#0b1020' }} />
      <PhoneScreens T={T} cues={cues} />
    </div>
  );
}

function Desktop({ T, cues }) {
  const start = cues.Desktop;
  if (T < start - 0.6 || T > cues.Close + 0.4) return null;
  const inP = MOTION.enter(start, 1.1)(T);
  const outP = 1 - clamp((T - (cues.Close - 0.7)) / 0.8, 0, 1);
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%', width: 1180, height: 720,
      transform: 'translate(-50%,-50%) translate(150px,0) scale(' + (0.93 + 0.07 * inP) + ')',
      opacity: inP * outP, borderRadius: 18, overflow: 'hidden',
      background: 'rgba(24,33,50,.9)', border: '1px solid rgba(255,255,255,.1)',
      backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
      boxShadow: '0 50px 130px rgba(0,0,0,.6)'
    }}>
      <div style={{ height: 54, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', borderBottom: '1px solid ' + C.line }}>
        <img src="assets/shift-mark.svg" alt="" style={{ width: 22, height: 22 }} />
        <span style={{ fontFamily: FH, fontSize: 17, color: C.text, letterSpacing: '.03em' }}>SHIFT</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontFamily: FH, fontSize: 15, color: C.accLite, padding: '6px 14px', borderRadius: 8, background: 'rgba(139,92,246,.2)', border: '1px solid rgba(167,139,250,.4)' }}>מתחילים</span>
          <span style={{ fontFamily: FH, fontSize: 15, color: C.muted, padding: '6px 14px' }}>מקצועי</span>
        </div>
      </div>
      <div style={{ display: 'flex', height: 'calc(100% - 54px)' }}>
        <div style={{ width: 210, borderInlineEnd: '1px solid ' + C.line, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {['סקירה', 'סקרינר', 'תיקים', 'חדשות', 'השוואה'].map((s, i) => (
            <div key={s} dir="rtl" style={{
              fontFamily: FH, fontSize: 17, padding: '10px 12px', borderRadius: 9,
              color: i === 1 ? C.accLite : C.muted,
              background: i === 1 ? 'rgba(139,92,246,.16)' : 'transparent',
              opacity: clamp((T - (start + 0.5 + i * 0.12)) / 0.4, 0, 1)
            }}>{s}</div>
          ))}
        </div>
        <div style={{ flex: 1, padding: 22 }}>
          <div dir="rtl" style={{ fontFamily: FH, fontSize: 24, color: C.text, opacity: clamp((T - (start + 0.7)) / 0.5, 0, 1) }}>סקרינר — הכלים המלאים, כשמוכנים</div>
          <div style={{ marginTop: 18, borderRadius: 12, border: '1px solid ' + C.line, overflow: 'hidden' }}>
            {[['NVDA', '$182.44', '+2.31%', true], ['AMD', '$171.35', '+4.86%', true], ['MSFT', '$508.12', '−0.67%', false], ['LLY', '$894.20', '+1.42%', true], ['TSLA', '$334.62', '−3.18%', false], ['JPM', '$241.08', '+0.88%', true]].map((r, i) => {
              const on = clamp((T - (start + 1.1 + i * 0.16)) / 0.4, 0, 1);
              return (
                <div key={r[0]} style={{
                  display: 'flex', alignItems: 'center', gap: 16, padding: '15px 18px',
                  borderTop: i ? '1px solid rgba(146,155,172,.2)' : 'none',
                  opacity: on, transform: 'translateY(' + (1 - on) * 8 + 'px)'
                }}>
                  <span style={{ fontFamily: FH, fontSize: 18, fontWeight: 500, color: C.text, width: 90 }}>{r[0]}</span>
                  <span style={{ flex: 1, height: 6, borderRadius: 4, background: 'rgba(146,155,172,.22)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: (35 + i * 9) * on + '%', background: r[3] ? C.acc : 'rgba(242,86,78,.7)' }} />
                  </span>
                  <span style={{ fontFamily: FH, fontSize: 18, color: C.text, width: 110, textAlign: 'right' }}>{r[1]}</span>
                  <span style={{ fontFamily: FH, fontSize: 18, color: r[3] ? C.up : C.down, width: 92, textAlign: 'right' }}>{r[2]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Close({ T, cues, total }) {
  const start = cues.Close;
  if (T < start - 0.5) return null;
  const p = MOTION.enter(start, 1.0)(T);
  return (
    <div dir="rtl" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: p }}>
      <img src="assets/shift-wordmark.svg" alt="SHIFT" style={{ height: 104, flex: 'none', transform: 'scale(' + (0.94 + 0.06 * p) + ')' }} />
      <div style={{ height: 46, flex: 'none' }} />
      <div style={{ fontFamily: FH, fontSize: 40, color: C.text, textAlign: 'center', maxWidth: 1240, lineHeight: 1.3, flex: 'none', opacity: clamp((T - (start + 0.7)) / 0.8, 0, 1) }}>
        דור שלם רוצה להתחיל להשקיע — ואין לו מאיפה.
      </div>
      <div style={{ height: 34, flex: 'none' }} />
      <div style={{ fontFamily: FH, fontSize: 30, color: C.accLite, textAlign: 'center', flex: 'none', opacity: clamp((T - (start + 1.6)) / 0.8, 0, 1) }}>
        SHIFT היא נקודת הפתיחה הזאת.
      </div>
      <div style={{ height: 40, flex: 'none' }} />
      <div style={{ width: animate({ from: 0, to: 320, start: start + 2.2, end: start + 3.4, ease: Easing.easeOutCubic })(T), height: 2, background: 'linear-gradient(90deg, transparent, ' + C.acc + ', transparent)' }} />
    </div>
  );
}

const LINES = [
  { at: 8.6, until: 19.4, text: 'פיזור בין כלים שאף אחד מהם לא נבנה בשבילם' },
  { at: 20.6, until: 28.4, text: 'או מומחיות שלרוב האנשים אין' },
  { at: 38.8, until: 50.4, text: 'מסך אחד. שפה אחת. בלי מונחים שצריך לתרגם.' },
  { at: 51.6, until: 61.4, text: 'החשבונות הקיימים מתחברים — לקריאה בלבד' },
  { at: 62.6, until: 72.4, text: 'ארבע שאלות, והצעה לתיק. מידע, לא ייעוץ.' },
  { at: 73.6, until: 81.4, text: 'ובדסקטופ — הכלים המלאים, כשמוכנים אליהם' }
];

function Caption({ T }) {
  const cur = LINES.find(l => T >= l.at && T < l.until);
  if (!cur) return null;
  const inP = clamp((T - cur.at) / 0.5, 0, 1);
  const outP = 1 - clamp((T - (cur.until - 0.45)) / 0.45, 0, 1);
  return (
    <div dir="rtl" style={{
      position: 'absolute', bottom: 74, left: 0, right: 0, display: 'flex', justifyContent: 'center',
      opacity: inP * outP, transform: 'translateY(' + (1 - inP) * 16 + 'px)'
    }}>
      <div style={{
        fontFamily: FH, fontSize: 34, color: C.text, padding: '16px 32px', borderRadius: 14,
        background: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.09)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', textAlign: 'center', maxWidth: 1400
      }}>{cur.text}</div>
    </div>
  );
}

function ShiftExplainer() {
  const { T, CUES, authoredTotal } = useComposition();
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: FH }}>
      <Bg T={T} />

      <Statement T={T} from={CUES.Hook + 0.5} to={CUES.Problem - 0.2} align="start"
        lines={[{ t: 'השקעה בישראל היום' }, { t: 'דורשת יותר ממה שיש לרוב האנשים.', accent: true, size: 62 }]} />

      <ToolCards T={T} cues={CUES} />
      <JargonWall T={T} cues={CUES} />

      <Statement T={T} from={CUES.Shift + 0.1} to={CUES.Shift + 0.85} align="center"
        lines={[{ t: 'דרך אחת.', size: 96 }]} />
      <Wordmark T={T} cues={CUES} />

      <Phone T={T} cues={CUES} />
      <Desktop T={T} cues={CUES} />

      <Shot from={CUES.Home} to={CUES.Desktop}>
        <div dir="rtl" style={{ position: 'absolute', top: '50%', right: 150, transform: 'translateY(-50%)', width: 620 }}>
          {[
            { at: CUES.Home + 0.6, until: CUES.Broker, k: 'התיק', t: 'הכול במקום אחד', s: 'מה שאת מחזיקה, איך זה זז, ולמה — בשפה פשוטה.' },
            { at: CUES.Broker + 0.4, until: CUES.Reco, k: 'חיבור', t: 'ברוקרים, לקריאה בלבד', s: 'מייבא יתרות ופוזיציות. לעולם לא מבצע פעולה.' },
            { at: CUES.Reco + 0.4, until: CUES.Desktop, k: 'המלצה', t: 'הצעה לתיק, לא הבטחה', s: 'ליבה ולוויין, מוסבר צעד־צעד. מידע בלבד.' }
          ].map((b) => {
            if (T < b.at - 0.3 || T > b.until) return null;
            const on = clamp((T - b.at) / 0.7, 0, 1);
            const out = 1 - clamp((T - (b.until - 0.5)) / 0.5, 0, 1);
            return (
              <div key={b.k} style={{ opacity: on * out, transform: 'translateY(' + (1 - on) * 22 + 'px)' }}>
                <div style={{ fontFamily: FH, fontSize: 22, color: C.accLite, letterSpacing: '.1em' }}>{b.k}</div>
                <div style={{ fontFamily: FH, fontSize: 60, color: C.text, lineHeight: 1.16, marginTop: 12 }}>{b.t}</div>
                <div style={{ fontFamily: FH, fontSize: 28, color: C.muted, lineHeight: 1.5, marginTop: 16 }}>{b.s}</div>
              </div>
            );
          })}
        </div>
      </Shot>

      <Close T={T} cues={CUES} total={authoredTotal} />
      <Caption T={T} />
    </div>
  );
}

window.ShiftExplainer = ShiftExplainer;
