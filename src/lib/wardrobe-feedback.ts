// Corrections the person gives to suggestions (table wardrobe_feedback), so an engine doesn't repeat
// a mistake for them:
//  - "already_own" ("Ce l'ho già"): a wardrobe-gap suggestion or a purchase verdict proposed
//    something they already have; its category/subcategory/colours count as owned from then on;
//  - "not_similar" ("Non è simile"): the purchase advisor called a product similar to an owned
//    piece; that piece is no longer compared with that product.

export type WardrobeFeedbackRow = {
  kind: "already_own" | "not_similar";
  category: string | null;
  subcategory: string | null;
  colors: string[];
  product_key: string | null;
  owned_item_id: string | null;
};

/** Stable key for a product the advisor looked at: its page (without tracking parameters), or
 *  brand + name when there's no page. */
export function productKey(p: { sourceUrl?: string | null; brand?: string | null; title?: string | null }): string | null {
  if (p.sourceUrl) {
    try {
      const u = new URL(p.sourceUrl);
      return `url:${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
    } catch { /* fall through */ }
  }
  const name = [p.brand, p.title].filter(Boolean).join("|").toLowerCase().replace(/\s+/g, " ").trim();
  return name ? `name:${name}` : null;
}

type FeedbackClient = {
  from: (t: "wardrobe_feedback") => {
    select: (cols: string) => { eq: (c: string, v: string) => PromiseLike<{ data: unknown; error: unknown }> };
  };
};

/** The person's corrections (own rows only — RLS). Never blocks a suggestion: errors → none. */
export async function loadWardrobeFeedback(supabase: unknown, userId: string): Promise<WardrobeFeedbackRow[]> {
  try {
    const { data, error } = await (supabase as FeedbackClient).from("wardrobe_feedback")
      .select("kind, category, subcategory, colors, product_key, owned_item_id").eq("user_id", userId);
    if (error) throw error;
    return (data ?? []) as WardrobeFeedbackRow[];
  } catch (e) {
    console.error("[AURA feedback] read failed, continuing without", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/** "Ce l'ho già" corrections as wardrobe-like pieces, for ownership checks. */
export function alreadyOwnedPieces(rows: WardrobeFeedbackRow[]): { category: string; subcategory: string | null; colors: string[]; brand?: string | null; model?: string | null }[] {
  return rows
    .filter((r) => r.kind === "already_own" && r.category)
    .map((r) => ({ category: r.category!, subcategory: r.subcategory, colors: r.colors ?? [], brand: null, model: null }));
}

/** Owned pieces the person said are NOT similar to this product. */
export function notSimilarItemIds(rows: WardrobeFeedbackRow[], key: string | null): Set<string> {
  if (!key) return new Set();
  return new Set(rows.filter((r) => r.kind === "not_similar" && r.product_key === key && r.owned_item_id).map((r) => r.owned_item_id!));
}
