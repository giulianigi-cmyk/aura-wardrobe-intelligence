/** Shared cache for fetchValuationConfig — same pattern as
 *  wardrobe-query.ts and outfit-plans-query.ts, the third and last of
 *  the duplicated-fetch candidates flagged in the original navigation
 *  audit. Wardrobe.tsx and Insights.tsx each ran their own independent
 *  fetch of this before.
 *
 *  Unlike the wardrobe items/plans caches, this config is NOT scoped
 *  per user — the underlying query has no user_id filter at all (it's
 *  shared pricing/valuation reference data: category profiles, brand
 *  modifiers, etc., the same for every account), so a single global
 *  query key is correct here, not one keyed by user id. It also
 *  changes far less often than a person's own wardrobe or plans — this
 *  is reference data an admin updates occasionally, not something any
 *  in-app user action modifies — so a long staleTime is appropriate
 *  and there's no matching "invalidate after a mutation" story the way
 *  there is for wardrobe items or plans.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchValuationConfig, EMPTY_VALUATION_CONFIG, type ValuationConfig } from "@/lib/wardrobe-value-engine";

export const valuationConfigQueryKey = ["valuation-config"] as const;

export function useValuationConfig() {
  return useQuery({
    queryKey: valuationConfigQueryKey,
    queryFn: fetchValuationConfig,
    staleTime: 60 * 60 * 1000, // an hour — this changes rarely and isn't user-mutable
    // A failed fetch shouldn't crash whatever screen needed it — both
    // previous call sites already had this same fallback behavior.
    placeholderData: EMPTY_VALUATION_CONFIG,
  });
}

export type { ValuationConfig };
