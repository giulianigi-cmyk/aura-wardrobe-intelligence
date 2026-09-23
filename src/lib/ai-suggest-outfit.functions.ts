import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { parseAiJson } from "./ai-json";
import { isItemAtAnyLocation } from "./wardrobe-location";
import { isItemAllowedByDressPreferences, hasAnyPreference, coversShoulders, coversArms, coversLegs, type DressPreferences } from "./dress-preferences";
import { anyItemViolatesWeather, violatesSleeveClimate, BLAZER_WARMTH_PROMPT_RULE } from "./outfit-weather-rules";
import { BELT_BODYCON_PROMPT_RULE, ACCESSORY_OCCASION_PROMPT_RULE, OPEN_LAYER_NEEDS_BASE_PROMPT_RULE, EMBELLISHED_EVENING_PROMPT_RULE, EMBELLISHED_SIGNAL, isEmbellishedPiece, allowsEmbellished, SPECIALIZED_OCCASION_TAGS, isBeachBag, isTechnicalFootwear, WORK_ACCESSORY_PROMPT_RULE, isSummerSeason } from "./outfit-styling-rules";
import { detectActivityKind } from "./activity-kind";
import { detectPlaceContext, isHardObligation, advisoryNoteFor, type DressRequirementType } from "./place-dress-code";

const ItemSchema = z.object({
  id: z.string(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  colors: z.array(z.string()).nullable().optional(),
  style: z.array(z.string()).nullable().optional(),
  season: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  material: z.array(z.string()).nullable().optional(),
  locationId: z.string().nullable().optional(),
  formality: z.number().nullable().optional(),
  dayEvening: z.string().nullable().optional(),
  sleeveLength: z.string().nullable().optional(),
  length: z.string().nullable().optional(),
  fit: z.string().nullable().optional(),
  heelHeight: z.string().nullable().optional(),
  toeShape: z.string().nullable().optional(),
  closure: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  styleTags: z.array(z.string()).nullable().optional(),
  // The piece's OWN occasion tags (from Wardrobe → edit → Occasion), as
  // opposed to params.occasion which is the TARGET occasion being
  // generated for. Previously never sent to this engine at all, so an
  // item tagged only "Travel" could freely surface in a Work outfit —
  // the AI had no way to know the tag existed.
  occasion: z.string().nullable().optional(),
  // Set while the item is out on loan (see wardrobe-loans.functions.ts).
  // A loaned item is physically not in the wardrobe right now, so it's
  // excluded before anything else runs — same hard-filter treatment as
  // location and dress preferences, not a prompt-level suggestion.
  activeLoanId: z.string().nullable().optional(),
});

const InputSchema = z.object({
  temperature: z.number().nullable().optional(),
  condition: z.string().nullable().optional(),
  occasion: z.string().nullable().optional(),
  dressRules: z.string().nullable().optional(),
  items: z.array(ItemSchema).min(1),
  avoidItemIds: z.array(z.string()).optional(),
  mustIncludeItemId: z.string().nullable().optional(),
});

const OutputSchema = z.object({
  item_ids: z.array(z.string()),
  explanation: z.string(),
});

export type SuggestOutfitItem = z.infer<typeof ItemSchema>;

export async function suggestOutfitCore(params: {
  supabase: any;
  userId: string;
  temperature: number | null;
  condition: string | null;
  occasion: string | null;
  dressRules: string | null;
  gender?: string | null;
  styleBoldness?: string | null;
  items: SuggestOutfitItem[];
  avoidItemIds?: string[];
  locationIdOverride?: string | null;
  // Optional — trip-capsule.server.ts passes this explicitly (it always
  // knows the real day/evening slot for a requirement, independent of
  // whatever the activity happens to be called). Falls back to reading
  // "evening" out of `occasion` text below for callers that don't have a
  // dedicated field yet (the on-demand/manual generator, where the
  // person picks "Evening" as one of the seven selectable occasions and
  // it lands directly in that string).
  daySegment?: "day" | "evening" | null;
  /**
   * Ids the caller has already ruled out for hard, non-negotiable reasons
   * (travel practicality, dress code) — as opposed to avoidItemIds, which
   * is a soft variety preference the relaxation logic above is free to
   * override when a category runs dry.
   *
   * This exists because the last-resort completion steps near the end of
   * this function (append a missing bag, swap in shoes) pick straight out
   * of `catalog`, bypassing every filter the caller applied upstream.
   * That's how a mini skirt or ankle boots kept reappearing on a train
   * outfit even after being correctly excluded from the candidate pool:
   * the pool was right, the safety net then reached around it.
   */
  hardExcludedItemIds?: string[];
  /**
   * Explicit multi-location selection (e.g. "use my main wardrobe AND
   * the beach house while I'm on this trip") — when provided, this
   * REPLACES the single active-location lookup entirely rather than
   * combining with it. An empty array is treated the same as omitting
   * it: no location restriction, everything eligible.
   */
  locationIdsOverride?: string[] | null;
  /**
   * Items of an outfit that already exists and is being ADAPTED (e.g. the
   * weather re-check). Soft constraint on purpose: the prompt asks to swap
   * only what the new weather makes wrong and keep the rest, but nothing
   * is hard-locked — a 22°C → 5°C swing must still be allowed to rebuild
   * the look rather than preserve summer pieces at any cost.
   */
  baseItemIds?: string[];
  /**
   * A single specific item that MUST appear in the result — used by the
   * "you haven't worn this in a while" flow in Insights.tsx to build a
   * fresh outfit around one forgotten piece, giving it a genuine chance
   * before suggesting it be sold or gifted. Deliberately distinct from
   * baseItemIds above: that one means "adapt this existing outfit,
   * keeping most of it"; this one means "design a new outfit from
   * scratch, but this one piece is non-negotiable."
   */
  mustIncludeItemId?: string | null;
  /**
   * A ready-made, deterministically-computed sentence about how this
   * segment's temperature compares to its trip-day counterpart (e.g.
   * "This evening is cooler than today's daytime..."). Computed by the
   * caller (trip-capsule.server.ts already has both tempMax and tempMin
   * for the same date) rather than re-derived here, and injected as a
   * proper system-prompt "Default:" rule — NOT appended to the occasion
   * string, which is a much weaker channel: everything else this
   * function reliably follows lives in the system prompt's own list of
   * Default rules, so this joins that list instead of being a novel,
   * easy-to-miss aside.
   */
  relativeWarmthHint?: string | null;

  /**
   * The actual calendar date this outfit is FOR, as YYYY-MM-DD — not the date the request is made.
   * Used only to gate season-locked pieces (a straw/beach bag, see isBeachBag) so a warm day doesn't
   * make one seasonally right on its own. Omit for an on-demand/"right now" request, where the
   * server's current date is exactly what's wanted; the weekly planner passes the specific day it's
   * building for instead, since that can be well into the future.
   */
  forDateIso?: string | null;
}): Promise<{ ok: true; item_ids: string[]; explanation: string } | { ok: false; error: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-2.5-flash");

  // A caller can explicitly choose which location(s) to build from for
  // this run, rather than always defaulting to whatever's currently
  // active — useful when generating outfits for a period spent
  // somewhere other than the active location, or across more than one
  // (a trip where both the main wardrobe and a second home are in
  // scope). locationIdsOverride (plural) takes priority when provided;
  // otherwise falls back to the single-location behavior this always
  // had.
  let activeLocations: { id: string; is_primary: boolean }[] = [];
  if (params.locationIdsOverride?.length) {
    const { data: locRows } = await (params.supabase.from("wardrobe_locations" as never) as any)
      .select("id, is_primary").in("id", params.locationIdsOverride).eq("user_id", params.userId);
    activeLocations = (locRows ?? []) as { id: string; is_primary: boolean }[];
  } else if (params.locationIdsOverride === undefined) {
    let locationId = params.locationIdOverride;
    if (locationId === undefined) {
      const { data: profileRow } = await (params.supabase.from("profiles" as never) as any)
        .select("active_location_id").eq("id", params.userId).maybeSingle();
      locationId = (profileRow as { active_location_id: string | null } | null)?.active_location_id ?? null;
    }
    if (locationId) {
      const { data: locRow } = await (params.supabase.from("wardrobe_locations" as never) as any)
        .select("id, is_primary").eq("id", locationId).eq("user_id", params.userId).maybeSingle();
      if (locRow) activeLocations = [locRow as { id: string; is_primary: boolean }];
    }
  }
  // locationIdsOverride === [] (explicitly empty) or === null both fall
  // through with activeLocations staying [], which isItemAtAnyLocation
  // already treats as "no restriction" — same as never scoping at all.
  let eligibleItems = params.items
    .filter((it) => !it.activeLoanId)
    .filter((it) =>
      isItemAtAnyLocation({ location_id: it.locationId ?? null }, activeLocations));

  // Hard filter, not just prompt text: SOLO le preferenze impostate per il
  // lavoro quando esistono (mai mischiate con quelle generali), altrimenti
  // le preferenze generali. Prima solo la chat applicava questo come
  // esclusione reale — gli altri motori (weekly, on-demand) lo passavano
  // solo come testo nel prompt, che il modello può ignorare in silenzio.
  const isWorkOccasionForPrefs = (params.occasion ?? "").toLowerCase().startsWith("work");
  const { data: prefsRow } = await (params.supabase.from("profiles" as never) as any)
    .select(isWorkOccasionForPrefs ? "dress_preferences, work_dress_preferences, work_dress_code" : "dress_preferences")
    .eq("id", params.userId).maybeSingle();
  const prefsRowTyped = prefsRow as { dress_preferences?: DressPreferences; work_dress_preferences?: DressPreferences; work_dress_code?: string | null } | null;
  const activeDressPrefs: DressPreferences | null =
    isWorkOccasionForPrefs && hasAnyPreference(prefsRowTyped?.work_dress_preferences)
      ? prefsRowTyped!.work_dress_preferences!
      : (prefsRowTyped?.dress_preferences ?? null);
  if (activeDressPrefs) {
    eligibleItems = eligibleItems.filter((it) => isItemAllowedByDressPreferences(it, activeDressPrefs));
  }

  // Work dress code (from Style Preferences) sets an acceptable formality
  // RANGE for a Work outfit, same mapping as the Outfit Engine spec
  // (Business Casual ~3, Business Formal ~4, etc). Only ever narrows the
  // catalog for a Work occasion, and only ever excludes items that HAVE
  // an explicit formality tag outside the range — an item with no
  // formality set yet (not all wardrobes are fully reanalyzed) is never
  // excluded on this basis, since that would be penalizing missing data
  // rather than an actual mismatch. "None" and "Uniform" apply no
  // constraint at all — a specified uniform makes formality irrelevant,
  // and "None" means the person hasn't set a floor/ceiling.
  const WORK_DRESS_CODE_FORMALITY_RANGE: Record<string, [number, number] | null> = {
    "None": null,
    "Casual": [1, 2],
    "Smart Casual": [2, 3],
    "Business Casual": [3, 4],
    "Business Formal": [4, 5],
    "Uniform": null,
  };
  if (isWorkOccasionForPrefs && prefsRowTyped?.work_dress_code) {
    const range = WORK_DRESS_CODE_FORMALITY_RANGE[prefsRowTyped.work_dress_code] ?? null;
    if (range) {
      const [min, max] = range;
      eligibleItems = eligibleItems.filter((it) => it.formality == null || (it.formality >= min && it.formality <= max));
    }
  }

  // Excluding items already used earlier in a multi-day batch is how
  // repeats get avoided across a generated week — done per category so a
  // shortage in one (e.g. only one or two bags owned) doesn't force
  // avoidance to relax for every other category too. A top only comes
  // back into rotation when tops specifically run out, not because bags
  // ran out first.
  if (params.avoidItemIds?.length) {
    const avoidSet = new Set(params.avoidItemIds);
    const byCategory = new Map<string, SuggestOutfitItem[]>();
    for (const it of eligibleItems) {
      const cat = it.category ?? "";
      const arr = byCategory.get(cat) ?? [];
      arr.push(it);
      byCategory.set(cat, arr);
    }
    const filtered: SuggestOutfitItem[] = [];
    for (const catItems of byCategory.values()) {
      const withoutRecent = catItems.filter((it) => !avoidSet.has(it.id));
      filtered.push(...(withoutRecent.length > 0 ? withoutRecent : catItems));
    }
    eligibleItems = filtered;
  }

  const wx = params.temperature != null
    ? `Weather: ${Math.round(params.temperature)}°C, ${params.condition ?? "unknown"}.`
    : "Weather: unknown.";
  const occ = params.occasion ? `Occasion: ${params.occasion}.` : "Occasion: everyday.";

  // Every field ItemSchema accepts must survive into this catalog — this
  // is the object every hard filter below actually reads via
  // catalog.find(...), NOT eligibleItems. A field silently dropped here
  // makes any check against it a permanent no-op even if the field is
  // received and even if a filter function already checks it (this is
  // exactly what happened to length and fit: the Work mini-skirt/dress
  // exclusion and the dress-preference length/fit checks were reading
  // catalog items that never actually carried those two fields).
  const catalog = eligibleItems.slice(0, 200).map((it) => ({
    id: it.id,
    category: it.category ?? "",
    subcategory: it.subcategory ?? "",
    colors: it.colors ?? [],
    style: it.style ?? [],
    season: it.season ?? "",
    brand: it.brand ?? "",
    material: it.material ?? [],
    formality: it.formality ?? null,
    dayEvening: it.dayEvening ?? "",
    sleeveLength: it.sleeveLength ?? "",
    length: it.length ?? "",
    fit: it.fit ?? "",
    heelHeight: it.heelHeight ?? "",
    toeShape: it.toeShape ?? "",
    closure: it.closure ?? "",
    gender: it.gender ?? "",
    styleTags: it.styleTags ?? [],
    occasion: it.occasion ?? "",
  }));

  const genderLine = params.gender === "Man"
    ? "This wardrobe belongs to a man: compose top + bottom (or a single one-piece garment) + shoes, and only add a bag if it genuinely fits the look — a bag is not a standard component for a men's outfit the way it is for women's. An accessory (belt, watch, scarf) is welcome when it adds something."
    : params.gender === "Woman"
    ? "This wardrobe belongs to a woman: a bag is a standard component of a complete outfit alongside top + bottom (or a dress) + shoes — include one whenever a suitable bag is available, plus an accessory when it adds something. Exception: never include a bag for a Sport occasion or a pool/beach/swim occasion — a handbag has no place at the gym or in the water."
    : null;

  const boldnessLine = params.styleBoldness === "Bold" || params.styleBoldness === "Creative"
    ? "This person likes to experiment: within every constraint above, lean into color and pattern — mixed prints, a strong color pairing, or a statement piece are welcome rather than defaulting to the safest neutral combination."
    : params.styleBoldness === "Classic"
    ? "This person prefers a classic wardrobe: favor neutral, coordinated colors and minimal pattern-mixing over bold color or print combinations, even when a bolder pairing would technically also work."
    : null;

  // Style Memory — learned from every ❤️/👎/💾 given anywhere in the app
  // (see outfit-feedback.functions.ts). This is the shared core every
  // "AI Suggest" call goes through (OutfitBuilder's button, Ask Your
  // Stylist's "more options"), so wiring it in here covers all of them
  // at once — previously none of them read it back at all. Same shared
  // module and occasion-scoped-beats-general priority already used by
  // Trip Capsule and the Home daily-looks engine.
  let styleMemorySection: string[] = [];
  try {
    const { buildStyleMemoryPromptSection } = await import("./style-memory-prompt");
    const occasionLabels = [...new Set([params.occasion, "Work", "Weekend", "Evening"].filter((x): x is string => Boolean(x)))];
    const { data: memoryRows } = await params.supabase
      .from("user_style_memory_active")
      .select("memory_type, value, context_axis, context_value, effective_confidence, evidence_count")
      .order("effective_confidence", { ascending: false })
      .limit(100);
    styleMemorySection = buildStyleMemoryPromptSection(memoryRows ?? [], occasionLabels);
  } catch (e) {
    // A person with no history yet, or a transient read error, sees
    // exactly the same suggestion quality as always — this only ever
    // adds a nudge on top, never something the outfit depends on.
    console.error("[AURA suggest-outfit] style memory read failed, continuing without it", e);
  }

  const system = [
    ...(params.dressRules ? [params.dressRules, ""] : []),
    "You are a personal stylist. Compose ONE coherent outfit from the user's wardrobe.",
    "Pick 3-5 items that work together (typically 1 top + 1 bottom OR 1 dress, + 1 shoes, optionally 1 outerwear and 1 accessory/bag).",
    ...(genderLine ? [genderLine] : []),
    "Match the weather and occasion. Prefer colors that harmonize and consistent style.",
    ...styleMemorySection,
    // The rules below this line are styling DEFAULTS, not absolute bans —
    // treat them as: strong preference → deviate when the outfit's own
    // context makes the combination clearly intentional (a monochrome-
    // adjacent look, a deliberate color-blocked statement, an eclectic
    // outfit the wardrobe's style tags support) → your final judgment
    // wins. A real outfit that reads as put-together always beats
    // mechanically satisfying every rule below.
    "Default: avoid combining black and navy/dark blue in the same outfit — two near-identical dark neutrals more often read as a mismatch than a choice. Deviate when one is clearly a small accent against the other as the dominant piece, or when nothing else in the eligible pieces avoids it.",
    "Default: keep the total color count to about 3-4 per outfit, counting accessories — neutrals (black, white, grey, beige, navy, brown, cream) are forgiving and don't count as strictly as a bold or saturated color does. Going over this isn't a hard stop, just a sign to double check the extra colors are earning their place rather than accumulating by accident.",
    "Default: when shoes and a bag are both part of the outfit, prefer their leather tone coordinating with EACH OTHER specifically — black shoes with a black/grey-toned bag, brown/cognac/tan shoes with a brown/tan/navy-toned bag. This is only about the two leather accessories relative to each other, not to the rest of the outfit — black shoes with a brown dress, sweater, or trousers is completely normal and not a deviation from anything. And even shoes-vs-bag mismatched tones (e.g. brown dress + black shoes + burgundy bag) can work when the overall palette reads as deliberately coordinated rather than accidental — this is a preference to weigh, not a requirement to enforce mechanically.",
    "Default: avoid two different bold patterns in the same outfit (leopard with stripes, floral with plaid). One dominant pattern plus one clearly secondary/small-scale pattern can work — e.g. a subtly striped shirt under a tartan blazer — when their scale and color contrast are deliberately different, not just two unrelated statements colliding.",
    "Default: avoid pairing a bold statement pattern (leopard, animal print, floral, plaid) with another loud, saturated, contrasting color elsewhere in the outfit. Once one piece is doing the visual work, lean the rest neutral or toward the pattern's own dominant color — unless the wardrobe's style tags for this person suggest they genuinely favor maximalist, high-contrast combinations, in which case a bolder pairing can be the right call.",
    "Default: denim-on-denim works when both pieces are the same wash/tone, or are deliberately very different (white denim with dark blue denim) — two similar-but-not-matching mid-blue denim pieces tend to clash rather than coordinate. When unsure and no clearly-matching or clearly-contrasting pair exists, use only one denim piece.",
    "Default: don't pair a short/mini-length skirt or dress with a deep/plunging neckline in the same outfit — treat the outfit's overall visual exposure as something to balance, not maximize on every axis at once. This is about overall balance, not a moral judgment, and it never overrides the dress-rules constraints stated earlier, which always take priority when they conflict.",
    "Default: an evening-specific piece (an evening gown, a cocktail dress, anything formality 5) belongs in an Evening segment, not Day — deviate only if the eligible pieces genuinely leave nothing better for that day.",
    "Default: keep formality roughly consistent across the outfit — an elegant, dressed-up piece paired with something at the opposite end (flip-flops with a tailored dress, gym sneakers with a cocktail dress) usually reads as unintentional. A deliberate contrast (like a smart top with clean minimal sneakers) can absolutely work when the rest of the outfit supports it as a coherent choice rather than an accident.",
    "Above ~25°C, prefer a top that hasn't already been worn earlier in this batch over one that has, even if it scores slightly lower on style — a fresh piece matters more in hot weather (sweat, hygiene) than in cooler seasons, where repeating a top once or twice is completely normal.",
    ...(params.relativeWarmthHint ? [`Default: ${params.relativeWarmthHint}`] : []),
    ...(boldnessLine ? [boldnessLine] : []),
    "NEVER pick more than one outerwear/layering piece in the same outfit — a blazer and a cardigan (or any two of blazer/cardigan/jacket/coat) are never worn together. Pick at most one.",
    "TEXT MUST MATCH THE ACTUAL ITEM, NOT YOUR INTENT: before writing the explanation, check the subcategory and colors of every item_id you're about to return, and describe each piece using its own real attributes — never call a sandal a 'décolleté'/'pumps' or describe a bag's color/pattern as something other than what it actually is. If nothing in the wardrobe matches what would be ideal, describe what you actually picked, not an idealized version of it.",
    "A Dress or Jumpsuit is a complete base on its own and REPLACES both top and bottom — NEVER combine a Dress or Jumpsuit with a separate Bottoms item (trousers, jeans, shorts, skirt) in the same outfit. If you pick a Dress or Jumpsuit, do not also pick anything from the Bottoms category.",
    "Weather overrides everything else for outerwear: above roughly 15°C, do not include a substantial coat (wool coat, trench, overcoat, puffer, quilted jacket) — it reads as overdressed for the actual weather regardless of how elegant the rest of the look is. Above roughly 26°C, also drop lighter layers — blazers, cardigans, jackets — a lightweight top alone is correct, even for a cocktail or formal occasion (there is always a lighter way to be elegant). Below roughly 10°C, prioritize real warmth over anything else. Only add outerwear when the temperature genuinely calls for it.",
    ...(params.temperature == null
      ? ["NEVER INVENT WEATHER DETAILS: the weather above is unknown — never state or imply a specific temperature or condition ('cool weather', 'possible rain') anywhere in your explanation. Speak only in general, season-appropriate terms if you mention weather at all, and never present an invented condition as the reason for a piece."]
      : ["PERCEIVED TEMPERATURE, NOT JUST THE NUMBER: treat the given temperature as a starting point and adjust which side of a threshold you land on based on the actual condition given alongside it — clear/sunny feels a notch warmer (lean lighter at a threshold), rain/wind/overcast feels a notch colder (lean warmer/more covered, and rain specifically means covered shoes and a real outer layer even at a temperature that wouldn't otherwise call for one). Never invent a perceived-temperature number — this only shifts which real option you pick at the boundary."]),
    // The occasion string carries the real activity name (e.g. "Yoga at
    // sunset (Sport)"), not just a dress-code label, so these rules can
    // key off what the day actually is.
    "If the occasion mentions a pool, swimming, the beach or the sea (pool, piscina, swim, beach, spiaggia, mare, snorkeling): the outfit MUST be built around a Swimwear item — a one-piece swimsuit, or a bikini top AND bikini bottom together — instead of the usual top + bottom. Add a cover-up, a light top/shorts or a dress only as a layer over it, plus sandals/flats and sunglasses if available — never a bag. Never return a city outfit for a swim occasion, and never pair a bikini top with trousers or a skirt.",
    "If the occasion is Sport or mentions yoga, gym, running, hiking, training, pilates, tennis or cycling: the outfit MUST be built from Activewear pieces (sports bra / training top + leggings, bike shorts or running shorts) with sneakers or the appropriate sport shoe. Exclude denim, tailoring, dresses, heels and anything delicate, and honour the specific activity named — hiking wants covered, sturdy shoes, yoga wants soft stretch pieces.",
    "If the occasion is Travel (a flight, a transfer, a long drive): prioritise comfort and layers — soft, non-restrictive pieces, closed comfortable shoes (sneakers or flats, no heels), and one light layer that can go on and off.",
    ...(() => {
      const pc = detectPlaceContext(params.occasion);
      if (!pc || !isHardObligation(pc.obligation)) return [];
      const bits: string[] = [];
      if (pc.requirements.some((r) => r === "cover_shoulders" || r === "cover_arms")) bits.push("cover the shoulders/arms (no off-shoulder, halter, strapless, bandeau or sleeveless construction)");
      if (pc.requirements.some((r) => r === "cover_knees" || r === "cover_legs")) bits.push("no mini-length skirt or dress");
      if (pc.requirements.includes("no_shorts")) bits.push("no shorts");
      if (pc.requirements.includes("avoid_tight")) bits.push("avoid a tightly fitted piece");
      if (pc.requirements.some((r) => r === "business_formal" || r === "formal_attire" || r === "cocktail" || r === "black_tie")) bits.push(`overall formality at least ${pc.minFormality ?? 4}/5`);
      return bits.length
        ? [`If the occasion is a visit to this kind of place (${pc.category.replace(/_/g, " ")}): ${bits.join("; ")} — this is the venue's own access/etiquette requirement, not a statement about the traveler, and applies regardless of any separate cultural preference.`]
        : [];
    })(),
    BLAZER_WARMTH_PROMPT_RULE,
    BELT_BODYCON_PROMPT_RULE,
    ACCESSORY_OCCASION_PROMPT_RULE,
    OPEN_LAYER_NEEDS_BASE_PROMPT_RULE,
    ...(detectActivityKind({ label: params.occasion, dressCode: null, minFormality: null }) === "concert"
      ? ["If the occasion is a concert, festival, DJ set or club night: NEVER include heels (pumps, stilettos, high sandals) — this is a physically demanding activity (hours standing, dancing, often outdoors), not an elegant sit-down evening. Sneakers, flat boots, or a low ankle boot are the right footwear; an ankle boot is fine in cool weather but should be avoided if it's genuinely hot instead. Build the rest of the outfit for a stylish-but-comfortable going-out look, not a black-tie dinner."]
      : []),
    ...(detectActivityKind({ label: params.occasion, dressCode: null, minFormality: null }) === "business_dinner"
      ? ["If the occasion is a work/business dinner (a client dinner, a work colleagues' dinner, cena di lavoro): favor understated, professional colors (black, navy, grey, white, camel, burgundy) over bright or flashy ones, avoid very short hemlines (mini-length) and anything overtly party-coded (sequins, sheer fabric, a deeply plunging neckline) — this should read polished and professional, not going-out, even though it's still a dinner."]
      : []),
    "For a 'Work' occasion specifically, exclude anything sequinned, sparkly, feathered, fringed, or overtly evening/party-coded (check the material and styleTags fields), exclude cocktail or evening dresses, and exclude very short skirts (mini-length). Separately, exclude genuinely bare-shoulder construction — off-shoulder, bardot, halter, strapless, one-shoulder, bandeau (check subcategory and styleTags for these terms) — but a plain sleeveless top or dress (sleeveLength: Sleeveless, no other bare-shoulder signal) is completely normal workwear and must NOT be excluded just for having no sleeves; judge it on formality/coverage like any other piece. Also treat dayEvening \"evening\" or formality 4-5 as a strong signal the piece belongs in an Evening look, not Work — these read as going-out wear, not workwear, even if the color looks fine on paper.",
    "Color palette by occasion, when choosing between otherwise-equal options: 'Formal'/'Business Formal' favors navy, grey, black, black-and-white; 'Work'/'Business Casual' favors khaki, light grey, navy, brown as a base with bordeaux, olive, camel, or light blue as accents; 'Smart Casual'/'Weekend' allows one clearly colorful statement piece against a simple base. This is a preference between similarly-fitting options, not a hard exclusion — don't reject an otherwise great outfit purely for using an off-palette color.",
    "Sequins, sparkle, or lurex/metallic fabric are for evening only — never pick a sequinned or sparkly piece for a Day segment, regardless of occasion, even outside a Work context specifically.",
    EMBELLISHED_EVENING_PROMPT_RULE,
    WORK_ACCESSORY_PROMPT_RULE,
    "Use each item's subcategory when present to judge fit-for-purpose: e.g. in hot weather prefer sandals/flats over boots; in rain or cold prefer boots over sandals; for formal occasions prefer pumps/heels over sneakers. When subcategory is empty, judge from category alone.",
    "A 'Running Shoes' subcategory item is built for running, not for everyday city walking — never pick it for a non-Sport occasion unless it is the only shoe available in the catalog. For a Sport/gym/running occasion specifically, it's the right choice.",
    "A gilet or waistcoat (vest) is never worn directly against skin with nothing underneath — always pair it with a shirt, t-shirt, or top layered beneath it. A tailored suit waistcoat additionally expects a blazer/jacket over it for a complete formal look, not worn as the outermost layer on its own.",
       "A belt is a genuine styling option, not just a functional afterthought — actively consider one from Accessories when the outfit has a waist to define (high-rise trousers/jeans/skirt with a tucked or cropped top, a Relaxed/Oversized-fit dress or jumpsuit with no built-in waist definition) and the wardrobe has one whose color/formality fits (leather belt with tailoring, a slimmer or woven belt for casual). Skip it when the piece is already fitted at the waist (Slim/Tailored fit) or is a Wrap style — an extra belt there is redundant, not additive.",
    "LAYERING TECHNIQUES — two specific combinations to actively consider, not just default to a single top: (1) a denim shirt or jacket worn OPEN, unbuttoned, over a well-fitted tank top or t-shirt underneath (the layer underneath must be 'Slim'/'Tailored'/'Regular' fit — never Oversized or Cropped, which reads sloppy layered this way); (2) a lace bra or bralette worn deliberately visible under a semi-sheer/sheer shirt or sweater, or under an open blazer, or peeking from a low/plunging neckline top or dress — for occasions where that reads as styled rather than accidental (evening, going-out, creative/bold contexts — never for a Work occasion, and never if it would violate a stated dress preference). Only propose either technique when the wardrobe actually has pieces that fit it (right subcategory/fit/material) — never force a layering trick onto pieces it doesn't suit.",
    "Return ONLY item ids that exist in the provided catalog. Never invent ids.",
    ...(params.baseItemIds?.length
      ? [
          `This person already planned an outfit made of these items: ${JSON.stringify(params.baseItemIds)}. The weather changed. ADAPT that outfit: keep every piece that still works and replace ONLY the pieces the new weather makes unsuitable, staying on the same occasion, formality and style. Do not redesign the look from scratch. If the temperature change is so large that most pieces no longer make sense, you may rebuild more of it — but always keep as much of the original outfit as the new weather allows.`,
        ]
      : []),
    ...(params.mustIncludeItemId
      ? [
          `MANDATORY ITEM: item id "${params.mustIncludeItemId}" MUST be included in item_ids — this is not optional and not subject to the usual fit/formality/color reasoning above being used to exclude it. Instead, use that reasoning to build the strongest possible outfit AROUND it: choose every other piece specifically to complement this one's category, color, formality and style. If this piece is, on its own, a poor match for the requested occasion or weather, still include it and do your best to make the overall look work as well as it can — never drop it and never substitute a different piece in its place.`,
        ]
      : []),
    "Explanation: 1-2 short sentences (max 200 chars) on why these pieces work.",
    "",
    "Respond with ONLY a single valid JSON object, no markdown fences, no extra text, in exactly this shape:",
    '{"item_ids": ["id1", "id2"], "explanation": "short reason"}',
  ].join("\n");

  const userContent = `${wx} ${occ}\nWardrobe:\n${JSON.stringify(catalog)}`;

  // Hard, code-level guardrails — mirrors the pattern in
  // suggest-daily-looks.functions.ts. The prompt above ALSO asks for all
  // of trusting the model got it right.
  const SLOT_LIMITS: Record<string, number> = {
    Tops: 1, Bottoms: 1, Dresses: 1, Jumpsuits: 1, Shoes: 1, Bags: 1, Outerwear: 1,
  };
  const hasSlotViolation = (ids: string[]): boolean => {
    const counts: Record<string, number> = {};
    for (const id of ids) {
      const cat = catalog.find((c) => c.id === id)?.category;
      if (!cat) continue;
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return Object.entries(SLOT_LIMITS).some(([cat, limit]) => (counts[cat] ?? 0) > limit);
  };
      const EVENING_SIGNAL = new RegExp(`embellish|strappy|feather|piuma|fringe|frange|tulle|${EMBELLISHED_SIGNAL.source}`, "i");
  // Sleeveless is NOT bare shoulders — a plain sleeveless tank/top is a
  // completely normal piece of workwear at the right formality. Bare
  // shoulders is specifically about garment construction that exposes
  // the shoulder itself (off-shoulder, bardot, halter, strapless,
  // one-shoulder, bandeau) — a different thing sleeve length alone
  // can't tell you (an off-shoulder top can have full-length sleeves).
  // No dedicated attribute exists for this in the schema, so this reads
  // the same signal the AI itself uses when tagging subcategory/style —
  // free text, not sleeveLength.
  const BARE_SHOULDER_SIGNAL = /off.?shoulder|bardot|halter|strapless|one.?shoulder|cold.?shoulder|bandeau|tube top/i;
  const violatesWorkRules = (ids: string[]): boolean =>
    ids.some((id) => {
      const item = catalog.find((c) => c.id === id);
      if (!item) return false;
      if ((item.dayEvening ?? "") === "evening" && (item.formality ?? 0) >= 4) return true;
      const text = `${item.subcategory ?? ""} ${(item.styleTags ?? []).join(" ")} ${(item.material ?? []).join(" ")}`;
      if (EVENING_SIGNAL.test(text)) return true;
      if (["Tops", "Dresses", "Jumpsuits"].includes(item.category ?? "") && BARE_SHOULDER_SIGNAL.test(text)) return true;
      // hiking / mountain boots are gear, not workwear
      if (isTechnicalFootwear(item)) return true;
      // shorts and mini skirts/dresses: the prompt asks for it, this makes sure
      if (item.category === "Bottoms" && /shorts/i.test(item.subcategory ?? "")) return true;
      const isSkirtOrDress = item.category === "Dresses" || (item.category === "Bottoms" && item.subcategory === "Skirt");
      if (isSkirtOrDress && (item.length ?? "") === "Mini") return true;
      return false;
    });

  // Beach / holiday bags (straw, raffia, wicker, basket) belong to Weekend, Travel, Resort or an everyday
  // summer look — never to Work, business, Evening or Formal.
  const BEACH_BAG_BLOCKED_OCCASION = /work|business|lavoro|office|ufficio|evening|sera|serata|cocktail|gala|wedding|matrimonio|black.?tie|formal|dinner|cena/i;
  const inSummer = isSummerSeason(params.forDateIso);
  const violatesBeachBag = (ids: string[]): boolean =>
    ids.some((id) => {
      const item = catalog.find((c) => c.id === id);
      if (!item || !isBeachBag(item)) return false;
      // Outside summer it's wrong for ANY occasion, warm day or not; inside summer the existing
      // occasion gate (never Work/business/evening) still applies.
      if (!inSummer) return true;
      return BEACH_BAG_BLOCKED_OCCASION.test(params.occasion ?? "") || params.daySegment === "evening";
    });

  // Weather is a hard constraint for EVERY occasion, not just Work — see
  // outfit-weather-rules.ts (unica fonte di verità, condivisa con Home).
  const violatesWeather = (ids: string[]): boolean => anyItemViolatesWeather(ids, catalog, params.temperature);

  const isWorkOccasion = (params.occasion ?? "").toLowerCase().startsWith("work");

  // Place-of-worship, embassy, formal-venue and similar venue requirements (place-dress-code.ts) —
  // detected from the occasion/location text, so this applies the same whether that text came from
  // a trip itinerary stop or a plain calendar event with no trip attached. Deliberately separate
  // from isWorkOccasion/violatesWorkRules above and from the person's own opt-in cultural-mode
  // preference: this is the VENUE's own requirement, on for every traveler, regardless of either.
  const placeContext = detectPlaceContext(params.occasion);
  const placeContextIsHard = placeContext != null && isHardObligation(placeContext.obligation);
  const placeRequirementSet = new Set<DressRequirementType>(placeContext?.requirements ?? []);
  // Reuses the same coverage checks dress-preferences.ts already defines for the person's own
  // stated preferences (cover_shoulders/cover_arms/cover_legs) — a venue's requirement and the
  // person's own configured one are checked against the exact same notion of "covered".
  const violatesPlaceRequirements = (ids: string[]): boolean =>
    placeContextIsHard && ids.some((id) => {
      const item = catalog.find((c) => c.id === id);
      if (!item) return false;
      if ((placeRequirementSet.has("cover_shoulders")) && !coversShoulders(item)) return true;
      if (placeRequirementSet.has("cover_arms") && ["Tops", "Dresses", "Outerwear", "Jumpsuits"].includes(item.category ?? "") && !coversArms(item)) return true;
      if (placeRequirementSet.has("no_shorts") && item.category === "Bottoms" && /shorts/i.test(item.subcategory ?? "")) return true;
      const isSkirtOrDress = item.category === "Dresses" || (item.category === "Bottoms" && item.subcategory === "Skirt");
      // cover_knees is the lighter requirement (Midi or Maxi is fine, just not Mini); cover_legs
      // is the stricter one (full coverage — coversLegs() only accepts Maxi/trousers-type pieces).
      if (placeRequirementSet.has("cover_knees") && isSkirtOrDress && (item.length ?? "") === "Mini") return true;
      if (placeRequirementSet.has("cover_legs") && !coversLegs(item)) return true;
      if (placeRequirementSet.has("avoid_tight") && item.fit === "Slim") return true;
      const needsFormality = placeRequirementSet.has("business_formal") ? placeContext!.minFormality ?? 4
        : placeRequirementSet.has("black_tie") ? 5
        : placeRequirementSet.has("cocktail") ? 4
        : placeRequirementSet.has("formal_attire") ? placeContext!.minFormality ?? 4
        : null;
      if (needsFormality != null && item.formality != null && item.formality < needsFormality) return true;
      return false;
    });

  // A bag is a mandatory component for a woman's outfit, not just a
  // prompt suggestion the model can skip — same principle as every other
  // hard rule here: the genderLine text above already asks for this, but
  // asking isn't enforcing. Never required for Sport/pool/beach, where a
  // handbag genuinely has no place, and never required when the wardrobe
  // simply has no eligible bag at all (nothing to enforce).
  const NO_BAG_OCCASION_SIGNAL = /sport|gym|yoga|running|hiking|training|pilates|tennis|cycling|pool|piscina|swim|beach|spiaggia|mare|snorkeling/i;
    const missingMandatoryBag = (ids: string[]): boolean => {
    if (params.gender !== "Woman") return false;
    // Only checks that a bag exists AT ALL — not that one already passes usableAddition. A wardrobe
    // whose only bags are tagged "Travel"/"Resort" still gets one for Work: pickBest below falls back
    // to its best available bag rather than silently going without (see pickBest's relaxed pool).
    // This used to require usableAddition here too, which meant a woman whose bags were all
    // situational-tagged got NO bag ever, in ANY look — the pool was empty, so nothing was "missing".
    if (!catalog.some((c) => c.category === "Bags")) return false;
    if (NO_BAG_OCCASION_SIGNAL.test(params.occasion ?? "")) return false;
    return !ids.some((id) => catalog.find((c) => c.id === id)?.category === "Bags");
  };

  // Running shoes are for actual Sport/gym/running occasions, never a
  // default "sneakers" pick elsewhere — universal, not just Work, since
  // the same wrong pick (e.g. running shoes for a concert/Everyday
  // outfit) can happen for any occasion type. Only enforced when a
  // non-running alternative genuinely exists in the wardrobe.
  const isSportOccasion = /sport|gym|yoga|running|hiking|training|pilates|tennis|cycling/i.test(params.occasion ?? "");
  const catalogHasNonRunningShoe = catalog.some((c) => c.category === "Shoes" && c.subcategory !== "Running Shoes");
  const violatesFootwearRule = (ids: string[]): boolean => {
    if (isSportOccasion) return false;
    if (!catalogHasNonRunningShoe) return false;
    return ids.some((id) => catalog.find((c) => c.id === id)?.subcategory === "Running Shoes");
  };

  // A piece the person has explicitly tagged as "Travel", "Sport" or
  // "Resort" only (via Wardrobe → edit → Occasion) is situational — it
  // shouldn't leak into a Work, Evening, or Formal look just because it
  // also happens to fit color/formality. Only fires when the item's
  // occasion tags are SET and specifically one of these situational tags
  // without also including the target occasion — an item with no occasion
  // tags at all, or one tagged broadly (e.g. "Everyday"), is never
  // excluded by this: most of a wardrobe isn't tagged per-occasion and
  // shouldn't be penalized for it.
  const targetOccasionBase = (params.occasion ?? "").split(/[·-]/)[0].trim();
  const violatesOccasionTag = (ids: string[]): boolean =>
    ids.some((id) => {
      const item = catalog.find((c) => c.id === id);
      if (!item?.occasion) return false;
      const tags = item.occasion.split(",").map((s) => s.trim()).filter(Boolean);
      const hasSpecialized = tags.some((tg) => SPECIALIZED_OCCASION_TAGS.includes(tg));
      if (!hasSpecialized) return false;
      return !tags.includes(targetOccasionBase);
    });

  // Not a hard style rule the way violatesWeather is — a long-sleeve top
  // isn't wrong at 21°C, just a worse pick than a short-sleeve one when
  // both sat in the same catalog. violatesSleeveClimate itself only
  // returns true when that better alternative existed and went unused,
  // so this never fires when a mismatched top is genuinely the only one
  // available — see its own comment for the reasoning (this is what
  // makes a day/evening sleeve contrast enforced rather than hoped for
  // from a prompt sentence).
  const violatesSleeve = (ids: string[]): boolean => violatesSleeveClimate(ids, catalog, params.temperature);

  // Sunglasses are a genuinely unconditional exclusion, not a soft
  // preference — nobody wears them after dark, so there's no fallback
  // case to protect the way violatesSleeve protects "it was the only
  // top available". isEvening checks the explicit param first, falling
  // back to the on-demand generator's occasion text (where "Evening" is
  // one of the seven literal occasion choices) for callers that don't
  // pass daySegment yet.
  const isEvening = params.daySegment === "evening" || (params.occasion ?? "").toLowerCase().includes("evening");
  // A cardigan (or any open-front layer) is worn OVER something, never as
  // the top itself — an outfit whose only upper-body piece is a cardigan
  // leaves the person with nothing underneath it. Deterministic check
  // rather than a prompt sentence, since this is a structural fact about
  // the garment, not a style preference the model should weigh.
  const violatesOpenLayerWithoutBase = (ids: string[]): boolean => {
    const upper = ids
      .map((id) => catalog.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c && (c.category === "Tops" || c.category === "Outerwear"));
    if (upper.length === 0) return false;
    const isOpenLayer = (c: (typeof upper)[number]) =>
      /cardigan|blazer|jacket|giacca|coat|cappotto|kimono|duster|gilet|waistcoat/i.test(`${c.subcategory ?? ""} ${c.style ?? ""}`);
    // A dress or jumpsuit already covers the torso — a cardigan over one
    // is complete, no separate top required.
    const hasDressBase = ids.some((id) => {
      const c = catalog.find((x) => x.id === id);
      return c?.category === "Dresses" || c?.category === "Jumpsuits";
    });
    if (hasDressBase) return false;
    return upper.every(isOpenLayer);
  };

  const violatesEveningSunglasses = (ids: string[]): boolean =>
    isEvening && ids.some((id) => catalog.find((c) => c.id === id)?.subcategory === "Sunglasses");

  // An embellished piece (crystals, Swarovski, rhinestones, diamonds, sequins — read from the Material
  // field) is an evening piece: only for an evening-type occasion or the evening segment of a day.
  const violatesEmbellished = (ids: string[]): boolean =>
    !allowsEmbellished(params.occasion, params.daySegment)
    && ids.some((id) => { const item = catalog.find((c) => c.id === id); return item ? isEmbellishedPiece(item) : false; });

  // Anything the last-resort completion steps may ADD to a look must pass every hard rule, exactly like
  // a piece the model picked itself. The bag/shoe fallbacks used to skip the occasion tag and the
  // beach/technical checks, which is how a Travel-only or straw bag ended up in a Work outfit.
  const hardExcluded = new Set(params.hardExcludedItemIds ?? []);
  const usableAddition = (c: { id: string }): boolean =>
    !hardExcluded.has(c.id)
    && !violatesWeather([c.id]) && !violatesEmbellished([c.id])
    && !violatesOccasionTag([c.id]) && !violatesBeachBag([c.id])
    && !(isWorkOccasion && violatesWorkRules([c.id])) && !violatesPlaceRequirements([c.id]);

  // STRUCTURE: an outfit is a top AND a bottom (or a dress/jumpsuit) — plus shoes, checked further down.
  // Nothing verified this before: when a hard rule stripped the trousers (or the model forgot them) the
  // look shipped as "a shirt, loafers and a bag". Not required for swim/sport, which use other categories.
  const structureRequired = !NO_BAG_OCCASION_SIGNAL.test(params.occasion ?? "");
  const catOfId = (id: string) => catalog.find((c) => c.id === id)?.category ?? "";
  const hasFullBody = (ids: string[]) => ids.some((id) => catOfId(id) === "Dresses" || catOfId(id) === "Jumpsuits");
  const missingLegs = (ids: string[]): boolean =>
    structureRequired && !hasFullBody(ids) && !ids.some((id) => catOfId(id) === "Bottoms")
    && catalog.some((c) => c.category === "Bottoms" && usableAddition(c));
  const missingTorso = (ids: string[]): boolean =>
    structureRequired && !hasFullBody(ids) && !ids.some((id) => catOfId(id) === "Tops")
    && catalog.some((c) => c.category === "Tops" && usableAddition(c));

  const isValidResult = (ids: string[]): boolean => {
    if (!ids.length) return false;
    if (hasSlotViolation(ids)) return false;
    if (violatesEmbellished(ids)) return false;
    if (violatesBeachBag(ids)) return false;
    if (missingLegs(ids) || missingTorso(ids)) return false;
    if (isWorkOccasion && violatesWorkRules(ids)) return false;
    if (violatesPlaceRequirements(ids)) return false;
    if (violatesWeather(ids)) return false;
    if (missingMandatoryBag(ids)) return false;
    if (violatesFootwearRule(ids)) return false;
    if (violatesOccasionTag(ids)) return false;
    if (violatesSleeve(ids)) return false;
    if (violatesEveningSunglasses(ids)) return false;
    if (violatesOpenLayerWithoutBase(ids)) return false;
    return true;
  };

  try {
    let text: string;
    try {
      const r1 = await generateText({
        model,
        system,
        messages: [{ role: "user", content: userContent }],
      });
      text = r1.text;
    } catch (err) {
      console.error("[AURA suggest-outfit] first call failed", err);
      text = "";
    }

    let parsed: z.infer<typeof OutputSchema>;
    try {
      parsed = parseAiJson(text, OutputSchema);
    } catch {
      const r2 = await generateText({
        model,
        system,
        messages: [
          { role: "user", content: userContent },
          { role: "assistant", content: text || "(no response)" },
          {
            role: "user",
            content: "That was not a single valid JSON object matching the required shape. Reply again with ONLY the JSON object, nothing else.",
          },
        ],
      });
      parsed = parseAiJson(r2.text, OutputSchema);
    }

    const validIds = new Set(catalog.map((c) => c.id));
    let item_ids = parsed.item_ids.filter((id) => validIds.has(id)).slice(0, 5);

    // If the first attempt breaks a hard rule (two tops, a bare-shoulder
    // piece for Work, etc.), ask once more instead of returning it —
    // mirrors the retry pattern used for daily looks.
    if (!isValidResult(item_ids)) {
      try {
        const retry = await generateText({
          model,
          system: system + "\n\nIMPORTANT — your previous answer broke a hard rule above (either more than one item in the same slot, an evening-coded/bare-shoulder piece for a Work occasion, an item excluded by the person's stated dress preferences, a piece unsuitable for the actual temperature — e.g. a wool/heavy piece when it's hot, or a bare/light piece when it's cold — a long-sleeve top when a short-sleeve one was available and it's mild-to-warm out, or the reverse when it's mild-to-cool — sunglasses in an evening look — or missing the mandatory bag for a women's outfit, or a beach/holiday bag or hiking boots in a Work/business/evening look, or a bare-shoulder/mini/shorts/too-fitted/underdressed piece for a place with its own access requirement (a place of worship, an embassy, a formal venue…), or an outfit without a bottom (trousers/skirt) or without a top). Try again, respecting every rule strictly this time.",
          messages: [{ role: "user", content: userContent }],
        });
        const retryParsed = parseAiJson(retry.text, OutputSchema);
        const retryIds = retryParsed.item_ids.filter((id) => validIds.has(id)).slice(0, 5);
        if (isValidResult(retryIds)) {
          item_ids = retryIds;
        } else if (hasSlotViolation(item_ids)) {
          // Neither attempt was clean and the original has a structural
          // slot conflict (e.g. two tops) — drop the lowest-priority
          // duplicate items rather than ship a visibly broken outfit.
          const seen = new Set<string>();
          item_ids = item_ids.filter((id) => {
            const cat = catalog.find((c) => c.id === id)?.category ?? "";
            const key = SLOT_LIMITS[cat] ? cat : id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        } else {
          // Not a slot conflict — a weather- or work-rule violation
          // (a wool piece in summer, a bare-shoulder top for Work, an
          // item outside the person's stated dress preferences). Strip
          // just the offending piece(s) rather than shipping a wrong
          // outfit — mirrors the "today" sanitize pattern in
          // suggest-daily-looks.functions.ts. Missing a shoe/top after
          // this is preferable to a materially wrong suggestion.
          item_ids = item_ids.filter((id) => {
            if (violatesWeather([id])) return false;
            if (violatesEmbellished([id])) return false;
            if (violatesBeachBag([id])) return false;
            if (isWorkOccasion && violatesWorkRules([id])) return false;
            if (violatesPlaceRequirements([id])) return false;
            if (violatesFootwearRule([id])) return false;
            if (violatesOccasionTag([id])) return false;
            if (violatesEveningSunglasses([id])) return false;
            return true;
          });
        }
      } catch (err) {
        console.error("[AURA suggest-outfit] retry failed", err);
      }
    }

    // Final sweep: whatever happened above (the retry call can fail to parse and leave the first answer
    // untouched), no piece that breaks a hard rule survives. The piece the caller made mandatory is kept.
    item_ids = item_ids.filter((id) =>
      id === params.mustIncludeItemId
      || (!violatesWeather([id]) && !violatesEmbellished([id]) && !violatesBeachBag([id])
        && !(isWorkOccasion && violatesWorkRules([id])) && !violatesPlaceRequirements([id]) && !violatesFootwearRule([id])
        && !violatesOccasionTag([id]) && !violatesEveningSunglasses([id])));

    // Last resort, after the retry/sanitize logic above has already run:
    // if the outfit is still missing its mandatory bag (the model simply
    // never included one), append the best available one directly rather
    // than shipping an incomplete women's outfit. Prefers a bag not
    // already excluded by avoidItemIds filtering upstream, and among the
    // eligible ones just takes the first — eligibleItems is already
    // filtered by dress preferences and location, so anything here is
    // already a legitimate candidate.
    // Every last-resort completion below picks straight out of `catalog`,
    // which deliberately bypasses the soft variety filtering — but it must
    // NOT bypass the caller's hard exclusions (see hardExcludedItemIds).
    // ...and it must not bypass the weather / evening-piece / Work / occasion-tag / beach-bag rules either:
    // without this the "add shoes if missing" step below would put back the very ankle boots the sanitize
    // step had just removed for a 29°C day, simply because they were the first pair of shoes in the catalog.
        // Which piece gets appended matters as much as adding one: not "the first in the list" but the one
    // closest in formality to what the look already contains. STRICT pool first (passes every hard
    // rule, occasion tag included); if that pool is empty — a woman whose only bag is tagged "Travel",
    // say — falls back to a RELAXED pool (weather and the caller's hard exclusions still apply, the
    // occasion-tag/beach-bag/embellished/Work checks don't) rather than adding nothing at all. This is
    // the same strict-then-relaxed pattern ensureBag/ensureShoes already use in
    // suggest-daily-looks.functions.ts — without it here, a bag or a pair of shoes could go missing
    // from every single Work/Evening look whenever the wardrobe's only options were tagged for another
    // occasion, which read as "AURA stopped adding bags/shoes" even though nothing was ever failing.
    const pickBest = (category: string, extra: (c: (typeof catalog)[number]) => boolean = () => true) => {
      const notUsed = (c: (typeof catalog)[number]) => !item_ids.includes(c.id) && !hardExcluded.has(c.id) && extra(c);
      const strict = catalog.filter((c) => c.category === category && notUsed(c) && usableAddition(c));
      const relaxed = catalog.filter((c) => c.category === category && notUsed(c) && !violatesWeather([c.id]));
      const pool = strict.length ? strict : relaxed;
      if (!pool.length) return null;
      const fs = item_ids.map((id) => catalog.find((c) => c.id === id)?.formality).filter((f): f is number => typeof f === "number");
      const target = fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : 3;
      return [...pool].sort((a, b) => Math.abs((a.formality ?? target) - target) - Math.abs((b.formality ?? target) - target))[0];
    };

    // Structure first (a bottom, a top), then shoes, then the bag — each chosen against the rules above.
    if (missingLegs(item_ids)) {
      const bottom = pickBest("Bottoms");
      if (bottom) item_ids = [...item_ids, bottom.id];
    }
    if (missingTorso(item_ids)) {
      const top = pickBest("Tops");
      if (top) item_ids = [...item_ids, top.id];
    }

    // If a running-shoe violation survived the sanitize step above (it only strips, it doesn't replace),
    // swap in a proper alternative rather than leaving the outfit without shoes at all.
    if (violatesFootwearRule(item_ids)) {
      const replacement = pickBest("Shoes", (c) => c.subcategory !== "Running Shoes");
      if (replacement) item_ids = [...item_ids, replacement.id];
    }

    // Shoes are part of the STRUCTURE rule described in the prompt, but nothing ever verified a Shoes item
    // was present at all: an outfit missing shoes entirely (the model never included one, or the sanitize
    // step stripped one for a weather/work violation without anything replacing it) shipped as "valid".
    if (!item_ids.some((id) => catalog.find((c) => c.id === id)?.category === "Shoes")) {
      const shoe = pickBest("Shoes", (c) => !violatesFootwearRule([c.id]));
      if (shoe) item_ids = [...item_ids, shoe.id];
    }

    if (missingMandatoryBag(item_ids)) {
      const bag = pickBest("Bags");
      if (bag) item_ids = [...item_ids, bag.id];
    }

    return {
      ok: true as const,
      item_ids,
      explanation: (parsed.explanation ?? "").slice(0, 240),
    };
  } catch (err) {
    console.error("[AURA suggest-outfit] failed", err);
    return { ok: false as const, error: err instanceof Error ? err.message : "AI failed" };
  }
}

export const suggestOutfitAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profileRow } = await (context.supabase.from("profiles" as never) as any)
      .select("gender, style_boldness").eq("id", context.userId).maybeSingle();
    const profile = profileRow as { gender?: string | null; style_boldness?: string | null } | null;

    return suggestOutfitCore({
      supabase: context.supabase,
      userId: context.userId,
      temperature: data.temperature ?? null,
      condition: data.condition ?? null,
      occasion: data.occasion ?? null,
      dressRules: data.dressRules ?? null,
      gender: profile?.gender ?? null,
      styleBoldness: profile?.style_boldness ?? null,
      mustIncludeItemId: data.mustIncludeItemId ?? null,
      items: data.items,
      avoidItemIds: data.avoidItemIds,
    });
  });
