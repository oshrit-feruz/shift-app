import type { ReactNode } from 'react';

/** Advisory chat bubble — bot on the start side, user on the end side. */
export function ChatBubble({ who, children }: { who: 'bot' | 'me'; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: who === 'me' ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '82%',
          padding: '10px 13px',
          fontSize: 14,
          lineHeight: 1.5,
          borderRadius: 14,
          ...(who === 'me'
            ? {
                background: 'var(--color-accent-800)',
                color: 'var(--acc-pale)',
                borderEndEndRadius: 5,
              }
            : {
                background: 'var(--sunk)',
                border: '1px solid var(--color-divider)',
                borderEndStartRadius: 5,
              }),
        }}
      >
        {children}
      </div>
    </div>
  );
}
