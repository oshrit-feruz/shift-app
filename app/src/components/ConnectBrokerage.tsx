import { useState } from 'react';
import { Card, CardTitle } from './Card';
import { Button } from './Button';
import { ReasonNote } from './ReasonNote';
import { useAuth } from '../auth/AuthProvider';
import { startBrokerageConnection } from '../data/snaptradeAccount';
import { track } from '../data/analytics';
import { useT } from '../i18n/useT';

/**
 * The card that starts a real brokerage connection.
 *
 * WHAT PRESSING THE BUTTON DOES, and why it is the whole design: it asks the
 * server for a one-time SnapTrade Connection Portal URL and sends the browser
 * there. The brokerage login happens on that page, at SnapTrade, and what the
 * user grants is a READ connection. This app therefore never handles a
 * brokerage username or password, and could not place a trade with what it
 * gets back. Both facts are stated on the card rather than buried in a
 * settings page, because they are what someone is deciding about.
 *
 * The portal URL expires after about five minutes, so it is used immediately
 * and never stored — the button is the whole lifetime of that link.
 *
 * A failure is shown in place with the reason the data layer gave, and the
 * button stays. It never navigates on a failure, which would leave someone on
 * a broken page with no way back.
 */
export function ConnectBrokerage({ card = true }: { card?: boolean } = {}) {
  const t = useT();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ en: string; he: string } | null>(null);

  // Signed out, or a deployment with no auth configured. The button would
  // reach a route that cannot resolve a user, so it says what is needed
  // instead of failing after the tap.
  const signedIn = session.status === 'ok' && session.data !== null;

  const connect = async () => {
    // The other half of the primary KPI. The advisory flow's own broker
    // screen offers the referral hand-off (screens/advisory/Connect.tsx);
    // this button is the read-only link itself, and both are the user
    // acting on the recommendation.
    //
    // Worth knowing when reading the funnel: this card lives on the
    // Connections and connected-account screens, not on the flow's broker
    // step, so a session can record this stage without having recorded
    // broker_screen_viewed. The queries in docs/funnel.md count each stage
    // independently rather than assuming an order, for exactly this reason.
    //
    // Recorded before the request, not after: what this measures is the
    // user acting, and a portal that fails to open is still an act.
    track('broker_action_clicked');
    setBusy(true);
    setError(null);
    const result = await startBrokerageConnection();
    if (result.status === 'ok') {
      // A full navigation, not a new tab: the portal redirects back here when
      // it is done, and a popup would be blocked as often as not.
      window.location.href = result.data.redirectURI;
      // Deliberately no setBusy(false): the page is leaving, and flipping the
      // button back to "Connect" for the last frame before it does would look
      // like the tap did nothing.
      return;
    }
    setError(result.status === 'unavailable' ? (result.reason ?? null) : null);
    setBusy(false);
  };

  const body = (
    <>
      <CardTitle>{t('link.title')}</CardTitle>
      <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.55 }}>
        {t('link.help')}
      </p>
      <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.55 }}>
        {t('link.permission')}
      </p>

      <ReasonNote title={t('link.failedTitle')} reason={error} />

      <Button
        variant="primary"
        block
        fontSize={16}
        minHeight={44}
        onClick={connect}
        disabled={busy || !signedIn}
      >
        {busy ? t('link.opening') : t('link.cta')}
      </Button>
      {!signedIn && (
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
          {t('link.signedOut')}
        </span>
      )}
    </>
  );

  // `card={false}` for the callers that already sit inside a Card — the empty
  // state of a linked account's own list, where a second card border around
  // this would read as a separate section rather than the way out of the one
  // above it.
  return card ? (
    <Card padding={13} gap={8}>
      {body}
    </Card>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 0 11px' }}>{body}</div>
  );
}
