// Server-only multi-item outfit detector.
// Extracted from analyze-outfit.functions.ts so both the authenticated
// server function AND the batch scan worker call exactly the same engine.
import { generateText } from "ai";
import type { z } from "zod";
import { COLOR_NAMES } from "./color-palette";
import {
  MATERIAL_OPTIONS, SUBCATEGORY_OPTIONS, SLEEVE_LENGTH_OPTIONS,
  LENGTH_OPTIONS_BY_CATEGORY, FIT_OPTIONS, HEEL_HEIGHT_OPTIONS, TOE_SHAPE_OPTIONS,
  CLOSURE_OPTIONS, GENDER_OPTIONS, STYLE_TAG_OPTIONS,
} from "./wardrobe-options";
import { parseAiJson } from "./ai-json";
import { PATTERNS } from "./outfit-match";
import {
  DETECT_CATEGORIES,
  DETECT_SEASONS,
  DetectOutputSchema,
  type DetectedOutfitItem,
} from "./outfit-detect-types";

const ALL_SUBCATEGORIES = Array.from(new Set(Object.values(SUBCATEGORY_OPTIONS).flat()));

// Extra instructions for "Scansiona un outfit" only (detailed mode). The goal there is not just
// "these are trousers" but enough visual identity to pick the RIGHT trousers out of a wardrobe with
// several similar ones — shade, pattern, cut, distinctive details — without inventing anything.
function detailedSection(): string[] {
  return [
    "VISUAL IDENTITY — these extra fields are used to find this exact piece among similar ones in the person's wardrobe, so be precise and literal:",
    "- colors: judge the garment's TRUE colour, mentally correcting for warm/cool light, shadows and camera white balance. Do not collapse neighbouring colours: navy is not black, ivory/cream is not pure white, camel is not beige, charcoal is not black, burgundy is not brown, olive is not dark green. If a dark garment shows any blue (or brown, green, red) cast in its lit areas, pick that colour, not black.",
    `- pattern: EXACTLY one of ${PATTERNS.join(", ")}. "pinstripe" = thin, widely spaced vertical lines on tailored fabric; "stripes" = any other stripes; "check" = plaid/tartan/gingham/windowpane; "textured" = no print but a visible weave or knit texture (tweed, cable knit, bouclé). Use "solid" only when the visible fabric clearly has no print.`,
    '- colorShade: 1-3 words naming the exact shade as seen, e.g. "dark navy", "warm ivory", "light heather grey".',
    '- visualDescription: 12-30 words describing the piece as precisely as a shop listing would: shade, pattern, apparent material/texture, silhouette and fit (e.g. straight, wide-leg, cropped, oversized, tailored), length, rise/waist, and construction (collar, lapels, sleeves, buttons, zips, pockets, belt, pleats). Example: "dark navy pinstripe tailored trousers, high waist, straight slightly wide leg, pressed front crease, fine wool-like fabric".',
    "- details: 0-5 short strings, only DISTINCTIVE visible details that would identify this exact piece (logo, print motif, embroidery, unusual buttons, hardware, buckle, cut-outs, appliqués, fringe, sequins, contrast stitching, unusual collar or sleeve shape). Empty array if none.",
    "NEVER invent what is not visible: if part of the garment is hidden (by a coat, a bag, hands, cropping), describe only the visible part and say so in visualDescription. If the material is not recognisable from the photo, leave materials empty rather than guessing.",
  ];
}

function buildPrompt(detailed = false): string {
  return [
    "You analyze a photo of a person wearing an outfit and identify every distinct visible garment, shoe, bag and accessory.",
    "COMPLETENESS — a common failure is stopping after the obvious top+bottom and missing everything smaller: sunglasses, a watch, a bracelet, a necklace, earrings, a belt, a hat, a scarf are all real, separate \"Accessories\" items and must be detected too whenever visible, even partially, even small in frame, even in one hand (like sunglasses being worn) or on one wrist. Before finishing, deliberately re-scan the photo head to wrist to ankle for anything not yet listed — bags and shoes are easy to catch, small accessories are what gets missed.",
    "ONE-PIECE VS. TWO-PIECE — read this before anything else: a dress or jumpsuit is a SINGLE item even when it has a fitted bodice/corset top portion and a separate-looking skirt or leg portion below it (a common silhouette). Detect that as ONE entry, category \"Dresses\" (or \"Jumpsuits\"), never as a separate Top + Bottom pair. Only detect two separate items when there is real, visible evidence of two actual garments — a genuine gap of visible skin between them, two different waistbands sitting at different heights, or a clearly different fabric/texture right at the waist seam. When in doubt, prefer the one-piece reading: a wrongly-split dress becomes two items that will never correctly match anything in the wardrobe, which is the worse failure.",
    "For EACH separate item worn, return one entry with:",
    `- category: EXACTLY one of ${DETECT_CATEGORIES.join(", ")}.`,
    `- subcategory: EXACTLY one value from this fixed list matching the category (e.g. if category is "Shoes", pick a Shoes value): ${ALL_SUBCATEGORIES.join(", ")}. Return an empty string only if truly none apply.`,
    `- colors: 1-2 items picked EXACTLY from this fixed palette (verbatim names): ${COLOR_NAMES.join(", ")}.`,
    `- materials: 0-2 items from: ${MATERIAL_OPTIONS.join(", ")}. Best guess from visible texture and garment type; empty array if genuinely unclear.`,
        `- seasons: 0-2 items from: ${DETECT_SEASONS.join(", ")}. Never combine "All Seasons" with a specific season — pick either "All Seasons" alone, or 1-2 specific seasons. Reason from material and coverage: heavy/insulating (wool, cashmere, shearling, coats, boots) → Autumn/Winter; light/breathable or minimal coverage (linen, thin cotton, shorts, sandals) → Spring/Summer. Reserve "All Seasons" for versatile mid-weight basics with no strong seasonal signal, not as a default when unsure.`,
        '- description: 3-6 words, e.g. "cropped denim jacket".',
    "- formality: an integer 1-5, purely about how dressed-up this specific piece reads: 1 = very casual/sport, 2 = casual, 3 = smart casual, 4 = elegant, 5 = formal/very elegant. Always give your best estimate.",
    "- dayEvening: EXACTLY one of \"day\", \"evening\", \"both\" — whether this piece reads as daytime wear, an evening/going-out piece, or works for either. A garment, shoe or bag decorated with crystals, Swarovski, rhinestones, diamonds or sequins is \"evening\" (and formality at least 4); list those decorations in materials.",
    "- sleeveLength: for Tops, Dresses, Outerwear or Jumpsuits only, EXACTLY one of \"Sleeveless\", \"Short Sleeve\", \"Three-Quarter Sleeve\", \"Long Sleeve\". Leave as an empty string for any other category.",
    `- length: CATEGORY-DEPENDENT, use the matching value set only — Dresses: ${LENGTH_OPTIONS_BY_CATEGORY.Dresses.join("/")}; Outerwear: ${LENGTH_OPTIONS_BY_CATEGORY.Outerwear.join("/")}; Tops: ${LENGTH_OPTIONS_BY_CATEGORY.Tops.join("/")}; Bottoms: ONLY when subcategory is "Skirt", use Mini/Midi/Maxi. For any other category, leave length as an empty string.`,
    `- fit (Tops, Bottoms, Dresses, Outerwear, Jumpsuits, Activewear only): EXACTLY one of ${FIT_OPTIONS.join(", ")}. Empty string for any other category.`,
    `- heelHeight (Shoes only): EXACTLY one of ${HEEL_HEIGHT_OPTIONS.join(", ")}. Empty string otherwise.`,
    `- toeShape (Shoes only): EXACTLY one of ${TOE_SHAPE_OPTIONS.join(", ")}. Empty string otherwise.`,
    `- closure (Shoes, Outerwear, Bags only): EXACTLY one of ${CLOSURE_OPTIONS.join(", ")}. Empty string otherwise.`,
    `- gender: EXACTLY one of ${GENDER_OPTIONS.join(", ")}. Always give your best estimate from the garment's cut and styling.`,
    `- styleTags: 0-3 items from: ${STYLE_TAG_OPTIONS.join(", ")}. Empty array if none clearly apply.`,
    "- confidence: 0 to 1, how sure you are this is a distinct, correctly identified item.",
    "- bbox: the item's bounding box as FRACTIONS of the full image (0 to 1): x and y are the top-left corner, width and height the box size. Be generous enough to include the whole item.",
    "Do not detect skin, hair, or background as items. Do not detect the same physical item twice. Return between 1 and 12 items, ordered roughly top-to-bottom on the body.",
    "If the photo does not clearly show a person wearing clothes, return an empty items array.",
    "",
    ...(detailed ? [...detailedSection(), ""] : []),
    "Respond with ONLY a single valid JSON object, no markdown fences, no extra text, in exactly this shape:",
    detailed
      ? '{"items": [{"category": "", "subcategory": "", "colors": [], "description": "", "materials": [], "seasons": [], "confidence": 0.9, "bbox": {"x": 0, "y": 0, "width": 0, "height": 0}, "formality": 3, "dayEvening": "day", "sleeveLength": "", "length": "", "fit": "", "heelHeight": "", "toeShape": "", "closure": "", "gender": "", "styleTags": [], "pattern": "solid", "colorShade": "", "visualDescription": "", "details": []}]}'
      : '{"items": [{"category": "", "subcategory": "", "colors": [], "description": "", "materials": [], "seasons": [], "confidence": 0.9, "bbox": {"x": 0, "y": 0, "width": 0, "height": 0}, "formality": 3, "dayEvening": "day", "sleeveLength": "", "length": "", "fit": "", "heelHeight": "", "toeShape": "", "closure": "", "gender": "", "styleTags": []}]}',
  ].join("\n");
}

function sanitize(output: z.infer<typeof DetectOutputSchema>): DetectedOutfitItem[] {
  const validColors = new Set(COLOR_NAMES);
  return output.items
    .filter((it) => (DETECT_CATEGORIES as readonly string[]).includes(it.category))
    .slice(0, 12)
    .map((it) => {
      const validSubs = SUBCATEGORY_OPTIONS[it.category] ?? [];
      const b = it.bbox;
      const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
      return {
        ...it,
        subcategory: validSubs.includes(it.subcategory) ? it.subcategory : "",
        colors: it.colors.filter((c) => validColors.has(c)).slice(0, 2),
        materials: it.materials.filter((m) => MATERIAL_OPTIONS.includes(m)).slice(0, 2),
                seasons: (() => {
          const s = it.seasons.filter((x) => (DETECT_SEASONS as readonly string[]).includes(x));
          return s.length > 1 && s.includes("All Seasons") ? s.filter((x) => x !== "All Seasons") : s;
        })(),
                confidence: Math.max(0, Math.min(1, it.confidence)),
        bbox: {
          x: clamp01(b.x),
          y: clamp01(b.y),
          width: Math.max(0.05, Math.min(1, b.width || 0.3)),
          height: Math.max(0.05, Math.min(1, b.height || 0.3)),
        },
        formality: it.formality != null ? Math.max(1, Math.min(5, Math.round(it.formality))) : undefined,
        dayEvening: ["day", "evening", "both"].includes(it.dayEvening ?? "") ? it.dayEvening : undefined,
        sleeveLength: SLEEVE_LENGTH_OPTIONS.includes(it.sleeveLength ?? "") ? it.sleeveLength : undefined,
        length: it.length || undefined,
        fit: FIT_OPTIONS.includes(it.fit ?? "") ? it.fit : undefined,
        heelHeight: HEEL_HEIGHT_OPTIONS.includes(it.heelHeight ?? "") ? it.heelHeight : undefined,
        toeShape: TOE_SHAPE_OPTIONS.includes(it.toeShape ?? "") ? it.toeShape : undefined,
        closure: CLOSURE_OPTIONS.includes(it.closure ?? "") ? it.closure : undefined,
        gender: GENDER_OPTIONS.includes(it.gender ?? "") ? it.gender : undefined,
        styleTags: (it.styleTags ?? []).filter((s) => STYLE_TAG_OPTIONS.includes(s)).slice(0, 3),
        pattern: (PATTERNS as readonly string[]).includes((it.pattern ?? "").toLowerCase()) ? it.pattern!.toLowerCase() : undefined,
        colorShade: it.colorShade?.trim().slice(0, 40) || undefined,
        visualDescription: it.visualDescription?.trim().slice(0, 300) || undefined,
        details: it.details?.length ? it.details.map((d) => d.trim()).filter(Boolean).slice(0, 5).map((d) => d.slice(0, 60)) : undefined,
      };
    });
}

export type DetectOutfitResult =
  | { ok: true; items: DetectedOutfitItem[] }
  | { ok: false; error: string; items: DetectedOutfitItem[] };

/** Run the multi-item outfit detector against a base64 data URL. */
export async function detectOutfitItems(imageDataUrl: string, opts: { detailed?: boolean } = {}): Promise<DetectOutfitResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-2.5-flash");

  const promptText = buildPrompt(opts.detailed);
  const buildMessages = () => [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: promptText },
        { type: "image" as const, image: imageDataUrl },
      ],
    },
  ];

  try {
    let text: string;
    try {
      text = (await generateText({ model, abortSignal: AbortSignal.timeout(25_000), messages: buildMessages() })).text;
    } catch (err) {
      console.error("[AURA analyze-outfit] first call failed", err);
      text = "";
    }

    let output: z.infer<typeof DetectOutputSchema>;
    try {
      output = parseAiJson(text, DetectOutputSchema);
    } catch {
      const r2 = await generateText({
        model,
        abortSignal: AbortSignal.timeout(25_000),
        messages: [
          ...buildMessages(),
          { role: "assistant", content: text || "(no response)" },
          {
            role: "user",
            content: "That was not a single valid JSON object matching the required shape. Reply again with ONLY the JSON object, nothing else.",
          },
        ],
      });
      output = parseAiJson(r2.text, DetectOutputSchema);
    }

    return { ok: true, items: sanitize(output) };
  } catch (err) {
    console.error("[AURA analyze-outfit] failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "AI failed", items: [] };
  }
}
