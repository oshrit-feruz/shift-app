/**
 * Shared classification of an upstream provider failure.
 *
 * Every failure path in this app already answers honestly — the frontend
 * renders "unavailable" rather than inventing data. What it did NOT do was
 * say WHICH failure it was: a plan that does not cover an endpoint, a spent
 * quota, and a provider that simply did not answer all collapsed into one
 * `upstream_error`, which makes a live problem take a support ticket to tell
 * apart from a transient one.
 *
 * That is the same silent-degradation shape this app keeps removing, one
 * level up: the response was honest about *whether* it failed and silent
 * about *why*. These helpers keep the honest status and add the reason.
 *
 * Nothing here echoes the API key or the upstream URL — only the status code
 * upstream returned, which is the one fact a caller needs to tell a plan
 * problem from an outage.
 */

export interface UpstreamFailure {
  /** HTTP status this app answers with. Always 502: we reached out and it went wrong. */
  status: 502;
  /** Machine-readable code the client maps to a specific message. */
  error: string;
  /** Human-readable, safe to show. */
  message: string;
  /** The status the provider itself returned, when there was one. */
  upstreamStatus?: number;
  /** The budget that elapsed, on a timeout. */
  timeoutMs?: number;
}

/**
 * Map the provider's own status onto a code that says what went wrong.
 *
 * 401/403 is the one that matters most in practice: EODHD answers a plain
 * "Forbidden" for an endpoint outside the key's plan, which is indefinite
 * and needs a subscription change — the opposite of the transient outage a
 * bare `upstream_error` implies.
 */
export function classifyUpstreamStatus(status: number, provider: string): UpstreamFailure {
  if (status === 401) {
    return {
      status: 502,
      error: 'upstream_unauthorized',
      message: `The ${provider} provider rejected the API key.`,
      upstreamStatus: status,
    };
  }
  if (status === 402 || status === 403) {
    return {
      status: 502,
      error: 'upstream_forbidden',
      message: `The ${provider} provider refused the request — this API key's plan may not include this data.`,
      upstreamStatus: status,
    };
  }
  if (status === 429) {
    return {
      status: 502,
      error: 'upstream_rate_limited',
      message: `The ${provider} provider's request quota has been reached.`,
      upstreamStatus: status,
    };
  }
  return {
    status: 502,
    error: 'upstream_error',
    message: `The ${provider} provider returned an error.`,
    upstreamStatus: status,
  };
}

/** True for the DOMException fetch raises when our AbortController fires. */
export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

/**
 * Map a thrown fetch (or a body read that aborted mid-stream) onto a code.
 *
 * A timeout and an unreachable host are different operational facts — one
 * says the provider is slow, the other that we never got to it — and reading
 * "could not reach" for a provider that answered in 11 seconds sends whoever
 * is debugging it looking in the wrong place.
 */
export function classifyFetchError(err: unknown, timeoutMs: number, provider: string): UpstreamFailure {
  if (isAbortError(err)) {
    return {
      status: 502,
      error: 'upstream_timeout',
      message: `The ${provider} provider did not respond within ${timeoutMs}ms.`,
      timeoutMs,
    };
  }
  return {
    status: 502,
    error: 'upstream_unavailable',
    message: `Could not reach the ${provider} provider.`,
  };
}

/** The JSON body for a failure — `status` is how it is sent, not part of it. */
export function failureBody(f: UpstreamFailure): Record<string, unknown> {
  const body: Record<string, unknown> = { error: f.error, message: f.message };
  if (f.upstreamStatus !== undefined) body.upstreamStatus = f.upstreamStatus;
  if (f.timeoutMs !== undefined) body.timeoutMs = f.timeoutMs;
  return body;
}

/** Either the parsed upstream body, or the failure to report instead. */
export type UpstreamResult = { ok: true; body: unknown } | { ok: false; failure: UpstreamFailure };

/**
 * One GET to a provider, under a timeout, with every failure classified.
 *
 * Both routes had this same block — the same abort wiring, the same four
 * failure branches, differing only in the words "news" and "earnings". Two
 * copies of failure handling is two places for them to drift apart, and the
 * handling is the part that must not.
 *
 * The timeout deliberately stays armed through body parsing: fetch()
 * resolves as soon as headers arrive while the body may still be streaming,
 * so clearing the timer any earlier would let a stalled body hang well past
 * the budget. Hence the json() call inside the same try, and clearTimeout
 * only in the finally.
 */
export async function fetchUpstreamJson(
  url: URL,
  timeoutMs: number,
  provider: string,
  route: string,
  fetchImpl: typeof fetch = fetch,
  /** 'text' for a provider that answers CSV; the body then comes back as a string. */
  as: 'json' | 'text' = 'json',
  /**
   * Extra request headers, for a provider that authenticates with one rather
   * than with a query parameter — SnapTrade signs each request and sends the
   * signature in a `Signature` header. Optional so the two query-authenticated
   * routes are unaffected.
   */
  headers?: Record<string, string>,
): Promise<UpstreamResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, ...(headers ? { headers } : {}) });
    if (!res.ok) {
      console.error(`${route}: upstream returned ${res.status}`);
      return { ok: false, failure: classifyUpstreamStatus(res.status, provider) };
    }
    try {
      return { ok: true, body: as === 'text' ? await res.text() : await res.json() };
    } catch (err) {
      // An abort firing mid-body-read is a timeout, not a malformed body:
      // the response may have been perfectly valid and simply too slow, so
      // calling it unreadable would be a guess about what we never saw.
      if (isAbortError(err)) {
        console.error(`${route}: upstream body read timed out:`, err);
        return { ok: false, failure: classifyFetchError(err, timeoutMs, provider) };
      }
      console.error(`${route}: upstream response was not valid JSON:`, err);
      return {
        ok: false,
        failure: {
          status: 502,
          error: 'bad_response',
          message: `The ${provider} provider returned an unreadable response.`,
        },
      };
    }
  } catch (err) {
    console.error(`${route}: upstream fetch failed:`, err);
    return { ok: false, failure: classifyFetchError(err, timeoutMs, provider) };
  } finally {
    clearTimeout(timeout);
  }
}
