import type { CSSProperties } from 'react';

/**
 * The style that makes a list row a real button without looking like one.
 *
 * Rows that navigate are `<button>` elements — they have to be reachable and
 * operable from the keyboard and announced as actions — but a button carries
 * a browser's own border, background, font and text alignment, all of which
 * would break the row's layout. This resets exactly those, and nothing else.
 *
 * Shared because two screens now render navigating rows (the home earnings
 * card and the calendar) and a second copy of a reset like this is how two
 * lists start looking subtly different from each other.
 */
export const ROW_BUTTON_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  borderInline: 'none',
  borderBottom: 'none',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'inherit',
  cursor: 'pointer',
};
