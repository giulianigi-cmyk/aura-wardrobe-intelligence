/** One quiet retry for requests the network dropped ("Load failed" on iPhone Safari, "Failed to
 *  fetch" elsewhere): a phone switching between Wi-Fi and mobile data loses the first try, the
 *  second goes through. Only network errors are retried — an HTTP error or a refusal from the
 *  server is returned to the caller as it is. */
export function isNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e instanceof TypeError || /load failed|failed to fetch|networkerror|network request failed|network connection was lost/i.test(e.message);
}

export async function retryOnNetworkError<T>(fn: () => Promise<T>, delayMs = 800): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await new Promise((r) => setTimeout(r, delayMs));
    return fn();
  }
}
