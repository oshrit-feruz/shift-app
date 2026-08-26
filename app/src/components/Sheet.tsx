import type { ReactNode } from 'react';

/**
 * Bottom sheet over a veil — the app's one modal treatment. Glass ground,
 * grab handle, sheetUp animation. Clicking the veil dismisses.
 */
export function Sheet({
  open,
  onClose,
  title,
  meta,
  children,
  maxHeight = '78%',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  maxHeight?: string;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        background: 'var(--veil)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'rgba(30,41,59,.45)',
          backdropFilter: 'blur(40px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
          borderTop: '1px solid rgba(146,155,172,.22)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: 'var(--shadow-lg)',
          padding: '16px 16px 34px',
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
          animation: 'sheetUp .22s ease both',
          maxHeight,
          overflowY: 'auto',
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line)', alignSelf: 'center' }} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, whiteSpace: 'nowrap', flex: 'none' }}>
            {title}
          </div>
          {meta != null && (
            <span className="text-muted" style={{ fontSize: 13 }}>
              {meta}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: 0, fontSize: 15, opacity: 0.6 }}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
