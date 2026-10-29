import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Loader2, X } from "lucide-react";
import type { WardrobeItem } from "@/lib/aura-types";
import type { LaundryDuePiece } from "@/lib/laundry-due-data";
import { thumbSrc } from "@/lib/wardrobe-image";
import { garmentWithColor } from "@/lib/garment-names";

/** «Forse da lavare» (laundry-due.ts): the pieces worn enough times for the temperature of those
 *  days, all ticked. «Nel cesto» puts them in the laundry basket; «Ancora puliti» asks again after
 *  the next wear. */
export function LaundryDueSheet({ due, items, signed, onBasket, onStillClean, onClose }: {
  due: LaundryDuePiece[];
  items: WardrobeItem[];
  signed: Record<string, string>;
  onBasket: (ids: string[]) => Promise<void>;
  onStillClean: (ids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(due.map((d) => d.id)));
  const [busy, setBusy] = useState<"basket" | "clean" | null>(null);
  const byId = new Map(items.map((it) => [it.id, it]));
  const list = due.filter((d) => byId.has(d.id));

  const run = async (kind: "basket" | "clean") => {
    const ids = list.map((d) => d.id).filter((id) => picked.has(id));
    if (!ids.length || busy) return;
    setBusy(kind);
    try { await (kind === "basket" ? onBasket(ids) : onStillClean(ids)); } finally { setBusy(null); }
  };
  const flip = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-background/80 backdrop-blur flex items-end justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card rounded-t-3xl border-t sm:border-x border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[88vh] overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif italic text-xl leading-tight">{t("laundryDue.title")}</p>
          <button onClick={onClose} aria-label={t("wardrobe.closeAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t("laundryDue.intro")}</p>

        {list.length ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {list.map((d) => {
              const it = byId.get(d.id)!;
              const on = picked.has(d.id);
              const src = thumbSrc(it, signed);
              const name = garmentWithColor(it.subcategory || it.category, it.colors?.[0] ?? it.color, i18n.language) || it.brand || "";
              return (
                <button key={d.id} onClick={() => flip(d.id)} className="text-left">
                  <div className={`relative aspect-[4/5] rounded-xl border overflow-hidden ${on ? "border-foreground border-2" : "border-border/60"}`} style={{ background: "#FFFFFF" }}>
                    {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-contain p-1" /> : <div className="h-full w-full" style={{ background: "#EDEDED" }} />}
                    <span className={`absolute top-1.5 right-1.5 h-5 w-5 rounded-full border flex items-center justify-center ${on ? "bg-foreground border-foreground" : "bg-background/80 border-border"}`}>
                      {on && <Check size={11} className="text-background" />}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-foreground/80 line-clamp-2 first-letter:uppercase">{name}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {d.lastTemp != null ? t("laundryDue.wornAt", { count: d.wears, temp: d.lastTemp }) : t("laundryDue.worn", { count: d.wears })}
                  </p>
                </button>
              );
            })}
          </div>
        ) : <p className="mt-4 text-sm text-muted-foreground">{t("laundryDue.none")}</p>}

        {list.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button onClick={() => void run("clean")} disabled={!picked.size || !!busy}
              className="h-11 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
              {busy === "clean" && <Loader2 size={12} className="animate-spin" />}{t("laundryDue.stillClean")}
            </button>
            <button onClick={() => void run("basket")} disabled={!picked.size || !!busy}
              className="h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.2em] inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
              {busy === "basket" && <Loader2 size={12} className="animate-spin" />}{t("laundryDue.toBasket", { count: picked.size })}
            </button>
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">{t("laundryDue.how")}</p>
      </div>
    </div>,
    document.body,
  );
}
