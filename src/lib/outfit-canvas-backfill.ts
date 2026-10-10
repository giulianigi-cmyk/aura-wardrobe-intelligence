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
  opts: { light?: boolean } = {},
): Promise<{ canvasPath: string; thumbPath: string | null } | null> {
  const items = await loadItems(userId, itemIds);
  if (!items.length) return null;
  const signed = await resolveWardrobeUrls(items as unknown as WardrobeItem[]);
  const compose: ComposeItem[] = [];
  for (const it of items) {
    const path = toStoragePath(it.image_url);
    // Light mode (background backfill): the small thumbnail, not the full-size photo — decoding
    // several originals at once is what crashed Safari on iPhone.
    const thumb = opts.light ? it.thumbnail_path : null;
    const url = (thumb && signed[thumb]) || (path ? signed[path] : null);
    if (url) compose.push({ id: it.id, imgUrl: url, category: it.category, subcategory: it.subcategory, length: it.length ?? null });
  }
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
const TRIED_KEY = "aura.canvasBackfill.tried";

function triedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(TRIED_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
function markTried(id: string) {
  try {
    const ids = [...triedIds(), id].slice(-200);
    localStorage.setItem(TRIED_KEY, JSON.stringify(ids));
  } catch { /* storage unavailable: at worst it is tried again next session */ }
}

/** Once per session, ONE outfit saved without a canvas image gets one (newest first). Light on
 *  purpose: thumbnails instead of originals, one outfit per app open, and each outfit is tried at
 *  most once on this device — marked BEFORE composing, so if the page ever dies mid-way the next
 *  launch skips it instead of crashing again. */
export async function backfillOutfitCanvases(userId: string): Promise<number> {
  if (backfillRan) return 0;
  backfillRan = true;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return 0;
  try {
    const { data, error } = await supabase
      .from("outfits")
      .select("id, item_ids")
      .eq("user_id", userId)
      .is("canvas_image_url", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !data?.length) return 0;
    const tried = triedIds();
    const row = (data as { id: string; item_ids: string[] | null }[]).find((r) => !tried.has(r.id));
    if (!row) return 0;
    markTried(row.id);
    const made = await composeOutfitCanvasForItems(userId, row.item_ids ?? [], { light: true });
    if (!made) return 0;
    const { error: updErr } = await supabase
      .from("outfits")
      .update({ canvas_image_url: made.canvasPath, ...(made.thumbPath ? { thumbnail_path: made.thumbPath } : {}) } as never)
      .eq("id", row.id)
      .eq("user_id", userId)
      .is("canvas_image_url", null);
    return updErr ? 0 : 1;
  } catch (e) {
    console.warn("[AURA] outfit canvas backfill failed", e);
    return 0;
  }
}
