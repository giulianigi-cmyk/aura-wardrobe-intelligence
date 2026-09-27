import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAiJson } from "./ai-json";
import { resolveProductImageUrl } from "./import-url.functions";
import { analyzeWardrobeImageCore } from "./ai-analyze.functions";
import { findBestMatch } from "./outfit-dedupe";
import { isItemAllowedByDressPreferences, hasAnyPreference, type DressPreferences } from "./dress-preferences";
import { COLOR_PALETTE } from "./color-palette";
import type { WardrobeItem } from "./aura-types";

// ============================================================================
// Purchase Advisor — "Should I buy this?"
//
// Deliberately isolated from every other module: it only ever READS from
// resolveProductImageUrl, analyzeWardrobeImageCore, findBestMatch and the
// dress-preferences helpers, never modifies them. Anything specific to
// this feature (label OCR, pairing/gap heuristics) lives entirely in this
// file so nothing else in the app can be affected by it.
// ============================================================================

const InputSchema = z.discriminatedUnion("source", [
  // accessToken is needed for the same reason it's needed in the plain
  // AddItem → paste-link flow: Firecrawl's per-user daily credit count
  // (see consumeFirecrawlCredit) is tracked against the signed-in user,
  // and the auth middleware here only exposes a Supabase client + userId
  // to the handler, never the raw bearer token — the client has to pass
  // it through explicitly, same as importProductFromUrl already does.
  z.object({ source: z.literal("url"), url: z.string().min(1), accessToken: z.string().optional() }),
  z.object({ source: z.literal("photo"), imageDataUrl: z.string().min(1) }),
  z.object({ source: z.literal("label"), imageDataUrl: z.string().min(1) }),
  z.object({ source: z.literal("photos"), garmentImageDataUrl: z.string().min(1), labelImageDataUrl: z.string().min(1) }),
]);
type SingleProductInput = z.infer<typeof InputSchema>;

const CompareInputSchema = z.object({ a: InputSchema, b: InputSchema });

type PurchaseProduct = {
  title: string | null;
  brand: string | null;
  price: string | null;
  currency: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  colors: string[];
  material: string | null;
  length: string | null;
  sleeveLength: string | null;
  fit: string | null;
  styleTags: string[];
};

export type PurchaseAdvisorResult =
  | {
      ok: true;
      verdict: "buy" | "maybe" | "skip";
      reason: string;
      confidence: "high" | "medium" | "low";
      product: {
        title: string | null;
        brand: string | null;
        price: string | null;
        currency: string | null;
        imageUrl: string | null;
        // The original product page, when the source was a link — lets
        // the person tap through to verify or actually buy. Null for
        // photo/label sources, since there's no page to link to.
        sourceUrl: string | null;
      };
      analysis: {
        category: string | null;
        subcategory: string | null;
        colors: string[];
        material: string | null;
      };
      wardrobe: {
        duplicate: { verdict: "certain" | "maybe"; itemId: string } | null;
        similarItemsCount: number;
        pairsWithCount: number;
        wardrobeGap: boolean;
      };
      rules: {
        dressPreferenceViolation: boolean;
      };
    }
  | { ok: false; error: string };

// ---- Label OCR/vision — new, self-contained, no shared file touched ----

const LabelSchema = z.object({
  brand: z.string().nullable(),
  productName: z.string().nullable(),
  material: z.string().nullable(),
  productCode: z.string().nullable(),
  size: z.string().nullable(),
  price: z.string().nullable(),
  currency: z.string().nullable(),
});
type LabelAnalysis = z.infer<typeof LabelSchema>;
const EMPTY_LABEL: LabelAnalysis = { brand: null, productName: null, material: null, productCode: null, size: null, price: null, currency: null };

async function analyzeLabelImage(imageDataUrl: string, model: Parameters<typeof generateText>[0]["model"]): Promise<LabelAnalysis> {
  const system = [
    "You read a photo of a garment's care label or hang tag. Extract ONLY what is actually printed and legible on it — never guess, infer, or fill in a plausible-sounding value that isn't visibly there.",
    "Fields: brand (commercial brand name/logo, if legible), productName (product/style name if printed), material (fabric composition as printed, e.g. \"100% Cotton\"), productCode (article/style/SKU code, copied exactly as printed), size (as printed, e.g. \"M\" or \"40\"), price (the numeric price as printed), currency (the currency symbol or code next to the price, e.g. EUR, USD, €, $).",
    "Every field MUST be null if it is not clearly legible in the photo.",
    "Respond with ONLY a single valid JSON object, no markdown fences, no extra text:",
    '{"brand": null, "productName": null, "material": null, "productCode": null, "size": null, "price": null, "currency": null}',
  ].join("\n");

  const callOnce = () => generateText({
    model,
    messages: [{ role: "user", content: [{ type: "text", text: system }, { type: "image", image: imageDataUrl }] }],
  });

  let text = "";
  try { text = (await callOnce()).text; } catch (e) { console.error("[AURA purchase-advisor] label call failed", e); }

  try {
    return parseAiJson(text, LabelSchema);
  } catch {
    try {
      const r2 = await generateText({
        model,
        messages: [
          { role: "user", content: [{ type: "text", text: system }, { type: "image", image: imageDataUrl }] },
          { role: "assistant", content: text || "(no response)" },
          { role: "user", content: "That was not a single valid JSON object. Reply again with ONLY the JSON object." },
        ],
      });
      return parseAiJson(r2.text, LabelSchema);
    } catch (e) {
      console.error("[AURA purchase-advisor] label retry failed", e);
      return EMPTY_LABEL;
    }
  }
}

// ---- Pairing heuristic — same neutral-aware idea already used (and
// recently fixed) in wardrobe-gap.functions.ts, kept as a small local
// copy per the isolation rule rather than touching that file. ----

const NEUTRAL_FAMILIES = new Set(["Whites", "Blacks & Greys", "Beiges"]);
const colorFamily = (name: string): string | undefined => COLOR_PALETTE.find((c) => c.name === name)?.family;
const isNeutralColor = (name: string): boolean => {
  const f = colorFamily(name);
  return f ? NEUTRAL_FAMILIES.has(f) : false;
};
const PAIRING_WHITELIST: Record<string, string[]> = {
  Tops: ["Bottoms", "Outerwear", "Shoes", "Bags", "Accessories"],
  Bottoms: ["Tops", "Outerwear", "Shoes", "Bags", "Accessories"],
  Dresses: ["Outerwear", "Shoes", "Bags", "Accessories"],
  Jumpsuits: ["Outerwear", "Shoes", "Bags", "Accessories"],
  Outerwear: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Shoes", "Bags"],
  Shoes: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Outerwear", "Bags"],
  Bags: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Outerwear", "Shoes"],
  Accessories: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Outerwear"],
};

function countPairings(category: string, colors: string[], wardrobe: WardrobeItem[]): number {
  const whitelist = new Set(PAIRING_WHITELIST[category] ?? []);
  if (whitelist.size === 0) return 0;
  const productIsNeutral = colors.length === 0 || colors.every(isNeutralColor);
  let count = 0;
  for (const it of wardrobe) {
    if (!it.category || !whitelist.has(it.category)) continue;
    const itColors = it.colors ?? [];
    const exactMatch = itColors.some((c) => colors.includes(c));
    const eitherNeutral = productIsNeutral || itColors.some(isNeutralColor);
    if (exactMatch || eitherNeutral) count++;
  }
  return count;
}

const LANGUAGE_NAMES: Record<string, string> = { it: "Italian", en: "English", es: "Spanish", fr: "French" };

const INVALID_LINK: Record<string, string> = {
  it: "Link non valido.",
  en: "Invalid link.",
  es: "Enlace no válido.",
  fr: "Lien invalide.",
};

const COULD_NOT_READ_PAGE: Record<string, string> = {
  it: "Non sono riuscita a leggere questa pagina prodotto.",
  en: "Couldn't read this product page.",
  es: "No he podido leer esta página de producto.",
  fr: "Impossible de lire cette page produit.",
};

/** Cuts `text` to at most `max` characters without breaking mid-word or mid-sentence when it can
 *  be avoided — the previous plain `.slice(0, 300)` produced things like "...il prezzo di" trailing
 *  into nothing. Prefers the last sentence-ending punctuation before the limit; falls back to the
 *  last whole word; only hard-cuts if neither exists (an unbroken 300-character word). */
function truncateAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (lastSentenceEnd > max * 0.4) return slice.slice(0, lastSentenceEnd + 1);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > max * 0.4) return slice.slice(0, lastSpace).trimEnd() + "…";
  return slice.trimEnd() + "…";
}

const FALLBACK_REASON: Record<string, string> = {
  it: "Impossibile generare la spiegazione completa, ma l'analisi del guardaroba è comunque completa.",
  en: "Couldn't generate the full explanation, but the wardrobe analysis is complete.",
  es: "No se pudo generar la explicación completa, pero el análisis del armario está completo.",
  fr: "Impossible de générer l'explication complète, mais l'analyse de la garde-robe est terminée.",
};

/** Downloads a remote image and returns it as a data URL, for feeding
 *  into the vision model — used only for the URL input mode, where the
 *  photo comes from resolveProductImageUrl rather than an upload. */
async function fetchAsDataUrl(imageUrl: string): Promise<string> {
  // The image URL comes from HTML on a page the user (or an attacker)
  // controls, so it must go through the SSRF guards like every other
  // outbound fetch of user-influenced URLs in this codebase.
  const { safeFetch } = await import("./safe-url");
  const resp = await safeFetch(imageUrl);
  if (!resp.ok) throw new Error(`image fetch ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const contentType = resp.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
}


/**
 * Steps 1+2 of the pipeline, factored out so both the single-product
 * analyzePurchase below and the two-product comparePurchases can share the exact
 * same product-resolution and wardrobe-facts logic rather than risk the two
 * ever drifting apart. Returns the resolved product plus, when a category
 * was identified, the wardrobe comparison facts for it.
 */
async function resolveProductAndWardrobeFacts(
  data: SingleProductInput,
  model: Parameters<typeof generateText>[0]["model"],
  langCode: string,
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<
  | { ok: true; product: PurchaseProduct; wardrobe: WardrobeItem[]; duplicate: { verdict: "certain" | "maybe"; itemId: string } | null; similarItemsCount: number; pairsWithCount: number; wardrobeGap: boolean }
  | { ok: false; error: string }
> {
  const product: PurchaseProduct = {
    title: null, brand: null, price: null, currency: null, imageUrl: null, sourceUrl: null, description: null,
    category: null, subcategory: null, colors: [], material: null,
    length: null, sleeveLength: null, fit: null, styleTags: [],
  };

  // ---- 1. Gather product facts, depending on input mode ----
  if (data.source === "url") {
    let target: URL;
    try { target = new URL(data.url.startsWith("http") ? data.url : `https://${data.url}`); }
    catch { return { ok: false, error: INVALID_LINK[langCode] ?? INVALID_LINK.en }; }

    const resolved = await resolveProductImageUrl(target.toString(), data.accessToken);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error || (COULD_NOT_READ_PAGE[langCode] ?? COULD_NOT_READ_PAGE.en) };
    }
    product.title = resolved.title || null;
    product.brand = resolved.brand || null;
    product.price = resolved.price ?? null;
    product.currency = resolved.priceCurrency ?? null;
    product.imageUrl = resolved.imageUrl;
    product.sourceUrl = target.toString();
    product.description = resolved.description ?? null;

    if (resolved.imageUrl) {
      try {
        const imageDataUrl = await fetchAsDataUrl(resolved.imageUrl);
        const garment = await analyzeWardrobeImageCore(imageDataUrl);
        product.category = garment.category || null;
        product.subcategory = garment.subcategory || null;
        product.colors = garment.colors ?? [];
        product.material = garment.materials?.[0] ?? null;
        product.length = garment.length || null;
        product.sleeveLength = garment.sleeveLength || null;
        product.fit = garment.fit || null;
        product.styleTags = garment.styleTags ?? [];
        if (!product.brand && garment.brand) product.brand = garment.brand;
      } catch (e) {
        // Text-only facts from the page are still usable even if the
        // photo itself couldn't be downloaded or analyzed.
        console.error("[AURA purchase-advisor] url image analysis failed", e);
      }
    }
  } else if (data.source === "photo") {
    product.imageUrl = data.imageDataUrl;
    const garment = await analyzeWardrobeImageCore(data.imageDataUrl);
    product.category = garment.category || null;
    product.subcategory = garment.subcategory || null;
    product.colors = garment.colors ?? [];
    product.material = garment.materials?.[0] ?? null;
    product.length = garment.length || null;
    product.sleeveLength = garment.sleeveLength || null;
    product.fit = garment.fit || null;
    product.styleTags = garment.styleTags ?? [];
    product.brand = garment.brand || null;
  } else if (data.source === "label") {
    const label = await analyzeLabelImage(data.imageDataUrl, model);
    product.brand = label.brand;
    product.title = label.productName;
    product.material = label.material;
    product.price = label.price;
    product.currency = label.currency;
    // category / colors / shape are unknowable from a label alone —
    // left null rather than guessed, per the "never invent" rule.
  } else {
    const [garment, label] = await Promise.all([
      analyzeWardrobeImageCore(data.garmentImageDataUrl),
      analyzeLabelImage(data.labelImageDataUrl, model),
    ]);
    product.imageUrl = data.garmentImageDataUrl;
    product.category = garment.category || null;
    product.subcategory = garment.subcategory || null;
    product.colors = garment.colors ?? [];
    product.length = garment.length || null;
    product.sleeveLength = garment.sleeveLength || null;
    product.fit = garment.fit || null;
    product.styleTags = garment.styleTags ?? [];
    // The label wins for printed-text fields when it has an answer —
    // more reliable there than reading small print off a garment photo.
    product.brand = label.brand || garment.brand || null;
    product.title = label.productName || null;
    product.material = label.material || garment.materials?.[0] || null;
    product.price = label.price;
    product.currency = label.currency;
  }

  // ---- 2. Wardrobe facts ----
  const { data: wardrobeRaw } = await supabase.from("wardrobe_items").select("*").eq("user_id", userId);
  const wardrobe = (wardrobeRaw ?? []) as WardrobeItem[];

  const duplicate = product.category
    ? (() => {
        const d = findBestMatch(
          { category: product.category!, subcategory: product.subcategory ?? undefined, colors: product.colors, brand: product.brand },
          wardrobe,
        );
        return d.verdict === "new" ? null : { verdict: d.verdict as "certain" | "maybe", itemId: d.match!.id };
      })()
    : null;

  const similarItemsCount = product.category
    ? wardrobe.filter((it) => it.category === product.category && (!product.subcategory || it.subcategory === product.subcategory)).length
    : 0;

  // "Does this fill a real gap?" — same spirit as the wardrobe-gap
  // suggestion: zero comparable pieces owned reads as a genuine gap;
  // several near-identical pieces already owned does not, regardless
  // of how nice the new one looks.
  const wardrobeGap = product.category ? similarItemsCount === 0 : false;

  const pairsWithCount = product.category ? countPairings(product.category, product.colors, wardrobe) : 0;

  return { ok: true, product, wardrobe, duplicate, similarItemsCount, pairsWithCount, wardrobeGap };
}

/** The deterministic verdict logic, extracted so both the single-item flow and the
 *  multi-item comparison below use the exact same rule — a comparison needs each item's
 *  OWN independent buy/maybe/skip just as much as the single-item advisor does; this is
 *  never a second, drifting copy of the same judgment. */
function computeVerdict(opts: {
  dressViolation: boolean; hasCategory: boolean; duplicate: { verdict: "certain" | "maybe" } | null;
  pairsWithCount: number; wardrobeGap: boolean; wardrobeSize: number; isLabelOnly: boolean;
}): { verdict: "buy" | "maybe" | "skip"; confidence: "high" | "medium" | "low" } {
  let verdict: "buy" | "maybe" | "skip";
  let confidence: "high" | "medium" | "low";
  if (opts.dressViolation) {
    verdict = "skip"; confidence = "high";
  } else if (!opts.hasCategory) {
    // Not enough to reason about (e.g. label-only, or vision genuinely
    // couldn't classify the piece) — never fake certainty.
    verdict = "maybe"; confidence = "low";
  } else if (opts.duplicate?.verdict === "certain") {
    verdict = "skip"; confidence = "medium";
  } else if (!opts.duplicate && opts.pairsWithCount >= 3 && opts.wardrobeGap) {
    verdict = "buy"; confidence = "high";
  } else if (!opts.duplicate && opts.pairsWithCount >= 3) {
    verdict = "buy"; confidence = opts.wardrobeSize > 0 ? "medium" : "low";
  } else {
    verdict = "maybe";
    confidence = opts.pairsWithCount > 0 ? "medium" : "low";
  }
  // A label photo alone never supports a confident visual verdict, whatever the
  // heuristics above computed from the (mostly null) product shape.
  if (opts.isLabelOnly && confidence === "high") confidence = "medium";
  return { verdict, confidence };
}

/**
 * "Should I buy this?" across four input modes (URL / photo / label /
 * photo+label). The verdict is 100% deterministic, computed in code from
 * real wardrobe facts (duplicate check, dress-preference hard rule,
 * pairing count, wardrobe gap) BEFORE any AI call — the AI is only ever
 * asked to phrase the 1-2 sentence reason for a decision that has
 * already been made, and is explicitly told not to change it. This
 * mirrors the same "hard rules first, AI explains, never overrides"
 * principle already used everywhere else in the outfit engine.
 */
export const analyzePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PurchaseAdvisorResult> => {
    const { supabase, userId } = context;

    // Moved to the very top (was originally fetched only just before the dress-preferences check
    // further down) so the early, non-AI error returns below — an invalid link, a page that
    // couldn't be read — can be localized too, instead of always shipping in English regardless of
    // the app's own selected language.
    const { data: profileRow } = await (supabase.from("profiles" as never) as any)
      .select("dress_preferences, language, season, undertone")
      .eq("id", userId).maybeSingle();
    const profile = profileRow as { dress_preferences?: DressPreferences; language?: string | null; season?: string | null; undertone?: string | null } | null;
    const langCode = profile?.language ?? "en";

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    const resolved = await resolveProductAndWardrobeFacts(data, model, langCode, supabase, userId);
    if (!resolved.ok) return resolved;
    const { product, wardrobe, duplicate, similarItemsCount, pairsWithCount, wardrobeGap } = resolved;

    // ---- 3. Dress preferences — hard rule, same as the outfit engine ----
    const dressPrefs = profile?.dress_preferences ?? null;
    const dressViolation = hasAnyPreference(dressPrefs) && product.category
      ? !isItemAllowedByDressPreferences(
          { category: product.category, subcategory: product.subcategory, length: product.length, sleeveLength: product.sleeveLength, fit: product.fit, styleTags: product.styleTags },
          dressPrefs,
        )
      : false;

    // ---- 4. Deterministic verdict — the AI never decides this part ----
    const { verdict, confidence } = computeVerdict({
      dressViolation, hasCategory: !!product.category, duplicate, pairsWithCount, wardrobeGap,
      wardrobeSize: wardrobe.length, isLabelOnly: data.source === "label",
    });

    const base = {
      product: { title: product.title, brand: product.brand, price: product.price, currency: product.currency, imageUrl: product.imageUrl, sourceUrl: product.sourceUrl },
      // description isn't part of the returned shape — reasoning-only
      // input, not something the UI needs to render separately.
      analysis: { category: product.category, subcategory: product.subcategory, colors: product.colors, material: product.material },
      wardrobe: { duplicate, similarItemsCount, pairsWithCount, wardrobeGap },
      rules: { dressPreferenceViolation: dressViolation },
    };

    // ---- 5. AI writes ONLY the reason for the already-decided verdict ----
    const langName = LANGUAGE_NAMES[profile?.language ?? "en"] ?? "English";
    const verdictShape =
      verdict === "buy"
        ? "Open by recommending the purchase, then give the CONCRETE reason: what specific value this exact piece adds to the wardrobe (fabric, color, silhouette, the occasion it unlocks). Do NOT restate the pairing count in this sentence — it's already shown on its own separate line right below your text, so repeating it here is redundant. Shape to follow (the Italian is for tone/structure calibration only; write it naturally in the target language above, never a word-for-word translation of this exact sentence): \"Ti suggerisco di acquistarlo: [prodotto] aggiunge [valore concreto] al tuo guardaroba.\""
        : verdict === "maybe"
        ? "Frame it as worth a look but not urgent, and say concretely why — something new, but limited real-world occasions to wear it, or partial overlap with what's owned. Shape to follow (same calibration note as above): \"Potrebbe essere un buon acquisto, ma non è una priorità: [motivo concreto basato sui fatti].\""
        : "Say plainly it isn't worth it and give the concrete reason (a near-duplicate already owned, or too few genuine new combinations). Shape to follow (same calibration note as above): \"Non lo considererei una priorità: [motivo concreto basato sui fatti].\"";
    const system = [
      "You are an elegant, knowledgeable personal stylist writing the explanation for a wardrobe purchase verdict that has ALREADY been decided — you only explain it, using ONLY the facts listed below. Never invent facts, prices, qualities, or wardrobe details not listed. Never soften, contradict, hedge, or second-guess the decision.",
      "Speak directly TO the person — \"il tuo guardaroba\", \"possiedi\", \"puoi abbinarlo\" (translated naturally into the target language) — never in the third person (\"la persona ha...\", \"l'utente possiede...\"). Sound like a stylist giving a real, personal opinion, not a database printing out matched fields — no generic filler a stock listing could produce (\"è un capo versatile\", \"aggiunge un tocco di stile\") unless tied to a specific, concrete reason from the facts below.",
      "NEVER say or imply that YOU (the app) or the person already bought, chose, or picked this item — a verdict is advice about a decision not yet made, never a report of one that already happened. (A genuinely already-purchased item is a different, past-tense case this prompt does not cover.)",
      "Never state the exact pairing-count number anywhere in your text, for any verdict — it's always shown separately, right below what you write, so stating it again would be a plain repetition of the same fact the person already just read.",
      `Respond in ${langName}.`,
      "Keep it under 280 characters — that's the hard limit this app enforces, so a longer reason gets cut off mid-sentence rather than shown in full. Say less, not more, if there isn't room to finish a thought.",
      `The decided verdict is ${verdict.toUpperCase()}. ${verdictShape}`,
      "Facts:",
      `- Product: ${product.category ?? "unknown category"}${product.subcategory ? " / " + product.subcategory : ""}, colors: ${product.colors.join(", ") || "unclear"}, brand: ${product.brand || "unknown"}, price: ${product.price ?? "unknown"}.`,
      ...(product.description ? [`- Product's own description (from the retailer's page, use for fabric/fit/styling detail in your reason, but never to override the facts above): "${product.description}"`] : []),
      duplicate?.verdict === "certain"
        ? "- Near-duplicate of something already owned."
        : duplicate?.verdict === "maybe"
        ? "- Similar to something already owned, not a certain duplicate."
        : "- Nothing similar already owned.",
      `- Would pair with about ${pairsWithCount} piece(s) already owned.`,
      wardrobeGap ? "- Fills a real gap: nothing comparable owned yet." : "- Not a gap: comparable pieces already owned.",
      dressViolation ? "- Conflicts with a stated dress preference — this is why it's a skip." : "",
      profile?.season ? `- Estimated color season: ${profile.season}${profile.undertone ? ` (${profile.undertone})` : ""} — soft note only, never a reason on its own.` : "",
      "Respond with ONLY a single valid JSON object, no markdown fences:",
      '{"reason": ""}',
    ].filter(Boolean).join("\n");

    let reason: string;
    try {
      const r1 = await generateText({ model, system, messages: [{ role: "user", content: "Write the reason." }] });
      const parsed = parseAiJson(r1.text, z.object({ reason: z.string() }));
      // The prompt now asks to stay under 280 chars, so this should rarely fire — but if the model
      // overruns anyway, cut at the last full sentence/word instead of mid-phrase (this is what
      // produced "...il prezzo di" trailing into nothing before): a shorter, complete thought reads
      // as honest; a hard mid-word cut reads as broken.
      reason = truncateAtBoundary(parsed.reason, 300);
    } catch (e) {
      console.error("[AURA purchase-advisor] reason generation failed", e);
      reason = FALLBACK_REASON[profile?.language ?? "en"] ?? FALLBACK_REASON.en;
    }

    return { ok: true as const, verdict, confidence, reason, ...base };
  });

// ============================================================================
// Compare two or more products — "should I buy this one, or one of these
// instead?"
//
// Reuses resolveProductAndWardrobeFacts and computeVerdict (above) for each
// product, so every fact and every individual verdict here is computed by
// the exact same logic the single-item advisor already relies on — never a
// second, drifting copy. Two axes, kept deliberately separate because the
// person can genuinely want either answer:
//   1. Is THIS item worth buying at all, on its own? (buy/maybe/skip, same
//      deterministic rule as the single-item flow)
//   2. Given all of them, what ORDER would you buy them in — a full ranking,
//      not just a single "winner" — so with 3-4 items the person gets real
//      guidance ("this one first, maybe that one, skip the third") rather
//      than one pick and silence about the rest.
// A hard "tier" is computed deterministically for every item first (a dress-
// preference conflict is always worse than none; a certain duplicate is
// always worse than a non-duplicate; a BUY verdict always outranks MAYBE,
// which always outranks SKIP) — the model can reorder freely WITHIN a tier
// using softer signals or its own judgment, including calling two items in
// the same tier genuinely equivalent, but it can never place a lower tier
// above a higher one. If it tries to anyway, the deterministic tier order
// wins — the model explains the ranking, it doesn't get to override it.
// ============================================================================

const CachedFactsSchema = z.object({
  source: z.literal("cached"),
  product: z.object({
    title: z.string().nullable(), brand: z.string().nullable(), price: z.string().nullable(),
    currency: z.string().nullable(), imageUrl: z.string().nullable(), sourceUrl: z.string().nullable(),
    category: z.string().nullable(), subcategory: z.string().nullable(), colors: z.array(z.string()),
    length: z.string().nullable(), sleeveLength: z.string().nullable(), fit: z.string().nullable(), styleTags: z.array(z.string()),
  }),
  duplicateVerdict: z.enum(["certain", "maybe", "new"]),
  pairsWithCount: z.number(),
  wardrobeGap: z.boolean(),
  isLabelOnly: z.boolean(),
});
export type CachedFacts = z.infer<typeof CachedFactsSchema>;

const MultiCompareInputSchema = z.object({ items: z.array(z.union([InputSchema, CachedFactsSchema])).min(2).max(6) });

type ComparedProductOut = {
  title: string | null;
  brand: string | null;
  price: string | null;
  currency: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
};

type ComparedItem = {
  product: ComparedProductOut;
  verdict: "buy" | "maybe" | "skip";
  confidence: "high" | "medium" | "low";
  wardrobe: { duplicate: boolean; pairsWithCount: number; wardrobeGap: boolean; dressPreferenceViolation: boolean };
  // Everything the "is this the same item as I already own?" judgment for THIS one product
  // depends on, opaque to the client — pass it back unchanged as this same item's `source` on a
  // later comparePurchases call (e.g. after adding one more piece to the comparison) and this
  // product will be judged identically rather than silently re-scraped and re-read by the vision
  // model a second time. That re-read is never guaranteed to land on the exact same category,
  // color or duplicate call as the first one — a borderline read can tip either way between two
  // separate calls — which is exactly what made the SAME shoe come back "maybe" once and "skip"
  // the next time, for no reason connected to the item itself or to anything the person did.
  cacheKey: CachedFacts;
};

export type ComparePurchasesResult =
  | { ok: true; items: ComparedItem[]; ranking: number[]; reason: string }
  | { ok: false; error: string };

const COULD_NOT_COMPARE: Record<string, string> = {
  it: "Non sono riuscita a confrontare questi capi.",
  en: "Couldn't compare these pieces.",
  es: "No he podido comparar estas prendas.",
  fr: "Impossible de comparer ces pièces.",
};

/** Higher = more desirable. A hard floor/ceiling the model's own ranking below is
 *  never allowed to cross — see the module comment above. */
function desirabilityTier(violation: boolean, duplicate: boolean, verdict: "buy" | "maybe" | "skip"): number {
  if (violation) return 0;
  if (duplicate) return 1;
  return { skip: 2, maybe: 3, buy: 4 }[verdict];
}

/** True when `ranking` is a valid permutation of 0..n-1 that never places a lower-tier
 *  item ahead of a higher-tier one — the one hard rule the model's own ordering must respect. */
function respectsTiers(ranking: number[], tiers: number[]): boolean {
  if (ranking.length !== tiers.length) return false;
  if (new Set(ranking).size !== tiers.length) return false; // must be a genuine permutation
  for (let i = 0; i < ranking.length - 1; i++) {
    if (tiers[ranking[i]] < tiers[ranking[i + 1]]) return false;
  }
  return true;
}

export const comparePurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MultiCompareInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ComparePurchasesResult> => {
    const { supabase, userId } = context;

    const { data: profileRow } = await (supabase.from("profiles" as never) as any)
      .select("dress_preferences, language, season, undertone")
      .eq("id", userId).maybeSingle();
    const profile = profileRow as { dress_preferences?: DressPreferences; language?: string | null; season?: string | null; undertone?: string | null } | null;
    const langCode = profile?.language ?? "en";
    const dressPrefs = profile?.dress_preferences ?? null;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    const resolvedAll = await Promise.all(
      data.items.map(async (item) => {
        if (item.source === "cached") {
          // Trust the client's cached facts outright — skip re-scraping and re-analyzing an item
          // whose result was already shown and hasn't been asked to change. See ComparedItem's
          // cacheKey field for why this exists at all.
          const p = item.product;
          return {
            ok: true as const,
            product: {
              title: p.title, brand: p.brand, price: p.price, currency: p.currency, imageUrl: p.imageUrl, sourceUrl: p.sourceUrl,
              description: null, category: p.category, subcategory: p.subcategory, colors: p.colors, material: null,
              length: p.length, sleeveLength: p.sleeveLength, fit: p.fit, styleTags: p.styleTags,
            },
            wardrobe: [] as WardrobeItem[], // size only affects a confidence tweak below; an empty
            // array is never wrong in the direction that matters (it can only make confidence
            // read as slightly more cautious ("low" instead of "medium"), never overstate it.
            duplicate: item.duplicateVerdict === "new" ? null : { score: item.duplicateVerdict === "certain" ? 1 : 0.7, match: null as unknown as WardrobeItem, verdict: item.duplicateVerdict },
            similarItemsCount: 0,
            pairsWithCount: item.pairsWithCount,
            wardrobeGap: item.wardrobeGap,
          };
        }
        return resolveProductAndWardrobeFacts(item, model, langCode, supabase, userId);
      }),
    );
    const firstError = resolvedAll.find((r): r is { ok: false; error: string } => !r.ok);
    if (firstError) return firstError;
    const resolved = resolvedAll as Extract<(typeof resolvedAll)[number], { ok: true }>[];

    const violations = resolved.map((r) =>
      hasAnyPreference(dressPrefs) && r.product.category
        ? !isItemAllowedByDressPreferences(
            { category: r.product.category, subcategory: r.product.subcategory, length: r.product.length, sleeveLength: r.product.sleeveLength, fit: r.product.fit, styleTags: r.product.styleTags },
            dressPrefs,
          )
        : false,
    );

    const isLabelOnly = data.items.map((it) => (it.source === "cached" ? it.isLabelOnly : it.source === "label"));

    const verdicts = resolved.map((r, i) =>
      computeVerdict({
        dressViolation: violations[i], hasCategory: !!r.product.category, duplicate: r.duplicate,
        pairsWithCount: r.pairsWithCount, wardrobeGap: r.wardrobeGap, wardrobeSize: r.wardrobe.length,
        isLabelOnly: isLabelOnly[i],
      }),
    );

    const items: ComparedItem[] = resolved.map((r, i) => ({
      product: { title: r.product.title, brand: r.product.brand, price: r.product.price, currency: r.product.currency, imageUrl: r.product.imageUrl, sourceUrl: r.product.sourceUrl },
      verdict: verdicts[i].verdict,
      confidence: verdicts[i].confidence,
      wardrobe: { duplicate: r.duplicate?.verdict === "certain", pairsWithCount: r.pairsWithCount, wardrobeGap: r.wardrobeGap, dressPreferenceViolation: violations[i] },
      cacheKey: {
        source: "cached" as const,
        product: {
          title: r.product.title, brand: r.product.brand, price: r.product.price, currency: r.product.currency, imageUrl: r.product.imageUrl, sourceUrl: r.product.sourceUrl,
          category: r.product.category, subcategory: r.product.subcategory, colors: r.product.colors,
          length: r.product.length, sleeveLength: r.product.sleeveLength, fit: r.product.fit, styleTags: r.product.styleTags,
        },
        duplicateVerdict: r.duplicate?.verdict ?? "new",
        pairsWithCount: r.pairsWithCount,
        wardrobeGap: r.wardrobeGap,
        isLabelOnly: isLabelOnly[i],
      },
    }));

    const tiers = items.map((it) => desirabilityTier(it.wardrobe.dressPreferenceViolation, it.wardrobe.duplicate, it.verdict));
    // Safety-net order: by tier, then by the softer pairing/gap signal — used whenever the model's
    // own ranking is missing, malformed, or breaks the tier rule.
    const fallbackRanking = items.map((_, i) => i).sort((a, b) => {
      if (tiers[b] !== tiers[a]) return tiers[b] - tiers[a];
      const scoreOf = (i: number) => items[i].wardrobe.pairsWithCount + (items[i].wardrobe.wardrobeGap ? 3 : 0);
      return scoreOf(b) - scoreOf(a);
    });

    const allSameTier = tiers.every((t) => t === tiers[0]);
    const langName = LANGUAGE_NAMES[langCode] ?? "English";
    const letters = ["A", "B", "C", "D", "E", "F"];
    const describeItem = (label: string, r: Extract<(typeof resolvedAll)[number], { ok: true }>, verdict: ComparedItem["verdict"], violation: boolean) => [
      `${label}: ${r.product.category ?? "unknown category"}${r.product.subcategory ? " / " + r.product.subcategory : ""}, colors: ${r.product.colors.join(", ") || "unclear"}, brand: ${r.product.brand || "unknown"}, price: ${r.product.price ?? "unknown"}. Individual verdict already decided: ${verdict.toUpperCase()}.`,
      r.duplicate?.verdict === "certain" ? `${label} is a near-duplicate of something already owned.` : r.duplicate?.verdict === "maybe" ? `${label} is similar to something already owned, not a certain duplicate.` : `${label}: nothing similar already owned.`,
      `${label} would pair with about ${r.pairsWithCount} piece(s) already owned.`,
      r.wardrobeGap ? `${label} fills a real gap — nothing comparable owned yet.` : `${label} is not a gap — comparable pieces already owned.`,
      violation ? `${label} conflicts with a stated dress preference.` : "",
    ].filter(Boolean);

    const system = [
      "You are an elegant, knowledgeable personal stylist helping the person decide, among SEVERAL specific products they're considering, what order they'd be worth getting in — first choice, second choice, and so on, including honestly saying when one (or all) genuinely isn't worth buying at all. Each product's individual buy/maybe/skip verdict is already decided (given below) — you are NOT re-deciding those.",
      "Speak directly TO the person — \"il tuo guardaroba\", \"possiedi\", \"ti starebbe meglio\" (translated naturally into the target language) — never in the third person. Sound like a stylist giving a real, personal opinion, not a database printing out matched fields.",
      "Your reason must reflect the full picture honestly: if every option is a SKIP, say plainly that none is really worth it, while still noting which would be the least bad if forced to pick. If several are a BUY, you can recommend more than one while still stating which comes first. Never imply a SKIP item is a good purchase just because it ranks above another SKIP.",
      "NEVER say or imply that YOU (the app) or the person already bought, chose, or picked any of these — this is advice about a decision not yet made.",
      `Respond in ${langName}.`,
      "Keep it under 320 characters — a bit more room than the single-item advisor, since a real ranking across several pieces needs a little more space to state honestly.",
      "Each item already has a fixed, non-negotiable tier — see below. Produce a full ranking (best to worst) of ALL items: you may reorder freely WITHIN the same tier (using the softer signals below, your own styling judgment, or genuinely calling two items in a tier equivalent), but a lower-tier item must never be placed above a higher-tier one — that ordering is already decided and is not yours to change.",
      allSameTier
        ? "Every item happens to sit in the same tier here — the full ranking is entirely yours to decide from the softer signals below, including saying some or all are genuinely equivalent."
        : "",
      "",
      "Facts (tier shown for each — higher number is more desirable and must never be ranked below a lower number):",
      ...items.flatMap((it, i) => [...describeItem(letters[i], resolved[i], it.verdict, violations[i]), `${letters[i]}'s tier: ${tiers[i]}`]),
      "",
      "Respond with ONLY a single valid JSON object, no markdown fences. \"ranking\" is ALL the letters above, ordered best to worst, e.g. for 3 items: [\"B\", \"A\", \"C\"]:",
      '{"ranking": [], "reason": ""}',
    ].filter(Boolean).join("\n");

    let ranking = fallbackRanking;
    let reason: string;
    try {
      const r1 = await generateText({ model, system, messages: [{ role: "user", content: "Write the ranking and reason." }] });
      const parsed = parseAiJson(r1.text, z.object({ ranking: z.array(z.string()), reason: z.string() }));
      const parsedIndices = parsed.ranking.map((letter) => letters.indexOf(letter.toUpperCase()));
      if (respectsTiers(parsedIndices, tiers)) ranking = parsedIndices;
      // else: keep the deterministic fallbackRanking — a malformed or tier-violating response
      // from the model is silently corrected rather than shipped, same "never let the model
      // override a hard rule" principle as the rest of this file.
      reason = truncateAtBoundary(parsed.reason, 340);
    } catch (e) {
      console.error("[AURA purchase-advisor] compare reason generation failed", e);
      reason = COULD_NOT_COMPARE[langCode] ?? COULD_NOT_COMPARE.en;
    }

    return { ok: true as const, items, ranking, reason };
  });
