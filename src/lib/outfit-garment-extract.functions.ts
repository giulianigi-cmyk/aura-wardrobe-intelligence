// Client-callable wrappers around fashn.server.ts's submitFashnEdit +
// the shared checkFashnStatus, for the "extract this garment as a clean
// product photo" feature (see outfit-segmentation.ts's
// fullPhotoMaskDataUrl for where the mask this needs comes from).
//
// Same submit-then-poll shape as avatar-tryon.functions.ts, for the
// same reason documented there: a single request that stays open until
// FASHN finishes is what previously caused "Load failed" in production
// on flaky mobile connections. The client (OutfitScan.tsx) polls
// checkGarmentExtraction every ~2s until done.
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { submitFashnEdit, checkFashnStatus } from "./fashn.server";

// ---------------------------------------------------------------------------
// Auto-describing WHERE a garment's design details sit, before reconstruction runs — so the
// person doesn't have to type it by hand. A generic "black dress" gives the reconstruction model
// almost nothing to work with for exactly the details a single occluded photo is hardest to get
// right (an appliqué's real position, a cutout's exact placement); a model that already looked at
// the photo and named those positions gives it something real to hold onto. The field in
// OutfitScan.tsx stays editable — this fills it in as a starting point, not a locked answer, since
// the photo can still be ambiguous or partially hide the very detail being described.
// ---------------------------------------------------------------------------
const DescribeInput = z.object({ imageDataUrl: z.string().min(1) });

export const describeGarmentDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DescribeInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    const prompt = [
      "Look at this garment photo — a cropped, isolated view of one piece, possibly with some background or the person's skin still visible around its edges.",
      "In ONE short sentence, name the garment's type, color, and the exact position of every visible design detail — appliqués, flowers, cutouts, embellishments, trims, unusual seams — using clear spatial terms (waist, bust, hip, neckline, side, hem, sleeve, etc.).",
      "Only mention details that are actually visible in the photo — never guess at something you can't see, and never describe a plain garment as having details it doesn't have.",
      "Be concrete and literal, not evocative: this sentence is used as a factual instruction for image reconstruction, not a description for a person.",
      "Respond with ONLY that one sentence — no preamble, no quotes, no markdown.",
    ].join(" ");

    try {
      const result = await generateText({
        model,
        abortSignal: AbortSignal.timeout(20_000),
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image", image: data.imageDataUrl }] }],
      });
      const description = result.text.trim().replace(/^["']|["']$/g, "");
      if (!description) return { ok: false as const, error: "No description generated" };
      return { ok: true as const, description };
    } catch (e) {
      console.error("[AURA garment-extract] auto-description failed", e);
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

const StartInput = z.object({
  imageDataUrl: z.string().min(1),
  maskDataUrl: z.string().min(1),
  // A short, human description of the garment (e.g. "the black leather
  // jacket") — folded into the prompt so FASHN's edit targets the right
  // item by more than just the mask alone, in case the mask's edges
  // are imperfect (a known limitation of the free client-side
  // segmentation model this mask comes from).
  garmentDescription: z.string().optional(),
});

// Kept short and literal rather than creative — the aim here is
// reconstruction, not restyling, so the instruction says exactly what
// AURA needs and nothing more speculative than that.
function buildExtractionPrompt(garmentDescription?: string): string {
  const subject = garmentDescription?.trim() || "the highlighted garment";
  return [
    `Extract ${subject} from this photo as a clean, professional ghost-mannequin product photo.`,
    "Remove the person's body, skin, face, hair, and every other garment or accessory.",
    "Reconstruct any part of this item that is hidden behind an arm, another piece of clothing, or a fold, using the visible parts of the same item as your only guide — do not invent a different color, pattern, or design detail.",
    "Show the item alone, fully laid out, centered on a plain white background, as if photographed for a product catalog.",
    "Preserve the garment's true color, fabric texture, and construction exactly as shown in the photo.",
  ].join(" ");
}

export const startGarmentExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartInput.parse(input))
  .handler(async ({ data }) => {
    const prompt = buildExtractionPrompt(data.garmentDescription);
    const result = await submitFashnEdit(data.imageDataUrl, prompt, data.maskDataUrl);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, predictionId: result.predictionId };
  });

const CheckInput = z.object({ predictionId: z.string().min(1) });

export const checkGarmentExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CheckInput.parse(input))
  .handler(async ({ data }) => checkFashnStatus(data.predictionId));
