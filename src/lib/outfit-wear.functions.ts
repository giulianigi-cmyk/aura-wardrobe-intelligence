// AURA — Outfit Photo Recognition → Wear Intelligence.
//
// Deliberately thin: detection (detectOutfitItems) and matching
// (findTopMatches / outfit-dedupe.ts) are untouched, reused exactly as
// they already exist for the outfit-scan-to-import flow. This file only
// adds the NEW step those two never needed — turning "AI saw X, AURA
// thinks it's your item Y" into a real, confirmed Wear Event once the
// person says so. See docs/ADR (Phase 2 design) for the full reasoning.

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { detectOutfitItems } from "./outfit-detect.server";
import { findTopMatches } from "./outfit-dedupe";
import { submitOutfitFeedback } from "./outfit-feedback.functions";
import type { WardrobeItem } from "./aura-types";

type DetectionCandidate = {
  detectionId: string;
  wardrobeItemId: string;
  matchScore: number;
  verdict: "certain" | "maybe" | "new";
};

type Detection = {
  detectionId: string;
  category: string;
  subcategory: string;
  colors: string[];
  materials: string[];
  bbox: { x: number; y: number; width: number; height: number };
  description: string;
  detectionConfidence: number;
  sleeveLength?: string;
  length?: string;
  fit?: string;
};

const StartInput = z.object({
  photoDataUrl: z.string().min(20),
  photoHash: z.string().min(10),
});

/** Step 1: upload + detect + match. Idempotent on (user, photoHash) — a
 *  repeat upload of the exact same file returns the existing row instead
 *  of reprocessing or duplicating (see the unique index in the
 *  migration). Never creates a wear event itself — this is the "AI saw /
 *  AURA thinks" stage only, nothing here is a fact yet. */
export const startOutfitPhotoDetection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await (supabaseAdmin.from("outfit_photo_detections" as never) as any)
      .select("*")
      .eq("user_id", context.userId)
      .eq("photo_hash", data.photoHash)
      .maybeSingle();
    if (existing) {
      return { ok: true as const, detection: await enrichWithCandidatePhotos(supabaseAdmin, existing) };
    }

    const detectResult = await detectOutfitItems(data.photoDataUrl);
    if (!detectResult.ok) {
      return { ok: false as const, error: detectResult.error };
    }
    if (detectResult.items.length === 0) {
      return { ok: false as const, error: "no_outfit_detected" };
    }

    const { data: wardrobe } = await (supabaseAdmin.from("wardrobe_items" as never) as any)
      .select("*")
      .eq("user_id", context.userId)
      .eq("archived", false);
    const wardrobeList = (wardrobe ?? []) as WardrobeItem[];

    const detections: Detection[] = detectResult.items.map((it, i) => ({
      detectionId: `d${i}`,
      category: it.category,
      subcategory: it.subcategory,
      colors: it.colors,
      materials: it.materials,
      bbox: it.bbox,
      description: it.description,
      detectionConfidence: it.confidence,
      sleeveLength: it.sleeveLength,
      length: it.length,
      fit: it.fit,
    }));

    const candidates: DetectionCandidate[] = [];
    for (const d of detections) {
      // Every attribute the detector already extracts, not just
      // category/color/subcategory — a plain 75%-confidence match that
      // ignored sleeve length, garment length, fit and material was
      // exactly how a strapless mini dress got matched against a
      // long-sleeve floor-length one. See outfit-dedupe.ts for the
      // full reasoning on why each of these earns its own small weight.
      const matches = findTopMatches(
        {
          category: d.category, subcategory: d.subcategory, colors: d.colors, brand: null,
          materials: d.materials, sleeveLength: d.sleeveLength, length: d.length, fit: d.fit,
        },
        wardrobeList,
        3,
      );
      for (const m of matches) {
        candidates.push({ detectionId: d.detectionId, wardrobeItemId: m.item.id, matchScore: m.score, verdict: m.verdict });
      }
    }

    // Photo is stored regardless of the retention setting at this point
    // — deleting it (if the person has disabled retention) happens only
    // AFTER confirmation, per the Phase 2 design; deleting it here would
    // leave nothing to show while the person is still deciding.
    const photoPath = `${context.userId}/wear-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const base64 = data.photoDataUrl.split(",")[1] ?? "";
    const buffer = Buffer.from(base64, "base64");
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("outfit-photos")
      .upload(photoPath, buffer, { contentType: "image/jpeg", upsert: false });
    if (uploadErr) return { ok: false as const, error: `Could not save photo: ${uploadErr.message}` };

    const { data: row, error: insertErr } = await (supabaseAdmin.from("outfit_photo_detections" as never) as any)
      .insert({
        user_id: context.userId,
        photo_path: photoPath,
        photo_hash: data.photoHash,
        target_person: "unknown",
        detections,
        candidates,
        status: "pending",
      })
      .select("*")
      .single();
    if (insertErr) return { ok: false as const, error: insertErr.message };

    return { ok: true as const, detection: await enrichWithCandidatePhotos(supabaseAdmin, row) };
  });

/** Signs the photo + every candidate wardrobe item's image so the
 *  confirmation UI can show real pictures ("I think it's THIS one",
 *  with an actual photo of the candidate) rather than just names. */
async function enrichWithCandidatePhotos(supabaseAdmin: any, row: any) {
  const candidateIds = Array.from(new Set((row.candidates ?? []).map((c: DetectionCandidate) => c.wardrobeItemId)));
  const itemPhotos: Record<string, string> = {};
  if (candidateIds.length) {
    const { data: items } = await supabaseAdmin.from("wardrobe_items").select("id, image_url, brand, category, colors, color").in("id", candidateIds);
    for (const it of items ?? []) {
      const path = typeof it.image_url === "string" && !it.image_url.startsWith("http") ? it.image_url : null;
      if (path) {
        const { data: signed } = await supabaseAdmin.storage.from("wardrobe").createSignedUrl(path, 3600);
        if (signed?.signedUrl) itemPhotos[it.id] = signed.signedUrl;
      }
    }
  }
  let photoUrl: string | null = null;
  if (row.photo_path) {
    const { data: signed } = await supabaseAdmin.storage.from("outfit-photos").createSignedUrl(row.photo_path, 3600);
    photoUrl = signed?.signedUrl ?? null;
  }
  return { ...row, photoUrl, itemPhotos };
}

const RefineVisualInput = z.object({
  photoDetectionId: z.string().uuid(),
  detections: z.array(z.object({
    detectionId: z.string(),
    category: z.string(),
    embedding: z.array(z.number()).length(768),
  })),
});

/** Second pass, called from the client after it has cropped each
 *  detected garment out of the photo and computed its visual embedding
 *  (both happen in the browser — see visual-embedding.ts and the
 *  client/server cost split behind this feature). The model itself
 *  never runs here; this only does the nearest-neighbor search via
 *  pgvector, which needs to happen server-side because it has to see
 *  every wardrobe item's stored embedding, not just the ones already
 *  sitting in the browser's memory.
 *
 *  Returns per-detection visual candidates ALONGSIDE the existing
 *  attribute-based ones — additive, not a replacement. The client
 *  blends the two; scoreMatch()/findTopMatches() in outfit-dedupe.ts
 *  are untouched by this function. */
export const refineDetectionWithVisualSimilarity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RefineVisualInput.parse(input))
  .handler(async ({ data, context }) => {
    const results: { detectionId: string; wardrobeItemId: string; visualSimilarity: number }[] = [];

    for (const d of data.detections) {
      const { data: matches, error } = await context.supabase.rpc("find_visually_similar_items", {
        _query_embedding: `[${d.embedding.join(",")}]`,
        _limit: 5,
      });
      if (error) {
        console.error("[AURA visual-match] pgvector search failed for detection", d.detectionId, error);
        continue;
      }
      const matchedIds = ((matches ?? []) as { wardrobe_item_id: string; visual_similarity: number }[]).map((m) => m.wardrobe_item_id);
      if (!matchedIds.length) continue;

      // A strong visual match on the wrong category is almost certainly
      // noise (a shoe's leather texture resembling a bag's, say) — the
      // category the detector already assigned is a cheap, reliable
      // filter before trusting the visual score at all.
      const { data: categoryRows } = await (context.supabase.from("wardrobe_items" as never) as any)
        .select("id, category").in("id", matchedIds);
      const categoryById = new Map(((categoryRows ?? []) as { id: string; category: string }[]).map((r) => [r.id, r.category]));

      for (const m of (matches ?? []) as { wardrobe_item_id: string; visual_similarity: number }[]) {
        if (categoryById.get(m.wardrobe_item_id) !== d.category) continue;
        results.push({ detectionId: d.detectionId, wardrobeItemId: m.wardrobe_item_id, visualSimilarity: m.visual_similarity });
      }
    }

    return { ok: true as const, visualCandidates: results };
  });

const ConfirmInput = z.object({
  photoDetectionId: z.string().uuid().nullable().optional(),
  itemIds: z.array(z.string().uuid()).min(1),
  wornAt: z.string(), // YYYY-MM-DD, always explicitly chosen by the person — see Phase 2 §7
  occasion: z.string().nullable().optional(),
});

/** Step 2: the ONLY point where a Wear Event is actually created — after
 *  this, worn_count/last_worn and Style Memory all follow from it.
 *  Everything before this call is still just "AURA thinks", not fact. */
export const confirmWearEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmInput.parse(input))
  .handler(async ({ data, context }) => {
    // Defense in depth: the SQL function already scopes to auth.uid(),
    // but every client-supplied id is verified as the caller's here too,
    // the same pattern the rest of the codebase uses.
    const { data: ownedItems, error: ownErr } = await (context.supabase.from("wardrobe_items" as never) as any)
      .select("id").eq("user_id", context.userId).in("id", data.itemIds);
    if (ownErr) return { ok: false as const, error: ownErr.message };
    if ((ownedItems ?? []).length !== new Set(data.itemIds).size) {
      return { ok: false as const, error: "One or more items do not belong to the current user" };
    }
    if (data.photoDetectionId) {
      const { data: det } = await (context.supabase.from("outfit_photo_detections" as never) as any)
        .select("id").eq("id", data.photoDetectionId).eq("user_id", context.userId).maybeSingle();
      if (!det) return { ok: false as const, error: "Detection not found" };
    }

    // context.supabase, not supabaseAdmin — the RPC's own auth.uid()
    // check needs the actual signed-in user's session, which only the
    // request-scoped client carries.
    const { data: eventId, error } = await context.supabase.rpc("confirm_wear_event", {
      _item_ids: data.itemIds,
      _worn_at: data.wornAt,
      _occasion: data.occasion ?? undefined,
      _source_photo_detection_id: data.photoDetectionId ?? undefined,
    });
    if (error) return { ok: false as const, error: error.message };

    // Fire-and-forget, same reliability Style Memory already has
    // everywhere else in the app (see Phase 2 design §1) — a lost
    // signal here doesn't corrupt anything, it just isn't learned from.
    void submitOutfitFeedback({
      data: { itemIds: data.itemIds, feedbackType: "worn", context: data.occasion ? { occasion: data.occasion } : null },
    }).catch((e) => console.error("[AURA outfit-wear] style-memory feedback failed", e));

    return { ok: true as const, eventId: eventId as string };
  });

const CorrectInput = z.object({
  eventId: z.string().uuid(),
  removeItemId: z.string().uuid(),
  replacementItemId: z.string().uuid().nullable().optional(),
});

/** Step 3, only reachable after a Wear Event already exists: the AI or
 *  the person's own earlier confirmation can still be wrong — this is
 *  what makes a confirmed event correctable rather than final the
 *  moment it's created. */
export const correctWearEventItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CorrectInput.parse(input))
  .handler(async ({ data, context }) => {
    // Same fix as confirmWearEvent above — context.supabase, not
    // supabaseAdmin, so the RPC's auth.uid() check actually sees the
    // signed-in user.
    const { error } = await context.supabase.rpc("correct_wear_event_item", {
      _event_id: data.eventId,
      _remove_item_id: data.removeItemId,
      _replacement_item_id: data.replacementItemId ?? undefined,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
