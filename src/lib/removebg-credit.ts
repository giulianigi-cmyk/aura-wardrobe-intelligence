// remove.bg answering 402 means the account has no credits left. Retrying never helps until it is
// topped up, so the app pauses remove.bg for a few hours (the free cutout result is kept, exactly
// as when remove.bg fails for any other reason) and tells the admins once instead of failing on
// every photo.

/** app_errors.fingerprint of the "remove.bg out of credits" marker. */
export const REMOVEBG_NO_CREDIT = "removebg_out_of_credits";
/** After an out-of-credits answer, remove.bg is not called again for this long. */
export const REMOVEBG_PAUSE_MS = 6 * 60 * 60 * 1000;
/** At most one admin alert in this window, however long the account stays empty. */
export const REMOVEBG_ALERT_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

/** True while the last out-of-credits answer (epoch ms, null = never) is recent enough to skip calls. */
export function removeBgPausedAt(lastNoCreditAt: number | null, now: number): boolean {
  return lastNoCreditAt != null && now - lastNoCreditAt < REMOVEBG_PAUSE_MS;
}

/** True when no alert went out in the last REMOVEBG_ALERT_EVERY_MS (previous marker, epoch ms). */
export function removeBgShouldAlert(previousNoCreditAt: number | null, now: number): boolean {
  return previousNoCreditAt == null || now - previousNoCreditAt >= REMOVEBG_ALERT_EVERY_MS;
}
