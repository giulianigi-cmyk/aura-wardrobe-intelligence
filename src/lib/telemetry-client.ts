// Usage events and app errors from the app, sent in small batches after the fact (every 15 s, when
// the app goes to the background, or at 20 queued). Errors come from: a screen crash (the
// ErrorBoundary logs "[AURA] screen crashed"), uncaught errors and rejections, and the app's own
// "[AURA …]" console.error lines. The same error is sent at most once every 10 minutes per session.
// Nothing here can break the app: every failure is swallowed.
import { errorFingerprint, platformOf, scrubText, MAX_MESSAGE, MAX_STACK, type ErrorKind, type EventName } from "./telemetry";
import { recordAppErrors, recordAppEvents } from "./telemetry.functions";

type QueuedEvent = { name: EventName; screen: string | null; props?: Record<string, string | number> };
type QueuedError = { kind: ErrorKind; message: string; stack: string | null; screen: string | null };

const FLUSH_MS = 15_000;
const MAX_QUEUE = 20;
const SAME_ERROR_GAP_MS = 10 * 60_000;
/** Kept while signed out (e.g. an error on the sign-in screen), oldest dropped first. */
const MAX_WAITING = 100;

let started = false;
let signedIn = false;
let currentScreen: string | null = null;
let lastAppScreen: string | null = null;
let sessionId = "";
let platform = "desktop-web";
const events: QueuedEvent[] = [];
const errors: QueuedError[] = [];
const lastSent = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule() {
  if (events.length + errors.length >= MAX_QUEUE) void flush();
  else if (!timer) timer = setTimeout(() => void flush(), FLUSH_MS);
}

async function flush(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  // Only for a signed-in person (the server functions need the account); otherwise kept for later.
  if (!signedIn) return;
  const ev = events.splice(0, 25);
  const er = errors.splice(0, 10);
  try {
    if (ev.length) await recordAppEvents({ data: { sessionId, platform, events: ev } });
    if (er.length) await recordAppErrors({ data: { sessionId, platform, errors: er } });
  } catch {
    // Dropped: statistics must never cost the person anything. Not logged with "[AURA" on purpose
    // (that would be captured as a new error).
  }
  if (events.length || errors.length) schedule();
}

/** A product event (fixed list, telemetry.ts). */
export function track(name: EventName, props?: Record<string, string | number>): void {
  if (!started) return;
  events.push({ name, screen: currentScreen, props });
  if (events.length > MAX_WAITING) events.shift();
  schedule();
}

/** The screen now shown; recorded as a screen_view when it changes. */
export function setScreen(screen: string): void {
  if (screen === currentScreen) return;
  currentScreen = screen;
  if (!screen.startsWith("settings")) lastAppScreen = screen;
  track("screen_view");
}

/** The last screen before Settings — where a reported problem most likely happened. */
export function lastScreenOutsideSettings(): string | null {
  return lastAppScreen;
}

export function telemetryPlatform(): string {
  return platform;
}

export function captureError(kind: ErrorKind, message: string, stack?: string | null): void {
  if (!started) return;
  const msg = scrubText(message || "unknown error", MAX_MESSAGE);
  const st = stack ? scrubText(stack, MAX_STACK) : null;
  const fp = errorFingerprint(kind, msg, st);
  const now = Date.now();
  if (now - (lastSent.get(fp) ?? 0) < SAME_ERROR_GAP_MS) return;
  lastSent.set(fp, now);
  errors.push({ kind, message: msg, stack: st, screen: currentScreen });
  if (errors.length > MAX_WAITING) errors.shift();
  schedule();
}

function describe(args: unknown[]): { message: string; stack: string | null } {
  const err = args.find((a): a is Error => a instanceof Error);
  const text = args
    .map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : ""))
    .filter(Boolean)
    .join(" ");
  return { message: text, stack: err?.stack ?? null };
}

/** Starts capturing (once per app load). */
export function startTelemetry(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    sessionId = crypto.randomUUID();
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    platform = platformOf(navigator.userAgent, !!standalone);
  } catch {
    sessionId = "00000000-0000-4000-8000-000000000000";
  }

  window.addEventListener("error", (e) => captureError("unhandled", e.message, e.error instanceof Error ? e.error.stack : null));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    captureError("rejection", r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : null);
  });
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    try {
      if (typeof args[0] === "string" && args[0].startsWith("[AURA")) {
        const { message, stack } = describe(args);
        captureError(args[0].startsWith("[AURA] screen crashed") ? "crash" : "logged", message, stack);
      }
    } catch {
      // never let the capture itself throw from console.error
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
}

/** Signed in / out: events wait in the queue until there is an account to send them with. */
export function setSignedIn(value: boolean): void {
  signedIn = value;
  if (value && (events.length || errors.length)) schedule();
}
