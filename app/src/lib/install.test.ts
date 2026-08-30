import { describe, expect, it } from 'vitest';
import {
  installRoute,
  isIOS,
  isIOSSafari,
  isMobileDevice,
  isStandaloneDisplay,
  shouldBlockUntilInstalled,
} from './install';

/** A window stub with just the two things the detectors read. */
function fakeWindow(opts: { media?: Record<string, boolean>; standalone?: boolean }): Window {
  const media = opts.media ?? {};
  return {
    navigator: { standalone: opts.standalone } as unknown as Navigator,
    matchMedia: (q: string) => ({ matches: media[q] ?? false }) as MediaQueryList,
  } as unknown as Window;
}

const touch = { '(pointer: coarse)': true, '(hover: none)': true };

describe('shouldBlockUntilInstalled', () => {
  it('blocks only an enforced, mobile, non-standalone window', () => {
    expect(shouldBlockUntilInstalled({ enforced: true, mobile: true, standalone: false })).toBe(true);
  });

  it('lets the installed app through', () => {
    expect(shouldBlockUntilInstalled({ enforced: true, mobile: true, standalone: true })).toBe(false);
  });

  it('never blocks desktop — there is no home screen to add to', () => {
    expect(shouldBlockUntilInstalled({ enforced: true, mobile: false, standalone: false })).toBe(false);
  });

  it('never blocks where it is not enforced (dev, preview)', () => {
    expect(shouldBlockUntilInstalled({ enforced: false, mobile: true, standalone: false })).toBe(false);
  });
});

describe('isStandaloneDisplay', () => {
  it('reads the display-mode media query', () => {
    expect(isStandaloneDisplay(fakeWindow({ media: { '(display-mode: standalone)': true } }))).toBe(true);
  });

  it('accepts the other launcher display modes', () => {
    expect(isStandaloneDisplay(fakeWindow({ media: { '(display-mode: fullscreen)': true } }))).toBe(true);
    expect(isStandaloneDisplay(fakeWindow({ media: { '(display-mode: minimal-ui)': true } }))).toBe(true);
  });

  it('reads iOS Safari’s non-standard navigator.standalone, which answers no media query', () => {
    expect(isStandaloneDisplay(fakeWindow({ standalone: true }))).toBe(true);
  });

  it('is false in a plain browser tab', () => {
    expect(isStandaloneDisplay(fakeWindow({ media: { '(display-mode: browser)': true } }))).toBe(false);
  });

  it('does not throw where matchMedia is missing', () => {
    expect(isStandaloneDisplay({ navigator: {} } as unknown as Window)).toBe(false);
  });
});

describe('isMobileDevice', () => {
  it('is true for a touch-only device', () => {
    expect(isMobileDevice(fakeWindow({ media: touch }))).toBe(true);
  });

  it('is false for a touchscreen laptop, which still hovers with a fine pointer', () => {
    expect(
      isMobileDevice(fakeWindow({ media: { '(pointer: coarse)': false, '(hover: none)': false } })),
    ).toBe(false);
  });
});

describe('isIOS / isIOSSafari', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const IPAD_DESKTOP_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const CHROME_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
  const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

  it('recognises an iPhone', () => expect(isIOS(IPHONE, 5)).toBe(true));

  it('recognises the iPad that claims to be a Mac, by its touch points', () => {
    expect(isIOS(IPAD_DESKTOP_UA, 5)).toBe(true);
    expect(isIOS(MAC, 0)).toBe(false);
  });

  it('tells Safari from the other iOS browsers', () => {
    expect(isIOSSafari(IPHONE)).toBe(true);
    expect(isIOSSafari(CHROME_IOS)).toBe(false);
  });

  it('treats an in-app webview as not-Safari: it cannot add to the home screen', () => {
    expect(isIOSSafari(`${IPHONE} [FBAN/FBIOS]`)).toBe(false);
  });
});

describe('installRoute', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Version/17.5 Mobile/15E148 Safari/604.1';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';

  it('prefers the native prompt wherever one was captured', () => {
    expect(installRoute({ canPrompt: true, ua: ANDROID, maxTouchPoints: 5 })).toBe('prompt');
  });

  it('sends iOS Safari to the Share-sheet steps', () => {
    expect(installRoute({ canPrompt: false, ua: IPHONE, maxTouchPoints: 5 })).toBe('ios-safari');
  });

  it('sends other iOS browsers to Safari, since they cannot install at all', () => {
    expect(installRoute({ canPrompt: false, ua: `${IPHONE} CriOS/126.0`, maxTouchPoints: 5 })).toBe(
      'ios-other',
    );
  });

  it('falls back to the browser menu for a Chromium that has not fired the event yet', () => {
    expect(installRoute({ canPrompt: false, ua: ANDROID, maxTouchPoints: 5 })).toBe('manual');
  });
});
