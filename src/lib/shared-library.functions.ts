import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export { SHARED_LIBRARY_SOURCE } from "./shared-library-source";

/** Riallinea la libreria condivisa dell'utente (o la svuota se il consenso è spento). */
export const syncMySharedLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncSharedLibrary } = await import("./shared-library.server");
    try {
      return await syncSharedLibrary(context.userId);
    } catch (e) {
      console.error("[AURA shared-library] sync failed", e);
      return { synced: 0, removed: 0 };
    }
  });

export type SharedLibraryItem = {
  id: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  color: string | null;
  colors: string[];
  material: string[];
  season: string | null;
  style: string | null;
  occasion: string | null;
  style_tags: string[];
  size: string | null;
  price: number | null;
  currency: string | null;
  gender: string | null;
  length: string | null;
  sleeve_length: string | null;
  fit: string | null;
  heel_height: string | null;
  toe_shape: string | null;
  closure: string | null;
  formality: number | null;
  day_evening: string | null;
  image_url: string;
  thumbnail_path: string | null;
  signed_url: string | null;
  /** Small copy for the grid (≈400 px); null when the piece has none yet — use signed_url then. */
  thumb_url: string | null;
};

const SHARED_COLUMNS =
  "id, brand, category, subcategory, color, colors, material, season, style, occasion, style_tags, size, price, currency, gender, length, sleeve_length, fit, heel_height, toe_shape, closure, formality, day_evening, image_url, thumbnail_path, created_at";

/** Temporary signed URLs for the full image and the thumbnail of each row. */
async function signRows(supabase: any, list: SharedLibraryItem[]): Promise<SharedLibraryItem[]> {
  if (!list.length) return [];
  const paths = [...new Set(list.flatMap((r) => [r.image_url, r.thumbnail_path].filter((x): x is string => !!x)))];
  const { data: signed, error: signError } = await supabase.storage
    .from("shared-library")
    .createSignedUrls(paths, 60 * 60);
  if (signError) console.error("[AURA shared-library] createSignedUrls failed", signError);
  (signed ?? []).forEach((s: { error?: unknown; path?: string | null }) => {
    if (s.error) console.error("[AURA shared-library] signing failed for", s.path, s.error);
  });
  const map = new Map<string, string>((signed ?? []).map((s: { path?: string | null; signedUrl: string }) => [s.path ?? "", s.signedUrl]));
  return list.map((r) => ({
    ...r,
    signed_url: map.get(r.image_url) ?? null,
    thumb_url: r.thumbnail_path ? map.get(r.thumbnail_path) ?? null : null,
  }));
}

/** Page size of the library grid. */
export const SHARED_PAGE_SIZE = 30;

/** The whole shared library, newest first, a page at a time: what the library shows when it opens,
 *  before any search (it used to open empty). */
export const browseSharedLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { offset?: number }) => ({ offset: Math.max(0, Math.min(10_000, Math.floor(Number(input?.offset) || 0))) }))
  .handler(async ({ data, context }): Promise<SharedLibraryItem[]> => {
    const { data: rows, error } = await (context.supabase as any)
      .from("shared_library_items")
      .select(SHARED_COLUMNS)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + SHARED_PAGE_SIZE - 1);
    if (error) {
      console.error("[AURA shared-library] browse", error);
      return [];
    }
    return signRows(context.supabase, (rows ?? []) as SharedLibraryItem[]);
  });

/** Ricerca nella libreria condivisa anonima; restituisce URL firmati temporanei.
 *  Stessa logica di searchProductLibrary: ogni parola della query deve
 *  comparire in qualche colonna, tutte le parole devono essere soddisfatte. */
export const searchSharedLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q: string }) => ({ q: String(input?.q ?? "").trim().slice(0, 80) }))
  .handler(async ({ data, context }): Promise<SharedLibraryItem[]> => {
    if (!data.q) return [];
    const tokens = data.q.split(/\s+/).filter(Boolean).slice(0, 6);

    let builder = (context.supabase as any)
      .from("shared_library_items")
      .select(SHARED_COLUMNS);
    for (const token of tokens) {
      const like = `%${token.replace(/[%,]/g, "")}%`;
      builder = builder.or(
        `brand.ilike.${like},category.ilike.${like},subcategory.ilike.${like},style.ilike.${like},color.ilike.${like}`,
      );
    }

    const { data: rows, error } = await builder.order("created_at", { ascending: false }).limit(60);
    if (error) {
      console.error("[AURA shared-library] search", error);
      return [];
    }
    return signRows(context.supabase, (rows ?? []) as SharedLibraryItem[]);
  });
