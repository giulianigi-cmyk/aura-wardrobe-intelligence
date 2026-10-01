import { supabase } from "@/integrations/supabase/client";
import { compressImageForUpload } from "@/lib/image-compress";
import { signStoragePaths } from "@/lib/signed-url-cache";

/** One-off thumbnail backfill for wardrobe items created before thumbnails existed (they have an
 *  original cut-out but `thumbnail_path` is null, so grids download the full PNG).
 *
 *  Authorised scope: ONLY the owner account for now. This id is a scope limit for a one-off data
 *  job, not an access control — the job runs with the signed-in user's own session, so Storage
 *  policies and RLS already restrict it to that user's own files and rows.
 *
 *  Guarantees:
 *  - originals are only downloaded, never written, moved or deleted;
 *  - each thumbnail goes to a deterministic path `{user_id}/thumb-backfill-{item_id}.jpg`, so a
 *    run interrupted between upload and DB update is resumed by rewriting that same file — never a
 *    second copy;
 *  - the row is updated only while `thumbnail_path` is still null, so an existing thumbnail (or one
 *    the user creates meanwhile) is never replaced;
 *  - nothing is deleted. */
export const THUMB_BACKFILL_OWNER_ID = "32ff3367-afb3-4229-9960-cdcb882961cd";

const BATCH_SIZE = 12;
/** Decoding a very large PNG can exhaust a phone browser's memory; those are left for a desktop run. */
const MAX_BYTES_ON_TOUCH_DEVICES = 8 * 1024 * 1024;

export type ThumbBackfillResult = { done: number; skipped: number; failed: number };

let running = false;

export function thumbBackfillPath(userId: string, itemId: string): string {
  return `${userId}/thumb-backfill-${itemId}.jpg`;
}

/** Injectable for tests; the app always uses the defaults. */
export type ThumbBackfillDeps = {
  db: typeof supabase;
  sign: typeof signStoragePaths;
  compress: typeof compressImageForUpload;
  fetchFn: typeof fetch;
  isTouch: boolean;
  ownerId: string;
};

export async function backfillWardrobeThumbs(userId: string, deps?: Partial<ThumbBackfillDeps>): Promise<ThumbBackfillResult> {
  const result: ThumbBackfillResult = { done: 0, skipped: 0, failed: 0 };
  const ownerId = deps?.ownerId ?? THUMB_BACKFILL_OWNER_ID;
  if (userId !== ownerId || running) return result;
  running = true;
  const db = deps?.db ?? supabase;
  const sign = deps?.sign ?? signStoragePaths;
  const compress = deps?.compress ?? compressImageForUpload;
  const fetchFn = deps?.fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const isTouch = deps?.isTouch
    ?? (typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches));
  // Items skipped or failed in this run are not retried until the next app launch, so one bad
  // file can't make the loop spin forever.
  const exclude = new Set<string>();
  try {
    for (;;) {
      let query = db
        .from("wardrobe_items")
        .select("id, image_url")
        .eq("user_id", userId)
        .is("thumbnail_path", null)
        .not("image_url", "is", null)
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);
      if (exclude.size) query = query.not("id", "in", `(${[...exclude].join(",")})`);
      const { data, error } = await query;
      if (error) { console.warn("[AURA thumb-backfill] select failed", error); break; }
      const rows = (data ?? []) as { id: string; image_url: string }[];
      if (!rows.length) break;

      const { urls } = await sign("wardrobe", rows.map((r) => r.image_url), 600);
      for (const row of rows) {
        try {
          const url = urls[row.image_url];
          if (!url) { exclude.add(row.id); result.failed++; continue; }
          const res = await fetchFn(url);
          if (!res.ok) { exclude.add(row.id); result.failed++; continue; }
          const blob = await res.blob();
          if (isTouch && blob.size > MAX_BYTES_ON_TOUCH_DEVICES) { exclude.add(row.id); result.skipped++; continue; }

          // Same generator as every live thumbnail (AddItem, Wardrobe, BatchReview): 400px, JPEG q0.75.
          const source = new File([blob], "item.png", { type: blob.type || "image/png" });
          const thumb = await compress(source, 400, 0.75);
          // compressImageForUpload falls back to the original when it can't shrink it; never
          // upload a full-size original as a "thumbnail".
          if (thumb === source || thumb.type !== "image/jpeg") { exclude.add(row.id); result.skipped++; continue; }

          const path = thumbBackfillPath(userId, row.id);
          const up = await db.storage.from("wardrobe").upload(path, thumb, {
            contentType: "image/jpeg",
            cacheControl: "3600",
            upsert: true, // only ever this deterministic backfill path: makes a resumed run idempotent
          });
          if (up.error) { exclude.add(row.id); result.failed++; console.warn("[AURA thumb-backfill] upload failed", row.id, up.error); continue; }

          const { data: updated, error: updErr } = await db
            .from("wardrobe_items")
            .update({ thumbnail_path: path } as never)
            .eq("id", row.id)
            .eq("user_id", userId)
            .is("thumbnail_path", null)
            .select("id");
          if (updErr) { exclude.add(row.id); result.failed++; console.warn("[AURA thumb-backfill] update failed", row.id, updErr); continue; }
          // No row updated = it got a thumbnail meanwhile; the existing one is left untouched.
          if ((updated ?? []).length) result.done++;
          else { exclude.add(row.id); result.skipped++; }
        } catch (e) {
          exclude.add(row.id);
          result.failed++;
          console.warn("[AURA thumb-backfill] item failed", row.id, e);
        }
      }
      // Yield between batches so the app stays responsive.
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    running = false;
  }
  console.info("[AURA thumb-backfill] finished", result);
  return result;
}
