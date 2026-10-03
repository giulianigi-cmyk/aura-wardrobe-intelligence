import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAiJson } from "./ai-json";
import { resolveProductImageUrl } from "./import-url.functions";
import { analyzeWardrobeImageCore } from "./ai-analyze.functions";
import { closestOwnedPiece, comparablePieces, ownedPieceLabel, ownedText, similarOwnedPiece } from "./purchase-similarity";
import { detailsIn } from "./garment-details";
import { alternativeGroups, compareRanking, positiveFeatures } from "./compare-alternatives";
import { alreadyOwnedPieces, loadWardrobeFeedback, notSimilarItemIds, productKey } from "./wardrobe-feedback";
import { ownedEquivalent } from "./gap-ownership";

/** itemId of a "duplicate" that comes from the person's own "Ce l'ho già", not from a wardrobe piece. */
export const SAID_OWNED_ID = "said-owned";
import { applyFashionSignals, fashionFacts, fashionPrompt, FashionSignalsSchema, type FashionSignals } from "./purchase-fashion";
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
        duplicate: { verdict: "certain" | "maybe"; itemId: string; label: string } | null;
        similarItemsCount: number;
        pairsWithCount: number;
        wardrobeGap: boolean;
        differsFrom: { label: string; differences: string[] } | null;
      };
      fashion: FashionSignals | null;
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
  | { ok: true; product: PurchaseProduct; wardrobe: WardrobeItem[]; duplicate: { verdict: "certain" | "maybe"; itemId: string; label: string } | null; similarItemsCount: number; comparableLabels: string[]; pairsWithCount: number; wardrobeGap: boolean; fashion: FashionSignals | null; differsFrom: { label: string; differences: string[] } | null; novelDetails: string[] }
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

  // Only pieces of the same kind count (purchase-similarity.ts): a Cartier ring used to be "too
  // similar" to the Cartier watches owned — same category, brand and a colour in common.
  // The product's own words (name, retailer description, tags) reveal details like "slingback" or
  // "vernice" that make it a different piece from an owned one of the same kind.
  const productText = [product.title, product.description, ...(product.styleTags ?? []), product.material].filter(Boolean).join(" ");
  const shape = { ...product, text: productText };
  // The person's corrections (wardrobe-feedback.ts): pieces they said are NOT similar to this very
  // product are left out of the comparison; a kind of piece they said they already own counts as owned.
  const feedback = await loadWardrobeFeedback(supabase, userId);
  const excluded = notSimilarItemIds(feedback, productKey(product));
  const comparableWardrobe = excluded.size ? wardrobe.filter((it) => !excluded.has(it.id)) : wardrobe;
  const dup = similarOwnedPiece(shape, comparableWardrobe);
  const saidOwned = product.category
    ? ownedEquivalent({ category: product.category, subcategory: product.subcategory ?? "", colors: product.colors }, alreadyOwnedPieces(feedback))
    : null;
  const duplicate = dup
    ? { verdict: dup.verdict, itemId: dup.itemId, label: dup.label }
    : saidOwned ? { verdict: "maybe" as const, itemId: SAID_OWNED_ID, label: "a piece of this kind and colour the person told AURA they already own" } : null;
  const closest = closestOwnedPiece(shape, comparableWardrobe);
  const differsFrom = closest && closest.differences.length ? { label: closest.label, differences: closest.differences } : null;
  // Details of this product that NO owned piece of the same category has (e.g. a slingback when
  // no slingback is owned) — what it would genuinely add (compare-alternatives.ts).
  const ownedDetails = new Set(wardrobe.filter((it) => it.category === product.category).flatMap((it) => [...detailsIn(ownedText(it))]));
  const novelDetails = [...detailsIn([product.subcategory, productText].filter(Boolean).join(" "))].filter((d) => !ownedDetails.has(d));
  const comparable = comparablePieces(product, comparableWardrobe);
  const similarItemsCount = comparable.length;
  const comparableLabels = comparable.slice(0, 2).map(ownedPieceLabel);

  // "Does this fill a real gap?" — same spirit as the wardrobe-gap
  // suggestion: zero comparable pieces owned reads as a genuine gap;
  // several near-identical pieces already owned does not, regardless
  // of how nice the new one looks.
  const wardrobeGap = product.category ? similarItemsCount === 0 && !saidOwned : false;

  const pairsWithCount = product.category ? countPairings(product.category, product.colors, wardrobe) : 0;

  // Fashion value (iconic, timeless, on trend, status, versatility) from the model's general
  // knowledge — only when there is something to judge it by; never blocks the advice if it fails.
  let fashion: FashionSignals | null = null;
  if (product.category && (product.brand || product.title)) {
    try {
      const r = await generateText({ model, prompt: fashionPrompt(product), abortSignal: AbortSignal.timeout(15_000) });
      fashion = parseAiJson(r.text, FashionSignalsSchema);
    } catch (e) {
      console.error("[AURA purchase-advisor] fashion signals failed, continuing without", e instanceof Error ? e.message : String(e));
    }
  }

  return { ok: true, product, wardrobe, duplicate, similarItemsCount, comparableLabels, pairsWithCount, wardrobeGap, fashion, differsFrom, novelDetails };
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
    const { product, wardrobe, duplicate, similarItemsCount, comparableLabels, pairsWithCount, wardrobeGap, fashion, differsFrom } = resolved;

    // ---- 3. Dress preferences — hard rule, same as the outfit engine ----
    const dressPrefs = profile?.dress_preferences ?? null;
    const dressViolation = hasAnyPreference(dressPrefs) && product.category
      ? !isItemAllowedByDressPreferences(
          { category: product.category, subcategory: product.subcategory, length: product.length, sleeveLength: product.sleeveLength, fit: product.fit, styleTags: product.styleTags },
          dressPrefs,
        )
      : false;

    // ---- 4. Deterministic verdict — the AI never decides this part ----
    const { verdict, confidence } = applyFashionSignals(
      computeVerdict({
        dressViolation, hasCategory: !!product.category, duplicate, pairsWithCount, wardrobeGap,
        wardrobeSize: wardrobe.length, isLabelOnly: data.source === "label",
      }),
      fashion,
      { dressViolation, duplicate, pairsWithCount, wardrobeGap },
    );

    const base = {
      product: { title: product.title, brand: product.brand, price: product.price, currency: product.currency, imageUrl: product.imageUrl, sourceUrl: product.sourceUrl },
      // description isn't part of the returned shape — reasoning-only
      // input, not something the UI needs to render separately.
      analysis: { category: product.category, subcategory: product.subcategory, colors: product.colors, material: product.material },
      wardrobe: { duplicate, similarItemsCount, pairsWithCount, wardrobeGap, differsFrom },
      fashion,
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
      "Grammar matters: use the correct grammatical gender and article for every product noun in the target language — e.g. in Italian \"i sandali\" (masculine plural, never \"le sandali\"), \"le décolleté\" / \"le pumps\" (feminine), \"gli stivaletti\", \"le sneakers\", \"la borsa\", \"il blazer\". Agree adjectives and past participles accordingly.",
      `Respond in ${langName}.`,
      "Keep it under 280 characters — that's the hard limit this app enforces, so a longer reason gets cut off mid-sentence rather than shown in full. Say less, not more, if there isn't room to finish a thought.",
      `The decided verdict is ${verdict.toUpperCase()}. ${verdictShape}`,
      "Facts:",
      `- Product: ${product.category ?? "unknown category"}${product.subcategory ? " / " + product.subcategory : ""}, colors: ${product.colors.join(", ") || "unclear"}, brand: ${product.brand || "unknown"}, price: ${product.price ?? "unknown"}.`,
      ...(product.description ? [`- Product's own description (from the retailer's page, use for fabric/fit/styling detail in your reason, but never to override the facts above): "${product.description}"`] : []),
      duplicate?.verdict === "certain"
        ? `- Near-duplicate of an owned piece: ${duplicate.label}. Name it when you mention it.`
        : duplicate?.verdict === "maybe"
        ? `- Similar to an owned piece (not a certain duplicate): ${duplicate.label}. Name it when you mention it.`
        : "- Nothing similar already owned. Do NOT say or imply it resembles something owned.",
      `- Would pair with about ${pairsWithCount} piece(s) already owned.`,
      wardrobeGap
        ? "- Fills a real gap: nothing of this kind owned yet."
        : `- Not a gap: pieces of the same kind already owned, e.g. ${comparableLabels.join("; ")}. They are the same kind of piece, not necessarily similar — only call it similar if the line above says so.`,
      differsFrom ? `- Compared with the owned ${differsFrom.label}, this one is different: ${differsFrom.differences.join(", ")} (it is not the same shoe/bag/piece — say how it differs and what it adds, e.g. more evening, a different look).` : "",
      ...fashionFacts(fashion),
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
  similarToLabel: z.string().nullable().optional(),
  comparableLabels: z.array(z.string()).optional(),
  differsFrom: z.object({ label: z.string(), differences: z.array(z.string()) }).nullable().optional(),
  fashion: FashionSignalsSchema.nullable().optional(),
  novelDetails: z.array(z.string()).optional(),
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
  wardrobe: { duplicate: boolean; similarTo: string | null; differsFrom: { label: string; differences: string[] } | null; pairsWithCount: number; wardrobeGap: boolean; dressPreferenceViolation: boolean };
  fashion: FashionSignals | null;
  /** Pieces of this comparison that do the same job: buy one or the other (compare-alternatives.ts). */
  alternative: { preferred: boolean; withNames: string[] } | null;
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

/** Higher = more desirable. The first key of the comparison order (compareRanking): the softer
 *  signals never cross it — see the module comment above. */
function desirabilityTier(violation: boolean, duplicate: boolean, verdict: "buy" | "maybe" | "skip"): number {
  if (violation) return 0;
  if (duplicate) return 1;
  return { skip: 2, maybe: 3, buy: 4 }[verdict];
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
            duplicate: item.duplicateVerdict === "new" ? null : { verdict: item.duplicateVerdict, itemId: "", label: item.similarToLabel ?? "" },
            similarItemsCount: 0,
            comparableLabels: item.comparableLabels ?? [],
            fashion: item.fashion ?? null,
            differsFrom: item.differsFrom ?? null,
            novelDetails: item.novelDetails ?? [],
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
      applyFashionSignals(
        computeVerdict({
          dressViolation: violations[i], hasCategory: !!r.product.category, duplicate: r.duplicate,
          pairsWithCount: r.pairsWithCount, wardrobeGap: r.wardrobeGap, wardrobeSize: r.wardrobe.length,
          isLabelOnly: isLabelOnly[i],
        }),
        r.fashion,
        { dressViolation: violations[i], duplicate: r.duplicate, pairsWithCount: r.pairsWithCount, wardrobeGap: r.wardrobeGap },
      ),
    );

    // Pieces of this comparison that do the same job (same kind, same colour) replace each other:
    // only the one that adds the most to the wardrobe stays a "buy", the others become "one or the
    // other" (compare-alternatives.ts) — e.g. a black patent slingback preferred over a black patent
    // pump when a black pump is already owned and no slingback is.
    const groups = alternativeGroups(resolved.map((r) => ({
      category: r.product.category, subcategory: r.product.subcategory, colors: r.product.colors,
      novelDetails: r.novelDetails, wardrobeGap: r.wardrobeGap, differences: r.differsFrom?.differences ?? [],
      duplicate: r.duplicate?.verdict === "certain", pairsWithCount: r.pairsWithCount,
    })));
    const shortName = (i: number) => [resolved[i].product.brand, resolved[i].product.title].filter(Boolean).join(" ").slice(0, 60) || "—";
    const alternativeOf = new Map<number, { preferred: boolean; withNames: string[] }>();
    for (const g of groups) {
      alternativeOf.set(g.preferred, { preferred: true, withNames: g.others.map(shortName) });
      for (const o of g.others) {
        alternativeOf.set(o, { preferred: false, withNames: [shortName(g.preferred)] });
        if (verdicts[o].verdict === "buy") verdicts[o] = { verdict: "maybe", confidence: verdicts[o].confidence };
      }
    }

    const items: ComparedItem[] = resolved.map((r, i) => ({
      product: { title: r.product.title, brand: r.product.brand, price: r.product.price, currency: r.product.currency, imageUrl: r.product.imageUrl, sourceUrl: r.product.sourceUrl },
      alternative: alternativeOf.get(i) ?? null,
      verdict: verdicts[i].verdict,
      confidence: verdicts[i].confidence,
      wardrobe: { duplicate: r.duplicate?.verdict === "certain", similarTo: r.duplicate?.itemId === SAID_OWNED_ID ? SAID_OWNED_ID : r.duplicate?.label || null, differsFrom: r.differsFrom, pairsWithCount: r.pairsWithCount, wardrobeGap: r.wardrobeGap, dressPreferenceViolation: violations[i] },
      fashion: r.fashion,
      cacheKey: {
        source: "cached" as const,
        product: {
          title: r.product.title, brand: r.product.brand, price: r.product.price, currency: r.product.currency, imageUrl: r.product.imageUrl, sourceUrl: r.product.sourceUrl,
          category: r.product.category, subcategory: r.product.subcategory, colors: r.product.colors,
          length: r.product.length, sleeveLength: r.product.sleeveLength, fit: r.product.fit, styleTags: r.product.styleTags,
        },
        duplicateVerdict: r.duplicate?.verdict ?? "new",
        similarToLabel: r.duplicate?.label || null,
        comparableLabels: r.comparableLabels,
        differsFrom: r.differsFrom,
        fashion: r.fashion,
        novelDetails: r.novelDetails,
        pairsWithCount: r.pairsWithCount,
        wardrobeGap: r.wardrobeGap,
        isLabelOnly: isLabelOnly[i],
      },
    }));

    const tiers = items.map((it) => desirabilityTier(it.wardrobe.dressPreferenceViolation, it.wardrobe.duplicate, it.verdict));
    // The order is decided here, not by the model: tier first, then how much the piece has going for
    // it (positive features, a gap or nothing similar owned, what it adds) — compare-alternatives.ts.
    const rankingFacts = resolved.map((r) => ({
      category: r.product.category, subcategory: r.product.subcategory, colors: r.product.colors,
      novelDetails: r.novelDetails, wardrobeGap: r.wardrobeGap, differences: r.differsFrom?.differences ?? [],
      duplicate: r.duplicate?.verdict === "certain", pairsWithCount: r.pairsWithCount,
      fashion: r.fashion ?? null, similarOwned: !!r.duplicate,
    }));
    const ranking = compareRanking(rankingFacts, tiers, groups);

    const langName = LANGUAGE_NAMES[langCode] ?? "English";
    const letters = ["A", "B", "C", "D", "E", "F"];
    // The person never sees the letters — only the pieces themselves (their brand and model, in a
    // ranked list of their own numbering). Letters exist purely so the model can give its ranking
    // back in a form this code can parse; the reason text must name pieces by what they are.
    const nameOfItem = (i: number) =>
      [items[i].product.brand, items[i].product.title].filter(Boolean).join(" ").slice(0, 70) ||
      [resolved[i].product.subcategory, resolved[i].product.category].filter(Boolean).join(" ") || "this piece";
    const describeItem = (label: string, r: Extract<(typeof resolvedAll)[number], { ok: true }>, verdict: ComparedItem["verdict"], violation: boolean) => [
      `${label} ("${nameOfItem(letters.indexOf(label))}"): ${r.product.category ?? "unknown category"}${r.product.subcategory ? " / " + r.product.subcategory : ""}, colors: ${r.product.colors.join(", ") || "unclear"}, brand: ${r.product.brand || "unknown"}, price: ${r.product.price ?? "unknown"}. Individual verdict already decided: ${verdict.toUpperCase()}.`,
      r.duplicate?.verdict === "certain"
        ? `${label} is a near-duplicate of an owned piece${r.duplicate.label ? `: ${r.duplicate.label}` : ""} — name that piece if you mention it.`
        : r.duplicate?.verdict === "maybe"
        ? `${label} is similar to an owned piece${r.duplicate.label ? `: ${r.duplicate.label}` : ""} (not a certain duplicate) — name that piece if you mention it.`
        : `${label}: nothing similar already owned — do NOT say or imply it resembles something owned.`,
      `${label} would pair with about ${r.pairsWithCount} piece(s) already owned.`,
      r.wardrobeGap
        ? `${label} fills a real gap — nothing of this kind owned yet.`
        : `${label} is not a gap — pieces of the same kind already owned${r.comparableLabels.length ? ` (e.g. ${r.comparableLabels.join("; ")})` : ""}; same kind does not mean similar.`,
      r.differsFrom ? `${label} differs from the owned ${r.differsFrom.label}: ${r.differsFrom.differences.join(", ")} — a different piece, say what it adds.` : "",
      ...fashionFacts(r.fashion).map((line) => `${label}: ${line.replace(/^- /, "")}`),
      violation ? `${label} conflicts with a stated dress preference.` : "",
    ].filter(Boolean);

    const system = [
      "You are an elegant, knowledgeable personal stylist helping the person decide, among SEVERAL specific products they're considering, what order they'd be worth getting in — first choice, second choice, and so on, including honestly saying when one (or all) genuinely isn't worth buying at all. Each product's individual buy/maybe/skip verdict is already decided (given below) — you are NOT re-deciding those.",
      "Speak directly TO the person — \"il tuo guardaroba\", \"possiedi\", \"ti starebbe meglio\" (translated naturally into the target language) — never in the third person. Sound like a stylist giving a real, personal opinion, not a database printing out matched fields.",
      "NEVER mention the letters A, B, C… in your reason, not even in brackets like \"(C)\" or \"(A e B)\" — the person cannot see them and has no idea what they refer to. Name each piece by its brand and model instead (e.g. \"i sandali Rene Caovilla Cleo\", \"le Louboutin Iriza\"), or by a short natural description when several share a brand. The letters are only internal references.",
      "Your reason must reflect the full picture honestly: if every option is a SKIP, say plainly that none is really worth it, while still noting which would be the least bad if forced to pick. If several are a BUY, you can recommend more than one while still stating which comes first. Never imply a SKIP item is a good purchase just because it ranks above another SKIP.",
      "NEVER say or imply that YOU (the app) or the person already bought, chose, or picked any of these — this is advice about a decision not yet made.",
      "Grammar matters: use the correct grammatical gender and article for every product noun in the target language — e.g. in Italian \"i sandali\" (masculine plural, never \"le sandali\"), \"le décolleté\" / \"le pumps\" (feminine), \"gli stivaletti\", \"le sneakers\", \"la borsa\", \"il blazer\". Agree adjectives and past participles accordingly.",
      `Respond in ${langName}.`,
      "Keep it under 320 characters — a bit more room than the single-item advisor, since a real ranking across several pieces needs a little more space to state honestly.",
      `The ranking is ALREADY DECIDED, best first: ${ranking.map((i) => `${letters[i]} ("${nameOfItem(i)}")`).join(" > ")}. It follows the verdicts, then how much each piece has going for it — its positive features (iconic, timeless, status, on trend, versatile), whether it fills a gap or is unlike anything owned, and what new it adds. Explain THIS order (say which comes first and why, naming its strengths); never propose a different one.`,
      ...ranking.map((i) => `${letters[i]} positive features: ${positiveFeatures(rankingFacts[i].fashion)}; ${rankingFacts[i].wardrobeGap ? "fills a gap" : rankingFacts[i].similarOwned ? "something similar is owned" : "nothing similar owned"}.`),
      "",
      ...groups.map((g) => {
        const why = (i: number) => resolved[i].novelDetails.length
          ? `adds ${resolved[i].novelDetails.join(", ")}, which nothing in the wardrobe has`
          : resolved[i].wardrobeGap ? "fills a gap" : resolved[i].differsFrom ? `is a ${resolved[i].differsFrom!.differences.join("/")} variant of the owned ${resolved[i].differsFrom!.label}` : "is close to what is owned";
        return `ALTERNATIVES: ${[g.preferred, ...g.others].map((i) => letters[i]).join(", ")} do the same job (same kind and colour) — one replaces the other, so say clearly to buy ONE of them, not all. Prefer ${letters[g.preferred]} ("${shortName(g.preferred)}"): it ${why(g.preferred)}; ${g.others.map((o) => `${letters[o]} ("${shortName(o)}") ${why(o)}`).join("; ")}.`;
      }),
      "Facts:",
      ...items.flatMap((it, i) => describeItem(letters[i], resolved[i], it.verdict, violations[i])),
      "",
      "Respond with ONLY a single valid JSON object, no markdown fences:",
      '{"reason": ""}',
    ].filter(Boolean).join("\n");

    let reason: string;
    try {
      const r1 = await generateText({ model, system, messages: [{ role: "user", content: "Write the reason." }] });
      const parsed = parseAiJson(r1.text, z.object({ reason: z.string() }));
      // Safety net for the rule above: a stray "(C)" / "(A e B)" reference to the internal letters
      // means nothing to the person reading this, so it is removed rather than shown.
      const withoutLetterRefs = parsed.reason.replace(/\s*\((?:[A-F](?:\s*(?:,|e|and|y|et|&|\/)\s*[A-F])*)\)/g, "");
      reason = truncateAtBoundary(withoutLetterRefs, 340);
    } catch (e) {
      console.error("[AURA purchase-advisor] compare reason generation failed", e);
      reason = COULD_NOT_COMPARE[langCode] ?? COULD_NOT_COMPARE.en;
    }

    return { ok: true as const, items, ranking, reason };
  });
