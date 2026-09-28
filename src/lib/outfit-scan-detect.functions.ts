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
    return detectOutfitItems(data.imageDataUrl);
  });
