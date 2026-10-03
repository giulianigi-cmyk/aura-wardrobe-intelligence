import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { ITEM_CATEGORIES, SUBCATEGORY_OPTIONS } from "./wardrobe-options";
import { COLOR_NAMES, COLOR_PALETTE } from "./color-palette";
import { parseAiJson } from "./ai-json";
import { ownedEquivalent } from "./gap-ownership";

const ItemSchema = z.object({
  id: z.string(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  colors: z.array(z.string()).nullable().optional(),
  style: z.array(z.string()).nullable().optional(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
});

// This engine had no language handling at all — every suggestion came out in English regardless
// of the app's own selected language, unlike purchase-advisor.functions.ts (same LANGUAGE_NAMES
// list) which already asks for it.
const LANGUAGE_NAMES: Record<string, string> = { it: "Italian", en: "English", es: "Spanish", fr: "French" };

// This one is shown to the person directly (not written by the model), so it needs its own fixed
// translation rather than a "Respond in X" instruction — same reasoning as purchase-advisor.
// functions.ts's FALLBACK_REASON, which this mirrors.
const NO_GAP_FOUND: Record<string, string> = {
  it: "Non ho trovato un vuoto evidente nel tuo guardaroba: sembra già piuttosto completo.",
  en: "Couldn't find a clear wardrobe gap that isn't already covered - the wardrobe looks fairly complete.",
  es: "No he encontrado un vacío claro en tu armario: parece bastante completo.",
  fr: "Je n'ai pas trouvé de manque évident dans votre garde-robe : elle semble déjà bien complète.",
};

const TOO_FEW_ITEMS: Record<string, string> = {
  it: "Aggiungi qualche altro capo al guardaroba prima che l'analisi dei vuoti abbia senso.",
  en: "Add a few more pieces to your wardrobe before gap analysis is meaningful.",
  es: "Añade algunas prendas más a tu armario antes de que el análisis de vacíos tenga sentido.",
  fr: "Ajoutez encore quelques pièces à votre garde-robe avant que l'analyse des manques ait du sens.",
};

const ANALYSIS_FAILED: Record<string, string> = {
  it: "L'analisi non è riuscita.",
  en: "Analysis failed.",
  es: "El análisis ha fallado.",
  fr: "L'analyse a échoué.",
};

const InputSchema = z.object({
  items: z.array(ItemSchema).min(1),
});

const OutputSchema = z.object({
  category: z.string(),
  subcategory: z.string(),
  colors: z.array(z.string()),
  // A natural, editorial-sounding name for the piece, in the app's own language — e.g. "Décolleté
  // nude", not a literal translation of category+subcategory ("Scarpe / Décolleté"). Separate from
  // "subcategory" on purpose: that field stays in AURA's fixed English vocabulary so the ownership
  // check can exact-match it against the wardrobe's own data; this is what the person actually
  // reads as the card's title.
  title: z.string(),
  reason: z.string(),
});

export type GapSuggestion = {
  category: string;
  subcategory: string;
  colors: string[];
  title: string;
  reason: string;
  pairsWithIds: string[];
};

type ChatMsg = { role: "user" | "assistant"; content: string };

// Neutral families pair with virtually everything in real styling - same
// principle already used elsewhere in AURA's color logic. A "Pure White"
// suggestion shouldn't only match other white pieces.
const NEUTRAL_FAMILIES = new Set(["Whites", "Blacks & Greys", "Beiges"]);
const colorFamily = (name: string): string | undefined =>
  COLOR_PALETTE.find((c) => c.name === name)?.family;
const isNeutralColor = (name: string): boolean => {
  const f = colorFamily(name);
  return f ? NEUTRAL_FAMILIES.has(f) : false;
};

// Which categories make sense to show as "would pair with" companions for
// a suggested piece. Deliberately a whitelist, not a blacklist: Underwear,
// Activewear and Swimwear are real wardrobe categories but never belong in
// an everyday outfit-pairing preview, regardless of color match.
const PAIRING_WHITELIST: Record<string, string[]> = {
  Tops: ["Bottoms", "Outerwear", "Shoes", "Bags", "Accessories"],
  Bottoms: ["Tops", "Outerwear", "Shoes", "Bags", "Accessories"],
  Dresses: ["Outerwear", "Shoes", "Bags", "Accessories"],
  Jumpsuits: ["Outerwear", "Shoes", "Bags", "Accessories"],
  Outerwear: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Shoes", "Bags"],
  Shoes: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Outerwear", "Bags"],
  Bags: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Outerwear", "Shoes"],
  Accessories: ["Tops", "Bottoms", "Dresses", "Jumpsuits", "Outerwear"],
  Underwear: [],
  Swimwear: ["Bags", "Accessories"],
  Activewear: ["Shoes", "Bags"],
};

const MAX_PAIRS = 12;
const MAX_ATTEMPTS = 3;

/**
 * Analyzes the user's real wardrobe and suggests ONE genuinely missing
 * piece - a category/subcategory/color combination that's absent or
 * under-represented given what they already own. This does NOT invent a
 * specific product, brand, or price (an LLM can't know what's actually
 * for sale) - it names a TYPE of piece with real reasoning. The list of
 * items it would pair with is computed HERE from the real wardrobe (not
 * asked of the model), so it references real, existing pieces - never a
 * fabricated count or fabricated items.
 *
 * Two hard, code-level guarantees (not just prompt instructions):
 * 1. The suggestion is checked against what's actually owned
 *    (category + subcategory + color) - if the model proposes something
 *    already owned, it's rejected and the model is asked again, up to
 *    MAX_ATTEMPTS times. If no genuine gap is found, we say so honestly
 *    instead of forcing a bad suggestion.
 * 2. "Would pair with" only pulls from categories that make sense as
 *    outfit companions (never Underwear/Activewear/Swimwear), ranked by
 *    real color-compatibility logic (neutrals pair with everything, same
 *    family scores well) instead of literal same-name color matching or
 *    an arbitrary fallback slice of the wardrobe.
 */
export const analyzeWardrobeGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profileRow } = await (context.supabase.from("profiles" as never) as any)
      .select("language").eq("id", context.userId).maybeSingle();
    const langCode = (profileRow as { language?: string | null } | null)?.language ?? "en";
    const langName = LANGUAGE_NAMES[langCode] ?? "English";

    if (data.items.length < 5) {
      return { ok: false as const, error: TOO_FEW_ITEMS[langCode] ?? TOO_FEW_ITEMS.en };
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    const catalog = data.items.map((it) => ({
      id: it.id,
      category: it.category ?? "",
      subcategory: it.subcategory ?? "",
      colors: it.colors ?? [],
      style: it.style ?? [],
      ...(it.brand ? { brand: it.brand } : {}),
      ...(it.model ? { model: it.model } : {}),
    }));

    // Ownership is checked in code after every suggestion (gap-ownership.ts): same category, a type
    // that does the same job (a shoulder bag is worn crossbody too) or no type on file, and a
    // colour that reads the same (Jet Black = Black). The old exact subcategory + colour-name
    // index missed a black YSL bag with no type on file and suggested a "black crossbody bag".

    const system = [
      "You are an elegant, knowledgeable personal stylist looking at this person's real wardrobe catalog to spot ONE genuinely missing piece — a category + subcategory + color combination that is absent or clearly under-represented, and that would meaningfully increase how many outfits they could put together.",
      "Speak directly TO the person in \"reason\" and \"title\" — never in the third person (\"la persona ha molti capi...\", \"l'utente possiede...\"). Never open by describing what they already have in general terms; go straight to the missing piece and its concrete value. No generic filler a stock listing could produce (\"aggiunge un tocco di stile\") unless tied to a specific reason drawn from the catalog.",
      `Respond in ${langName} for "title" and "reason" only — "category", "subcategory" and "colors" must stay in the exact fixed English vocabulary given below (the app matches them against the wardrobe's own data and displays them as-is).`,
      "\"title\": a short, natural, editorial name for the piece — e.g. \"Décolleté nude\" — written the way a stylist would say it out loud, NOT a literal word-for-word translation of the English category/subcategory/color (never \"Scarpe nude decollete\" as a mechanical concatenation).",
      "\"reason\": one concrete sentence following this shape — [che cosa aggiungerebbe al guardaroba] + [per quali occasioni/outfit sarebbe utile] — grounded in what's actually missing from the catalog. Calibration example (Italian, for tone and structure only — write naturally in the target language above, never a word-for-word translation of this exact sentence): \"Un paio di décolleté nude aggiungerebbe eleganza e versatilità al tuo guardaroba, completando facilmente outfit formali e semi-formali.\"",
      `Category must be EXACTLY one of: ${ITEM_CATEGORIES.join(", ")}.`,
      // Free text here used to be the reason a real gap could go undetected: the wardrobe's own
      // items are tagged with one of these fixed subcategories, but the model could write anything
      // ("a standard pair of boots") — text that never exact-matches "Knee Boots"/"Over-the-Knee
      // Boots" the person already owns, so the ownership check below silently let the redundant
      // suggestion through. Constrained to the same fixed vocabulary the wardrobe itself uses, so
      // the check can actually catch it.
      `Subcategory must be EXACTLY one value from the list for the chosen category, verbatim: ${JSON.stringify(SUBCATEGORY_OPTIONS)}.`,
      `Colors: 1-2 items picked EXACTLY from this fixed palette (verbatim): ${COLOR_NAMES.join(", ")}.`,
      "Do not invent a brand, product name, or price - you have no way of knowing what's for sale.",
      "Base the suggestion strictly on real gaps in the provided catalog (e.g. many tops and bottoms but no outerwear at all, or no neutral shoes to anchor bright pieces).",
      "CRITICAL: never suggest a category+subcategory+color the person already owns - check the catalog color by color, not just by category.",
      "A piece with an empty subcategory may be ANY type of that category (read its brand and model): never suggest a type and colour such a piece could already be. Many bags are worn in more than one way — a shoulder bag usually also has a crossbody strap, a top-handle 'Bandoulière' has a shoulder strap — so a crossbody bag is not missing when a shoulder bag of that colour is owned.",
      "",
      "Respond with ONLY a single valid JSON object, no markdown fences, no extra text, in exactly this shape:",
      '{"category": "", "subcategory": "", "colors": [], "title": "", "reason": ""}',
    ].join("\n");

    const userContent = `Wardrobe catalog (JSON):\n${JSON.stringify(catalog)}`;
    const messages: ChatMsg[] = [{ role: "user", content: userContent }];

    try {
      let accepted: z.infer<typeof OutputSchema> | null = null;
      let category = "";
      let subcategory = "";
      let colors: string[] = [];

      for (let attempt = 0; attempt < MAX_ATTEMPTS && !accepted; attempt++) {
        let text: string;
        try {
          text = (await generateText({ model, system, messages })).text;
        } catch (err) {
          console.error("[AURA wardrobe-gap] call failed", err);
          text = "";
        }

        let candidate: z.infer<typeof OutputSchema>;
        try {
          candidate = parseAiJson(text, OutputSchema);
        } catch {
          const r2 = await generateText({
            model,
            system,
            messages: [
              ...messages,
              { role: "assistant", content: text || "(no response)" },
              { role: "user", content: "That was not a single valid JSON object matching the required shape. Reply again with ONLY the JSON object, nothing else." },
            ],
          });
          candidate = parseAiJson(r2.text, OutputSchema);
        }

        const candCategory = ITEM_CATEGORIES.includes(candidate.category) ? candidate.category : ITEM_CATEGORIES[0];
        const validSubcats = SUBCATEGORY_OPTIONS[candCategory] ?? [];
        const candSubcategory = validSubcats.includes(candidate.subcategory) ? candidate.subcategory : (validSubcats[0] ?? candidate.subcategory);
        const candColors = candidate.colors.filter((c) => COLOR_NAMES.includes(c));
        const owner = ownedEquivalent({ category: candCategory, subcategory: candSubcategory, colors: candColors }, data.items);
        const alreadyOwned = !!owner;

        if (!alreadyOwned) {
          accepted = candidate;
          category = candCategory;
          subcategory = candSubcategory;
          colors = candColors;
          break;
        }

        messages.push({ role: "assistant", content: text });
        messages.push({
          role: "user",
          content: `That's already owned: the wardrobe already has ${[owner?.brand, owner?.model, owner?.subcategory || owner?.category, (owner?.colors ?? []).join("/")].filter(Boolean).join(" ")}, which covers ${candCategory} / ${candidate.subcategory} in ${candColors.join(", ")}. Pick a genuinely different, currently missing category+subcategory+color combination. Reply again with ONLY the JSON object.`,
        });
      }

      if (!accepted) {
        return { ok: false as const, error: NO_GAP_FOUND[langCode] ?? NO_GAP_FOUND.en };
      }

      // Dresses/Jumpsuits gia' coprono lo slot top+bottom - abbinarli a un
      // Top o Bottom suggerito (o viceversa) non si indossa mai davvero
      // insieme, indipendentemente dal colore. Stessa regola gia' usata
      // per la generazione outfit AI altrove in AURA. Gestita qui tramite
      // whitelist esplicita (mai categorie come Underwear/Activewear).
      const whitelist = new Set(PAIRING_WHITELIST[category] ?? []);
      const others = data.items.filter((it) => it.category && whitelist.has(it.category));

      // Color-aware ranking - reuses AURA's neutral-color logic instead of
      // a literal same-name match: neutrals pair with (almost) everything,
      // same color family scores well, everything else in a whitelisted
      // category is still eligible (real outfits mix colors) but ranks
      // lower. This replaces the old "same color, else random 12" fallback.
      //
      // Fixed a real bias here: neutral-on-neutral used to stack TWO
      // separate +2 bonuses (once for "the suggestion is neutral", once
      // for "this item is neutral") on top of each other, so whenever the
      // suggested piece was neutral - which is most of the time, since
      // that's the safe/versatile color an AI tends to suggest - every
      // neutral item in the wardrobe outscored everything else combined.
      // In practice that meant the "would pair with" preview was almost
      // always a wall of white/black/beige pieces regardless of what was
      // actually in the wardrobe. Neutral-on-neutral is still rewarded
      // (it's a genuinely strong pairing) but no longer double-stacked.
      const suggestedIsNeutral = colors.length === 0 || colors.every(isNeutralColor);
      const suggestedFamilies = new Set(colors.map(colorFamily).filter((f): f is string => !!f));

      const scored = others.map((it) => {
        const itColors = it.colors ?? [];
        const itemIsNeutral = itColors.some(isNeutralColor);
        let score = 0;
        if (itColors.some((c) => colors.includes(c))) score += 3; // exact color match
        if (suggestedIsNeutral && itemIsNeutral) score += 2; // both neutral: strong pairing, counted once
        else if (suggestedIsNeutral || itemIsNeutral) score += 1; // only one side neutral: still helps, less aggressively
        if (itColors.some((c) => suggestedFamilies.has(colorFamily(c) ?? ""))) score += 1; // same family
        return { it, score };
      });

      // Diversity, not just a global top-N by score: several items in
      // the same category (e.g. four pairs of light trousers) can easily
      // tie for the top score, and showing all four told the person
      // nothing new about their wardrobe. Round-robin across categories
      // instead - best-scoring item from each eligible category first,
      // then second-best from each, and so on - so the preview actually
      // reflects the breadth of what they own.
      const byCategory = new Map<string, typeof scored>();
      for (const s of scored) {
        const cat = s.it.category ?? "";
        const arr = byCategory.get(cat) ?? [];
        arr.push(s);
        byCategory.set(cat, arr);
      }
      for (const arr of byCategory.values()) arr.sort((a, b) => b.score - a.score);
      const categoryOrder = [...byCategory.keys()].sort(
        (a, b) => (byCategory.get(b)![0]?.score ?? 0) - (byCategory.get(a)![0]?.score ?? 0)
      );
      const pairsWithIds: string[] = [];
      for (let round = 0; pairsWithIds.length < MAX_PAIRS; round++) {
        let addedThisRound = false;
        for (const cat of categoryOrder) {
          const arr = byCategory.get(cat)!;
          if (arr[round]) {
            pairsWithIds.push(arr[round].it.id);
            addedThisRound = true;
            if (pairsWithIds.length >= MAX_PAIRS) break;
          }
        }
        if (!addedThisRound) break;
      }

      const suggestion: GapSuggestion = {
        category,
        subcategory,
        colors,
        title: accepted.title,
        reason: accepted.reason,
        pairsWithIds,
      };
      return { ok: true as const, suggestion };
    } catch (err) {
      console.error("[AURA wardrobe-gap] failed", err);
      return { ok: false as const, error: err instanceof Error ? err.message : (ANALYSIS_FAILED[langCode] ?? ANALYSIS_FAILED.en) };
    }
  });
