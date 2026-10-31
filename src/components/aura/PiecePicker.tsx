import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import { garmentWithColor } from "@/lib/garment-names";
import { expandSearchWord, normalizeText } from "@/lib/wardrobe-search";
import { Search, Check, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import type { WardrobeItem } from "@/lib/aura-types";
import { ITEM_CATEGORIES } from "@/lib/wardrobe-options";
import { thumbSrc, toStoragePath } from "@/lib/wardrobe-image";
import { listLocations } from "@/lib/wardrobe-locations.functions";
import { isWearableNow } from "@/lib/wardrobe-storage";
import { isInLaundry } from "@/lib/laundry-basket";
import { GridColumnsToggle, gridClass, useGridColumns } from "./GridColumnsToggle";
import type { WardrobeLocation } from "@/lib/wardrobe-location";

const PICKER_PAGE = 40;

/**
 * Shared piece picker — the single Closet-style grid used everywhere the
 * user selects wardrobe items (calendar planning, marking a day as worn,
 * editing a saved outfit in the builder). Search + category chips +
 * location chips only help *find* a piece; they never restrict which
 * pieces can be selected — the full wardrobe is always reachable by
 * clearing the filters. «Disponibili ora» (the default) hides pieces put
 * away in the cambio stagione, archived, lent or in the laundry; «Tutti»
 * shows them too, marked, for planning further ahead.
 */

/** Why a piece can't be worn right now, for its label under «Tutti». */
function unavailableReason(it: WardrobeItem): "archived" | "stored" | "lent" | "basket" | "dryCleaner" | null {
  const x = it as unknown as { archived?: boolean | null; stored_at?: string | null; active_loan_id?: string | null; laundry_kind?: string | null; laundry_since?: string | null };
  if (x.archived) return "archived";
  if (x.stored_at) return "stored";
  if (x.active_loan_id) return "lent";
  if (isInLaundry(x)) return x.laundry_kind === "dry_cleaner" ? "dryCleaner" : "basket";
  return null;
}
export function PiecePicker({
  items,
  signed,
  selectedIds,
  onToggle,
  loading = false,
  emptyHint,
  extraChips,
  className = "",
  columns = 2,
  showAllByDefault = false,
}: {
  items: WardrobeItem[];
  signed: Record<string, string>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  loading?: boolean;
  emptyHint?: string;
  /** Optional context-specific chips (e.g. "Suggested" in the planner). */
  extraChips?: ReactNode;
  className?: string;
  /** Columns until the person picks 2 or 3 with the toggle (then their choice, everywhere). */
  columns?: 2 | 3;
  /** «Tutti» instead of «Disponibili ora» on opening (planning far ahead, e.g. a trip). */
  showAllByDefault?: boolean;
}) {
  const { t } = useTranslation();
  const fetchLocations = useServerFn(listLocations);
  const [locations, setLocations] = useState<WardrobeLocation[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [locId, setLocId] = useState<string>("all");
  const [onlyAvailable, setOnlyAvailable] = useState(!showAllByDefault);
  const [cols, setCols] = useGridColumns(columns);
  const someUnavailable = useMemo(() => items.some((i) => !isWearableNow(i as never)), [items]);

  useEffect(() => {
    let alive = true;
    fetchLocations()
      .then((res) => { if (alive) setLocations(res.locations); })
      .catch((e) => console.error("[AURA picker] locations load failed", e));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shown a page at a time, the next page when the end of the grid comes into view: a wardrobe of
  // hundreds of pieces drawn all at once (every photo decoded) is what made Safari on iPhone reload
  // the canvas editor when the picker was opened for the second piece (reported).
  const [shownCount, setShownCount] = useState(PICKER_PAGE);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setShownCount(PICKER_PAGE); }, [q, cat, locId, onlyAvailable]);
  useEffect(() => {
    const el = moreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShownCount((n) => n + PICKER_PAGE);
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  });

  const visible = useMemo(() => {
    // Every word must match brand, model, type, colour, material…; words in any language are
    // expanded to the stored English values ("gonna nera" → skirt + black, "lino" → linen).
    const words = normalizeText(q).split(" ").filter(Boolean);
    return items.filter((i) => {
      // A piece already chosen stays visible so it can be removed.
      if (onlyAvailable && !isWearableNow(i as never) && !selectedIds.includes(i.id)) return false;
      const itemLoc = (i as unknown as { location_id?: string | null }).location_id ?? null;
      if (!((locId === "all" || itemLoc === locId) && (cat === "All" || i.category === cat))) return false;
      if (!words.length) return true;
      const hay = normalizeText([
        i.category, i.subcategory, i.brand, i.model, i.color, i.style, i.occasion, i.season,
        ...(i.colors ?? []), ...(Array.isArray(i.material) ? i.material : []), ...(i.style_tags ?? []),
      ].filter(Boolean).join(" "));
      return words.every((w) => expandSearchWord(w).some((x) => hay.includes(x)));
    });
  }, [items, cat, q, locId, onlyAvailable, selectedIds]);

  return (
    <div className={className}>
      <div className="flex items-center gap-2 rounded-full bg-secondary/60 px-4 py-2.5">
        <Search size={15} className="text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("piecePicker.searchPlaceholder")}
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground outline-none"
        />
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
        {extraChips}
        {["All", ...ITEM_CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs tracking-wide transition ${
              cat === c ? "bg-foreground text-background" : "bg-secondary/60 text-foreground/70"
            }`}
          >{c === "All" ? t("piecePicker.all") : t(`piecePicker.categories.${c}`, { defaultValue: c })}</button>
        ))}
      </div>

      {locations.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setLocId("all")}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-widest ${locId === "all" ? "bg-foreground text-background" : "bg-secondary/60 text-foreground/70"}`}
          >{t("piecePicker.all")}</button>
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => setLocId(loc.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-widest ${locId === loc.id ? "bg-foreground text-background" : "bg-secondary/60 text-foreground/70"}`}
            >{loc.name}</button>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        {someUnavailable ? (
          <div className="flex gap-1 rounded-full bg-secondary/60 p-1">
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                onClick={() => setOnlyAvailable(v)}
                className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${onlyAvailable === v ? "bg-foreground text-background" : "text-foreground/70"}`}
              >{v ? t("piecePicker.availableNow") : t("piecePicker.allPieces")}</button>
            ))}
          </div>
        ) : <span />}
        <GridColumnsToggle value={cols} onChange={setCols} />
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="animate-spin" /></div>
      ) : visible.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {items.length === 0 ? (emptyHint ?? t("piecePicker.emptyDefault")) : t("piecePicker.noMatches")}
        </p>
      ) : (
        <div className={`mt-4 grid ${gridClass(cols)}`}>
          {visible.slice(0, shownCount).map((it) => {
            const src = thumbSrc(it, signed) || (toStoragePath(it.image_url) ? signed[toStoragePath(it.image_url)!] ?? "" : "");
            const on = selectedIds.includes(it.id);
            const label = it.colors?.[0] ?? it.color ?? it.category ?? t("wardrobe.wardrobePieceFallback");
            const away = unavailableReason(it);
            return (
              <button key={it.id} onClick={() => onToggle(it.id)} className="group text-left">
                <div
                  className={`relative overflow-hidden rounded-[1.25rem] border aspect-[4/5] ${on ? "border-foreground border-2" : "border-border/50"}`}
                  style={{ background: "#FFFFFF" }}
                >
                  {src ? (
                    <img src={src} alt={`${it.brand ?? label} piece`} className="h-full w-full object-contain p-1 transition-transform duration-500 group-active:scale-95" loading="lazy" />
                  ) : (
                    <div className="h-full w-full animate-pulse" style={{ background: "#EDEDED" }} />
                  )}
                  {away && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-background/90 border border-border px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{t(`piecePicker.away.${away}`)}</span>
                  )}
                  {on && (
                    <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-foreground border border-foreground flex items-center justify-center">
                      <Check size={13} className="text-background" />
                    </span>
                  )}
                </div>
                <div className="px-0.5 mt-1.5">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground truncate">{it.brand ?? it.category}</p>
                  <p className={`font-serif leading-tight truncate ${cols === 3 ? "text-[13px]" : "text-[15px]"}`}>
                    {garmentWithColor(it.subcategory || it.category, it.colors?.[0] ?? it.color, i18n.language) || label}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {!loading && visible.length > shownCount && <div ref={moreRef} className="h-10" aria-hidden />}
    </div>
  );
}
