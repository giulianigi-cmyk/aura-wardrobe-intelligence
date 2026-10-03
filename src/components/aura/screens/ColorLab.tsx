import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Palette, Search, X } from "lucide-react";
import type { Screen } from "../AuraApp";
import { supabase } from "@/integrations/supabase/client";
import type { WardrobeItem } from "@/lib/aura-types";
import { useAuth } from "@/hooks/use-auth";
import { resolveWardrobeUrls, toStoragePath } from "@/lib/wardrobe-image";
import { ColorWheelPicker } from "@/components/ColorWheelPicker";
import { normalizeText, searchWardrobe } from "@/lib/wardrobe-search";

/**
 * Dedicated, discoverable entry point for color analysis — separate from
 * the per-item shortcut in Wardrobe.tsx. Lets the user pick any garment
 * from their closet and opens the same ColorWheelPicker used there.
 */
export function ColorLab({ go }: { go: (s: Screen) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<WardrobeItem | null>(null);
  const [query, setQuery] = useState("");

  // Search by brand, model, type, colour or material — plain text ("zara", "lino") or the same
  // multilingual words the stylist understands ("gonna nera", "black skirt").
  const visible = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return items;
    const tokens = q.split(" ");
    const bySynonyms = new Set(searchWardrobe(query, items).matches.map((it) => it.id));
    return items.filter((it) => {
      if (bySynonyms.has(it.id)) return true;
      const hay = normalizeText([it.brand, it.model, it.category, it.subcategory, it.color, ...(it.colors ?? []), ...(Array.isArray(it.material) ? it.material : [])].filter(Boolean).join(" "));
      return tokens.every((tk) => hay.includes(tk));
    });
  }, [items, query]);

  useEffect(() => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    supabase.from("wardrobe_items")
      .select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error("[AURA color-lab] load error", error); setLoading(false); return; }
        setItems((data ?? []) as WardrobeItem[]);
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (!items.length) { setSigned({}); return; }
    let cancelled = false;
    void resolveWardrobeUrls(items).then((map) => { if (!cancelled) setSigned((prev) => ({ ...prev, ...map })); });
    return () => { cancelled = true; };
  }, [items]);

  const activeSrc = active ? (() => {
    const path = toStoragePath(active.image_url);
    return path ? signed[path] : "";
  })() : "";

  return (
    <div className="h-full overflow-y-auto pb-28">
      <header className="px-6 pt-6 flex items-center gap-3">
        <button
          onClick={() => go("home")}
          aria-label={t("colorLab.backAria")}
          className="h-9 w-9 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90"
        >
          <ArrowLeft size={16} />
        </button>
      <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("colorLab.colorLab")}</p>
          <p className="font-serif text-2xl">{t("colorLab.colorHarmony")}</p>
        </div>
      </header>

      <p className="px-6 mt-3 text-sm text-muted-foreground">
        {t("colorLab.description")}
      </p>

      {!loading && items.length > 0 && (
        <div className="px-6 mt-4">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("colorLab.searchPlaceholder")}
              aria-label={t("colorLab.searchPlaceholder")}
              className="w-full h-10 rounded-full bg-secondary/60 pl-9 pr-9 text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label={t("colorLab.clearSearch")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground"
              ><X size={14} /></button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-6 mt-6 grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl animate-pulse" style={{ background: "#EDEDED" }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-6 mt-10 text-center">
          <Palette size={28} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {t("colorLab.emptyState")}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="px-6 mt-10 text-center text-sm text-muted-foreground">{t("colorLab.noResults")}</p>
      ) : (
        <div className="px-6 mt-4 grid grid-cols-3 gap-3">
          {visible.map((it) => {
            const path = toStoragePath(it.image_url);
            const src = path ? signed[path] : "";
            return (
              <button
                key={it.id}
                onClick={() => src && setActive(it)}
                disabled={!src}
                className="aspect-square rounded-2xl overflow-hidden border border-border active:scale-95 transition disabled:opacity-50"
                style={{ background: "#FFFFFF" }}
              >
                {src ? (
                  <img src={src} alt="" className="h-full w-full object-contain p-2" />
                ) : (
                  <div className="h-full w-full animate-pulse" style={{ background: "#EDEDED" }} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {active && activeSrc && (
        <ColorWheelPicker imageUrl={activeSrc} onClose={() => setActive(null)} />
      )}
    </div>
  );
}
