import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X, Check, Loader2, User, Calendar as CalendarIcon, LayoutGrid, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { saveOutfitPlan } from "@/lib/outfit-plan.functions";
import { useOutfitPlansCacheActions } from "@/lib/outfit-plans-query";
import { useWardrobeItems } from "@/lib/wardrobe-query";
import { resolveWardrobeUrls, toStoragePath } from "@/lib/wardrobe-image";
import type { WardrobeItem } from "@/lib/aura-types";
import { composeOutfitImage, computeBuilderLayout, type BuilderLayoutEntry, type ComposeItem } from "@/lib/compose-outfit-canvas";
import { ShareOutfitSheet } from "./ShareOutfitSheet";

type View = "canvas" | "pieces" | "photo";

/** One place to look at ANY outfit — a Home suggestion, a planned or worn
 *  day, a saved outfit, a trip look — and do the same things with it
 *  everywhere:
 *   - see it as the automatic canvas (the same composition Home builds),
 *     as the pieces side by side (tap one for its photo), or, when there is
 *     a photo of the outfit, that photo first with the pieces underneath;
 *   - try it on the avatar, or open it on the editable canvas;
 *   - save it (as a canvas image + exact layout) and/or put it on a calendar day;
 *   - share it to a friend's chat, the feed, or outside AURA (WhatsApp,
 *     Instagram, …) — sharing needs a saved outfit, so it saves first if needed.
 *
 *  Self-contained: give it the piece ids and it resolves the photos and
 *  composes the canvas itself (unless a stored canvas image is passed). */
export function OutfitViewerSheet({
  itemIds, title, occasion, explanation, notes, photoUrl, canvasPath, canvasUrl: canvasUrlProp,
  outfitId, savedLayout, onClose, onTryOn, onEditOnCanvas, onSaved,
}: {
  itemIds: string[];
  /** small heading, e.g. "Friday, September 18 · Work" */
  title?: string | null;
  occasion?: string | null;
  explanation?: string | null;
  notes?: string | null;
  /** a photo of the outfit (e.g. the one taken when it was worn): shown FIRST, pieces underneath */
  photoUrl?: string | null;
  /** an already-stored canvas image (path in the "outfits" bucket) to show instead of composing */
  canvasPath?: string | null;
  /** a ready-to-use signed URL of that image, if the caller already has one */
  canvasUrl?: string | null;
  /** the outfit is already saved: no need to insert it again to share it */
  outfitId?: string | null;
  /** exact layout of a saved outfit, handed to the editable canvas untouched */
  savedLayout?: BuilderLayoutEntry[] | null;
  onClose: () => void;
  onTryOn: (itemIds: string[]) => void;
  /** open the editable canvas; `layout` is the exact arrangement to show (null = let it auto-place) */
  onEditOnCanvas: (layout: BuilderLayoutEntry[] | null) => void;
  onSaved?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const savePlan = useServerFn(saveOutfitPlan);
  const plansCache = useOutfitPlansCacheActions();
  const itemsQuery = useWardrobeItems();

  const [view, setView] = useState<View>(photoUrl ? "photo" : "canvas");
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [canvasUrl, setCanvasUrl] = useState<string | null>(canvasUrlProp ?? null);
  const [canvasState, setCanvasState] = useState<"loading" | "ready" | "failed">(canvasUrlProp ? "ready" : "loading");
  const blobRef = useRef<Blob | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const [savedId, setSavedId] = useState<string | null>(outfitId ?? null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareFor, setShareFor] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [savingCalendar, setSavingCalendar] = useState(false);

  // ── the pieces ──
  const picks = useMemo(() => {
    const byId = new Map((itemsQuery.data ?? []).map((it) => [it.id, it]));
    return itemIds.map((id) => byId.get(id)).filter((it): it is WardrobeItem => Boolean(it));
  }, [itemsQuery.data, itemIds]);
  const picksKey = picks.map((p) => p.id).join("|");

  useEffect(() => {
    let alive = true;
    if (!picks.length) { setSigned({}); return; }
    void resolveWardrobeUrls(picks).then((m) => { if (alive) setSigned(m); }).catch(() => { /* thumbnails just stay blank */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picksKey]);

  const thumbOf = (it: WardrobeItem): string | null => {
    const path = toStoragePath(it.image_url);
    return path ? signed[path] ?? null : null;
  };

  const composeItems = useMemo<ComposeItem[]>(() => {
    const list: ComposeItem[] = [];
    for (const it of picks) {
      const url = thumbOf(it);
      if (url) list.push({ id: it.id, imgUrl: url, category: it.category, subcategory: it.subcategory, length: it.length });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picksKey, signed]);
  const composeKey = composeItems.map((c) => c.id + c.imgUrl).join("|");

  // ── the canvas image: a stored one, or composed right here ──
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    if (canvasUrlProp) { setCanvasUrl(canvasUrlProp); setCanvasState("ready"); return; }
    if (canvasPath) {
      setCanvasState("loading");
      void supabase.storage.from("outfits").createSignedUrl(canvasPath, 60 * 60).then(({ data }) => {
        if (!alive) return;
        if (data?.signedUrl) { setCanvasUrl(data.signedUrl); setCanvasState("ready"); } else setCanvasState("failed");
      });
      return () => { alive = false; };
    }
    if (!composeItems.length) { setCanvasState(itemsQuery.isSuccess ? "failed" : "loading"); return; }
    setCanvasState("loading");
    void composeOutfitImage(composeItems).then((blob) => {
      if (!alive) return;
      if (!blob) { setCanvasState("failed"); return; }
      blobRef.current = blob;
      objectUrl = URL.createObjectURL(blob);
      setCanvasUrl(objectUrl);
      setCanvasState("ready");
    }).catch(() => { if (alive) setCanvasState("failed"); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeKey, canvasPath, canvasUrlProp, itemsQuery.isSuccess]);

  // ── saving / sharing / calendar ──
  /** Inserts the outfit once (canvas image + exact layout) and returns its id;
   *  later calls return the same id. Null on failure (a toast is shown). */
  const persistOutfit = async (): Promise<string | null> => {
    if (savedId) return savedId;
    if (!user) return null;
    let storedPath: string | null = null;
    const fresh = () => `${user.id}/outfit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    if (canvasPath) {
      // a cached per-day image (Home) or another outfit's file: copy it so this outfit owns its picture
      const to = fresh();
      const { error: copyErr } = await supabase.storage.from("outfits").copy(canvasPath, to);
      storedPath = copyErr ? canvasPath : to;
    } else if (blobRef.current) {
      const to = fresh();
      const { error: upErr } = await supabase.storage.from("outfits").upload(to, blobRef.current, { contentType: "image/png", cacheControl: "3600" });
      if (!upErr) storedPath = to;
    }
    const layout = savedLayout ?? (await computeBuilderLayout(composeItems).catch(() => null));
    const day = new Date().toLocaleDateString(i18n.language, { day: "numeric", month: "short" });
    const { data, error } = await (supabase.from("outfits" as never) as any).insert({
      user_id: user.id,
      item_ids: itemIds,
      canvas_image_url: storedPath,
      layout,
      name: `${occasion || "Look"} · ${day}`,
      occasion: occasion ? [occasion] : [],
      notes: notes ?? null,
    }).select("id").single();
    if (error || !data) { toast.error(error?.message ?? t("avatar.saveFailed")); return null; }
    const id = (data as { id: string }).id;
    setSavedId(id);
    onSaved?.();
    return id;
  };

  const saveCanvas = async () => {
    if (saving || savedId) return;
    setSaving(true);
    try {
      if (await persistOutfit()) toast.success(t("avatar.savedToOutfits"));
    } finally {
      setSaving(false);
    }
  };

  const shareOutfit = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const id = await persistOutfit();
      // An outfit saved earlier without a canvas image has nothing to post outside
      // AURA: store the canvas composed here on it first.
      if (id && outfitId && !canvasPath && blobRef.current && user) {
        const to = `${user.id}/outfit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const { error: upErr } = await supabase.storage.from("outfits").upload(to, blobRef.current, { contentType: "image/png", cacheControl: "3600" });
        if (!upErr) await (supabase.from("outfits" as never) as any).update({ canvas_image_url: to }).eq("id", id).eq("user_id", user.id);
      }
      if (id) setShareFor(id);
    } finally {
      setSharing(false);
    }
  };

  const editOnCanvas = async () => {
    if (opening) return;
    setOpening(true);
    try {
      onEditOnCanvas(savedLayout ?? (await computeBuilderLayout(composeItems).catch(() => null)));
    } finally {
      setOpening(false);
    }
  };

  const saveToCalendar = async () => {
    setSavingCalendar(true);
    try {
      await savePlan({ data: { itemIds, date: calendarDate } });
      plansCache.invalidate();
      toast.success(t("avatar.addedToCalendar"));
      setShowCalendar(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("shareOutfitSheet.couldNotAddToCalendar"));
    } finally {
      setSavingCalendar(false);
    }
  };

  // ── pieces ──
  const piecesGrid = (cols: string, pad: string) => (
    <div className={`grid ${cols} gap-2`}>
      {picks.map((it) => {
        const src = thumbOf(it);
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => src && setLightbox(src)}
            className="aspect-square rounded-xl overflow-hidden border border-border/60 active:scale-95 transition"
            style={{ background: "#FFFFFF" }}
          >
            {src ? <img src={src} alt="" className={`h-full w-full object-contain ${pad}`} loading="lazy" /> : null}
          </button>
        );
      })}
    </div>
  );

  const segments: { key: View; label: string }[] = [
    ...(photoUrl ? [{ key: "photo" as View, label: t("outfitViewer.photo", { defaultValue: "Photo" }) }] : []),
    { key: "canvas", label: t("outfitViewer.canvas", { defaultValue: "Canvas" }) },
    { key: "pieces", label: t("outfitViewer.pieces", { defaultValue: "Pieces" }) },
  ];

  const canvasBlock = (
    <div className="rounded-2xl overflow-hidden aspect-[4/5] shadow-soft flex items-center justify-center" style={{ background: "#FFFFFF" }}>
      {canvasState === "ready" && canvasUrl ? (
        <img src={canvasUrl} alt="" className="h-full w-full object-contain" />
      ) : canvasState === "loading" ? (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-[10px] uppercase tracking-[0.25em]">{t("outfitViewer.composing", { defaultValue: "Composing the canvas" })}</span>
        </div>
      ) : (
        <div className="h-full w-full p-3 overflow-y-auto">{piecesGrid("grid-cols-2", "p-1.5")}</div>
      )}
    </div>
  );

  const content = (
    <div className="fixed inset-0 z-[60] bg-background overflow-y-auto no-scrollbar">
      <div className="px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] max-w-md mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="min-w-0 truncate text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {title || occasion || t("home.todayFallback")}
          </p>
          <button onClick={onClose} aria-label={t("avatar.backAria")} className="h-10 w-10 shrink-0 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90">
            <X size={16} />
          </button>
        </div>

        <div className="flex rounded-full border border-border p-1 mb-3">
          {segments.map((s) => (
            <button
              key={s.key}
              onClick={() => setView(s.key)}
              className={`flex-1 h-8 rounded-full text-[10px] uppercase tracking-[0.2em] ${view === s.key ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >{s.label}</button>
          ))}
        </div>

        {view === "canvas" && canvasBlock}
        {view === "pieces" && piecesGrid("grid-cols-3", "p-2")}
        {view === "photo" && photoUrl && (
          <>
            <img src={photoUrl} alt="" className="w-full rounded-2xl aspect-[4/5] object-cover" />
            <div className="mt-3">{piecesGrid("grid-cols-4", "p-1.5")}</div>
            <button
              onClick={() => setView("canvas")}
              className="mt-3 w-full h-11 rounded-full border border-border flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98]"
            ><LayoutGrid size={13} /> {t("outfitViewer.seeCanvas", { defaultValue: "See canvas" })}</button>
          </>
        )}

        {(explanation || notes) && (
          <p className="mt-4 text-sm text-foreground/80 leading-relaxed">{explanation || notes}</p>
        )}

        <div className="mt-5 space-y-2">
          <button
            onClick={() => void saveCanvas()}
            disabled={!!savedId || saving}
            className="w-full h-12 rounded-full bg-foreground text-background flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : savedId ? <Check size={13} /> : null}
            {savedId ? t("avatar.savedToOutfits") : t("outfitViewer.saveCanvas", { defaultValue: "Save canvas" })}
          </button>
          <button
            onClick={() => setShowCalendar(true)}
            className="w-full h-12 rounded-full border border-border flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98]"
          ><CalendarIcon size={13} /> {t("shareOutfitSheet.addToCalendar")}</button>
          <button
            onClick={() => void shareOutfit()}
            disabled={sharing}
            className="w-full h-12 rounded-full border border-border flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98] disabled:opacity-60"
          >{sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={13} />} {t("shareOutfitSheet.share")}</button>
          <button
            onClick={() => onTryOn(itemIds)}
            className="w-full h-12 rounded-full border border-border flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98]"
          ><User size={13} /> {t("avatar.tryOnCta")}</button>
          <button
            onClick={() => void editOnCanvas()}
            disabled={opening}
            className="w-full h-12 rounded-full border border-border flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98] disabled:opacity-60"
          >{opening ? <Loader2 size={14} className="animate-spin" /> : <LayoutGrid size={13} />} {t("aiStylist.openOnCanvas")}</button>
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[75] bg-black/75 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden aspect-square" style={{ background: "#FFFFFF" }}>
            <img src={lightbox} alt="" className="h-full w-full object-contain p-4" />
          </div>
        </div>
      )}

      {shareFor && <ShareOutfitSheet outfitId={shareFor} onClose={() => setShareFor(null)} />}

      {showCalendar && (
        <div className="fixed inset-0 z-[70] bg-background/95 backdrop-blur flex items-end">
          <div className="w-full bg-card rounded-t-3xl border-t border-border p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-3">
            <p className="font-serif italic text-2xl">{t("shareOutfitSheet.selectDate")}</p>
            <input
              type="date"
              value={calendarDate}
              onChange={(e) => setCalendarDate(e.target.value)}
              className="w-full bg-secondary/60 rounded-full px-4 py-3 text-sm outline-none"
            />
            <button
              onClick={() => void saveToCalendar()}
              disabled={savingCalendar || !calendarDate}
              className="w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98] disabled:opacity-50"
            >{savingCalendar ? <Loader2 size={14} className="animate-spin mx-auto" /> : t("avatar.save")}</button>
            <button onClick={() => setShowCalendar(false)} className="w-full h-11 rounded-full border border-border text-[10px] uppercase tracking-[0.3em]">
              {t("avatar.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
