import { useEffect, useRef } from 'react';

/**
 * Official free TradingView embed widgets — real market data, no API key.
 * The embed script replaces the container with an iframe served by
 * TradingView; attribution ("Powered by TradingView") is built into the
 * widget and must stay visible per their embed terms.
 */

type WidgetKind = 'advanced-chart' | 'financials' | 'timeline';

const SCRIPT_URL: Record<WidgetKind, string> = {
  'advanced-chart': 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',
  financials: 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js',
  timeline: 'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js',
};

function widgetConfig(kind: WidgetKind, symbol: string): Record<string, unknown> {
  const common = { colorTheme: 'dark', isTransparent: true, locale: 'he_IL' };
  switch (kind) {
    case 'advanced-chart':
      return {
        autosize: true,
        symbol,
        interval: 'D',
        theme: 'dark',
        style: '3',
        locale: 'he_IL',
        hide_top_toolbar: true,
        hide_legend: true,
        allow_symbol_change: false,
        save_image: false,
        backgroundColor: 'rgba(22, 24, 38, 1)',
      };
    case 'financials':
      return { ...common, symbol, displayMode: 'regular', width: '100%', height: 440 };
    case 'timeline':
      return { ...common, feedMode: 'symbol', symbol, displayMode: 'regular', width: '100%', height: 460 };
  }
}

export default function TradingViewWidget({
  kind,
  symbol,
  height,
}: {
  kind: WidgetKind;
  symbol: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.height = '100%';
    container.appendChild(inner);
    const script = document.createElement('script');
    script.src = SCRIPT_URL[kind];
    script.async = true;
    script.innerHTML = JSON.stringify(widgetConfig(kind, symbol));
    container.appendChild(script);
    return () => {
      container.innerHTML = '';
    };
  }, [kind, symbol]);

  return (
    <div className="card elev-sm" style={{ padding: 8, overflow: 'hidden' }}>
      {/* The widget iframe needs an LTR box; the surrounding page stays RTL. */}
      <div
        ref={containerRef}
        dir="ltr"
        className="tradingview-widget-container"
        style={{ height: height ?? (kind === 'advanced-chart' ? 320 : undefined), width: '100%' }}
      />
      <span className="card-meta">מקור הנתונים: TradingView · נתוני שוק, לא נתוני החשבון שלך</span>
    </div>
  );
}
