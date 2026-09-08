// AURA Avatar — "Prova sul mio avatar" orchestration.
//
// Takes a plain array of wardrobe item_ids — it doesn't care whether they
// came from an already-saved outfit (outfits.item_ids / outfit_plans) or
// a fresh selection made directly in the try-on picker (both entry points
// funnel into this same set of functions).
//
// Split into small, fast steps instead of one call that blocks until the
// whole outfit is generated. The original single-call version held one
// HTTP request open for up to ~90s of internal FASHN polling per garment
// — in production that surfaced as a bare "Load failed" in Safari, most
// likely something in the path (Cloudflare's edge, an intermediate
// proxy, the phone's own connection) closing a long-idle request before
// FASHN finished, not a real failure of the generation itself. Many
// short round-trips are far more reliable than one long one — the same
// principle batch-scan already uses elsewhere in this codebase (poll a
// job's status every few seconds rather than block on the whole batch).
//
// The client (AvatarTryOn.tsx) now drives the loop:
//   prepareAvatarTryOn (once)
//     → for each item: startTryOnStep, then poll checkTryOnStep
//   finalizeAvatarTryOn (once, after the last item's step completes)
//
// FASHN's tryon-max takes exactly one garment per call, so a full outfit
// is still applied as a chain: the avatar photo goes in as model_image
// for the first item, and each result becomes the model_image for the
// next, in the order the items are passed. Caller controls ordering; a
// reasonable default is base layers first (dress/top+bottom) then
// outerwear, then shoes, so later steps don't have to "see through" a
// coat to place shoes correctly.

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { submitFashnRun, checkFashnStatus } from "@/lib/fashn.server";

// FASHN's own default safety policy doesn't support these — see
// https://docs.bfl.ml and docs.fashn.ai error handling. Caught here with
// a clear message instead of surfacing FASHN's raw rejection to the user.
const UNSUPPORTED_CATEGORIES = new Set(["Underwear", "Swimwear"]);

/** Web Crypto (crypto.subtle), not node:crypto's createHash — this runs on
 *  Cloudflare Workers, where Web Crypto is a native runtime API rather
 *  than something routed through the nodejs_compat shim. Buffer (used
 *  below for the final PNG) already has precedent elsewhere in this repo
 *  under that shim; createHash does not, so this avoids being the first
 *  thing in the codebase to find out whether it's fully supported. */
async function cacheKeyFor(avatarPhotoPath: string, itemIds: string[]): Promise<string> {
  const sorted = [...itemIds].sort();
  const input = `${avatarPhotoPath}::${sorted.join(",")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchAsDataUrl(supabaseAdmin: any, bucket: string, path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Could not read ${bucket}/${path}: ${error?.message ?? "not found"}`);
  const arrayBuffer = await data.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mime = (data as Blob).type || "image/jpeg";
  return `data:${mime};base64,${base64}`;
}

/** Mirrors wardrobe-image.ts's toStoragePath — duplicated rather than
 *  imported because that module also pulls in the browser-only supabase
 *  client, which this server file must not bundle. */
function toWardrobeStoragePath(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (!imageUrl.startsWith("http")) return imageUrl;
  const marker = "/wardrobe/";
  const idx = imageUrl.indexOf(marker);
  return idx >= 0 ? imageUrl.slice(idx + marker.length) : null;
}

const PrepareInput = z.object({
  itemIds: z.array(z.string()).min(1).max(6),
  forceRegenerate: z.boolean().optional(),
});

/** Step 1 (once per try-on): validates the avatar + items, checks the
 *  cache, and — on a cache miss — hands back everything the client needs
 *  to start stepping through items itself (the avatar photo as a data
 *  URL, and the item ids in the order to apply them). Fast: no FASHN
 *  call happens here. */
export const prepareAvatarTryOn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PrepareInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: avatar, error: avatarErr } = await (supabaseAdmin.from("user_avatar" as never) as any)
      .select("photo_path, generation_status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (avatarErr) throw new Error(avatarErr.message);
    if (!avatar?.photo_path || avatar.generation_status !== "completed") {
      return { ok: false as const, error: "no_avatar", message: "No avatar photo set up yet." };
    }

    const { data: items, error: itemsErr } = await (supabaseAdmin.from("wardrobe_items" as never) as any)
      .select("id, category")
      .eq("user_id", context.userId)
      .in("id", data.itemIds);
    if (itemsErr) throw new Error(itemsErr.message);
    if (!items || items.length !== data.itemIds.length) {
      return { ok: false as const, error: "items_not_found", message: "One or more items could not be found." };
    }

    const blocked = (items as { category: string | null }[]).find((i) => i.category && UNSUPPORTED_CATEGORIES.has(i.category));
    if (blocked) {
      return {
        ok: false as const,
        error: "unsupported_category",
        message: `${blocked.category} isn't supported for virtual try-on yet.`,
      };
    }

    const cacheKey = await cacheKeyFor(avatar.photo_path, data.itemIds);
    if (!data.forceRegenerate) {
      const { data: cached } = await (supabaseAdmin.from("avatar_tryon_cache" as never) as any)
        .select("result_image_path")
        .eq("user_id", context.userId)
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (cached?.result_image_path) {
        const { data: signed } = await supabaseAdmin.storage
          .from("avatar-private")
          .createSignedUrl(cached.result_image_path, 60 * 60);
        if (signed?.signedUrl) {
          return { ok: true as const, cached: true as const, imageUrl: signed.signedUrl };
        }
        // Signed-URL failure on an otherwise-valid cache row (e.g. the
        // file was since deleted) — fall through and regenerate.
      }
    }

    let avatarImageDataUrl: string;
    try {
      avatarImageDataUrl = await fetchAsDataUrl(supabaseAdmin, "avatar-private", avatar.photo_path);
    } catch (e) {
      return { ok: false as const, error: "avatar_photo_missing", message: e instanceof Error ? e.message : "Could not load avatar photo." };
    }

    // Preserve the order the caller asked for (outfits.item_ids already
    // encodes a sensible layering order from the outfit engine; the
    // direct-selection picker is responsible for its own ordering).
    return { ok: true as const, cached: false as const, avatarImageDataUrl, orderedItemIds: data.itemIds, cacheKey };
  });

const StepInput = z.object({
  modelImageDataUrl: z.string().min(1),
  itemId: z.string(),
});

/** One chain step, submit half: fetches this item's garment image and
 *  hands it to FASHN, returning a prediction id immediately — does not
 *  wait for the result. Ownership of itemId is re-checked here (not just
 *  trusted from prepare's earlier check), same as any other per-request
 *  server function. */
export const startTryOnStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StepInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: item, error: itemErr } = await (supabaseAdmin.from("wardrobe_items" as never) as any)
      .select("image_url")
      .eq("user_id", context.userId)
      .eq("id", data.itemId)
      .maybeSingle();
    if (itemErr) throw new Error(itemErr.message);
    if (!item) return { ok: false as const, error: "Item not found." };

    const garmentPath = toWardrobeStoragePath(item.image_url);
    let garmentImage: string;
    try {
      garmentImage = garmentPath
        ? await fetchAsDataUrl(supabaseAdmin, "wardrobe", garmentPath)
        : item.image_url; // legacy rows storing a direct URL rather than a bucket path
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Could not load garment image." };
    }

    const result = await submitFashnRun(data.modelImageDataUrl, garmentImage);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, predictionId: result.predictionId };
  });

const CheckInput = z.object({ predictionId: z.string() });

/** One chain step, poll half — call this every ~2s from the client until
 *  done is true or ok is false. A single fast status check, never an
 *  internal wait. */
export const checkTryOnStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CheckInput.parse(input))
  .handler(async ({ data }) => {
    return await checkFashnStatus(data.predictionId);
  });

const FinalizeInput = z.object({
  itemIds: z.array(z.string()).min(1).max(6),
  finalImageDataUrl: z.string().min(1),
});

/** Once the last item's step has completed: persists the final composited
 *  image into AURA's own private storage (so it outlives FASHN's 60-
 *  minute base64 retention window) and writes the cache row keyed on
 *  this avatar + item combination. Recomputes the cache key itself from
 *  the avatar's current photo rather than trusting one from the client —
 *  it's cheap to redo and this is the point that actually persists data. */
export const finalizeAvatarTryOn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FinalizeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: avatar, error: avatarErr } = await (supabaseAdmin.from("user_avatar" as never) as any)
      .select("photo_path")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (avatarErr) throw new Error(avatarErr.message);
    if (!avatar?.photo_path) return { ok: false as const, error: "No avatar photo set up yet." };

    const dataUrlMatch = data.finalImageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) return { ok: false as const, error: "Unexpected image format." };
    const [, finalMime, finalBase64] = dataUrlMatch;
    const finalBuffer = Buffer.from(finalBase64, "base64");
    const finalExt = finalMime === "image/jpeg" ? "jpg" : "png";
    const resultPath = `${context.userId}/tryon-${Date.now()}-${Math.random().toString(36).slice(2)}.${finalExt}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("avatar-private")
      .upload(resultPath, finalBuffer, { contentType: finalMime, upsert: false });
    if (uploadErr) return { ok: false as const, error: `Result generated but could not be saved: ${uploadErr.message}` };

    const cacheKey = await cacheKeyFor(avatar.photo_path, data.itemIds);
    await (supabaseAdmin.from("avatar_tryon_cache" as never) as any).upsert(
      { user_id: context.userId, cache_key: cacheKey, result_image_path: resultPath, item_ids: data.itemIds },
      { onConflict: "user_id,cache_key" },
    );

    const { data: signed } = await supabaseAdmin.storage.from("avatar-private").createSignedUrl(resultPath, 60 * 60);
    return { ok: true as const, imageUrl: signed?.signedUrl ?? "" };
  });
