// "Scansiona un outfit" → item detection, server side.
//
// Reuses the exact same AI detector (detectOutfitItems) already relied on by the batch-scan and
// LogWear flows — see outfit-wear.functions.ts's own header comment on why this file stays
// deliberately thin rather than re-implementing detection. OutfitScan previously ran ONLY a local
// image-segmentation model with no AI guidance at all: every detected item's category came from
// pixel classification into a small fixed label set (no jewelry, no watches — those categories
// don't exist for it), the count was capped by whatever fraction of the frame each region
// happened to cover, and there was no open-vocabulary understanding of what was actually in the
// photo to sanity-check any of it. That is a fundamentally weaker foundation than every other
// "look at this photo and tell me what's in it" flow in the app already has, and explains the
// mismatched, sometimes unrecognizable results reported against it.
//
// This function is intentionally NOT the same as LogWear's startOutfitPhotoDetection: it has no
// idempotent-by-hash persistence (an outfit scan is a one-shot review-then-save flow, never
// revisited by hash) and no wardrobe-candidate matching of its own — OutfitScan already has its
// own dedupe/candidate logic (outfit-dedupe.ts's findBestMatch/findTopMatches) and keeps using it
// unchanged; only WHERE each detected item's category, attributes and rough location come from
// has changed, not what happens with them afterward.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { detectOutfitItems } from "./outfit-detect.server";

const InputSchema = z.object({ imageDataUrl: z.string().min(20) });

export const detectOutfitPhotoItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    // Detailed mode: also returns pattern, exact shade, a precise visual description and the
    // distinctive details, which the wardrobe matching step (outfit-match.ts) relies on.
    return detectOutfitItems(data.imageDataUrl, { detailed: true });
  });

// ---------------------------------------------------------------------------
// Storing the scanned outfit photo so a wear event confirmed from "Scansiona un outfit" shows up
// with its picture in the worn history and "My outfit photos", exactly like one confirmed from
// LogWear. Same bucket, same table, same row shape as startOutfitPhotoDetection writes — just
// without running detection or matching a second time (the scan already did both, and the person
// already reviewed the result). Idempotent per (user, photoHash): re-saving the same photo reuses
// the existing row rather than tripping the unique index.
// ---------------------------------------------------------------------------
const SavePhotoInput = z.object({
  photoDataUrl: z.string().min(20),
  photoHash: z.string().min(10),
});

export const saveScanPhotoForWear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SavePhotoInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await (supabaseAdmin.from("outfit_photo_detections" as never) as any)
      .select("id").eq("user_id", context.userId).eq("photo_hash", data.photoHash).maybeSingle();
    if (existing) return { ok: true as const, detectionId: (existing as { id: string }).id };

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
        detections: [],
        candidates: [],
        status: "pending",
      })
      .select("id")
      .single();
    if (insertErr) return { ok: false as const, error: insertErr.message };
    return { ok: true as const, detectionId: (row as { id: string }).id };
  });
