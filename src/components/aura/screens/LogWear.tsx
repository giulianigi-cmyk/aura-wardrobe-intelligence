// AURA — "What did I wear?" screen.
//
// Deliberately mirrors the three-level-of-knowledge model from the
// Phase 2 design: A) what the AI detected, B) what AURA thinks it
// matches in the wardrobe, C) what the person actually confirmed. Only
// C ever becomes a Wear Event — see confirmWearEvent in
// outfit-wear.functions.ts, which is the one and only place that
// happens.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Check, HelpCircle, Plus, ChevronDown, ChevronUp, Search, X, ShoppingBag } from "lucide-react";
import { startOutfitPhotoDetection, confirmWearEvent } from "@/lib/outfit-wear.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { resolveWardrobeUrls, thumbSrc } from "@/lib/wardrobe-image";
import type { WardrobeItem } from "@/lib/aura-types";
import type { Screen } from "../AuraApp";

type Verdict = "certain" | "maybe" | "new";
type Candidate = { wardrobeItemId: string; matchScore: number; verdict: Verdict };
type Detection = {
  detectionId: string;
  category: string;
  subcategory: string;
  colors: string[];
  materials: string[];
  description: string;
  detectionConfidence: number;
  bbox: { x: number; y: number; width: number; height: number };
};
type DetectionResult = {
  id: string;
  photoUrl: string | null;
  itemPhotos: Record<string, string>;
  detections: Detection[];
  candidates: Candidate[];
  status: "pending" | "confirmed" | "dismissed";
};

async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Crops just one detected garment out of the full outfit photo, using
 *  the detector's own bounding box (fractions of the image, same
 *  convention as ItemCropAdjuster elsewhere in the app) — so "add this
 *  to my wardrobe" hands AddItem a photo of the actual piece, not the
 *  whole outfit shot with three other garments in frame. */
function cropToGarment(photoUrl: string, bbox: { x: number; y: number; width: number; height: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const sx = bbox.x * img.naturalWidth;
      const sy = bbox.y * img.naturalHeight;
      const sw = bbox.width * img.naturalWidth;
      const sh = bbox.height * img.naturalHeight;
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no canvas context")); return; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = photoUrl;
  });
}

type Selection = {
  chosenItemId: string | null;
  confirmed: boolean;
  candidateIndex: number;
  manualPhoto?: string | null;
  manualLabel?: string | null;
};

export function LogWear({ go, openBuilder, openAddItemWithGarment }: {
  go: (s: Screen) => void;
  openBuilder: (init: { itemIds: string[]; occasion?: string } | null) => void;
  openAddItemWithGarment: (garment: { photoDataUrl: string; category?: string; colors?: string[]; materials?: string[] }) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const start = useServerFn(startOutfitPhotoDetection);
  const confirm = useServerFn(confirmWearEvent);

  const [stage, setStage] = useState<"upload" | "processing" | "confirm" | "done" | "error">("upload");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [wornAt, setWornAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [occasion, setOccasion] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const [searchingForDetectionId, setSearchingForDetectionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchColumns, setSearchColumns] = useState<2 | 3>(3);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [wardrobeUrls, setWardrobeUrls] = useState<Record<string, string>>({});
  const [croppingDetectionId, setCroppingDetectionId] = useState<string | null>(null);

  useEffect(() => {
    if (searchingForDetectionId === null || wardrobe.length || !user) return;
    void (async () => {
      const { data } = await (supabase.from("wardrobe_items" as never) as any)
        .select("*").eq("user_id", user.id).eq("archived", false);
      const items = (data ?? []) as WardrobeItem[];
      setWardrobe(items);
      setWardrobeUrls(await resolveWardrobeUrls(items));
    })();
  }, [searchingForDetectionId, wardrobe.length, user]);

  const filteredWardrobe = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return wardrobe;
    return wardrobe.filter((it) =>
      [it.brand, it.category, it.subcategory, it.color, ...(it.colors ?? [])].some((f) => f?.toLowerCase().includes(q)));
  }, [wardrobe, searchQuery]);

  const candidatesByDetection = useMemo(() => {
    const map: Record<string, Candidate[]> = {};
    // Never hidden by verdict — the match score is attribute-based, not
    // visual, so a genuinely correct item can easily score as low as
    // 40-50% (no detected brand, no material overlap) while a real
    // mismatch can occasionally do the same. Hiding low scores outright
    // was tried and reverted: it hid correct matches at least as often
    // as it hid wrong ones. What actually matters is never treating a
    // low score as settled — see the "certain"-only auto-confirm below.
    for (const c of result?.candidates ?? []) {
      (map[c.detectionId] ??= []).push(c);
    }
    for (const list of Object.values(map)) list.sort((a, b) => b.matchScore - a.matchScore);
    return map;
  }, [result]);

  const onPickPhoto = async (file: File | null) => {
    if (!file) return;
    setStage("processing");
    setErrorMessage(null);
    try {
      const [photoHash, photoDataUrl] = await Promise.all([hashFile(file), fileToDataUrl(file)]);
      const res = await start({ data: { photoHash, photoDataUrl } });
      if (!res.ok) {
        setErrorMessage(
          res.error === "no_outfit_detected" ? t("logWear.noOutfitDetected") : res.error,
        );
        setStage("error");
        return;
      }
      const det = res.detection as DetectionResult;
      setResult(det);

      const initial: Record<string, Selection> = {};
      for (const d of det.detections) {
        // Every positive-score candidate stays visible — see the note on
        // candidatesByDetection above for why a low score alone was
        // dropped as an exclusion signal. Only a "certain" (>=90%) match
        // gets pre-confirmed automatically; anything else — including a
        // correct item that only scored 50% — is shown for the person to
        // look at and confirm themselves, never silently hidden.
        const cands = (det.candidates as Candidate[])
          .filter((c) => c.detectionId === d.detectionId)
          .sort((a, b) => b.matchScore - a.matchScore);
        const top = cands[0];
        if (top?.verdict === "certain") {
          initial[d.detectionId] = { chosenItemId: top.wardrobeItemId, confirmed: true, candidateIndex: 0 };
        } else if (top) {
          initial[d.detectionId] = { chosenItemId: top.wardrobeItemId, confirmed: false, candidateIndex: 0 };
        } else {
          initial[d.detectionId] = { chosenItemId: null, confirmed: false, candidateIndex: 0 };
        }
      }
      setSelections(initial);
      setStage("confirm");
    } catch (e) {
      console.error("[AURA log-wear] detection failed", e);
      setErrorMessage(e instanceof Error ? e.message : t("logWear.genericError"));
      setStage("error");
    }
  };

  const cycleCandidate = (detectionId: string, direction: 1 | -1) => {
    const cands = candidatesByDetection[detectionId] ?? [];
    if (!cands.length) return;
    setSelections((prev) => {
      const cur = prev[detectionId];
      const nextIndex = (cur.candidateIndex + direction + cands.length) % cands.length;
      return { ...prev, [detectionId]: { ...cur, candidateIndex: nextIndex, chosenItemId: cands[nextIndex].wardrobeItemId, confirmed: false } };
    });
  };

  const toggleConfirmed = (detectionId: string) => {
    setSelections((prev) => ({ ...prev, [detectionId]: { ...prev[detectionId], confirmed: !prev[detectionId].confirmed } }));
  };

  const pickManualItem = (detectionId: string, item: WardrobeItem) => {
    const photo = thumbSrc(item, wardrobeUrls) || null;
    setSelections((prev) => ({
      ...prev,
      [detectionId]: {
        chosenItemId: item.id,
        confirmed: true,
        candidateIndex: -1,
        manualPhoto: photo,
        manualLabel: [item.brand, item.colors?.[0] ?? item.color, item.category].filter(Boolean).join(" "),
      },
    }));
    setSearchingForDetectionId(null);
    setSearchQuery("");
  };

  const addDetectionToWardrobe = async (d: Detection) => {
    if (!result?.photoUrl) return;
    setCroppingDetectionId(d.detectionId);
    try {
      const cropped = await cropToGarment(result.photoUrl, d.bbox);
      openAddItemWithGarment({ photoDataUrl: cropped, category: d.category, colors: d.colors, materials: d.materials });
    } catch (e) {
      console.error("[AURA log-wear] crop failed", e);
      toast.error(t("logWear.genericError"));
    } finally {
      setCroppingDetectionId(null);
    }
  };

  const confirmedItemIds = Object.values(selections)
    .filter((s) => s.confirmed && s.chosenItemId)
    .map((s) => s.chosenItemId!) as string[];

  const onConfirm = async () => {
    if (!confirmedItemIds.length || !result) return;
    setConfirming(true);
    try {
      const res = await confirm({
        data: { photoDetectionId: result.id, itemIds: confirmedItemIds, wornAt, occasion: occasion.trim() || null },
      });
      if (!res.ok) throw new Error(res.error);
      setStage("done");
    } catch (e) {
      console.error("[AURA log-wear] confirm failed", e);
      toast.error(e instanceof Error ? e.message : t("logWear.genericError"));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28 bg-background">
      <header className="px-6 pt-14 pb-2 flex items-center justify-between">
        <button onClick={() => go("wardrobe")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={15} />
        </button>
        <p className="font-serif text-lg italic">{t("logWear.title")}</p>
        <div className="w-10" />
      </header>

      {stage === "upload" && (
        <div className="px-6 mt-10 text-center animate-fade-up">
          <p className="text-sm text-muted-foreground leading-relaxed">{t("logWear.uploadHint")}</p>
          <label className="mt-8 inline-flex h-14 px-8 rounded-full bg-foreground text-background items-center justify-center gap-2 active:scale-95 cursor-pointer">
            <Plus size={16} />
            <span className="text-xs uppercase tracking-[0.3em]">{t("logWear.choosePhoto")}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      )}

      {stage === "processing" && (
        <div className="px-6 mt-16 flex flex-col items-center text-center animate-fade-up">
          <Loader2 size={28} className="animate-spin" />
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed max-w-[240px]">{t("logWear.processing")}</p>
        </div>
      )}

      {stage === "error" && (
        <div className="px-6 mt-16 flex flex-col items-center text-center animate-fade-up">
          <p className="font-serif text-xl italic">{t("logWear.errorTitle")}</p>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed max-w-[260px]">{errorMessage}</p>
          <button
            onClick={() => setStage("upload")}
            className="mt-6 h-12 px-6 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98]"
          >{t("logWear.tryAgain")}</button>
        </div>
      )}

      {stage === "confirm" && result && (
        <div className="px-6 mt-4 animate-fade-up">
          {result.photoUrl && (
            <img src={result.photoUrl} alt="" className="w-full rounded-2xl aspect-[4/5] object-cover" />
          )}

          <p className="mt-5 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("logWear.itemsFound")}</p>

          <div className="mt-3 space-y-3">
            {result.detections.map((d) => {
              const sel = selections[d.detectionId];
              const cands = candidatesByDetection[d.detectionId] ?? [];
              const current = sel?.candidateIndex != null && sel.candidateIndex >= 0 ? cands[sel.candidateIndex] : undefined;
              const photo = sel?.manualPhoto ?? (sel?.chosenItemId ? result.itemPhotos[sel.chosenItemId] : null);
              const isManual = Boolean(sel?.manualLabel);

              if (!current && !isManual) {
                return (
                  <div key={d.detectionId} className="rounded-2xl border border-border/60 p-3 opacity-90">
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 shrink-0 rounded-xl bg-secondary/50 flex items-center justify-center">
                        <HelpCircle size={18} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs">{t("logWear.unrecognized")}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{d.description}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setSearchingForDetectionId(d.detectionId)}
                        className="flex-1 h-9 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-1.5"
                      ><Search size={11} /> {t("logWear.searchWardrobe")}</button>
                      <button
                        onClick={() => void addDetectionToWardrobe(d)}
                        disabled={croppingDetectionId === d.detectionId}
                        className="flex-1 h-9 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {croppingDetectionId === d.detectionId ? <Loader2 size={11} className="animate-spin" /> : <ShoppingBag size={11} />}
                        {t("logWear.addToWardrobe")}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={d.detectionId} className={`rounded-2xl border p-3 ${sel.confirmed ? "border-foreground" : "border-border/60"}`}>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => photo && setZoomedPhoto(photo)}
                      className="h-14 w-14 shrink-0 rounded-xl overflow-hidden active:scale-95 transition"
                      style={{ background: "#FFFFFF" }}
                      aria-label={t("logWear.viewPhotoAria")}
                    >
                      {photo ? <img src={photo} alt="" className="h-full w-full object-contain p-1" /> : null}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs">
                        {isManual ? sel.manualLabel : (
                          <>{current!.verdict === "certain" ? t("logWear.thisIsIt") : t("logWear.thinkItsThis")}{" — "}{Math.round(current!.matchScore * 100)}%</>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{d.description}</p>
                    </div>
                    <button
                      onClick={() => toggleConfirmed(d.detectionId)}
                      className={`h-8 w-8 shrink-0 rounded-full border flex items-center justify-center active:scale-90 ${sel.confirmed ? "bg-foreground border-foreground text-background" : "border-border"}`}
                      aria-label={t("logWear.confirmAria")}
                    ><Check size={14} /></button>
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-2">
                    {cands.length > 1 && !isManual && (
                      <>
                        <button onClick={() => cycleCandidate(d.detectionId, -1)} className="h-7 w-7 rounded-full border border-border flex items-center justify-center"><ChevronUp size={12} /></button>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{t("logWear.changeItem")}</span>
                        <button onClick={() => cycleCandidate(d.detectionId, 1)} className="h-7 w-7 rounded-full border border-border flex items-center justify-center"><ChevronDown size={12} /></button>
                      </>
                    )}
                    <button
                      onClick={() => setSearchingForDetectionId(d.detectionId)}
                      className="h-7 px-3 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] flex items-center gap-1.5"
                    ><Search size={10} /> {t("logWear.searchWardrobe")}</button>
                  </div>
                </div>
              );
            })}
          </div>

          {zoomedPhoto && (
            <div
              className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-8"
              onClick={() => setZoomedPhoto(null)}
            >
              <img src={zoomedPhoto} alt="" className="max-h-full max-w-full object-contain rounded-2xl" style={{ background: "#FFFFFF" }} />
              <button
                onClick={() => setZoomedPhoto(null)}
                className="absolute top-6 right-6 h-10 w-10 rounded-full bg-background/90 flex items-center justify-center"
                aria-label={t("logWear.closeAria")}
              ><X size={16} /></button>
            </div>
          )}

          {searchingForDetectionId && (
            <div
              className="fixed inset-0 z-[80] bg-background/90 backdrop-blur flex flex-col"
              onClick={() => setSearchingForDetectionId(null)}
            >
              <div onClick={(e) => e.stopPropagation()} className="flex flex-col h-full pt-14 px-6 pb-6">
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => setSearchingForDetectionId(null)} className="h-10 w-10 rounded-full border border-border flex items-center justify-center">
                    <X size={15} />
                  </button>
                  <div className="flex-1 rounded-full bg-secondary/60 flex items-center px-4 py-2.5">
                    <Search size={14} className="text-muted-foreground shrink-0" />
                    <input
                      autoFocus
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t("logWear.searchPlaceholder")}
                      className="flex-1 ml-2 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between shrink-0">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    {t("logWear.itemsFound")} · {filteredWardrobe.length}
                  </p>
                  <div className="flex items-center gap-1 rounded-full border border-border p-0.5">
                    <button
                      onClick={() => setSearchColumns(2)}
                      className={`rounded-full px-2.5 py-1 text-[10px] ${searchColumns === 2 ? "bg-foreground text-background" : "text-muted-foreground"}`}
                    >2</button>
                    <button
                      onClick={() => setSearchColumns(3)}
                      className={`rounded-full px-2.5 py-1 text-[10px] ${searchColumns === 3 ? "bg-foreground text-background" : "text-muted-foreground"}`}
                    >3</button>
                  </div>
                </div>
                <div className={`mt-3 flex-1 min-h-0 overflow-y-auto grid gap-2 ${searchColumns === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {filteredWardrobe.map((item) => {
                    // Same helper Wardrobe.tsx's own grid uses — a manual
                    // path lookup here previously ignored thumbnail_path
                    // entirely, and for a wardrobe where most pieces only
                    // had a thumbnail signed (not the full image under
                    // that exact key), the grid rendered as a wall of
                    // empty bordered squares instead of photos.
                    const src = thumbSrc(item, wardrobeUrls);
                    return (
                      <button
                        key={item.id}
                        onClick={() => pickManualItem(searchingForDetectionId, item)}
                        className="aspect-square rounded-xl overflow-hidden border border-border/50 active:scale-95 transition"
                        style={{ background: "#FFFFFF" }}
                      >
                        {src ? <img src={src} alt="" className="h-full w-full object-contain p-1" /> : null}
                      </button>
                    );
                  })}
                  {!wardrobe.length && (
                    <div className="col-span-3 flex justify-center pt-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("logWear.wornOnLabel")}</p>
            <input
              type="date"
              value={wornAt}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setWornAt(e.target.value)}
              className="mt-2 w-full bg-secondary/60 rounded-full px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("logWear.occasionLabel")}</p>
            <input
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
              placeholder={t("logWear.occasionPlaceholder")}
              className="mt-2 w-full bg-secondary/60 rounded-full px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <button
            onClick={() => void onConfirm()}
            disabled={confirming || confirmedItemIds.length === 0}
            className="mt-6 w-full h-14 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98] inline-flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {confirming && <Loader2 size={12} className="animate-spin" />}
            {t("logWear.confirmButton", { count: confirmedItemIds.length })}
          </button>
        </div>
      )}

      {stage === "done" && (
        <div className="px-6 mt-16 flex flex-col items-center text-center animate-fade-up">
          <p className="font-serif text-xl italic">{t("logWear.doneTitle")}</p>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed max-w-[260px]">{t("logWear.doneBody")}</p>
          <button
            onClick={() => openBuilder({ itemIds: confirmedItemIds, occasion: occasion.trim() || undefined })}
            className="mt-6 h-12 px-6 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98]"
          >{t("logWear.openOnCanvas")}</button>
          <button
            onClick={() => go("wardrobe")}
            className="mt-3 h-12 px-6 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] active:scale-[0.98]"
          >{t("logWear.backToCloset")}</button>
        </div>
      )}
    </div>
  );
}
