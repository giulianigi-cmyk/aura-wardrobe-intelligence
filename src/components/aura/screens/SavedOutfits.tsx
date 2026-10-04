import { useCallback, useEffect, useState } from "react";
import { saveGeneralPlanAskingSameDay } from "@/lib/same-day-choice";
import { toast } from "sonner";
import { ArrowLeft, Heart, Sparkles, Calendar as CalendarIcon, Loader2, Plus, Trash2, Copy, Share2 } from "lucide-react";
import type { BuilderInit, Screen } from "../AuraApp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ShareOutfitSheet } from "../ShareOutfitSheet";
import type { Tables } from "@/integrations/supabase/types";
import { useTranslation } from "react-i18next";
import { outfitThumbSrc, backfillOutfitThumbs } from "@/lib/outfit-thumb";
import { OutfitThumb } from "../OutfitThumb";

type Outfit = Tables<"outfits">;

export function SavedOutfits({ go, openBuilder }: { go: (s: Screen) => void; openBuilder: (init: BuilderInit) => void }) {

  const { user } = useAuth();
  const { t } = useTranslation();
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [assignFor, setAssignFor] = useState<Outfit | null>(null);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [shareFor, setShareFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("outfits")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
        const list = (data ?? []) as Outfit[];
    setOutfits(list);
    // Sign both the thumbnail (used for display when present) and the
    // original canvas image (fallback for outfits saved before the
    // thumbnail pipeline, or if the thumb fails to load).
    const paths = list.flatMap((o) => [o.thumbnail_path, o.canvas_image_url]).filter(Boolean) as string[];
    if (paths.length) {

            const { data: urls } = await supabase.storage.from("outfits").createSignedUrls(paths, 60 * 60);
      const map: Record<string, string> = {};
      urls?.forEach((r, i) => { if (r.signedUrl) map[paths[i]] = r.signedUrl; });
      setSigned(map);
    } else {
      setSigned({});
    }
    setLoading(false);
    void backfillOutfitThumbs(user.id).then((done) => {
      if (done > 0) void load();
    });
  }, [user]);


  useEffect(() => { void load(); }, [load]);

  const assignToDay = async () => {
    if (!assignFor || !user) return;
    // No calendar event / trip here: this is the day's general slot, whose
    // unique constraint is (user_id, general_date). See outfit-plan-slot.ts.
    // A day that already has another outfit: add this one too or replace it (same-day-choice.ts).
    try {
      const planId = await saveGeneralPlanAskingSameDay(supabase, user.id, date, {
        item_ids: assignFor.item_ids,
        occasion: assignFor.occasion?.[0] ?? null,
        notes: assignFor.notes ?? assignFor.name ?? null,
      }, t);
      if (!planId) return;
    } catch (e) { toast.error(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)); return; }
    toast.success(t("savedOutfits.addedToCalendar"));
    setAssignFor(null);
    go("planner");
  };

  const deleteOutfit = async (id: string) => {
    if (!user) return;
    const outfit = outfits.find((o) => o.id === id);
    setDeleting(true);
    const { error } = await supabase.from("outfits").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      setDeleting(false);
      toast.error(error.message);
      return;
    }
    if (outfit?.canvas_image_url) {
      try { await supabase.storage.from("outfits").remove([outfit.canvas_image_url]); } catch { /* best-effort */ }
    }
    setOutfits((prev) => prev.filter((o) => o.id !== id));
    setConfirmDelete(null);
    setDeleting(false);
    toast.success(t("savedOutfits.deleted"));
  };
  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28 bg-background">
      <header className="px-6 pt-14 pb-2 flex items-center justify-between">
        <button onClick={() => go("profile")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={15} />
        </button>
        <p className="font-serif text-lg italic">{t("savedOutfits.title")}</p>
        <button
          onClick={() => go("builder")}
          className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90"
          aria-label={t("savedOutfits.create")}
        ><Plus size={15} /></button>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
      ) : outfits.length === 0 ? (
        <section className="mx-6 mt-6 rounded-3xl bg-card border border-border/60 p-8 text-center shadow-soft animate-fade-up">
          <div className="mx-auto h-14 w-14 rounded-full bg-secondary/60 flex items-center justify-center mb-4">
            <Heart size={20} />
          </div>
          <h2 className="font-serif text-2xl italic">{t("savedOutfits.emptyTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {t("savedOutfits.emptyBody")}
          </p>
          <button
            onClick={() => go("builder")}
            className="mt-6 h-11 px-6 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98] inline-flex items-center gap-2"
          ><Sparkles size={12} /> {t("savedOutfits.openBuilder")}</button>
        </section>
      ) : (
        <div className="mx-4 mt-4 grid grid-cols-2 gap-3">
                    {outfits.map((o) => {
            const url = outfitThumbSrc(o, signed);
            const imgPath = o.thumbnail_path || o.canvas_image_url;
            const open = () => openBuilder({

              itemIds: o.item_ids,
              name: o.name,
              occasion: o.occasion?.[0],
              notes: o.notes ?? undefined,
              outfitId: o.id,
            });
            const duplicate = () => openBuilder({
              itemIds: o.item_ids,
              name: t("savedOutfits.copyName", { name: o.name }),
              occasion: o.occasion?.[0],
              notes: o.notes ?? undefined,
            });
            return (
              <div key={o.id} className="rounded-2xl overflow-hidden border border-border/60 bg-card shadow-soft relative">
                                <button onClick={open} className="block w-full text-left active:scale-[0.98]">
                  {imgPath ? (
                    <OutfitThumb path={imgPath} url={url} alt={o.name} signing={loading} className="aspect-square" />
                  ) : (
                    <div className="aspect-square flex items-center justify-center text-xs text-muted-foreground">{t("savedOutfits.openCanvas")}</div>
                  )}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); duplicate(); }}
                  aria-label={t("savedOutfits.duplicate")}
                  className="absolute top-2 right-20 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-90 shadow-soft"
                ><Copy size={14} /></button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShareFor(o.id); }}
                  aria-label={t("savedOutfits.share")}
                  className="absolute top-2 right-11 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-90 shadow-soft"
                ><Share2 size={14} /></button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(o.id); }}
                  aria-label={t("savedOutfits.delete")}
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-90 shadow-soft"
                ><Trash2 size={14} /></button>
                <div className="p-3">
                  <button onClick={open} className="block w-full text-left">
                    <p className="font-serif text-base truncate">{o.name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("savedOutfits.pieces", { count: o.item_ids.length })}</p>
                  </button>
                  <button
                    onClick={() => setAssignFor(o)}
                    className="mt-2 h-8 w-full rounded-full border border-border text-[10px] uppercase tracking-[0.25em] active:scale-[0.98] inline-flex items-center justify-center gap-1.5"
                  ><CalendarIcon size={11} /> {t("savedOutfits.plan")}</button>
                </div>

                {confirmDelete === o.id && (
                  <div className="absolute inset-0 z-10 bg-background/90 backdrop-blur flex flex-col items-center justify-center gap-2 p-3 text-center">
                    <p className="text-xs">{t("savedOutfits.confirmDelete")}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="h-8 px-4 rounded-full border border-border text-[10px] uppercase tracking-[0.2em]"
                      >{t("savedOutfits.cancel")}</button>
                      <button
                        disabled={deleting}
                        onClick={() => void deleteOutfit(o.id)}
                        className="h-8 px-4 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.2em] disabled:opacity-60"
                      >{deleting ? "…" : t("savedOutfits.deleteButton")}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {shareFor && (
        <ShareOutfitSheet outfitId={shareFor} onClose={() => setShareFor(null)} />
      )}

      {assignFor && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end" onClick={() => setAssignFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-card rounded-t-3xl border-t border-border p-5 space-y-3">
            <p className="font-serif italic text-lg">{t("savedOutfits.assignTitle")}</p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-secondary/60 rounded-full px-4 py-2.5 text-sm outline-none"
            />
            <button
              onClick={assignToDay}
              className="w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98]"
            >{t("savedOutfits.saveToCalendar")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
