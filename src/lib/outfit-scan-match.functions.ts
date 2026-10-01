// "Scansiona un outfit" → LEVEL 2 of wardrobe matching: visual reranking.
//
// Level 1 (outfit-match.ts, on the device) narrows the wardrobe to a few plausible candidates from
// metadata. Metadata can't see a pinstripe, a cut-out or a slightly different shade, so here the
// vision model looks at the garment in the outfit photo next to the REAL pictures of those
// candidates (their stored thumbnails) and scores each one. One call per detected garment, with at
// most 6 small thumbnails, run in parallel by the client.
import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseAiJson } from "./ai-json";
import { mapVisualScores, type VisualScore } from "./outfit-match";

const MAX_CANDIDATES = 6;
const LANGUAGE_NAMES: Record<string, string> = { it: "Italian", en: "English", es: "Spanish", fr: "French" };

const RerankInput = z.object({
  // JPEG crop of the garment's area in the outfit photo, downscaled by the client (~640px).
  targetImageDataUrl: z.string().startsWith("data:image/").max(3_000_000),
  garment: z.object({
    category: z.string().max(40),
    subcategory: z.string().max(40).optional(),
    pattern: z.string().max(40).optional(),
    colorShade: z.string().max(60).optional(),
    colors: z.array(z.string().max(40)).max(3).optional(),
    description: z.string().max(320).optional(),
    details: z.array(z.string().max(80)).max(5).optional(),
  }),
  candidateIds: z.array(z.string().uuid()).min(1).max(MAX_CANDIDATES),
  language: z.string().max(10).optional(),
});

const Score = z.coerce.number();
const RerankOutput = z.object({
  candidates: z.array(z.object({
    ref: z.string(),
    overall: Score, color: Score, pattern: Score, silhouette: Score, material: Score, details: Score,
    sameItem: z.string(),
    reason: z.string().optional(),
  })),
});

export type RerankResult = { ok: true; scores: VisualScore[] } | { ok: false; error: string };

function buildPrompt(g: z.infer<typeof RerankInput>["garment"], refs: string[], language: string): string {
  const garmentLine = [
    g.subcategory || g.category,
    g.colorShade ? `shade: ${g.colorShade}` : g.colors?.length ? `colour: ${g.colors.join(" / ")}` : "",
    g.pattern ? `pattern: ${g.pattern}` : "",
  ].filter(Boolean).join("; ");
  return [
    "You are matching ONE garment worn in an outfit photo against candidate pieces from the same person's own wardrobe.",
    `The first image (TARGET) is a crop of the outfit photo. The garment to match is the ${g.category.toLowerCase()} in it: ${garmentLine}.`,
    g.description ? `Detector's description of it: "${g.description}".` : "",
    g.details?.length ? `Distinctive details noticed: ${g.details.join(", ")}.` : "",
    `The next ${refs.length} images are the person's own photos of wardrobe pieces, labelled ${refs.join(", ")} (usually product-style, isolated on white). Ignore every other garment visible in the TARGET crop.`,
    "",
    "For EACH candidate, judge whether it is the SAME physical garment as the one in the TARGET, comparing what you actually see — never the category alone. Score each factor 0-100:",
    "- color: hue, lightness and saturation of the main colour (and secondary colours). Neighbouring colours are DIFFERENT colours: navy vs black, ivory/cream vs pure white, camel vs beige, light vs dark grey, charcoal vs black, electric/royal blue vs navy, brown vs burgundy, olive vs dark green — when such a difference is real, score 40 or less. But the TARGET is a worn photo: warm or cool light, shadows, folds and camera white balance shift colours. If a difference is plausibly explained by the lighting, do not penalise it heavily; if it persists in the well-lit parts, it is real.",
    "- pattern: solid vs pinstripe / stripes / check / houndstooth / floral / animal / polka dot / print is decisive — a clear mismatch scores 20 or less, also stripe spacing and check scale count. If the pattern can't be judged in the TARGET (too small, blurred, hidden), score 50.",
    "- silhouette: cut, fit and proportions — skinny/slim/straight/wide/flare/bootcut, cropped vs full length, mini/midi/maxi, fitted vs oversized, tailored vs relaxed, rise, collar, lapels and sleeve shape.",
    "- material: visible texture and sheen (denim, leather, suede, knit, satin, velvet, tweed, wool, linen…). Score 50 when it can't be judged from the photos.",
    "- details: distinctive details (logo, print motif, embroidery, buttons, zips, buckles, pockets, belt, cut-outs, appliqués, sequins, stitching). Matching distinctive details raise it strongly; a distinctive detail clearly present in one and clearly absent in the other scores 25 or less; 50 when there is nothing distinctive to compare. A part hidden in the TARGET is not evidence of absence.",
    "- overall: your calibrated probability, 0-100, that this candidate IS the same garment. 90-100 = visually the same piece; 75-89 = very likely; 60-74 = possible but with visible differences; below 60 = probably a different piece. Do not inflate. If two candidates are equally similar give them (nearly) equal scores — never spread scores to manufacture a winner.",
    '- sameItem: "yes" only when you see no real difference; "no" when there is at least one clear difference in colour, pattern, cut or a distinctive detail; otherwise "maybe".',
    `- reason: at most 12 words in ${language}, the key visible evidence (e.g. for Italian "stesso gessato blu, gamba dritta" or "nero, non blu navy").`,
    "It is normal and expected that NONE of the candidates is the same garment — say so with low scores instead of picking the least different one.",
    "",
    "Respond with ONLY a single valid JSON object, no markdown fences, no extra text:",
    `{"candidates": [{"ref": "${refs[0]}", "overall": 0, "color": 0, "pattern": 0, "silhouette": 0, "material": 0, "details": 0, "sameItem": "maybe", "reason": ""}]} with one entry per candidate, in order.`,
  ].filter((l) => l !== "").join("\n");
}

export const rerankOutfitCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RerankInput.parse(input))
  .handler(async ({ data, context }): Promise<RerankResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false, error: "Missing LOVABLE_API_KEY" };

    // Only the caller's own items (RLS applies to context.supabase too); thumbnails first — small
    // 400px JPEGs, plenty for a visual comparison and far cheaper than the originals.
    const { data: rows, error: rowsErr } = await context.supabase
      .from("wardrobe_items").select("id, image_url, thumbnail_path").eq("user_id", context.userId).in("id", data.candidateIds);
    if (rowsErr) return { ok: false, error: rowsErr.message };
    const byId = new Map((rows ?? []).map((r) => [r.id, r]));

    const images = await Promise.all(data.candidateIds.map(async (id) => {
      const row = byId.get(id);
      const path = row?.thumbnail_path || row?.image_url;
      if (!path) return null;
      try {
        const { data: blob, error } = await context.supabase.storage.from("wardrobe").download(path);
        if (error || !blob) return null;
        if (blob.size > 4 * 1024 * 1024) return null; // never ship a huge original to the model
        const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
        return { id, dataUrl: `data:${blob.type || "image/jpeg"};base64,${base64}` };
      } catch {
        return null;
      }
    }));
    const usable = images.filter((x): x is { id: string; dataUrl: string } => !!x);
    if (!usable.length) return { ok: false, error: "No candidate images available" };

    const refs = usable.map((_, i) => `C${i + 1}`);
    const language = LANGUAGE_NAMES[(data.language ?? "en").slice(0, 2)] ?? "English";
    const prompt = buildPrompt(data.garment, refs, language);
    const content = [
      { type: "text" as const, text: prompt },
      { type: "text" as const, text: "TARGET:" },
      { type: "image" as const, image: data.targetImageDataUrl },
      ...usable.flatMap((c, i) => [
        { type: "text" as const, text: `${refs[i]}:` },
        { type: "image" as const, image: c.dataUrl },
      ]),
    ];

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const model = createLovableAiGatewayProvider(key)("google/gemini-2.5-flash");
    try {
      let text = "";
      try {
        text = (await generateText({ model, abortSignal: AbortSignal.timeout(25_000), messages: [{ role: "user", content }] })).text;
      } catch (err) {
        console.error("[AURA outfit-match] rerank call failed", err);
      }
      let parsed: z.infer<typeof RerankOutput>;
      try {
        parsed = parseAiJson(text, RerankOutput);
      } catch {
        const r2 = await generateText({
          model,
          abortSignal: AbortSignal.timeout(25_000),
          messages: [
            { role: "user", content },
            { role: "assistant", content: text || "(no response)" },
            { role: "user", content: "That was not a single valid JSON object matching the required shape. Reply again with ONLY the JSON object, nothing else." },
          ],
        });
        parsed = parseAiJson(r2.text, RerankOutput);
      }
      return { ok: true, scores: mapVisualScores(parsed.candidates, usable.map((u) => u.id)) };
    } catch (err) {
      console.error("[AURA outfit-match] rerank failed", err);
      return { ok: false, error: err instanceof Error ? err.message : "AI failed" };
    }
  });
