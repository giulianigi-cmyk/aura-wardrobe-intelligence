import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { WardrobeItem } from "@/lib/aura-types";
import { thumbSrc } from "@/lib/wardrobe-image";
import { garmentWithColor } from "@/lib/garment-names";
import { seasonChangeSuggestions } from "@/lib/wardrobe-storage";

const DAYS = 14;

/** "Cosa mettere via?": from the next two weeks' highs where the person is, the pieces to put away
 *  (pre-ticked), those to keep out anyway (planned or worn recently) and those to take back from the
 *  cambio stagione (pre-ticked). Rules only, no AI: see seasonChangeSuggestions. */
export function SeasonChangeSheet({
  items, signed, dailyMax, userId, onStore, onAskStylist, onClose,
}: {
  items: WardrobeItem[];
  signed: Record<string, string>;
  /** Daytime highs of the coming days; empty when the location is unknown. */
  dailyMax: number[];
  userId: string | undefined;
  onStore: (ids: string[], stored: boolean) => Promise<void>;
  /** Opens the Stylist chat with a question about this season change already written. */
  onAskStylist?: (message: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [plannedIds, setPlannedIds] = useState<Set<string> | null>(null);
  const [away, setAway] = useState<Set<string>>(new Set());
  const [back, setBack] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"away" | "back" | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const highs = useMemo(() => dailyMax.slice(0, DAYS), [dailyMax]);

  // Pieces already planned in the coming weeks (calendar and trips) stay out.
  useEffect(() => {
    if (!userId) { setPlannedIds(new Set()); return; }
    const until = new Date(Date.now() + DAYS * 86400000).toISOString().slice(0, 10);
    void (supabase.from("outfit_plans" as never) as any)
      .select("item_ids").eq("user_id", userId).gte("date", today).lte("date", until)
      .then(({ data }: { data: { item_ids: string[] | null }[] | null }) =>
        setPlannedIds(new Set((data ?? []).flatMap((r) => r.item_ids ?? []))));
  }, [userId, today]);

  const plan = useMemo(
    () => (plannedIds ? seasonChangeSuggestions(items, highs, { today, plannedIds }) : null),
    [items, highs, today, plannedIds],
  );
  useEffect(() => {
    if (!plan) return;
    setAway(new Set(plan.putAway.map((i) => i.id)));
    setBack(new Set(plan.bringBack.map((i) => i.id)));
  }, [plan]);

  const run = async (kind: "away" | "back") => {
    const ids = Array.from(kind === "away" ? away : back);
    if (!ids.length || busy) return;
    setBusy(kind);
    try { await onStore(ids, kind === "away"); } finally { setBusy(null); }
  };

  const label = (it: WardrobeItem) =>
    garmentWithColor(it.subcategory || it.category, it.colors?.[0] ?? it.color, i18n.language) || it.brand || "";
  const grid = (list: WardrobeItem[], picked: Set<string> | null, toggle?: (id: string) => void, note?: (it: WardrobeItem) => string) => (
    <div className="grid grid-cols-3 gap-2">
      {list.map((it) => {
        const on = picked?.has(it.id) ?? false;
        const src = thumbSrc(it, signed);
        return (
          <button key={it.id} disabled={!toggle} onClick={() => toggle?.(it.id)} className="text-left">
            <div className={`relative aspect-[4/5] rounded-xl border overflow-hidden ${on ? "border-foreground border-2" : "border-border/60"}`} style={{ background: "#FFFFFF" }}>
              {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-contain p-1" /> : <div className="h-full w-full" style={{ background: "#EDEDED" }} />}
              {toggle && (
                <span className={`absolute top-1.5 right-1.5 h-5 w-5 rounded-full border flex items-center justify-center ${on ? "bg-foreground border-foreground" : "bg-background/80 border-border"}`}>
                  {on && <Check size={11} className="text-background" />}
                </span>
              )}
            </div>
            <p className="mt-1 text-[12px] leading-snug text-foreground/80 line-clamp-3">{note ? note(it) : label(it)}</p>
          </button>
        );
      })}
    </div>
  );
  const flip = (set: (f: (s: Set<string>) => Set<string>) => void) => (id: string) =>
    set((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-background/80 backdrop-blur flex items-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-card rounded-t-3xl border-t border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[88vh] overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif italic text-xl leading-tight">{t("seasonChange.title")}</p>
          <button onClick={onClose} aria-label={t("wardrobe.closeAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>

        {!highs.length ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("seasonChange.noWeather")}</p>
        ) : !plan ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("seasonChange.forecast", { min: Math.round(Math.min(...highs)), max: Math.round(Math.max(...highs)) })}
            </p>

            <section className="mt-5">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">{t("seasonChange.putAwayTitle", { count: plan.putAway.length })}</p>
              {plan.putAway.length ? (
                <>
                  <p className="text-[11px] text-muted-foreground mb-2">{t("seasonChange.putAwayHint")}</p>
                  {grid(plan.putAway, away, flip(setAway))}
                  <button
                    onClick={() => void run("away")} disabled={!away.size || !!busy}
                    className="mt-3 w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.25em] inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >{busy === "away" && <Loader2 size={12} className="animate-spin" />}{t("seasonChange.putAwayButton", { count: away.size })}</button>
                </>
              ) : <p className="text-sm text-muted-foreground">{t("seasonChange.putAwayNone")}</p>}
            </section>

            {plan.keepOut.length > 0 && (
              <section className="mt-6">
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">{t("seasonChange.keepOutTitle", { count: plan.keepOut.length })}</p>
                <p className="text-[11px] text-muted-foreground mb-2">{t("seasonChange.keepOutHint")}</p>
                {grid(plan.keepOut.map((k) => k.item), null, undefined, (it) => {
                  const reason = plan.keepOut.find((k) => k.item.id === it.id)?.reason;
                  return `${label(it)} · ${t(reason === "planned" ? "seasonChange.reasonPlanned" : "seasonChange.reasonRecent")}`;
                })}
              </section>
            )}

            <section className="mt-6">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">{t("seasonChange.bringBackTitle", { count: plan.bringBack.length })}</p>
              {plan.bringBack.length ? (
                <>
                  <p className="text-[11px] text-muted-foreground mb-2">{t("seasonChange.bringBackHint")}</p>
                  {grid(plan.bringBack, back, flip(setBack))}
                  <button
                    onClick={() => void run("back")} disabled={!back.size || !!busy}
                    className="mt-3 w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.25em] inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >{busy === "back" && <Loader2 size={12} className="animate-spin" />}{t("seasonChange.bringBackButton", { count: back.size })}</button>
                </>
              ) : <p className="text-sm text-muted-foreground">{t("seasonChange.bringBackNone")}</p>}
            </section>

            {onAskStylist && (
              <button
                onClick={() => {
                  const names = (list: WardrobeItem[]) => list.slice(0, 8).map(label).filter(Boolean).join(", ");
                  const parts = [
                    t("seasonChange.askIntro", { min: Math.round(Math.min(...highs)), max: Math.round(Math.max(...highs)) }),
                    away.size ? t("seasonChange.askAway", { names: names(plan.putAway.filter((i) => away.has(i.id))) }) : "",
                    back.size ? t("seasonChange.askBack", { names: names(plan.bringBack.filter((i) => back.has(i.id))) }) : "",
                    t("seasonChange.askQuestion"),
                  ];
                  onAskStylist(parts.filter(Boolean).join(" "));
                }}
                className="mt-6 w-full h-11 rounded-full border border-border text-[10px] uppercase tracking-[0.25em] inline-flex items-center justify-center gap-2"
              ><Sparkles size={12} /> {t("seasonChange.askStylist")}</button>
            )}

            <p className="mt-6 text-[11px] text-muted-foreground">{t("seasonChange.untaggedNote")}</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
