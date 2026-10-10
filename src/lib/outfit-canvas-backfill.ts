import { supabase } from "@/integrations/supabase/client";
import type { WardrobeItem } from "@/lib/aura-types";
import { composeOutfitImage, type ComposeItem } from "@/lib/compose-outfit-canvas";
import { resolveWardrobeUrls, toStoragePath } from "@/lib/wardrobe-image";
import { uploadOutfitThumb } from "@/lib/outfit-thumb";

/**
 * Canvas image for an outfit that was saved with only its pieces (e.g. from the
 * avatar try-on), so My Outfits shows the composed look instead of an empty
 * "Open canvas" tile. Client-side (the composition is a browser canvas) and
 * best-effort: any failure leaves the outfit exactly as it was.
 */

type ItemRow = Pick<WardrobeItem, "id" | "image_url" | "category" | "subcategory"> & {
  length?: string | null;
  thumbnail_path?: string | null;
};

async function loadItems(userId: string, ids: string[]): Promise<ItemRow[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("id, image_url, category, subcategory, length, thumbnail_path")
    .eq("user_id", userId)
    .in("id", ids);
  if (error || !data) return [];
  return data as unknown as ItemRow[];
}

/** Composes the canvas PNG (and its grid thumbnail) and uploads both.
 *  Returns null when nothing could be composed. */
export async function composeOutfitCanvasForItems(
  userId: string,
  itemIds: string[],
): Promise<{ canvasPath: string; thumbPath: string | null } | null> {
  const items = await loadItems(userId, itemIds);
  if (!items.length) return null;
  const signed = await resolveWardrobeUrls(items as unknown as WardrobeItem[]);
  const compose: ComposeItem[] = items
    .map((it) => {
      const path = toStoragePath(it.image_url);
      const url = path ? signed[path] : null;
      return url ? { id: it.id, imgUrl: url, category: it.category, subcategory: it.subcategory, length: it.length ?? null } : null;
    })
    .filter((x): x is ComposeItem => x != null);
  if (!compose.length) return null;

  const blob = await composeOutfitImage(compose);
  if (!blob) return null;
  const canvasPath = `${userId}/outfit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await supabase.storage.from("outfits").upload(canvasPath, blob, {
    contentType: "image/png",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    console.warn("[AURA] outfit canvas upload failed", error);
    return null;
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const thumbPath = await uploadOutfitThumb(userId, objectUrl);
    return { canvasPath, thumbPath };
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  }
}

let backfillRan = false;

/** Once per session: gives a canvas image to the user's outfits saved without
 *  one. Small batch, newest first; returns how many outfits were updated. */
export async function backfillOutfitCanvases(userId: string, batch = 10): Promise<number> {
  if (backfillRan) return 0;
  backfillRan = true;
  try {
    const { data, error } = await supabase
      .from("outfits")
      .select("id, item_ids")
      .eq("user_id", userId)
      .is("canvas_image_url", null)
      .order("created_at", { ascending: false })
      .limit(batch);
    if (error || !data?.length) return 0;
    let done = 0;
    for (const row of data as { id: string; item_ids: string[] | null }[]) {
      try {
        const made = await composeOutfitCanvasForItems(userId, row.item_ids ?? []);
        if (!made) continue;
        const { error: updErr } = await supabase
          .from("outfits")
          .update({ canvas_image_url: made.canvasPath, ...(made.thumbPath ? { thumbnail_path: made.thumbPath } : {}) } as never)
          .eq("id", row.id)
          .eq("user_id", userId)
          .is("canvas_image_url", null);
        if (!updErr) done++;
      } catch (e) {
        console.warn("[AURA] outfit canvas backfill item failed", row.id, e);
      }
    }
    return done;
  } catch (e) {
    console.warn("[AURA] outfit canvas backfill failed", e);
    return 0;
  }
}
