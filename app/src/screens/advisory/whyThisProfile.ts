/**
 * The result screen's one line connecting the answers to the profile.
 *
 * Its own module, and pure, for two reasons. It builds string keys by
 * template — `adv.q${i + 1}a${answer}` — which TypeScript only accepts through
 * a cast, so a wrong key fails at runtime on the screen the whole flow leads
 * to rather than at build time. And the choice it makes is a claim about
 * causation, which is worth testing directly rather than through a component.
 *
 * WHY TWO FORMS. The mapping (lib/advisory.ts) has two shapes:
 *
 *   - the HARD RULE is one answer. A horizon under two years, or no cash set
 *     aside, produces Conservative on its own; the other three are not
 *     consulted. Naming that answer is exact, and the line says the rest did
 *     not matter, because they did not.
 *   - everything else is the SUM of all four against two thresholds. No pair
 *     is the reason, so all four are listed and the line claims only that
 *     together they map.
 *
 * The tempting alternative — always citing the horizon and the drop-reaction,
 * which reads best — is false for most combinations. It would put a
 * plausible-looking explanation of a number on the one screen where every
 * other figure is real.
 *
 * Says nothing about how individual stocks are selected: this explains the
 * questionnaire, not the contents of the allocation.
 */

import { decisiveAnswer, type Answer } from '../../lib/advisory';
import type { StringKey } from '../../i18n/strings';
import type { TFn } from '../../i18n/useT';

/** The key holding the reader's chosen answer to question `index` (0-based). */
function answerKey(index: number, answer: Answer): StringKey {
  return `adv.q${index + 1}a${answer}` as StringKey;
}

/**
 * The line, or null when there is nothing honest to say.
 *
 * EXACTLY four, not "at least four". `Answer[]` permits any length, and
 * `advAnswers` is rehydrated straight out of localStorage and the synced
 * `user_state` row without validation — `readPersisted` heals `watchlist` and
 * `savedAlerts` but passes this array through verbatim (state/appState.tsx).
 * A bag carrying five would build `adv.q5a2`, a key that does not exist, and
 * take the recommendation screen down with it.
 *
 * Fewer than four has no profile to explain either, so both ends read null.
 */
export function whyThisProfileLine(answers: Answer[], profile: string, t: TFn): string | null {
  if (answers.length !== 4) return null;

  const decisive = decisiveAnswer(answers);
  if (decisive !== null) {
    return t('rec.whyOne', { answer: t(answerKey(decisive, answers[decisive])), profile });
  }
  return t('rec.whyAll', {
    // The reader's own four choices, in the order they were asked.
    answers: answers.map((a, i) => t(answerKey(i, a))).join(' · '),
    profile,
  });
}
