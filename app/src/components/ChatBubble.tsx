import type { ReactNode } from 'react';

/**
 * Advisory chat bubble — bot on the start side, user on the end side.
 *
 * Bubbles arrive rather than appear (see `.chat-bubble` in base.css). The
 * entrance runs on mount, so it is the caller's job to keep a bubble that
 * merely changes role — the question being asked becoming a question already
 * answered — on the same key, or every turn of the conversation replays every
 * time the user answers.
 *
 * `delayMs` is the beat before a bubble lands. The answer echoes the tap and
 * takes none; the question that comes back after it takes the app's stagger
 * cap, which is what makes the pair read as a reply rather than as two things
 * appearing at once.
 */
export function ChatBubble({
  who,
  delayMs = 0,
  children,
}: {
  who: 'bot' | 'me';
  delayMs?: number;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: who === 'me' ? 'flex-end' : 'flex-start' }}>
      <div
        className="chat-bubble"
        style={{
          // Zero rather than undefined so the value is always declared: the
          // reduced-motion block flattens delays globally, and a property
          // that is only sometimes present is harder to reason about there.
          animationDelay: `${delayMs}ms`,
          maxWidth: '82%',
          padding: '10px 13px',
          fontSize: 'var(--text-row)',
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
