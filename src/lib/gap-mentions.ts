// «Al tuo guardaroba manca»: the pieces the reason talks about come first among those it would pair
// with. Pure, no DB.
//
// The model is asked for the ids of the catalog pieces it names; when it leaves them out, a piece
// whose brand (or brand + model) is written in the reason counts as named too — «i tuoi pantaloni
// verde smeraldo di Scotch & Soda» must show those trousers.

type Piece = { id: string; brand?: string | null; model?: string | null };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Ids of the pieces named in `reason`: those the model gave (when they exist), then those whose
 *  brand appears in the text. A brand shared by several pieces only counts with its model too, or
 *  when just one of them is in `eligible`. */
export function mentionedPieces(reason: string, modelIds: readonly string[], items: readonly Piece[], eligible: ReadonlySet<string>): string[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  const out = modelIds.filter((id, i) => byId.has(id) && modelIds.indexOf(id) === i);
  const text = ` ${norm(reason)} `;
  const named = items.filter((it) => {
    const brand = norm(it.brand ?? "");
    return brand.length >= 3 && text.includes(brand);
  });
  const byBrand = new Map<string, Piece[]>();
  for (const it of named) byBrand.set(norm(it.brand ?? ""), [...(byBrand.get(norm(it.brand ?? "")) ?? []), it]);
  for (const group of byBrand.values()) {
    const withModel = group.filter((it) => { const m = norm(it.model ?? ""); return m.length >= 3 && text.includes(m); });
    const pick = withModel.length ? withModel : group.length === 1 ? group : group.filter((it) => eligible.has(it.id)).length === 1 ? group.filter((it) => eligible.has(it.id)) : [];
    for (const it of pick) if (!out.includes(it.id)) out.push(it.id);
  }
  return out;
}

/** The named pieces first, then the others in their order, at most `max`. */
export function namedFirst(named: readonly string[], ranked: readonly string[], max: number): string[] {
  return [...new Set([...named, ...ranked])].slice(0, max);
}
