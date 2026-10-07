import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { usageFeature } from "@/lib/ai-usage";
import { analyzeWardrobeImageCore } from "./ai-analyze.functions";

const BUCKET = "wardrobe";
// Piccolo lotto per chiamata: il client la richiama in loop mostrando il
// progresso, così restiamo sempre dentro i limiti di tempo del server
// anche con guardaroba da centinaia di capi.
const BATCH_SIZE = 5;

function toDataUrl(bytes: ArrayBuffer, contentType: string): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);
  return `data:${contentType || "image/jpeg"};base64,${b64}`;
}

type CandidateRow = {
  id: string;
  image_url: string | null;
  category: string | null;
  subcategory: string | null;
  style_tags: string[] | null;
  details: string[] | null;
  attrs_backfilled_at: string | null;
  user_edited_fields: string[] | null;
  formality: number | null;
  occasion: string | null;
  season: string | null;
  day_evening: string | null;
  sleeve_length: string | null;
  fit: string | null;
  heel_height: string | null;
  toe_shape: string | null;
  closure: string | null;
  gender: string | null;
  material: string[] | null;
};

// Mirrors ATTRIBUTE_APPLICABILITY in wardrobe-options.ts — an attribute
// only counts as "missing" for a category it actually applies to,
// otherwise every Shoe would be flagged forever for lacking a sleeve
// length that will never exist.
const SLEEVE_CATS = ["Tops", "Dresses", "Outerwear", "Jumpsuits"];
const FIT_CATS = ["Tops", "Bottoms", "Dresses", "Outerwear", "Jumpsuits", "Activewear"];
const CLOSURE_CATS = ["Shoes", "Outerwear", "Bags"];

/**
 * True when this item is missing at least one attribute the outfit
 * engines actually rely on. Checked in code rather than as a Postgres
 * filter for two reasons: several of these fields are only meaningful
 * for specific categories (see the *_CATS lists above), and material is
 * an array column where "is it empty" isn't a plain IS NULL check the
 * way a scalar column is — both are trivial to get right here and easy
 * to get subtly wrong as a hand-written PostgREST OR/array filter.
 */
function isIncomplete(item: CandidateRow): boolean {
  if (item.formality == null) return true;
  if (!item.occasion) return true;
  if (!item.season) return true;
  if (!item.day_evening) return true;
  if (!item.gender) return true;
  if (!item.material || item.material.length === 0) return true;
  const cat = item.category ?? "";
  if (SLEEVE_CATS.includes(cat) && !item.sleeve_length) return true;
  if (FIT_CATS.includes(cat) && !item.fit) return true;
  if (cat === "Shoes" && (!item.heel_height || !item.toe_shape)) return true;
  if (CLOSURE_CATS.includes(cat) && !item.closure) return true;
  return false;
}

const CANDIDATE_COLUMNS =
  "id, image_url, category, subcategory, style_tags, details, attrs_backfilled_at, user_edited_fields, formality, occasion, season, day_evening, sleeve_length, fit, heel_height, toe_shape, closure, gender, material";

/** Still to process: never analysed for details (details NULL, which includes every piece added
 *  before the details existed and pieces added by batch/scan), or missing an attribute and never
 *  passed through this job. A processed piece is marked (details set, attrs_backfilled_at), so a
 *  photo the AI can't read is not analysed again and again. */
export function needsCompletion(item: Pick<CandidateRow, "details" | "attrs_backfilled_at"> & Parameters<typeof isIncomplete>[0]): boolean {
  if (item.details == null) return true;
  return item.attrs_backfilled_at == null && isIncomplete(item);
}

/** The fields to write: only empty ones, never one the person set or corrected by hand
 *  (user_edited_fields), and the type only when the analysis sees the same category. */
export function completionPatch(item: CandidateRow, result: Awaited<ReturnType<typeof analyzeWardrobeImageCore>>): Record<string, unknown> {
  const edited = new Set(item.user_edited_fields ?? []);
  const free = (field: string, current: unknown) =>
    !edited.has(field) && (current == null || current === "" || (Array.isArray(current) && current.length === 0));
  const patch: Record<string, unknown> = {};
  if (free("subcategory", item.subcategory) && result.subcategory && result.category === item.category) patch.subcategory = result.subcategory;
  if (free("sleeve_length", item.sleeve_length) && result.sleeveLength) patch.sleeve_length = result.sleeveLength;
  if (free("fit", item.fit) && result.fit) patch.fit = result.fit;
  if (free("heel_height", item.heel_height) && result.heelHeight) patch.heel_height = result.heelHeight;
  if (free("toe_shape", item.toe_shape) && result.toeShape) patch.toe_shape = result.toeShape;
  if (free("closure", item.closure) && result.closure) patch.closure = result.closure;
  if (free("gender", item.gender) && result.gender) patch.gender = result.gender;
  if (free("style_tags", item.style_tags) && result.styleTags?.length) patch.style_tags = result.styleTags;
  if (free("formality", item.formality) && result.formality != null) patch.formality = result.formality;
  if (free("day_evening", item.day_evening) && result.dayEvening) patch.day_evening = result.dayEvening;
  if (free("occasion", item.occasion) && result.occasions?.length) patch.occasion = result.occasions.join(", ");
  if (free("season", item.season) && result.seasons?.length) patch.season = result.seasons.join(", ");
  if (free("material", item.material) && result.materials?.length) patch.material = result.materials;
  // details: always recorded (an empty array = analysed, nothing notable) unless set by hand
  if (!edited.has("details") && item.details == null) patch.details = result.details ?? [];
  patch.attrs_backfilled_at = new Date().toISOString();
  return patch;
}

/**
 * Ri-analizza in batch i capi già in guardaroba a cui manca almeno un
 * attributo che gli outfit engine usano davvero — non solo formality
 * come nella prima versione di questa funzione, ma anche occasion,
 * season, day_evening, gender, material, e gli attributi
 * categoria-specifici (sleeveLength, fit, heelHeight, toeShape, closure).
 * Un capo con sleeve_length vuoto, per esempio, è esattamente il motivo
 * per cui la regola "niente spalle scoperte al lavoro" può fallire in
 * silenzio anche se il codice che la applica è corretto: se il dato non
 * c'è, il controllo non ha nulla su cui decidere.
 *
 * occasion/season non vengono MAI impostate con un default arbitrario
 * (a differenza di purchase_date, gestita altrove via SQL) — solo con un
 * valore che l'AI ha effettivamente dedotto dalla foto.
 *
 * Non tocca MAI category/subcategory/colori/brand già presenti —
 * aggiorna solo i campi nuovi/mancanti, e solo quando il risultato AI ne
 * produce uno (mai sovrascrive con vuoto, mai sovrascrive una correzione
 * manuale già fatta su un campo che aveva già un valore).
 */
export const reanalyzeWardrobeBatch = createServerFn({ method: "POST" })
  // Consumption ledger: background completion of the person's own pieces, counted as item analysis
  // (it was recorded with no feature and no person). Not checked against the plan limits: nobody
  // asked for it.
  .middleware([requireSupabaseAuth, usageFeature("item_analysis", "reanalyze", { observe: false })])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: allItems, error: qErr } = await context.supabase
      .from("wardrobe_items")
      .select(CANDIDATE_COLUMNS)
      .eq("user_id", context.userId)
      .not("image_url", "is", null);
    if (qErr) throw new Error(qErr.message);

    const rows = (allItems ?? []) as unknown as CandidateRow[];
    const todo = rows.filter(needsCompletion);
    const items = todo.slice(0, BATCH_SIZE);

    let updated = 0;
    let done = 0;

    for (const item of items) {
      try {
        if (!item.image_url) continue; // excluded by .not() above; guard only for TS
        const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(BUCKET).download(item.image_url);
        if (dlErr || !blob) {
          console.error("[AURA reanalyze] download failed", item.id, dlErr);
          // the photo can't be read: mark it so it isn't retried forever
          await context.supabase.from("wardrobe_items").update({ details: [], attrs_backfilled_at: new Date().toISOString() } as never).eq("id", item.id);
          done++;
          continue;
        }

        const dataUrl = toDataUrl(await blob.arrayBuffer(), blob.type || "image/jpeg");
        // An AI outage throws (AiCallFailedError): the piece is left unmarked and retried later.
        const result = await analyzeWardrobeImageCore(dataUrl);
        const patch = completionPatch(item, result);

        const { error: updErr } = await context.supabase
          .from("wardrobe_items")
          .update(patch as never)
          .eq("id", item.id);
        if (updErr) { console.error("[AURA reanalyze] update failed", item.id, updErr); continue; }
        done++;
        if (Object.keys(patch).some((k) => k !== "attrs_backfilled_at" && k !== "details")) updated++;
      } catch (e) {
        console.error("[AURA reanalyze] item failed, will retry later", item.id, e instanceof Error ? e.message : String(e));
        break; // most likely the AI service: stop this batch
      }
    }

    const remaining = todo.length - done;

    return { processed: done, updated, remaining: Math.max(remaining, 0) };
  });
