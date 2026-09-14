/** Shared cache layer for wardrobe_items and their signed image URLs —
 *  built on the @tanstack/react-query infrastructure that was already
 *  installed and already wired up (QueryClientProvider in
 *  src/routes/__root.tsx) but never actually used anywhere in the app.
 *  This is deliberately NOT a custom cache system: every screen that
 *  needs the wardrobe list or its images should go through the hooks
 *  below instead of running its own supabase.from("wardrobe_items")
 *  query, so there is exactly one fetch per user session instead of one
 *  per screen.
 *
 *  Design note on archived items: this returns the FULL set, archived
 *  included, rather than guessing which subset any given screen wants.
 *  Some screens genuinely need archived items too (Planner resolves
 *  ALREADY-SAVED outfit plans by item id, and a plan from before a piece
 *  was sold/donated should still render correctly) while others only
 *  want the active set (a suggestion pool should never offer something
 *  no longer owned). Filtering happens at the call site — see
 *  useActiveWardrobeItems below for the common case — not by fetching a
 *  different query per screen, which is exactly the duplication this
 *  file exists to remove.
 */
import { useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { resolveWardrobeUrls, toStoragePath } from "@/lib/wardrobe-image";
import type { WardrobeItem } from "@/lib/aura-types";

export const wardrobeItemsQueryKey = (userId: string | undefined) => ["wardrobe-items", userId] as const;
export const wardrobeImagesQueryKey = (userId: string | undefined) => ["wardrobe-images", userId] as const;

async function fetchWardrobeItems(userId: string): Promise<WardrobeItem[]> {
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WardrobeItem[];
}

/** The one shared fetch of a user's full wardrobe. staleTime is 5
 *  minutes — not because the data is assumed fresh for 5 minutes
 *  regardless of what happens, but because freshness here is meant to
 *  come from EXPLICIT invalidation right after a mutation (see Phase 2:
 *  invalidateWardrobeItems below), not from polling or a short timer.
 *  Within that window, moving between tabs reads this same cached
 *  result instantly — no spinner, no network call — exactly the
 *  "Home → Wardrobe → Stylist → Wardrobe" scenario this was built for. */
export function useWardrobeItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: wardrobeItemsQueryKey(user?.id),
    queryFn: () => fetchWardrobeItems(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

/** Convenience wrapper for the common case — Home's count, AIStylist's
 *  and Planner's suggestion pool, anything that should never include a
 *  sold/donated/archived piece. Reads from the same cache as
 *  useWardrobeItems (no second fetch), just filters the result. */
export function useActiveWardrobeItems() {
  const query = useWardrobeItems();
  const items = useMemo(
    () => (query.data ?? []).filter((it) => !(it as unknown as { archived?: boolean }).archived),
    [query.data],
  );
  return { ...query, data: items };
}

async function fetchWardrobeImages(items: WardrobeItem[]): Promise<Record<string, string>> {
  return resolveWardrobeUrls(items);
}

/** Signed URLs for every image/thumbnail referenced by `items`. The
 *  query key includes every relevant storage path (image + thumbnail),
 *  not just the user id — so the SAME set of items (the common case:
 *  switching tabs with nothing added/removed) hits cache and re-signs
 *  nothing, while a genuinely different item set (something added,
 *  removed, or re-uploaded) correctly triggers exactly one fresh batch
 *  sign call, still far cheaper than the 4 independent re-signs this
 *  replaces.
 *
 *  staleTime is deliberately just under the one-hour signed-URL expiry
 *  (createSignedUrls(..., 60*60) in wardrobe-image.ts) — a session kept
 *  open past that point triggers a background re-sign on the next
 *  mount/focus, well before the URLs actually break, rather than
 *  waiting for a broken image to be the first sign anything expired. */
export function useWardrobeImages(items: WardrobeItem[] | undefined) {
  const { user } = useAuth();
  const paths = useMemo(() => {
    if (!items?.length) return [] as string[];
    const thumbPaths = items
      .map((i) => (i as unknown as { thumbnail_path?: string | null }).thumbnail_path)
      .filter((p): p is string => Boolean(p));
    const imagePaths = items.map((i) => toStoragePath(i.image_url)).filter((p): p is string => Boolean(p));
    return Array.from(new Set([...imagePaths, ...thumbPaths])).sort();
  }, [items]);

  return useQuery({
    queryKey: [...wardrobeImagesQueryKey(user?.id), paths],
    queryFn: () => fetchWardrobeImages(items ?? []),
    enabled: !!user && paths.length > 0,
    staleTime: 50 * 60 * 1000,
  });
}

/** Called right after any mutation that changes wardrobe_items — add,
 *  edit, delete, archive/restore, LogWear's worn_count/last_worn bump,
 *  a batch import, an outfit scan. Marks the shared cache stale so the
 *  next screen that reads it refetches, instead of silently showing an
 *  outdated list. See Phase 2 for exactly where each of these calls in. */
export function invalidateWardrobeItems(queryClient: QueryClient, userId: string | undefined) {
  void queryClient.invalidateQueries({ queryKey: wardrobeItemsQueryKey(userId) });
}

/** Optimistic-update helper for the common case of a single item
 *  changing (edit, archive toggle, worn_count bump) — writes the new
 *  item straight into the cache so the UI updates instantly, without
 *  waiting for a refetch. Falls back to invalidation (see above) rather
 *  than a hand-rolled rollback when a caller isn't sure the update is
 *  safe to apply optimistically. */
export function updateWardrobeItemInCache(queryClient: QueryClient, userId: string | undefined, updated: WardrobeItem) {
  queryClient.setQueryData<WardrobeItem[]>(wardrobeItemsQueryKey(userId), (prev) =>
    prev ? prev.map((it) => (it.id === updated.id ? updated : it)) : prev,
  );
}

/** Same idea for a brand-new item (AddItem, OutfitScan, BatchReview) —
 *  prepends into the cache immediately rather than waiting for the next
 *  full refetch, mirroring the optimistic prepend Wardrobe.tsx already
 *  did locally before this shared cache existed. */
export function addWardrobeItemToCache(queryClient: QueryClient, userId: string | undefined, created: WardrobeItem) {
  queryClient.setQueryData<WardrobeItem[]>(wardrobeItemsQueryKey(userId), (prev) => {
    if (!prev) return prev;
    if (prev.some((it) => it.id === created.id)) return prev;
    return [created, ...prev];
  });
}

/** Same idea for a deletion. */
export function removeWardrobeItemFromCache(queryClient: QueryClient, userId: string | undefined, itemId: string) {
  queryClient.setQueryData<WardrobeItem[]>(wardrobeItemsQueryKey(userId), (prev) =>
    prev ? prev.filter((it) => it.id !== itemId) : prev,
  );
}

/** Thin wrapper so call sites don't need to import useQueryClient AND
 *  useAuth separately just to invalidate/update after their own
 *  mutation — see Phase 2 usages. */
export function useWardrobeCacheActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return {
    invalidate: () => invalidateWardrobeItems(queryClient, user?.id),
    updateItem: (updated: WardrobeItem) => updateWardrobeItemInCache(queryClient, user?.id, updated),
    addItem: (created: WardrobeItem) => addWardrobeItemToCache(queryClient, user?.id, created),
    removeItem: (itemId: string) => removeWardrobeItemFromCache(queryClient, user?.id, itemId),
  };
}
