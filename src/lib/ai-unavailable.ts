// The AI service refusing work because its credit has run out (HTTP 402 "Payment Required" from
// the Lovable AI Gateway). Retrying never helps until the credit is topped up, so callers stop at
// the first such answer and tell the person the service is temporarily unavailable.

/** Stored at the start of a batch-scan job's error_message when it stopped for this reason. */
export const SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE";

export function isServiceOutOfCredits(err: unknown): boolean {
  if (err && typeof err === "object" && (err as { statusCode?: unknown }).statusCode === 402) return true;
  const message = typeof err === "string" ? err : err instanceof Error ? err.message : "";
  return message.startsWith(SERVICE_UNAVAILABLE)
    || /payment required|insufficient (credits|balance|funds)|out of credits|credits? (exhausted|depleted)|\b(http|status) 402\b/i.test(message);
}
