/** Shared cache for outfit_plans — same reasoning and pattern as
 *  wardrobe-query.ts, just for the second genuinely-duplicated dataset
 *  found in the audit: AIStylist and Planner (both persistent tabs,
 *  see AuraApp.tsx) were each running their own independent
 *  `select("*")` on outfit_plans. Deliberately narrow in scope — the
 *  audit also flagged wardrobe locations and the valuation config as
 *  possible candidates, but each of those only has ONE persistent-tab
 *  consumer, so the real, verifiable duplication this phase is meant to
 *  fix doesn't apply to them the same way. */
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type OutfitPlanRow = Tables<"outfit_plans">;

export const outfitPlansQueryKey = (userId: string | undefined) => ["outfit-plans", userId] as const;

async function fetchOutfitPlans(userId: string): Promise<OutfitPlanRow[]> {
  const { data, error } = await supabase
    .from("outfit_plans")
    .select("*")
    .eq("user_id", userId)
    .order("date");
  if (error) throw error;
  return (data ?? []) as OutfitPlanRow[];
}

/** staleTime matches wardrobe-query.ts's reasoning: freshness comes from
 *  explicit invalidation right after a mutation (see
 *  invalidateOutfitPlans below), not from a short timer — so a plan
 *  saved/edited/cancelled in AIStylist shows correctly in Planner on
 *  the very next visit, and vice versa, without either screen re-
 *  fetching just because a few minutes passed. */
export function useOutfitPlans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: outfitPlansQueryKey(user?.id),
    queryFn: () => fetchOutfitPlans(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function invalidateOutfitPlans(queryClient: QueryClient, userId: string | undefined) {
  void queryClient.invalidateQueries({ queryKey: outfitPlansQueryKey(userId) });
}

/** Thin wrapper mirroring useWardrobeCacheActions — call sites in
 *  AIStylist, Planner, OutfitBuilder, and SavedOutfits use this after
 *  their own upsert/update/cancel calls instead of relying on each
 *  screen's own next full reload() to notice the change. */
export function useOutfitPlansCacheActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return {
    invalidate: () => invalidateOutfitPlans(queryClient, user?.id),
  };
}
