// Which «Novità» this person has already used (feature-news.ts), read from their own data — the same
// queries from the app (their session, row-level security) and from the notification job (admin).
import type { NewsId } from "./feature-news";

type Counted = PromiseLike<{ count: number | null }>;

/** The features with at least one trace of use. Sell has no lasting trace: told once anyway. */
export async function usedNews(client: any, userId: string): Promise<Set<NewsId>> {
  const count = (q: Counted) => Promise.resolve(q).then((r) => r.count ?? 0).catch(() => 0);
  const rows = (table: string) => client.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  const [wishlist, compare, basket, storage, trips, calendar, locations, tryon] = await Promise.all([
    count(rows("wishlist_items")),
    count(rows("ai_usage_ledger").eq("feature", "advisor_compare")),
    count(rows("wardrobe_items").not("laundry_kind", "is", null)),
    count(rows("wardrobe_items").not("stored_at", "is", null)),
    count(rows("trips")),
    count(rows("calendar_connections")),
    count(rows("wardrobe_locations")),
    count(rows("avatar_tryon_cache")),
  ]);
  const used = new Set<NewsId>();
  if (wishlist > 0) used.add("wishlist");
  if (compare > 0) used.add("compare");
  if (basket > 0) used.add("basket");
  if (storage > 0) used.add("storage");
  if (trips > 0) used.add("trips");
  if (calendar > 0) used.add("calendar");
  if (locations > 1) used.add("locations"); // the first place is created for everyone
  if (tryon > 0) used.add("tryon");
  return used;
}
