// Why a try-on failed, in a few known kinds, so the screen can say something true instead of the same
// "Riprova" every time — a provider out of credits never succeeds on retry, a timeout often does.
// Only the kind is shown, never the provider's raw message.

export type TryOnErrorKind = "credits" | "rate_limit" | "timeout" | "content_policy" | "image" | "save" | "network" | "provider";

export function classifyTryOnError(message: string | null | undefined, stage: "step" | "save" | "other" = "other"): TryOnErrorKind {
  const m = (message ?? "").toLowerCase();
  if (/credit|balance|insufficient|payment|billing|http 402|quota/.test(m)) return "credits";
  if (/http 429|rate limit|too many requests|concurrency/.test(m)) return "rate_limit";
  if (/timeout|timed out|time out|deadline/.test(m)) return "timeout";
  if (/nsfw|safety|policy|moderation|not allowed|inappropriate/.test(m)) return "content_policy";
  if (/image|too large|format|decode|resolution|pose|person not detected|no person/.test(m)) return "image";
  if (/load failed|failed to fetch|network|connection/.test(m)) return "network";
  return stage === "save" ? "save" : "provider";
}
