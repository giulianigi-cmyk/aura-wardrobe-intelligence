// AURA — "What did I wear?" screen.
//
// Deliberately mirrors the three-level-of-knowledge model from the
// Phase 2 design: A) what the AI detected, B) what AURA thinks it
// matches in the wardrobe, C) what the person actually confirmed. Only
// C ever becomes a Wear Event — see confirmWearEvent in
// outfit-wear.functions.ts, which is the one and only place that
// happens.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Check, HelpCircle, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { startOutfitPhotoDetection, confirmWearEvent } from "@/lib/outfit-wear.functions";
import type { Screen } from "../AuraApp";

type Verdict = "certain" | "maybe" | "new";
type Candidate = { wardrobeItemId: string; matchScore: number; verdict: Verdict };
type Detection = { detectionId: string; category: string; subcategory: string; colors: string[]; description: string; detectionConfidence: number };
type DetectionResult = {
  id: string;
  photoUrl: string | null;
  itemPhotos: Record<string, string>;
  detections: Detection[];
  candidates: Candidate[];
  status: "pending" | "confirmed" | "dismissed";
};

/** SHA-256 of the raw file — computed once, client-side, purely so the
 *  server can recognize "this exact photo was already uploaded" without
 *  ever needing to re-run detection on a duplicate (see the unique
 *  index on outfit_photo_detections in the migration). */
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

type Selection = { chosenItemId: string | null; confirmed: boolean; candidateIndex: number };

export function LogWear({ go, openBuilder }: { go: (s: Screen) => void; openBuilder: (init: { itemIds: string[]; occasion?: string } | null) => void }) {
  const { t } = useTranslation();
  const start = useServerFn(startOutfitPhotoDetection);
  const confirm = useServerFn(confirmWearEvent);

  const [stage, setStage] = useState<"upload" | "processing" | "confirm" | "done" | "error">("upload");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [wornAt, setWornAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [occasion, setOccasion] = useState("");
  const [confirming, setConfirming] = useState(false);

  const candidatesByDetection = useMemo(() => {
    const map: Record<string, Candidate[]> = {};
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
        const cands = (det.candidates as Candidate[]).filter((c) => c.detectionId === d.detectionId).sort((a, b) => b.matchScore - a.matchScore);
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
              const current = cands[sel?.candidateIndex ?? 0];
              const photo = sel?.chosenItemId ? result.itemPhotos[sel.chosenItemId] : null;

              if (!current) {
                return (
                  <div key={d.detectionId} className="flex items-center gap-3 rounded-2xl border border-border/60 p-3 opacity-70">
                    <div className="h-14 w-14 shrink-0 rounded-xl bg-secondary/50 flex items-center justify-center">
                      <HelpCircle size={18} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs">{t("logWear.unrecognized")}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{d.description}</p>
                    </div>
                  </div>
                );
              }

              return (
                <div key={d.detectionId} className={`rounded-2xl border p-3 ${sel.confirmed ? "border-foreground" : "border-border/60"}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden" style={{ background: "#FFFFFF" }}>
                      {photo ? <img src={photo} alt="" className="h-full w-full object-contain p-1" /> : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs">
                        {current.verdict === "certain" ? t("logWear.thisIsIt") : t("logWear.thinkItsThis")}
                        {" — "}{Math.round(current.matchScore * 100)}%
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{d.description}</p>
                    </div>
                    <button
                      onClick={() => toggleConfirmed(d.detectionId)}
                      className={`h-8 w-8 shrink-0 rounded-full border flex items-center justify-center active:scale-90 ${sel.confirmed ? "bg-foreground border-foreground text-background" : "border-border"}`}
                      aria-label={t("logWear.confirmAria")}
                    ><Check size={14} /></button>
                  </div>
                  {cands.length > 1 && (
                    <div className="mt-2 flex items-center justify-center gap-3">
                      <button onClick={() => cycleCandidate(d.detectionId, -1)} className="h-7 w-7 rounded-full border border-border flex items-center justify-center"><ChevronUp size={12} /></button>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{t("logWear.changeItem")}</span>
                      <button onClick={() => cycleCandidate(d.detectionId, 1)} className="h-7 w-7 rounded-full border border-border flex items-center justify-center"><ChevronDown size={12} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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
