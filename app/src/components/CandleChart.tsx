import { useMemo } from 'react';
import { candles, fit, linePath, ma, macdSeries, rsiSeries } from './charts';

/** Advanced-mode candlestick chart with optional MA/volume/RSI/MACD panes —
 *  the prototype's procedural SVG, componentized. */
export function CandleChart({
  closes,
  showMA,
  showRSI,
  showMACD,
  rsiNow,
}: {
  closes: number[];
  showMA: boolean;
  showRSI: boolean;
  showMACD: boolean;
  rsiNow: number;
}) {
  const W = 340;
  const H = 170;
  const step = W / closes.length;
  const bw = Math.max(2.6, step * 0.55);
  // All the derived series depend only on `closes`; a parent re-render (a
  // timeframe chip, an indicator toggle) must not redo the O(n·window) math.
  const { cs, ma20, ma50, macd, signal, mMax, rsiPath } = useMemo(() => {
    const macdOut = macdSeries(closes);
    const max = Math.max(...macdOut.macd.map(Math.abs), 1);
    return {
      cs: candles(closes, W, H - 4),
      ma20: linePath(ma(closes, 12).map((v, i) => [i * step + step / 2, yFor(v, closes, H - 4)])),
      ma50: linePath(ma(closes, 26).map((v, i) => [i * step + step / 2, yFor(v, closes, H - 4)])),
      macd: macdOut.macd,
      signal: macdOut.signal,
      mMax: max,
      rsiPath: linePath(fit(rsiSeries(closes), W, 52, 8)),
    };
    // W/H/step are constants derived from closes; closes is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closes]);
  const mLine = (v: number[]) => linePath(v.map((x, i) => [i * step + step / 2, 30 - (x / mMax) * 18]));

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: H }}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {[24, 60, 96, 132].map((y) => (
          <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="var(--grid)" />
        ))}
        {cs.map((c, i) => (
          <g key={i}>
            <line
              x1={c.x}
              y1={c.hy}
              x2={c.x}
              y2={c.ly}
              stroke={c.up ? 'var(--up)' : 'var(--down)'}
              strokeWidth="1"
            />
            <rect x={c.bx} y={c.by} width={c.bw} height={c.bh} fill={c.up ? 'var(--up)' : 'var(--down)'} />
          </g>
        ))}
        {showMA && (
          <g>
            <path d={ma20} fill="none" stroke="var(--acc-lite)" strokeWidth="1.1" />
            <path d={ma50} fill="none" stroke="var(--acc-dim)" strokeWidth="1.1" strokeDasharray="4 3" />
          </g>
        )}
      </svg>
      {/* volume pane */}
      <svg
        viewBox={`0 0 ${W} 40`}
        style={{ width: '100%', height: 40 }}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {closes.map((c, i) => {
          const h = 8 + ((i * 37) % 26);
          const up = i > 0 && c >= closes[i - 1];
          return (
            <rect
              key={i}
              x={i * step + step / 2 - bw / 2}
              y={38 - h}
              width={bw}
              height={h}
              fill={up ? 'var(--up)' : 'var(--down)'}
              opacity=".5"
            />
          );
        })}
      </svg>
      {showRSI && (
        <svg
          viewBox={`0 0 ${W} 52`}
          style={{ width: '100%', height: 52, borderTop: '1px solid var(--grid)' }}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line x1="0" y1="14" x2={W} y2="14" stroke="var(--line)" strokeDasharray="3 3" />
          <line x1="0" y1="40" x2={W} y2="40" stroke="var(--line)" strokeDasharray="3 3" />
          <path d={rsiPath} fill="none" stroke="var(--acc-pale)" strokeWidth="1.2" />
          <text x="3" y="10" fill="var(--muted)" fontSize="8">
            RSI(14) {rsiNow}
          </text>
        </svg>
      )}
      {showMACD && (
        <svg
          viewBox={`0 0 ${W} 52`}
          style={{ width: '100%', height: 52, borderTop: '1px solid var(--grid)' }}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {macd.map((v, i) => {
            const h = (Math.abs(v) / mMax) * 18;
            return (
              <rect
                key={i}
                x={i * step + step / 2 - bw / 2}
                y={v >= 0 ? 30 - h : 30}
                width={bw}
                height={Math.max(0.8, h)}
                fill={v >= 0 ? 'var(--up)' : 'var(--down)'}
                opacity=".65"
              />
            );
          })}
          <path d={mLine(macd)} fill="none" stroke="var(--acc-lite)" strokeWidth="1.1" />
          <path d={mLine(signal)} fill="none" stroke="var(--down)" strokeWidth="1.1" />
          <text x="3" y="10" fill="var(--muted)" fontSize="8">
            MACD(12,26,9)
          </text>
        </svg>
      )}
    </>
  );
}

function yFor(v: number, closes: number[], h: number): number {
  const lo = Math.min(...closes) - 4;
  const hi = Math.max(...closes) + 4;
  return h - ((v - lo) / (hi - lo)) * (h - 8) - 4;
}
