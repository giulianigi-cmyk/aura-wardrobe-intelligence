/** Shared cache for `outfits` — same pattern as wardrobe-query.ts and
 *  outfit-plans-query.ts. Missed in the original navigation audit
 *  because `outfits` wasn't independently duplicated across the
 *  persistent tabs the way wardrobe_items/outfit_plans were — but it
 *  surfaced a real, related bug: AIStylist is now a persistent tab (see
 *  AuraApp.tsx) that never remounts, so its own outfits list never
 *  refreshed after saving a new one in OutfitBuilder (a separate,
 *  secondary screen). Before persistent tabs, leaving and returning to
 *  AIStylist remounted it and refetched automatically — that natural
 *  refresh point no longer exists, so it has to be explicit now,
 *  exactly like wardrobe items and plans already are.
 */
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Outfit } from "@/lib/aura-types";

export const outfitsQueryKey = (userId: string | undefined) => ["outfits", userId] as const;

async function fetchOutfits(userId: string): Promise<Outfit[]> {
  const { data, error } = await supabase
    .from("outfits")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Outfit[];
}

export function useOutfits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: outfitsQueryKey(user?.id),
    queryFn: () => fetchOutfits(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function invalidateOutfits(queryClient: QueryClient, userId: string | undefined) {
  void queryClient.invalidateQueries({ queryKey: outfitsQueryKey(userId) });
}

/** Optimistic-update helpers, same pattern as wardrobe-query.ts's
 *  updateWardrobeItemInCache/removeWardrobeItemFromCache — used for
 *  archive/restore and delete so the UI updates instantly instead of
 *  waiting on a refetch. */
export function updateOutfitInCache(queryClient: QueryClient, userId: string | undefined, updated: Outfit) {
  queryClient.setQueryData<Outfit[]>(outfitsQueryKey(userId), (prev) =>
    prev ? prev.map((o) => (o.id === updated.id ? updated : o)) : prev,
  );
}

export function removeOutfitFromCache(queryClient: QueryClient, userId: string | undefined, outfitId: string) {
  queryClient.setQueryData<Outfit[]>(outfitsQueryKey(userId), (prev) =>
    prev ? prev.filter((o) => o.id !== outfitId) : prev,
  );
}

/** Call after saving a new outfit or updating/deleting an existing one
 *  — OutfitBuilder.tsx (save/update) and AIStylist.tsx (delete,
 *  archive/restore) all need this so every screen reading the shared
 *  list sees the change without waiting on a remount that, for a
 *  persistent tab, may never come. */
export function useOutfitsCacheActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return {
    invalidate: () => invalidateOutfits(queryClient, user?.id),
    updateOutfit: (updated: Outfit) => updateOutfitInCache(queryClient, user?.id, updated),
    removeOutfit: (outfitId: string) => removeOutfitFromCache(queryClient, user?.id, outfitId),
  };
}
