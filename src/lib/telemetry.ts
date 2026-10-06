// Usage events and app errors — the pure part, shared by the app (telemetry-client.ts) and the
// server functions (telemetry.functions.ts). Only a fixed list of events with a few short fields;
// error text is stripped of anything personal before it is stored.

// Sign-ups, pieces added, outfits saved and AI use are already in the database (auth.users,
// wardrobe_items, outfits, ai_usage_ledger) and are not sent again as events.
// flow_step: one timed step of a flow (e.g. adding a piece: picked, analysis, cutout, saved,
// abandoned), with its duration in ms — where people wait and where they give up.
export const EVENT_NAMES = ["app_open", "screen_view", "profile_setup_completed", "problem_reported", "flow_step"] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export const ERROR_KINDS = ["crash", "unhandled", "rejection", "logged"] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

/** Screen names are the app's own identifiers (lower-case words and dashes). */
export const SCREEN_RE = /^[a-z][a-z0-9-]{0,39}$/;

export const MAX_MESSAGE = 300;
export const MAX_STACK = 2000;

/** Removes what could identify a person or open an account from an error text: e-mail addresses,
 *  bearer / JWT / API tokens, long hex or base64 runs, URL query strings and fragments, UUIDs. */
export function scrubText(text: string, max: number): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g, "$1 <token>")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "<jwt>")
    .replace(/\b(sk|pk|sb|rk)_[A-Za-z0-9_]{12,}/g, "<key>")
    .replace(/(https?:\/\/[^\s?#"')]+)[?#][^\s"')]*/g, "$1")
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "<data-url>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, "<blob>")
    .slice(0, max);
}

/** Same error, same fingerprint: kind + message without numbers + first stack frame. */
export function errorFingerprint(kind: string, message: string, stack?: string | null): string {
  const frame = (stack ?? "").split("\n").map((l) => l.trim()).find((l) => l.startsWith("at ") || l.includes("@")) ?? "";
  const norm = (s: string) => s.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  const raw = `${kind}|${norm(message).slice(0, 120)}|${norm(frame.replace(/\?[^:)]*/, "")).slice(0, 120)}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Coarse device family; nothing more specific is kept. */
export function platformOf(userAgent: string, standalone: boolean): string {
  const ua = userAgent.toLowerCase();
  const os = /iphone|ipad|ipod/.test(ua) ? "ios" : /android/.test(ua) ? "android" : "desktop";
  return standalone ? `${os}-app` : `${os}-web`;
}
