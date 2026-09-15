/** Shared cache for wardrobe locations (listLocations) — same pattern
 *  and reasoning as wardrobe-query.ts and outfit-plans-query.ts. Third
 *  and smallest of the three duplicated-fetch candidates the original
 *  navigation audit flagged: AIStylist (a persistent tab), TripCreate
 *  and TripDetail (both secondary screens) each ran their own
 *  independent call. Lower priority than the first two — this is a
 *  handful of rows per user, not hundreds of wardrobe items — but still
 *  a real duplicate fetch with no reason to keep repeating it.
 */
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { listLocations } from "@/lib/wardrobe-locations.functions";
import type { WardrobeLocation } from "@/lib/wardrobe-location";

export type WardrobeLocationsResult = { locations: WardrobeLocation[]; activeLocationId: string | null };

export const wardrobeLocationsQueryKey = (userId: string | undefined) => ["wardrobe-locations", userId] as const;

/** Locations change rarely (someone sets up a second home once, not
 *  every session) — a longer staleTime than the items/plans caches is
 *  appropriate here, still backed by the same explicit-invalidation
 *  principle: a change is signaled via invalidateWardrobeLocations, not
 *  waited out. */
export function useWardrobeLocations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: wardrobeLocationsQueryKey(user?.id),
    queryFn: () => listLocations() as Promise<WardrobeLocationsResult>,
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });
}

export function invalidateWardrobeLocations(queryClient: QueryClient, userId: string | undefined) {
  void queryClient.invalidateQueries({ queryKey: wardrobeLocationsQueryKey(userId) });
}

/** Call after adding, renaming, removing a location, or changing which
 *  one is active — see TripCreate.tsx / TripDetail.tsx / Settings'
 *  wardrobe-locations screen for where locations actually get mutated. */
export function useWardrobeLocationsCacheActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return { invalidate: () => invalidateWardrobeLocations(queryClient, user?.id) };
}
