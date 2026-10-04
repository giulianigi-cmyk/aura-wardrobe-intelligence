// Visual comparison for "Devo comprarlo?": metadata (brand, colour name, type, fit) can't tell which
// of ten "Denim Wash" jeans really looks like the product — the leg shape, the wash, the rise, the
// details are only in the pictures. The vision model looks at the product photo next to the photos
// of the few closest owned pieces (any category: jeans, bags, shoes, knits…) and says how similar
// each one is TO WEAR, and what differs. Server-only; one call per analysed product.
import { generateText } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WardrobeItem } from "./aura-types";
import { parseAiJson } from "./ai-json";

export const MAX_VISUAL_CANDIDATES = 5;

export type VisualSimilarity = {
  itemId: string;
  /** 0-100: how much it would do the same job in an outfit (100 = practically the same piece). */
  similarity: number;
  /** Short, concrete differences in the person's language ("lavaggio più scuro, gamba più larga"). */
  note: string;
};

const Out = z.object({
  candidates: z.array(z.object({ ref: z.string(), similarity: z.coerce.number(), note: z.string().optional() })),
});

export function visualPrompt(product: { category: string | null; subcategory: string | null; title: string | null }, refs: string[], language: string): string {
  const kind = (product.subcategory || product.category || "piece").toLowerCase();
  return [
    `The first image (PRODUCT) is a ${kind} the person is thinking of buying${product.title ? ` ("${product.title}")` : ""}.`,
    `The next ${refs.length} images are pieces the person already owns, labelled ${refs.join(", ")}.`,
    "For EACH owned piece, judge how similar it is to the PRODUCT as a wardrobe choice — would it do the same job in an outfit? Compare what you actually SEE: shape and cut (for trousers: leg shape, rise, length; for bags: shape, size, handles, strap; for shoes: heel, toe, straps; for tops: neckline, sleeves, fit), colour and shade (a darker or lighter wash, a different tone), material and finish, and distinctive details (logos, hardware, embellishment, pockets, prints).",
    "similarity 0-100: 90-100 = practically the same piece; 70-89 = very similar, does the same job; 50-69 = same kind with visible differences; below 50 = clearly different. Do not inflate; equally similar pieces get equal scores.",
    `note: at most 12 words in ${language}, what the PRODUCT has that differs from that owned piece (e.g. Italian "lavaggio più scuro, gamba più ampia, vita più alta"); "quasi identico" (in ${language}) when there is no real difference.`,
    "Respond with ONLY a single valid JSON object, no markdown fences:",
    `{"candidates": [{"ref": "${refs[0]}", "similarity": 0, "note": ""}]} with one entry per owned piece, in order.`,
  ].join("\n");
}

/** Maps "C1…Cn" back to item ids; unknown or repeated refs are dropped. */
export function mapVisual(raw: { ref: string; similarity: number; note?: string }[], ids: string[]): VisualSimilarity[] {
  const seen = new Set<string>();
  const out: VisualSimilarity[] = [];
  for (const c of raw) {
    const m = /^C(\d+)$/i.exec(c.ref.trim());
    const id = m ? ids[Number(m[1]) - 1] : undefined;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ itemId: id, similarity: Math.max(0, Math.min(100, Number.isFinite(c.similarity) ? c.similarity : 0)), note: (c.note ?? "").trim().slice(0, 120) });
  }
  return out;
}

/** Null when it can't be done (no product photo, no candidate photos, model failure) — the advice
 *  then falls back to the metadata comparison, never fails because of this. */
export async function compareVisually(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>;
  model: Parameters<typeof generateText>[0]["model"];
  productImageDataUrl: string | null;
  product: { category: string | null; subcategory: string | null; title: string | null };
  candidates: WardrobeItem[];
  language: string;
}): Promise<VisualSimilarity[] | null> {
  if (!opts.productImageDataUrl || !opts.candidates.length) return null;
  const images = await Promise.all(opts.candidates.slice(0, MAX_VISUAL_CANDIDATES).map(async (it) => {
    const path = (it as { thumbnail_path?: string | null }).thumbnail_path || it.image_url;
    if (!path || path.startsWith("http")) return null;
    try {
      const { data: blob, error } = await opts.supabase.storage.from("wardrobe").download(path);
      if (error || !blob || blob.size > 4 * 1024 * 1024) return null;
      return { id: it.id, dataUrl: `data:${blob.type || "image/jpeg"};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}` };
    } catch {
      return null;
    }
  }));
  const usable = images.filter((x): x is { id: string; dataUrl: string } => !!x);
  if (!usable.length) return null;
  const refs = usable.map((_, i) => `C${i + 1}`);
  const content = [
    { type: "text" as const, text: visualPrompt(opts.product, refs, opts.language) },
    { type: "text" as const, text: "PRODUCT:" },
    { type: "image" as const, image: opts.productImageDataUrl },
    ...usable.flatMap((c, i) => [{ type: "text" as const, text: `${refs[i]}:` }, { type: "image" as const, image: c.dataUrl }]),
  ];
  try {
    const r = await generateText({ model: opts.model, abortSignal: AbortSignal.timeout(25_000), messages: [{ role: "user", content }] });
    return mapVisual(parseAiJson(r.text, Out).candidates, usable.map((u) => u.id));
  } catch (e) {
    console.error("[AURA purchase-visual] comparison failed, using metadata only", e instanceof Error ? e.message : String(e));
    return null;
  }
}
