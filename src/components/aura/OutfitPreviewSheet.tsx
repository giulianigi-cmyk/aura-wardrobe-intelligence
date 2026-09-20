import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X, Check, Loader2, Sparkles, User, Calendar as CalendarIcon, LayoutGrid, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { saveOutfitPlan } from "@/lib/outfit-plan.functions";
import { useOutfitPlansCacheActions } from "@/lib/outfit-plans-query";
import type { DailyLook } from "@/lib/suggest-daily-looks.functions";
import { ShareOutfitSheet } from "./ShareOutfitSheet";
import { computeBuilderLayout, type BuilderLayoutEntry, type ComposeItem } from "@/lib/compose-outfit-canvas";

/** Full-screen view of one Home look (Today's edit or a Curated card),
 *  opened by tapping the card. Shows the composed canvas large and offers
 *  the things a person actually wants to do with it:
 *   - Save it to "My outfits";
 *   - Share it (a friend's private chat, the feed, or outside AURA:
 *     WhatsApp, Instagram, …) through the same ShareOutfitSheet the
 *     saved-outfits list uses — sharing needs a saved outfit, so it is
 *     saved first if it isn't yet;
 *   - Try it on their avatar (hands the item ids to the existing
 *     AvatarTryOn flow, which starts generating right away);
 *   - Put it on a day in the calendar (same outfit_plans path the
 *     avatar try-on and the share sheet use). */
export function OutfitPreviewSheet({
  look, imageUrl, imagePath, thumbs, composeItems, onClose, onTryOn, onEditOnCanvas, onSaved,
}: {
  look: DailyLook;
  /** signed URL of the composed image, when available */
  imageUrl: string | null;
  /** storage path (outfits bucket) of the composed image, when available */
  imagePath: string | null;
  /** fallback item thumbnails (same order as look.item_ids) */
  thumbs: (string | null)[];
  /** the same items (with signed URLs) Home composed the image from — used to
   *  re-derive the exact arrangement, so nothing moves when the look is
   *  saved or opened on the canvas */
  composeItems: ComposeItem[];
  onClose: () => void;
  onTryOn: (itemIds: string[]) => void;
  /** open the editable canvas with this exact layout */
  onEditOnCanvas: (layout: BuilderLayoutEntry[] | null) => void;
  onSaved?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const savePlan = useServerFn(saveOutfitPlan);
  const plansCache = useOutfitPlansCacheActions();

  const [opening, setOpening] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [savingCalendar, setSavingCalendar] = useState(false);

  /** Inserts the outfit once (with its image + exact layout) and returns its id;
   *  later calls return the same id. Null on failure (a toast is shown). */
  const persistOutfit = async (): Promise<string | null> => {
    if (savedId) return savedId;
    if (!user) return null;
    // The composed image lives under a per-day cache path that the Home
    // regenerates; copy it to its own file so the saved outfit keeps its
    // picture. Falls back to the original path if the copy is refused.
    let canvasPath: string | null = imagePath;
    if (imagePath) {
      const copyTo = `${user.id}/outfit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      const { error: copyErr } = await supabase.storage.from("outfits").copy(imagePath, copyTo);
      if (!copyErr) canvasPath = copyTo;
    }
    // Save the real arrangement too, so reopening this outfit on the canvas
    // shows the garments exactly where Home put them instead of re-guessing.
    const layout = await computeBuilderLayout(composeItems).catch(() => null);
    const day = new Date().toLocaleDateString(i18n.language, { day: "numeric", month: "short" });
    const { data, error } = await (supabase.from("outfits" as never) as any).insert({
      user_id: user.id,
      item_ids: look.item_ids,
      canvas_image_url: canvasPath,
      layout,
      name: `${look.occasion || "Look"} · ${day}`,
      occasion: look.occasion ? [look.occasion] : [],
    }).select("id").single();
    if (error || !data) { toast.error(error?.message ?? t("avatar.saveFailed")); return null; }
    const id = (data as { id: string }).id;
    setSavedId(id);
    setSaved(true);
    onSaved?.();
    return id;
  };

  const saveOutfit = async () => {
    if (saved || saving) return;
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
      if (id) setShareFor(id);
    } finally {
      setSharing(false);
    }
  };

  const editOnCanvas = async () => {
    if (opening) return;
    setOpening(true);
    try {
      onEditOnCanvas(await computeBuilderLayout(composeItems).catch(() => null));
    } finally {
      setOpening(false);
    }
  };

  const saveToCalendar = async () => {
    setSavingCalendar(true);
    try {
      await savePlan({ data: { itemIds: look.item_ids, date: calendarDate } });
      plansCache.invalidate();
      toast.success(t("avatar.addedToCalendar"));
      setShowCalendar(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("shareOutfitSheet.couldNotAddToCalendar"));
    } finally {
      setSavingCalendar(false);
    }
  };

  const content = (
    <div className="fixed inset-0 z-[60] bg-background overflow-y-auto no-scrollbar">
      <div className="px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1.5">
            <Sparkles size={11} />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{look.occasion || t("home.todayFallback")}</span>
          </div>
          <button onClick={onClose} aria-label={t("avatar.backAria")} className="h-10 w-10 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl overflow-hidden aspect-[4/5] shadow-soft" style={{ background: "#FFFFFF" }}>
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="h-full w-full p-3 grid grid-cols-2 gap-2">
              {look.item_ids.slice(0, 6).map((id, i) => (
                <div key={id} className="rounded-xl overflow-hidden bg-secondary/30 flex items-center justify-center">
                  {thumbs[i] ? <img src={thumbs[i]!} alt="" className="h-full w-full object-contain p-1.5" /> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {look.explanation ? (
          <p className="mt-4 text-sm text-foreground/80 leading-relaxed">{look.explanation}</p>
        ) : null}

        <div className="mt-5 space-y-2">
          <button
            onClick={() => void saveOutfit()}
            disabled={saved || saving}
            className="w-full h-12 rounded-full bg-foreground text-background flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={13} /> : null}
            {saved ? t("avatar.savedToOutfits") : t("avatar.save")}
          </button>
          <button
            onClick={() => void shareOutfit()}
            disabled={sharing}
            className="w-full h-12 rounded-full border border-border flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98] disabled:opacity-60"
          >{sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={13} />} {t("shareOutfitSheet.share")}</button>
          <button
            onClick={() => onTryOn(look.item_ids)}
            className="w-full h-12 rounded-full border border-border flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98]"
          ><User size={13} /> {t("avatar.tryOnCta")}</button>
          <button
            onClick={() => void editOnCanvas()}
            disabled={opening}
            className="w-full h-12 rounded-full border border-border flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98] disabled:opacity-60"
          >{opening ? <Loader2 size={14} className="animate-spin" /> : <LayoutGrid size={13} />} {t("aiStylist.openOnCanvas")}</button>
          <button
            onClick={() => setShowCalendar(true)}
            className="w-full h-12 rounded-full border border-border flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98]"
          ><CalendarIcon size={13} /> {t("shareOutfitSheet.addToCalendar")}</button>
        </div>
      </div>

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
