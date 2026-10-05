// Names the feature a server function serves, for the consumption ledger (ai-usage.server.ts).
// Goes after requireSupabaseAuth in .middleware([...]) so the signed-in user is known. Safe to
// import from *.functions.ts: the server-only module is loaded lazily inside the server callback.
import { createMiddleware } from "@tanstack/react-start";
import type { UsageFeature } from "./ai-usage.server";

export function usageFeature(feature: UsageFeature, action?: string) {
  return createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const { runInUsageScope } = await import("./ai-usage.server");
    const userId = (context as { userId?: string } | undefined)?.userId ?? null;
    return runInUsageScope(feature, userId, () => next(), action ?? null);
  });
}
