import { useRef, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import { ArrowLeft, Camera, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Screen } from "../AuraApp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWardrobeCacheActions } from "@/lib/wardrobe-query";
import { useOutfitPlansCacheActions } from "@/lib/outfit-plans-query";
import { compressImageForUpload } from "@/lib/image-compress";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { WardrobeItem } from "@/lib/aura-types";
import { DetectedItemCard } from "@/components/aura/DetectedItemCard";
import { ItemCropAdjuster, type FractionalBox } from "@/components/aura/ItemCropAdjuster";
import { removeBackgroundClient } from "@/lib/bg-removal-client";
import { PiecePicker } from "../PiecePicker";
import { detectOutfitPhotoItems, saveScanPhotoForWear } from "@/lib/outfit-scan-detect.functions";
import { cropItemFromSegmentation } from "@/lib/outfit-segmentation";
import type { DedupeResult } from "@/lib/outfit-dedupe";
import { rankCandidates, retrieveCandidates, verdictForScore, type DetectedGarment, type MatchConfidence, type Pattern, type RankedCandidate, type VisualScore } from "@/lib/outfit-match";
import { rerankOutfitCandidates } from "@/lib/outfit-scan-match.functions";
import { findVisualDuplicates, confirmWearEvent } from "@/lib/outfit-wear.functions";
import { startGarmentExtraction, checkGarmentExtraction, describeGarmentDetails } from "@/lib/outfit-garment-extract.functions";
import { trimFileMargins } from "@/lib/auto-crop";
import { resolveWardrobeUrls, toStoragePath } from "@/lib/wardrobe-image";

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fileToDataUrl(f: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

/** Plain rectangular crop straight from the bbox, no per-pixel mask — the fallback for whenever
 *  cropItemFromSegmentation finds no confident region for this category (rare, but the AI
 *  detector can flag something the segmentation model's fixed label set has no match for, or a
 *  connected-component that fails its own sanity checks). No transparency: the caller marks the
 *  resulting ScanItem `transparent: false` accordingly. */
async function cropFromBBox(photoDataUrl: string, bbox: { x: number; y: number; width: number; height: number } | null): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image load failed"));
      el.src = photoDataUrl;
    });
    const b = bbox ?? { x: 0, y: 0, width: 1, height: 1 };
    const sx = Math.round(b.x * img.naturalWidth);
    const sy = Math.round(b.y * img.naturalHeight);
    const sw = Math.max(8, Math.round(b.width * img.naturalWidth));
    const sh = Math.max(8, Math.round(b.height * img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = sw; canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return null;
  }
}

/** Same bbox crop, downscaled for the visual comparison with the wardrobe (outfit-match.ts level 2):
 *  ~640px JPEG keeps shade, pattern and details readable while staying small to upload. The crop
 *  keeps some context around the garment on purpose — the model is told which piece to look at. */
async function cropForMatch(photoDataUrl: string, bbox: { x: number; y: number; width: number; height: number } | null): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image load failed"));
      el.src = photoDataUrl;
    });
    const b = bbox ?? { x: 0, y: 0, width: 1, height: 1 };
    const pad = 0.04;
    const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad);
    const x1 = Math.min(1, b.x + b.width + pad), y1 = Math.min(1, b.y + b.height + pad);
    const sw = Math.max(8, Math.round((x1 - x0) * img.naturalWidth));
    const sh = Math.max(8, Math.round((y1 - y0) * img.naturalHeight));
    const scale = Math.min(1, 640 / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, Math.round(x0 * img.naturalWidth), Math.round(y0 * img.naturalHeight), sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

/** Runs async jobs with a small concurrency limit (independent per-garment comparisons). */
async function runLimited<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results = new Array<T>(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) { const i = next++; results[i] = await jobs[i](); }
  }));
  return results;
}

type ScanItem = {
  key: string;
  category: string;
  subcategory: string;
  colors: string[];
  materials: string[];
  seasons: string[];
  brand: string;
  description: string;
  imageDataUrl: string;
  transparent: boolean;
  dedupe: DedupeResult;
  candidates: RankedCandidate[];
  candidateIndex: number;
  /** outfit-match.ts verdict: high = proposed directly, medium = confirm with alternatives, low = no match forced. */
  confidence: MatchConfidence;
  visualChecked: boolean;
  status: "pending" | "confirmed-new" | "confirmed-duplicate";
  price: string;
  currency: string;
  size: string;
  styles: string[];
  occasions: string[];
  purchaseDate: string;
  sleeveLength: string;
  formality: number | null;
  dayEvening: string;
  length: string;
  fit: string;
  heelHeight: string;
  toeShape: string;
  closure: string;
  gender: string;
  styleTags: string[];
  model: string;
  bagSizeClass: string;
  sourcePhotoDataUrl: string;
  sourceMaskDataUrl: string;
  bbox: { x: number; y: number; width: number; height: number } | null;
  reconstructing: boolean;
};


function ownedScanItem(item: WardrobeItem, sourcePhoto: string): ScanItem {
  const colors = (item.colors && item.colors.length ? item.colors : item.color ? [item.color] : []) as string[];
  return {
    key: `owned-${item.id}-${Date.now()}`,
    category: item.category ?? "", subcategory: item.subcategory ?? "", colors,
    materials: [], seasons: [], brand: item.brand ?? "",
    description: [colors[0], item.subcategory || item.category || ""].filter(Boolean).join(" "),
    imageDataUrl: "", transparent: false,
    dedupe: { score: 1, match: item, verdict: "certain" },
    candidates: [{ item, score: 1 }], candidateIndex: 0,
    confidence: "high", visualChecked: false,
    status: "confirmed-duplicate",
    price: "", currency: "EUR", size: "", styles: [], occasions: [],
    purchaseDate: new Date().toISOString().slice(0, 10),
    sleeveLength: "", formality: null, dayEvening: "", length: "", fit: "", heelHeight: "", toeShape: "",
    closure: "", gender: "", styleTags: [], model: "", bagSizeClass: "",
    sourcePhotoDataUrl: sourcePhoto, sourceMaskDataUrl: "", bbox: null, reconstructing: false,
  };
}

/** Up to 4 wardrobe candidates for one detected garment, best first, each with its picture, a short
 *  name and the match percentage (outfit-match.ts). Tapping one selects it. */
function CandidateStrip({ candidates, selectedIndex, thumbs, onSelect }: {
  candidates: RankedCandidate[];
  selectedIndex: number | null;
  thumbs: Record<string, string>;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-4 gap-2">
      {candidates.slice(0, 4).map((c, i) => {
        const label = [c.item.colors?.[0] ?? c.item.color, c.item.subcategory || c.item.category].filter(Boolean).join(" ");
        const selected = i === selectedIndex;
        return (
          <button
            key={c.item.id}
            onClick={() => onSelect(i)}
            className={`min-w-0 rounded-xl border p-1 text-center active:scale-[0.97] ${selected ? "border-foreground border-2" : "border-border"}`}
          >
            <div className="aspect-square rounded-lg overflow-hidden" style={{ background: "#FFFFFF" }}>
              {thumbs[c.item.id] && <img src={thumbs[c.item.id]} alt="" className="h-full w-full object-contain p-0.5" />}
            </div>
            <p className="mt-1 text-[10px] font-medium">{Math.round(c.score * 100)}%</p>
            <p className="text-[9px] leading-tight text-muted-foreground truncate">{label}</p>
          </button>
        );
      })}
    </div>
  );
}

export function OutfitScan({ go }: { go: (s: Screen) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [existingBrands, setExistingBrands] = useState<string[]>([]);
  useEffect(() => {
    if (!user) return;
    void supabase.from("wardrobe_items").select("brand").eq("user_id", user.id).not("brand", "is", null)
      .then(({ data }) => {
        const brands = Array.from(new Set(((data ?? []) as { brand: string | null }[])
          .map((r) => r.brand?.trim())
          .filter((b): b is string => Boolean(b))));
        setExistingBrands(brands.sort((a, b) => a.localeCompare(b)));
      });
  }, [user]);
  const wardrobeCache = useWardrobeCacheActions();
  const outfitPlansCache = useOutfitPlansCacheActions();
  const detectOutfitPhotoItemsFn = useServerFn(detectOutfitPhotoItems);
  const rerankCandidates = useServerFn(rerankOutfitCandidates);
  const findVisualDupes = useServerFn(findVisualDuplicates);
  const confirmWorn = useServerFn(confirmWearEvent);
  const startReconstruction = useServerFn(startGarmentExtraction);
  const checkReconstruction = useServerFn(checkGarmentExtraction);
  
  const fileRef = useRef<HTMLInputElement>(null);

  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "analyzing" | "review" | "saving" | "savingMyOutfit" | "myOutfitFailed" | "assignCalendar">("idle");
  const [finishedItemIds, setFinishedItemIds] = useState<string[]>([]);
  const [savingOutfit, setSavingOutfit] = useState(false);
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const [calendarDate, setCalendarDate] = useState(todayIso());
  const [assignToCalendar, setAssignToCalendar] = useState(false);
  const [myOutfitEventId, setMyOutfitEventId] = useState<string | null>(null);
  const savePhotoForWear = useServerFn(saveScanPhotoForWear);
  const [progressLabel, setProgressLabel] = useState("");
  const [scanItems, setScanItems] = useState<ScanItem[]>([]);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [matchThumbs, setMatchThumbs] = useState<Record<string, string>>({});

  const reset = () => {
    setPhotoDataUrl(null);
    setScanItems([]);
    setStage("idle");
    setProgressLabel("");
    setCalendarDate(todayIso()); setAssignToCalendar(false); setMyOutfitEventId(null);
    setFinishedItemIds([]);
  };

  const onPick = async (file: File | null) => {
    if (!file || !user) return;
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(file);
    });
    setPhotoDataUrl(dataUrl);
    setStage("analyzing");
    setProgressLabel(t("outfitScan.lookingAtOutfit"));

    try {
      const { data: existing } = await supabase
        .from("wardrobe_items").select("*").eq("user_id", user.id);
      const existingList = (existing ?? []) as WardrobeItem[];
      setWardrobe(existingList);

      setProgressLabel(t("outfitScan.analyzingOutfit"));
      const detection = await detectOutfitPhotoItemsFn({ data: { imageDataUrl: dataUrl } });
      if (!detection.ok || detection.items.length === 0) {
        toast.error(t("outfitScan.noClothingRecognized"));
        reset();
        return;
      }
      const detected = detection.items;
      const photoKey = `outfit-scan-${Date.now()}`;

      const built: ScanItem[] = [];
      const toMatch: { index: number; retrieved: ReturnType<typeof retrieveCandidates>; matchCrop: string | null; detected: typeof detected[number] }[] = [];
      for (let i = 0; i < detected.length; i++) {
        const d = detected[i];
        setProgressLabel(t("outfitScan.identifyingItem", { current: i + 1, total: detected.length }));

        const meta = {
          category: d.category, subcategory: d.subcategory, colors: d.colors,
          materials: d.materials, seasons: d.seasons,
          brand: "",
          formality: d.formality ?? null, dayEvening: d.dayEvening || "", sleeveLength: d.sleeveLength || "",
          length: d.length || "", fit: d.fit || "", heelHeight: "", toeShape: "",
          closure: "", gender: d.gender || "", styleTags: d.styleTags ?? [],
          model: "", bagSizeClass: "",
        };

        let cropImageUrl: string;
        let sourceMaskDataUrl = "";
        let transparent = true;
        try {
          const cropped = await cropItemFromSegmentation(photoKey, dataUrl, d.category, d.bbox);
          if (cropped) {
            cropImageUrl = cropped.crop;
            sourceMaskDataUrl = cropped.fullPhotoMaskDataUrl;
          } else {
            cropImageUrl = (await cropFromBBox(dataUrl, d.bbox)) ?? dataUrl;
            transparent = false;
          }
        } catch (e) {
          console.warn("[AURA outfit-scan] segmentation crop failed for item, falling back to plain bbox crop", i, e);
          cropImageUrl = (await cropFromBBox(dataUrl, d.bbox)) ?? dataUrl;
          transparent = false;
        }

        // LEVEL 1 — retrieval of plausible candidates (outfit-match.ts). The on-device visual
        // embedding, when it finds neighbours, only widens this pool; it no longer decides.
        const garment: DetectedGarment = {
          category: meta.category, subcategory: meta.subcategory, colors: meta.colors,
          pattern: (d.pattern as Pattern | undefined) ?? null, materials: meta.materials,
          sleeveLength: meta.sleeveLength, length: meta.length, fit: meta.fit,
        };
        let visualIds: string[] = [];
        if (meta.category) {
          try {
            const { computeGarmentEmbedding } = await import("@/lib/visual-embedding");
            const embedding = await computeGarmentEmbedding(cropImageUrl);
            const res = await findVisualDupes({ data: { category: meta.category, embedding } });
            if (res.ok) visualIds = res.matches.map((m) => m.wardrobeItemId);
          } catch (e) {
            console.error("[AURA outfit-scan] visual embedding lookup failed, using metadata retrieval only", e);
          }
        }
        const retrieved = retrieveCandidates(garment, existingList, { visualIds });
        const matchCrop = retrieved.length ? await cropForMatch(dataUrl, d.bbox) : null;
        toMatch.push({ index: built.length, retrieved, matchCrop, detected: d });
        const dedupe: DedupeResult = { score: 0, match: null, verdict: "new" };
        const candidates: RankedCandidate[] = [];

        const description = [meta.colors[0], meta.subcategory || meta.category].filter(Boolean).join(" ");

        built.push({
          key: `${Date.now()}-${i}`,
          category: meta.category,
          subcategory: meta.subcategory,
          colors: meta.colors,
          materials: meta.materials,
          seasons: meta.seasons,
          brand: meta.brand || "",
          description,
          imageDataUrl: cropImageUrl,
          transparent,
          dedupe,
          candidates,
          candidateIndex: 0,
          confidence: "low",
          visualChecked: false,
          status: "confirmed-new",
          price: "",
          currency: "EUR",
          size: "",
          styles: [],
          occasions: [],
          purchaseDate: new Date().toISOString().slice(0, 10),
          sleeveLength: meta.sleeveLength,
          formality: meta.formality,
          dayEvening: meta.dayEvening,
          length: meta.length,
          fit: meta.fit,
          heelHeight: meta.heelHeight,
          toeShape: meta.toeShape,
          closure: meta.closure,
          gender: meta.gender,
          styleTags: meta.styleTags,
          model: meta.model,
          bagSizeClass: meta.bagSizeClass,
          sourcePhotoDataUrl: dataUrl,
          sourceMaskDataUrl,
          bbox: d.bbox,
          reconstructing: false,
        });
      }

      // LEVEL 2 — visual reranking: the garment in the photo vs the real pictures of its candidates,
      // one request per garment, run in parallel. A failed comparison falls back to the metadata
      // ranking, capped so it can never look certain (rankCandidates).
      if (toMatch.length) {
        setProgressLabel(t("outfitScan.comparingWithWardrobe", { defaultValue: "Confronto con il tuo guardaroba…" }));
        const verdicts = await runLimited(toMatch.map((m) => async () => {
          if (!m.retrieved.length) return rankCandidates([], null);
          let visual: VisualScore[] | null = null;
          if (m.matchCrop) {
            try {
              const res = await rerankCandidates({
                data: {
                  targetImageDataUrl: m.matchCrop,
                  garment: {
                    category: m.detected.category,
                    subcategory: m.detected.subcategory || undefined,
                    pattern: m.detected.pattern,
                    colorShade: m.detected.colorShade,
                    colors: m.detected.colors.slice(0, 3),
                    description: m.detected.visualDescription || m.detected.description,
                    details: m.detected.details,
                  },
                  candidateIds: m.retrieved.map((r) => r.item.id),
                  language: i18n.language,
                },
              });
              if (res.ok) visual = res.scores;
              else console.warn("[AURA outfit-scan] visual comparison unavailable, using metadata ranking", res.error);
            } catch (e) {
              console.warn("[AURA outfit-scan] visual comparison failed, using metadata ranking", e);
            }
          }
          return rankCandidates(m.retrieved, visual);
        }), 3);
        toMatch.forEach((m, k) => {
          const v = verdicts[k];
          const b = built[m.index];
          b.candidates = v.match && !v.candidates.some((c) => c.item.id === v.match!.item.id) ? [v.match, ...v.candidates] : v.candidates;
          b.candidateIndex = 0;
          b.confidence = v.confidence;
          b.visualChecked = v.visualChecked;
          b.dedupe = v.match
            ? { score: v.match.score, match: v.match.item, verdict: v.confidence === "high" ? "certain" : "maybe" }
            : { score: v.candidates[0]?.score ?? 0, match: null, verdict: "new" };
          b.status = v.confidence === "high" ? "confirmed-duplicate" : v.confidence === "medium" ? "pending" : "confirmed-new";
        });
        const shown = built.flatMap((b) => b.candidates.map((c) => c.item));
        if (shown.length) {
          const urls = await resolveWardrobeUrls(shown);
          setMatchThumbs((prev) => {
            const next = { ...prev };
            for (const it of shown) {
              const p = toStoragePath(it.image_url);
              if (p && urls[p]) next[it.id] = urls[p];
            }
            return next;
          });
        }
      }

      setScanItems(built);
      setStage("review");
    } catch (e) {
      console.error("[AURA outfit-scan] failed", e);
      toast.error(t("outfitScan.somethingWentWrong"));
      reset();
    }
  };

  const updateItem = (key: string, patch: Partial<ScanItem>) =>
    setScanItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const removeItem = (key: string) =>
    setScanItems((prev) => prev.filter((it) => it.key !== key));

  const cycleCandidate = (key: string, dir: 1 | -1) =>
    setScanItems((prev) => prev.map((it) => {
      if (it.key !== key || !it.candidates.length) return it;
      const nextIndex = Math.min(it.candidates.length - 1, Math.max(0, it.candidateIndex + dir));
      const c = it.candidates[nextIndex];
      return {
        ...it,
        candidateIndex: nextIndex,
        dedupe: { score: c.score, match: c.item, verdict: verdictForScore(c.score) },
      };
    }));

  /** The person picks one of the listed alternatives directly. */
  const chooseCandidate = (key: string, index: number, confirm: boolean) =>
    setScanItems((prev) => prev.map((it) => {
      if (it.key !== key || !it.candidates[index]) return it;
      const c = it.candidates[index];
      return {
        ...it,
        candidateIndex: index,
        dedupe: { score: c.score, match: c.item, verdict: verdictForScore(c.score) },
        ...(confirm ? { status: "confirmed-duplicate" as const } : {}),
      };
    }));

  const [searchForKey, setSearchForKey] = useState<string | null>(null);
  const [wardrobeSigned, setWardrobeSigned] = useState<Record<string, string>>({});
  const [wardrobeSignedLoading, setWardrobeSignedLoading] = useState(false);
  const openWardrobeSearch = async (key: string) => {
    setSearchForKey(key);
    if (Object.keys(wardrobeSigned).length === 0 && wardrobe.length > 0) {
      setWardrobeSignedLoading(true);
      try { setWardrobeSigned(await resolveWardrobeUrls(wardrobe)); }
      finally { setWardrobeSignedLoading(false); }
    }
  };
  const ADD_FROM_WARDROBE = "__add__";
  const describeGarment = useServerFn(describeGarmentDetails);

  const [adjustingKey, setAdjustingKey] = useState<string | null>(null);
  const adjustingItem = scanItems.find((it) => it.key === adjustingKey) ?? null;
  const applyManualCrop = (key: string, dataUrl: string, box: FractionalBox) =>
    updateItem(key, { imageDataUrl: dataUrl, bbox: box, transparent: false });
  const pickFromWardrobeSearch = (item: WardrobeItem) => {
    if (!searchForKey) return;
    const path = toStoragePath(item.image_url);
    if (path && wardrobeSigned[path]) setMatchThumbs((prev) => ({ ...prev, [item.id]: wardrobeSigned[path] }));
    if (searchForKey === ADD_FROM_WARDROBE) {
      setScanItems((prev) => {
        if (prev.some((it) => it.status === "confirmed-duplicate" && it.dedupe.match?.id === item.id)) return prev;
        return [...prev, ownedScanItem(item, photoDataUrl ?? "")];
      });
      setSearchForKey(null);
      return;
    }
    updateItem(searchForKey, {
      dedupe: { score: 1, match: item, verdict: "certain" },
      status: "confirmed-duplicate",
      candidates: [{ item, score: 1 }],
      candidateIndex: 0,
    });
    setSearchForKey(null);
  };

  const reconstructItem = async (key: string) => {
    const item = scanItems.find((it) => it.key === key);
    if (!item || item.reconstructing) return;
    updateItem(key, { reconstructing: true });
    try {
      const fallback = [item.colors[0], item.subcategory || item.category].filter(Boolean).join(" ");
      let garmentDescription = fallback;
      try {
        const described = await describeGarment({ data: { imageDataUrl: item.imageDataUrl } });
        if (described.ok) garmentDescription = described.description;
      } catch (e) {
        console.warn("[AURA outfit-scan] auto-description failed, using the plain fallback", e);
      }
      const started = await startReconstruction({
        data: {
          imageDataUrl: item.sourcePhotoDataUrl,
          maskDataUrl: item.sourceMaskDataUrl,
          garmentDescription: garmentDescription || undefined,
        },
      });
      if (!started.ok) {
        toast.error(started.error || t("outfitScan.reconstructionFailed"));
        return;
      }
      if (started.done) {
        updateItem(key, { imageDataUrl: started.imageDataUrl, transparent: true });
        toast.success(t("outfitScan.reconstructionDone"));
        return;
      }
      const predictionId = started.predictionId;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const check = await checkReconstruction({ data: { predictionId } });
        if (!check.ok) {
          toast.error(check.error || t("outfitScan.reconstructionFailed"));
          return;
        }
        if (check.done) {
          let finalImageDataUrl = check.imageDataUrl;
          let finalTransparent = false;
          try {
            const bgRemoved = await removeBackgroundClient(check.imageDataUrl);
            if (bgRemoved.ok) { finalImageDataUrl = bgRemoved.imageDataUrl; finalTransparent = true; }
          } catch (e) {
            console.warn("[AURA outfit-scan] background removal on reconstructed image failed, keeping its plain background", e);
          }
          updateItem(key, { imageDataUrl: finalImageDataUrl, transparent: finalTransparent });
          toast.success(t("outfitScan.reconstructionDone"));
          return;
        }
      }
      toast.error(t("outfitScan.reconstructionTimedOut"));
    } catch (e) {
      console.error("[AURA outfit-scan] garment reconstruction failed", e);
      toast.error(t("outfitScan.reconstructionFailed"));
    } finally {
      updateItem(key, { reconstructing: false });
    }
  };

  const toSave = scanItems.filter((it) => it.status === "confirmed-new");

  const save = async () => {
    if (!user) return;
    const duplicateIds = scanItems
      .filter((it) => it.status === "confirmed-duplicate" && it.dedupe.match)
      .map((it) => it.dedupe.match!.id);
    if (toSave.length === 0) {
      const allItemIds = Array.from(new Set(duplicateIds));
      setFinishedItemIds(allItemIds);
      if (allItemIds.length) void saveToMyOutfit(allItemIds);
      else { reset(); go("wardrobe"); }
      return;
    }
    setStage("saving");
    let ok = 0, failed = 0;
    const newIds: string[] = [];
    for (let i = 0; i < toSave.length; i++) {
      const it = toSave[i];
      setProgressLabel(t("outfitScan.savingItem", { current: i + 1, total: toSave.length }));
      try {
        const ext = it.transparent ? "png" : "jpg";
        const path = `${user.id}/scan-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}.${ext}`;
        const rawFile = await dataUrlToFile(it.imageDataUrl, `scan.${ext}`);
        const file = await trimFileMargins(rawFile);
        const { error: upErr } = await supabase.storage.from("wardrobe").upload(path, file, {
          cacheControl: "3600", upsert: false, contentType: file.type || (it.transparent ? "image/png" : "image/jpeg"),
        });
        if (upErr) throw upErr;

        const payload = {
          user_id: user.id,
          image_url: path,
          category: it.category,
          subcategory: it.subcategory || null,
          color: it.colors[0] ?? null,
          colors: it.colors,
          material: it.materials,
          season: it.seasons.join(", ") || null,
          brand: it.brand.trim() || null,
          style: it.styles.join(", ") || null,
          occasion: it.occasions.join(", ") || null,
          size: it.size.trim() || null,
          price: (() => {
            const n = parseFloat(it.price.replace(",", "."));
            return Number.isFinite(n) && n > 0 ? n : null;
          })(),
          currency: it.price.trim() ? it.currency : null,
          purchase_date: it.purchaseDate || null,
          sleeve_length: it.sleeveLength || null,
          formality: it.formality,
          day_evening: it.dayEvening || null,
          length: it.length || null,
          fit: it.fit || null,
          heel_height: it.heelHeight || null,
          toe_shape: it.toeShape || null,
          closure: it.closure || null,
          gender: it.gender || null,
          style_tags: it.styleTags,
          model: it.model.trim() || null,
          bag_size_class: it.bagSizeClass || null,
          source: "outfit_scan",
        } as unknown as TablesInsert<"wardrobe_items">;

        const { data: inserted, error: insErr } = await supabase
          .from("wardrobe_items").insert(payload).select("*").single();
        if (insErr) throw insErr;

        void (async () => {
          try {
            const { computeGarmentEmbedding, EMBEDDING_MODEL_VERSION } = await import("@/lib/visual-embedding");
            const embedding = await computeGarmentEmbedding(it.imageDataUrl);
            await supabase.from("visual_embeddings" as never).insert({
              wardrobe_item_id: (inserted as { id: string }).id,
              user_id: user.id,
              embedding: `[${embedding.join(",")}]`,
              model_version: EMBEDDING_MODEL_VERSION,
            } as never);
          } catch (e) {
            console.error("[AURA outfit-scan] visual embedding failed — attribute matching still works without it", e);
          }
        })();

        wardrobeCache.addItem(inserted as WardrobeItem);
        newIds.push((inserted as { id: string }).id);
        ok++;
      } catch (e) {
        console.error("[AURA outfit-scan] save item failed", e);
        failed++;
      }
    }
    if (ok) toast.success(t("outfitScan.addedPiecesToCloset", { count: ok }));
    if (failed) toast.error(t("outfitScan.itemsCouldNotBeSaved", { count: failed }));
    const allItemIds = Array.from(new Set([...newIds, ...duplicateIds]));
    setFinishedItemIds(allItemIds);
    if (allItemIds.length > 0) {
      void saveToMyOutfit(allItemIds);
    } else {
      setStage("idle");
      reset();
      go("wardrobe");
    }
  };

  const saveToMyOutfit = async (itemIds: string[]) => {
    if (!user) return;
    setStage("savingMyOutfit");
    try {
      let photoFile: File | null = null;
      if (photoDataUrl) {
        try {
          const raw = await dataUrlToFile(photoDataUrl, "outfit.jpg");
          photoFile = await compressImageForUpload(raw);
        } catch (e) {
          console.warn("[AURA outfit-scan] photo compression failed, saving without the photo", e);
        }
      }

      let photoDetectionId: string | null = null;
      if (photoFile) {
        try {
          const res = await savePhotoForWear({ data: { photoDataUrl: await fileToDataUrl(photoFile), photoHash: await sha256Hex(photoFile) } });
          if (res.ok) photoDetectionId = res.detectionId;
        } catch (e) {
          console.warn("[AURA outfit-scan] saving the worn-photo failed, logging the wear without it", e);
        }
      }
      const res = await confirmWorn({ data: { itemIds, wornAt: todayIso(), photoDetectionId } });
      if (!res.ok) throw new Error(res.error);
      setMyOutfitEventId(res.eventId ?? null);
      setStage("assignCalendar");
    } catch (e) {
      console.error("[AURA outfit-scan] saving to My Outfit failed", e);
      const detail = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
      toast.error(`${t("outfitScan.couldNotSaveOutfit", { defaultValue: "Non sono riuscita a salvare l’outfit. Riprova." })} (${detail})`);
      setStage("myOutfitFailed");
    }
  };

  const finishCalendar = async () => {
    if (!user) return;
    if (!assignToCalendar) { reset(); go("wardrobe"); return; }
    setSavingOutfit(true);
    try {
      const status = calendarDate <= todayIso() ? "worn" : "planned";
      const { data: planRow, error } = await supabase.from("outfit_plans").insert({
        user_id: user.id,
        date: calendarDate,
        item_ids: finishedItemIds,
        status,
      } as never).select("id").single();
      if (error) throw error;
      const planId = (planRow as { id: string }).id;
      if (myOutfitEventId) {
        await (supabase.from("wardrobe_events" as never) as any)
          .update({ outfit_plan_id: planId }).eq("id", myOutfitEventId);
      }
      outfitPlansCache.invalidate();
      toast.success(t("outfitScan.addedToCalendar", { defaultValue: "Aggiunto al calendario" }));
    } catch (e) {
      console.error("[AURA outfit-scan] calendar assignment failed", e);
      toast.error(t("outfitScan.couldNotAddToCalendar", { defaultValue: "Non sono riuscita ad aggiungerlo al calendario. Riprova." }));
      setSavingOutfit(false);
      return;
    }
    setSavingOutfit(false);
    reset();
    go("wardrobe");
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      <header className="px-6 pt-14 pb-2 flex items-center gap-3">
        <button onClick={() => go("wardrobe")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("outfitScan.wardrobe")}</p>
          <h1 className="font-serif text-2xl italic leading-tight">{t("outfitScan.scanAnOutfit")}</h1>
        </div>
      </header>

      {stage === "idle" && (
        <div className="mx-6 mt-8">
          <div className="rounded-3xl border-2 border-dashed border-border p-8 text-center">
            <Camera size={22} className="mx-auto text-muted-foreground" />
            <p className="mt-4 font-serif text-lg italic">{t("outfitScan.photographYourOutfit")}</p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {t("outfitScan.photoHint")}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => document.getElementById("outfit-scan-camera")?.click()}
                className="h-12 rounded-full bg-foreground text-background text-xs uppercase tracking-[0.3em]"
              >{t("outfitScan.takeAPhoto")}</button>
              <button
                onClick={() => fileRef.current?.click()}
                className="h-12 rounded-full border border-foreground text-xs uppercase tracking-[0.3em]"
              >{t("outfitScan.chooseFromLibrary")}</button>
            </div>
          </div>
          <input
            id="outfit-scan-camera" type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <input
            ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {stage === "analyzing" && (
        <div className="mx-6 mt-16 text-center">
          {photoDataUrl && (
            <img src={photoDataUrl} alt="" className="mx-auto max-h-64 rounded-2xl object-contain" />
          )}
          <div className="mt-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <p className="text-sm">{progressLabel}</p>
          </div>
        </div>
      )}

      {stage === "review" && (
        <div className="mx-6 mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("outfitScan.foundPiecesReview", { count: scanItems.length })}
          </p>

          {scanItems.map((it) => {
            if (it.status === "confirmed-duplicate") {
              const thumb = it.dedupe.match ? matchThumbs[it.dedupe.match.id] : null;
              return (
                <div key={it.key} className="rounded-2xl border border-border bg-secondary/30 p-4 flex items-center gap-3">
                  <div className="h-14 w-14 rounded-xl overflow-hidden shrink-0" style={{ background: "#FFFFFF" }}>
                    {thumb ? <img src={thumb} alt="" className="h-full w-full object-contain p-1" /> : it.imageDataUrl ? (
                      <img src={it.imageDataUrl} alt="" className="h-full w-full object-contain p-1" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      {t("outfitScan.alreadyInCloset")}
                      {it.dedupe.score < 1 ? <span className="text-muted-foreground"> · {Math.round(it.dedupe.score * 100)}%</span> : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{it.description}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {it.imageDataUrl && (
                      <button
                        onClick={() => updateItem(it.key, { status: "confirmed-new" })}
                        className="text-[10px] uppercase tracking-widest text-muted-foreground underline"
                      >{t("outfitScan.addAnyway")}</button>
                    )}
                    <button
                      onClick={() => void openWardrobeSearch(it.key)}
                      className="text-[10px] uppercase tracking-widest text-muted-foreground underline"
                    >{t("outfitScan.notThisOneSearch", { defaultValue: "Non è questo? Cerca" })}</button>
                    <button
                      onClick={() => removeItem(it.key)}
                      aria-label={t("outfitScan.removeFromOutfit", { defaultValue: "Togli dall’outfit" })}
                      className="text-muted-foreground"
                    ><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            }

            if (it.status === "pending") {
              const thumb = it.dedupe.match ? matchThumbs[it.dedupe.match.id] : null;
              const hasPrev = it.candidateIndex > 0;
              const hasNext = it.candidateIndex < it.candidates.length - 1;
              return (
                <div key={it.key} className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground text-center">{t("outfitScan.isThisSameItem")}</p>
                  <div className="mt-3 flex items-center justify-center gap-4">
                    <div className="text-center">
                      <div className="h-20 w-20 rounded-xl overflow-hidden mx-auto" style={{ background: "#FFFFFF" }}>
                        <img src={it.imageDataUrl} alt="" className="h-full w-full object-contain p-1.5" />
                      </div>
                      <p className="mt-1 text-[9px] uppercase tracking-wide text-muted-foreground">{t("outfitScan.newScan")}</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => cycleCandidate(it.key, -1)}
                          disabled={!hasPrev}
                          aria-label={t("outfitScan.previousCandidate", { defaultValue: "Capo precedente" })}
                          className="h-6 w-6 rounded-full bg-secondary/60 flex items-center justify-center disabled:opacity-30"
                        >‹</button>
                        <div className="h-20 w-20 rounded-xl overflow-hidden" style={{ background: "#FFFFFF" }}>
                          {thumb && <img src={thumb} alt="" className="h-full w-full object-contain p-1.5" />}
                        </div>
                        <button
                          onClick={() => cycleCandidate(it.key, 1)}
                          disabled={!hasNext}
                          aria-label={t("outfitScan.nextCandidate", { defaultValue: "Capo successivo" })}
                          className="h-6 w-6 rounded-full bg-secondary/60 flex items-center justify-center disabled:opacity-30"
                        >›</button>
                      </div>
                      <p className="mt-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                        {t("outfitScan.alreadyOwned")} · {Math.round(it.dedupe.score * 100)}%
                      </p>
                    </div>
                  </div>
                  {it.candidates[it.candidateIndex]?.reason && (
                    <p className="mt-2 text-[11px] text-muted-foreground text-center">{it.candidates[it.candidateIndex].reason}</p>
                  )}
                  {!it.visualChecked && (
                    <p className="mt-1 text-[10px] text-muted-foreground text-center">{t("outfitScan.visualCheckUnavailable", { defaultValue: "Confronto visivo non disponibile: verifica tu il capo." })}</p>
                  )}
                  {it.candidates.length > 1 && (
                    <>
                      <p className="mt-3 text-[10px] uppercase tracking-[0.3em] text-muted-foreground text-center">{t("outfitScan.alternatives", { defaultValue: "Alternative" })}</p>
                      <CandidateStrip candidates={it.candidates} selectedIndex={it.candidateIndex} thumbs={matchThumbs} onSelect={(i) => chooseCandidate(it.key, i, false)} />
                    </>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateItem(it.key, { status: "confirmed-new" })}
                      className="h-11 rounded-full border border-border text-[10px] uppercase tracking-[0.3em]"
                    >{t("outfitScan.noDifferent")}</button>
                    <button
                      onClick={() => updateItem(it.key, { status: "confirmed-duplicate" })}
                      className="h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em]"
                    >{t("outfitScan.yesSame")}</button>
                  </div>
                  <button
                    onClick={() => void openWardrobeSearch(it.key)}
                    className="mt-2 w-full h-9 rounded-full text-[10px] uppercase tracking-[0.3em] text-muted-foreground underline"
                  >{t("outfitScan.searchWardrobeInstead", { defaultValue: "Cerca nel guardaroba" })}</button>
                </div>
              );
            }

            return (
              <DetectedItemCard
                key={it.key}
                item={it}
                imageUrl={it.imageDataUrl}
                onChange={(patch) => updateItem(it.key, patch)}
                onRemove={() => removeItem(it.key)}
                existingBrands={existingBrands}
                footer={
                  <>
                    {it.confidence === "low" && wardrobe.length > 0 && (
                      <div className="mt-3 rounded-2xl border border-dashed border-border p-3">
                        <p className="text-[11px] text-muted-foreground text-center">{t("outfitScan.noConfidentMatch", { defaultValue: "Nessun match sicuro nel guardaroba — scegli tu il capo o aggiungilo come nuovo." })}</p>
                        {it.candidates.length > 0 && (
                          <CandidateStrip candidates={it.candidates} selectedIndex={null} thumbs={matchThumbs} onSelect={(i) => chooseCandidate(it.key, i, true)} />
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => setAdjustingKey(it.key)}
                      className="mt-3 w-full h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] text-muted-foreground active:scale-[0.98]"
                    >{t("outfitScan.adjustCrop", { defaultValue: "Adatta ritaglio" })}</button>
                    <button
                      onClick={() => void openWardrobeSearch(it.key)}
                      className="mt-2 w-full h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] text-muted-foreground active:scale-[0.98]"
                    >{t("outfitScan.alreadyInWardrobeSearch", { defaultValue: "È già nel guardaroba? Cercalo" })}</button>
                    {it.sourceMaskDataUrl ? (
                      <button
                        onClick={() => void reconstructItem(it.key)}
                        disabled={it.reconstructing}
                        className="mt-2 w-full h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] text-muted-foreground active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-1.5"
                      >
                        {it.reconstructing ? <Loader2 size={11} className="animate-spin" /> : null}
                        {it.reconstructing ? t("outfitScan.reconstructing") : t("outfitScan.reconstructHiddenParts")}
                      </button>
                    ) : null}
                  </>
                }
              />
            );
          })}

          <button
            onClick={() => void openWardrobeSearch("__add__")}
            className="w-full h-11 rounded-full border border-dashed border-border text-[10px] uppercase tracking-[0.3em] text-muted-foreground flex items-center justify-center gap-2 active:scale-[0.98]"
          ><Plus size={13} /> {t("outfitScan.addPieceFromWardrobe", { defaultValue: "Aggiungi un capo dal guardaroba" })}</button>

          <div className="pt-2 pb-4 flex gap-2">
            <button
              onClick={reset}
              className="h-12 px-5 rounded-full border border-border text-[10px] uppercase tracking-[0.3em]"
            >{t("outfitScan.startOver")}</button>
            <button
              onClick={save}
              disabled={toSave.length === 0 && !scanItems.some((it) => it.status === "confirmed-duplicate")}
              className="flex-1 h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Check size={14} /> {toSave.length > 0 ? t("outfitScan.saveItemsCount", { count: toSave.length }) : t("outfitScan.continueToOutfit", { defaultValue: "Continua" })}
            </button>
          </div>
        </div>
      )}

      {stage === "saving" && (
        <div className="mx-6 mt-16 text-center">
          <Loader2 size={20} className="mx-auto animate-spin text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{progressLabel}</p>
        </div>
      )}

      {stage === "savingMyOutfit" && (
        <div className="mx-6 mt-16 text-center">
          <Loader2 size={20} className="mx-auto animate-spin text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t("outfitScan.savingToMyOutfit", { defaultValue: "Salvo l’outfit in My Outfit…" })}</p>
        </div>
      )}

      {stage === "myOutfitFailed" && (
        <div className="mx-6 mt-16 text-center">
          <p className="font-serif text-xl italic">{t("outfitScan.couldNotSaveToMyOutfit", { defaultValue: "Non sono riuscita a salvarlo in My Outfit" })}</p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => void saveToMyOutfit(finishedItemIds)}
              className="h-12 rounded-full bg-foreground text-background text-xs uppercase tracking-[0.25em]"
            >{t("outfitScan.retry", { defaultValue: "Riprova" })}</button>
            <button
              onClick={() => { reset(); go("wardrobe"); }}
              className="h-12 rounded-full border border-border text-xs uppercase tracking-[0.25em]"
            >{t("outfitScan.skipSavingOutfit", { defaultValue: "Salta" })}</button>
          </div>
        </div>
      )}

      {stage === "assignCalendar" && (
        <div className="mx-6 mt-8">
          <p className="font-serif text-2xl italic text-center">{t("outfitScan.savedToMyOutfitTitle", { defaultValue: "Salvato in My Outfit" })}</p>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed text-center">{t("outfitScan.assignCalendarHint", { defaultValue: "Vuoi assegnarlo anche a una data nel calendario?" })}</p>

          {photoDataUrl && (
            <img src={photoDataUrl} alt="" className="mt-5 mx-auto max-h-56 rounded-2xl object-contain" />
          )}

          <div className="mt-5 space-y-3">
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <input type="checkbox" checked={assignToCalendar} onChange={(e) => setAssignToCalendar(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm">{t("outfitScan.assignCalendarToggle", { defaultValue: "Aggiungi anche al calendario" })}</span>
            </label>
            {assignToCalendar && (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-2.5">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">{t("outfitScan.outfitDateLabel", { defaultValue: "Data" })}</span>
                <input
                  type="date"
                  value={calendarDate}
                  onChange={(e) => setCalendarDate(e.target.value || todayIso())}
                  className="flex-1 bg-transparent text-sm outline-none text-right"
                />
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => void finishCalendar()}
              disabled={savingOutfit}
              className="h-12 rounded-full bg-foreground text-background text-xs uppercase tracking-[0.25em] inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >{savingOutfit && <Loader2 size={14} className="animate-spin" />} {assignToCalendar ? t("outfitScan.saveOutfitButton", { defaultValue: "Salva" }) : t("outfitScan.doneButton", { defaultValue: "Fatto" })}</button>
            {assignToCalendar && (
              <button
                onClick={() => { reset(); go("wardrobe"); }}
                disabled={savingOutfit}
                className="h-12 rounded-full border border-border text-xs uppercase tracking-[0.25em] disabled:opacity-50"
              >{t("outfitScan.skipSavingOutfit", { defaultValue: "Salta" })}</button>
            )}
          </div>
        </div>
      )}
      {adjustingItem && (
        <ItemCropAdjuster
          src={adjustingItem.sourcePhotoDataUrl}
          initialBox={adjustingItem.bbox}
          onCancel={() => setAdjustingKey(null)}
          onSave={({ dataUrl, box }) => {
            applyManualCrop(adjustingItem.key, dataUrl, box);
            setAdjustingKey(null);
          }}
        />
      )}

      {searchForKey && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="px-6 pt-14 pb-3 flex items-center gap-3 border-b border-border/60">
            <button onClick={() => setSearchForKey(null)} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
              <ArrowLeft size={16} />
            </button>
            <h1 className="font-serif text-xl italic">{t("outfitScan.searchWardrobeTitle", { defaultValue: "Trova il capo giusto" })}</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            <PiecePicker
              items={wardrobe}
              signed={wardrobeSigned}
              selectedIds={[]}
              onToggle={(id) => {
                const item = wardrobe.find((w) => w.id === id);
                if (item) pickFromWardrobeSearch(item);
              }}
              loading={wardrobeSignedLoading}
              emptyHint={t("outfitScan.wardrobeSearchEmpty", { defaultValue: "Nessun capo trovato" })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
