// Client-callable wrappers for AddItem.tsx's "improve quality" action on
// a low-resolution single-piece photo (see the lowResWarning state
// there) — reuses the same FASHN Edit primitives as
// outfit-garment-extract.functions.ts (submitFashnEdit,
// checkFashnStatus), but with a different instruction: sharpen and
// clarify an already-clean single-item photo, not reconstruct a
// garment hidden behind a body or other clothing. No mask is used
// here — the whole photo is one garment, there's nothing to isolate.
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { submitFashnEdit, checkFashnStatus } from "./fashn.server";

const StartInput = z.object({ imageDataUrl: z.string().min(1) });

// Deliberately an enhancement instruction, not a creative one — the
// point is recovering clarity the camera already captured but
// compressed away, not adding detail that was never there. Same
// "don't invent" framing as the garment-extraction prompt for the
// same reason: a wardrobe app showing an invented pattern or color
// as if it were the real photo would be actively misleading.
const ENHANCE_PROMPT = [
  "Sharpen and clarify this photo of a clothing item or accessory.",
  "Increase resolution and reduce blur, noise, and compression artifacts.",
  "Do not change the item's color, pattern, shape, or any design detail — only improve clarity and sharpness of what is already visible.",
  "Keep the same framing, background, and composition exactly as they are.",
].join(" ");

export const startPhotoEnhance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartInput.parse(input))
  .handler(async ({ data }) => {
    const result = await submitFashnEdit(data.imageDataUrl, ENHANCE_PROMPT);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, predictionId: result.predictionId };
  });

const CheckInput = z.object({ predictionId: z.string().min(1) });

export const checkPhotoEnhance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CheckInput.parse(input))
  .handler(async ({ data }) => checkFashnStatus(data.predictionId));
