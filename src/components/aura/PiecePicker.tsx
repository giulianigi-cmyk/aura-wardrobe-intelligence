import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { WardrobeLocation } from "@/lib/wardrobe-location";

/**
 * Shared piece picker — the single Closet-style grid used everywhere the
 * user selects wardrobe items (calendar planning, marking a day as worn,
 * editing a saved outfit in the builder). Search + category chips +
 * location chips only help *find* a piece; they never restrict which
 * pieces can be selected — the full wardrobe is always reachable by
 * clearing the filters.
 */
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
  /** 3 for big wardrobes where more pieces per screen helps (avatar try-on). */
  columns?: 2 | 3;
}) {
  const { t } = useTranslation();
  const fetchLocations = useServerFn(listLocations);
  const [locations, setLocations] = useState<WardrobeLocation[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [locId, setLocId] = useState<string>("all");

  useEffect(() => {
    let alive = true;
    fetchLocations()
      .then((res) => { if (alive) setLocations(res.locations); })
      .catch((e) => console.error("[AURA picker] locations load failed", e));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    // Every word must match brand, model, type, colour, material…; words in any language are
    // expanded to the stored English values ("gonna nera" → skirt + black, "lino" → linen).
    const words = normalizeText(q).split(" ").filter(Boolean);
    return items.filter((i) => {
      const itemLoc = (i as unknown as { location_id?: string | null }).location_id ?? null;
      if (!((locId === "all" || itemLoc === locId) && (cat === "All" || i.category === cat))) return false;
      if (!words.length) return true;
      const hay = normalizeText([
        i.category, i.subcategory, i.brand, i.model, i.color, i.style, i.occasion, i.season,
        ...(i.colors ?? []), ...(Array.isArray(i.material) ? i.material : []), ...(i.style_tags ?? []),
      ].filter(Boolean).join(" "));
      return words.every((w) => expandSearchWord(w).some((x) => hay.includes(x)));
    });
  }, [items, cat, q, locId]);

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

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="animate-spin" /></div>
      ) : visible.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {items.length === 0 ? (emptyHint ?? t("piecePicker.emptyDefault")) : t("piecePicker.noMatches")}
        </p>
      ) : (
        <div className={`mt-4 grid ${columns === 3 ? "grid-cols-3 gap-x-2 gap-y-4" : "grid-cols-2 gap-x-3 gap-y-5"}`}>
          {visible.map((it) => {
            const src = thumbSrc(it, signed) || (toStoragePath(it.image_url) ? signed[toStoragePath(it.image_url)!] ?? "" : "");
            const on = selectedIds.includes(it.id);
            const label = it.colors?.[0] ?? it.color ?? it.category ?? "Wardrobe piece";
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
                  {on && (
                    <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-foreground border border-foreground flex items-center justify-center">
                      <Check size={13} className="text-background" />
                    </span>
                  )}
                </div>
                <div className="px-0.5 mt-1.5">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground truncate">{it.brand ?? it.category}</p>
                  <p className={`font-serif leading-tight truncate ${columns === 3 ? "text-[13px]" : "text-[15px]"}`}>
                    {garmentWithColor(it.category, it.colors?.[0] ?? it.color, i18n.language) || label}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
