// Names the feature a server function serves, for the consumption ledger (ai-usage.server.ts).
// Goes after requireSupabaseAuth in .middleware([...]) so the signed-in user is known. Safe to
// import from *.functions.ts: the server-only module is loaded lazily inside the server callback.
import { createMiddleware } from "@tanstack/react-start";
import type { UsageFeature } from "./ai-usage.server";

/** observe: false on status-polling endpoints (called every ~2 s while a job runs), where checking
 *  the plan limits again would only repeat the same reads. */
export function usageFeature(feature: UsageFeature, action?: string, opts: { observe?: boolean } = {}) {
  return createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const { runInUsageScope } = await import("./ai-usage.server");
    const userId = (context as { userId?: string } | undefined)?.userId ?? null;
    const result = await runInUsageScope(feature, userId, () => next(), action ?? null);
    // Plan limits, observe-only (plans.server.ts): never blocks, never fails the request.
    if (opts.observe !== false) {
      const { observeLimitsAfter } = await import("./plans.server");
      await observeLimitsAfter(feature, userId);
    }
    return result;
  });
}
