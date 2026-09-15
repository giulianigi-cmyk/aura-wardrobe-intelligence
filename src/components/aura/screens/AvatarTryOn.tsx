import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles, RefreshCcw, Check, Calendar as CalendarIcon, User, Shirt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { resolveWardrobeUrls } from "@/lib/wardrobe-image";
import { prepareAvatarTryOn, startTryOnStep, checkTryOnStep, finalizeAvatarTryOn } from "@/lib/avatar-tryon.functions";
import { saveOutfitPlan } from "@/lib/outfit-plan.functions";
import type { Screen } from "../AuraApp";

type WardrobeItem = { id: string; category: string | null; subcategory: string | null; image_url: string | null };

type Stage = "pick" | "generating" | "result" | "error";
type View = "person" | "items";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 45; // ~90s per item, matches FASHN's own documented worst case

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** itemIds: pass when arriving from an outfit already picked elsewhere
 *  (AIStylist, SavedOutfits, TripDetail, OutfitBuilder) — the picker step
 *  is skipped and generation starts immediately. Leave undefined to open
 *  the standalone "choose pieces yourself" entry point. */
export function AvatarTryOn({ go, itemIds: initialItemIds }: { go: (s: Screen) => void; itemIds?: string[] }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const prepare = useServerFn(prepareAvatarTryOn);
  const startStep = useServerFn(startTryOnStep);
  const checkStep = useServerFn(checkTryOnStep);
  const finalize = useServerFn(finalizeAvatarTryOn);
  const savePlan = useServerFn(saveOutfitPlan);

  const [stage, setStage] = useState<Stage>(initialItemIds?.length ? "generating" : "pick");
  const [view, setView] = useState<View>("person");
  const [regenerating, setRegenerating] = useState(false);
  const [progress, setProgress] = useState<{ step: number; total: number } | null>(null);

  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [wardrobeUrls, setWardrobeUrls] = useState<Record<string, string>>({});
  const [loadingWardrobe, setLoadingWardrobe] = useState(true);
  const [selected, setSelected] = useState<string[]>(initialItemIds ?? []);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const [saved, setSaved] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [savingCalendar, setSavingCalendar] = useState(false);

  // Bumped on every "Generate"/"Regenerate" press so a stale poll loop
  // from a previous, abandoned attempt can tell it's no longer current
  // and stop touching state — otherwise a slow leftover poll from a
  // cancelled run could overwrite a newer one's result.
  const runToken = useRef(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingWardrobe(true);
      const { data } = await (supabase.from("wardrobe_items" as never) as any)
        .select("id, category, subcategory, image_url")
        .eq("user_id", user.id)
        .eq("archived", false);
      const items = (data ?? []) as WardrobeItem[];
      setWardrobe(items);
      setWardrobeUrls(await resolveWardrobeUrls(items as never));
      setLoadingWardrobe(false);
    })();
  }, [user]);

  /** Runs one chained garment step to completion: submit, then poll every
   *  ~2s until FASHN reports done or failed. Never a single long-held
   *  request — see avatar-tryon.functions.ts for why that mattered. */
  const runOneStep = async (modelImageDataUrl: string, itemId: string): Promise<{ ok: true; imageDataUrl: string } | { ok: false; error: string }> => {
    const started = await startStep({ data: { modelImageDataUrl, itemId } });
    if (!started.ok) return { ok: false, error: started.error };

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      const status = await checkStep({ data: { predictionId: started.predictionId } });
      if (!status.ok) return { ok: false, error: status.error };
      if (status.done) return { ok: true, imageDataUrl: status.imageDataUrl };
      // not done yet — keep polling
    }
    return { ok: false, error: t("avatar.errorTitle") };
  };

  const generate = async (itemIds: string[], forceRegenerate = false) => {
    const myRun = ++runToken.current;
    setStage("generating");
    setErrorMessage(null);
    setErrorCode(null);
    setProgress(null);
    try {
      const prepared = await prepare({ data: { itemIds, forceRegenerate } });
      if (myRun !== runToken.current) return; // superseded by a newer attempt
      if (!prepared.ok) {
        // "no_avatar" specifically means retrying can never succeed —
        // there is nothing to generate against until a photo exists.
        // The error screen below branches on this to send the person to
        // set one up instead of offering a Retry button that would just
        // fail identically forever.
        setErrorMessage(prepared.error === "no_avatar" ? t("avatar.noAvatarYetBody") : prepared.message);
        setErrorCode(prepared.error);
        setStage("error");
        return;
      }
      if (prepared.cached) {
        setResultUrl(prepared.imageUrl);
        setSaved(false);
        setStage("result");
        return;
      }

      let currentModelImage = prepared.avatarImageDataUrl;
      const total = prepared.orderedItemIds.length;
      for (let i = 0; i < total; i++) {
        setProgress({ step: i + 1, total });
        const stepResult = await runOneStep(currentModelImage, prepared.orderedItemIds[i]);
        if (myRun !== runToken.current) return; // superseded
        if (!stepResult.ok) {
          setErrorMessage(stepResult.error);
          setStage("error");
          return;
        }
        currentModelImage = stepResult.imageDataUrl;
      }

      const final = await finalize({ data: { itemIds, finalImageDataUrl: currentModelImage } });
      if (myRun !== runToken.current) return; // superseded
      if (!final.ok) {
        setErrorMessage(final.error);
        setStage("error");
        return;
      }
      setResultUrl(final.imageUrl);
      setSaved(false);
      setStage("result");
    } catch (e) {
      if (myRun !== runToken.current) return;
      console.error("[AURA avatar-tryon] generate failed", e);
      setErrorMessage(e instanceof Error ? e.message : t("avatar.errorTitle"));
      setStage("error");
    } finally {
      if (myRun === runToken.current) setProgress(null);
    }
  };

  useEffect(() => {
    if (initialItemIds?.length && stage === "generating" && !resultUrl && !errorMessage) {
      void generate(initialItemIds);
    }
    // Only on mount for the "arrived with an outfit already chosen" path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const regenerate = async () => {
    setRegenerating(true);
    await generate(selected.length ? selected : (initialItemIds ?? []), true);
    setRegenerating(false);
  };

  const saveAsOutfit = async () => {
    if (!user) return;
    const ids = selected.length ? selected : (initialItemIds ?? []);
    const { error } = await supabase.from("outfits").insert({ user_id: user.id, item_ids: ids } as never);
    if (error) { toast.error(error.message); return; }
    setSaved(true);
    toast.success(t("avatar.savedToOutfits"));
  };

  const saveToCalendar = async () => {
    const ids = selected.length ? selected : (initialItemIds ?? []);
    setSavingCalendar(true);
    try {
      await savePlan({ data: { itemIds: ids, date: calendarDate } });
      toast.success(t("avatar.addedToCalendar"));
      setShowCalendarPicker(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("avatar.saveFailed"));
    } finally {
      setSavingCalendar(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      <header className="px-6 pt-14 pb-3 flex items-center gap-3">
        <button onClick={() => go("avatar")} aria-label={t("avatar.backAria")} className="h-10 w-10 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90">
          <ArrowLeft size={16} />
        </button>
        <h1 className="font-serif text-2xl italic">{t("avatar.tryOnTitle")}</h1>
      </header>

      {stage === "pick" && (
        <div className="px-6 mt-2 animate-fade-up">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("avatar.pickItemsEyebrow")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("avatar.pickItemsHint")}</p>

          {loadingWardrobe ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {wardrobe.map((it) => {
                const on = selected.includes(it.id);
                const url = it.image_url ? wardrobeUrls[it.image_url] : undefined;
                return (
                  <button
                    key={it.id}
                    onClick={() => toggleSelect(it.id)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition ${on ? "border-foreground" : "border-transparent"}`}
                  >
                    {url && <img src={url} alt="" className="h-full w-full object-cover bg-secondary/40" />}
                    {on && (
                      <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-foreground text-background flex items-center justify-center">
                        <Check size={11} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={() => void generate(selected)}
            disabled={selected.length === 0}
            className="fixed bottom-24 left-6 right-6 h-14 rounded-full bg-foreground text-background flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-luxe disabled:opacity-40"
          >
            <Sparkles size={16} />
            <span className="text-xs uppercase tracking-[0.3em]">
              {t("avatar.generate")}{selected.length ? ` · ${t("avatar.selectedCount", { count: selected.length })}` : ""}
            </span>
          </button>
        </div>
      )}

      {stage === "generating" && (
        <div className="px-6 mt-16 flex flex-col items-center text-center animate-fade-up">
          <Loader2 size={28} className="animate-spin" />
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed max-w-[220px]">
            {progress && progress.total > 1 ? `${t("avatar.generating")} (${progress.step}/${progress.total})` : t("avatar.generating")}
          </p>
        </div>
      )}

      {stage === "error" && errorCode === "no_avatar" && (
        <div className="px-6 mt-16 flex flex-col items-center text-center animate-fade-up">
          <p className="font-serif text-xl italic">{t("avatar.noAvatarYetTitle")}</p>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed max-w-[260px]">{errorMessage}</p>
          <button
            onClick={() => go("avatar")}
            className="mt-6 h-12 px-6 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98]"
          >{t("avatar.setUpNow")}</button>
        </div>
      )}

      {stage === "error" && errorCode !== "no_avatar" && (
        <div className="px-6 mt-16 flex flex-col items-center text-center animate-fade-up">
          <p className="font-serif text-xl italic">{t("avatar.errorTitle")}</p>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed max-w-[260px]">{errorMessage}</p>
          <button
            onClick={() => void generate(selected.length ? selected : (initialItemIds ?? []), true)}
            className="mt-6 h-12 px-6 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98]"
          >{t("avatar.retry")}</button>
        </div>
      )}

      {stage === "result" && (
        <div className="px-6 mt-2 animate-fade-up">
          <div className="flex items-center justify-center gap-1 rounded-full border border-border p-1 w-fit mx-auto">
            <button
              onClick={() => setView("person")}
              className={`h-9 px-4 rounded-full flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] transition ${view === "person" ? "bg-foreground text-background" : "text-muted-foreground"}`}
            ><User size={12} /> {t("avatar.viewPerson")}</button>
            <button
              onClick={() => setView("items")}
              className={`h-9 px-4 rounded-full flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] transition ${view === "items" ? "bg-foreground text-background" : "text-muted-foreground"}`}
            ><Shirt size={12} /> {t("avatar.viewItems")}</button>
          </div>

          <div className="mt-4 rounded-3xl overflow-hidden bg-secondary/40 aspect-[4/5]">
            {view === "person" ? (
              resultUrl && <img src={resultUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid grid-cols-3 gap-1 h-full p-1">
                {(selected.length ? selected : (initialItemIds ?? [])).map((id) => {
                  const it = wardrobe.find((w) => w.id === id);
                  const url = it?.image_url ? wardrobeUrls[it.image_url] : undefined;
                  return (
                    <div key={id} className="rounded-lg overflow-hidden bg-background">
                      {url && <img src={url} alt="" className="h-full w-full object-contain" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => void regenerate()}
              disabled={regenerating}
              className="h-12 rounded-full border border-border flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] disabled:opacity-50"
            >{regenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />} {t("avatar.regenerate")}</button>
            <button
              onClick={() => void saveAsOutfit()}
              disabled={saved}
              className="h-12 rounded-full bg-foreground text-background flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] disabled:opacity-60"
            >{saved ? <Check size={13} /> : null} {t("avatar.save")}</button>
          </div>

          <button
            onClick={() => setShowCalendarPicker(true)}
            className="mt-2 w-full h-12 rounded-full border border-border flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em]"
          ><CalendarIcon size={13} /> {t("avatar.showOnCalendar")}</button>

          {showCalendarPicker && (
            <div className="fixed inset-0 z-[70] bg-background/95 backdrop-blur flex items-end">
              <div className="w-full bg-card rounded-t-3xl border-t border-border p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-3">
                <p className="font-serif italic text-2xl">{t("avatar.selectDate")}</p>
                <input
                  type="date"
                  value={calendarDate}
                  onChange={(e) => setCalendarDate(e.target.value)}
                  className="w-full bg-secondary/60 rounded-full px-4 py-3 text-sm outline-none"
                />
                <button
                  onClick={() => void saveToCalendar()}
                  disabled={savingCalendar}
                  className="w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98] disabled:opacity-50"
                >{savingCalendar ? <Loader2 size={14} className="animate-spin mx-auto" /> : t("avatar.save")}</button>
                <button onClick={() => setShowCalendarPicker(false)} className="w-full h-11 rounded-full border border-border text-[10px] uppercase tracking-[0.3em]">
                  {t("avatar.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
