import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Loader2, AlertTriangle, Copy, X } from "lucide-react";
import { toast } from "sonner";
import type { Screen } from "../AuraApp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWardrobeCacheActions } from "@/lib/wardrobe-query";
import { DetectedItemCard, type DetectedItemDraft } from "@/components/aura/DetectedItemCard";
import { ItemCropAdjuster, type FractionalBox } from "@/components/aura/ItemCropAdjuster";
import { confirmDetectedItems, listDetectedItems, rejectDetectedItem } from "@/lib/batch-scan.functions";
import type { BBox } from "@/lib/outfit-detect-types";
import { findBestMatch, type DedupeResult } from "@/lib/outfit-dedupe";
import { findVisualDuplicates } from "@/lib/outfit-wear.functions";
import { clearSegmentationCache, cropItemFromSegmentation } from "@/lib/outfit-segmentation";
import { trimWhiteMargins } from "@/lib/auto-crop";
import { removeBackgroundClient } from "@/lib/bg-removal-client";
import { analyzeCutoutQuality } from "@/lib/cutout-quality";
import { removeBackground } from "@/lib/ai-bgremove.functions";
import { compressImageForUpload } from "@/lib/image-compress";
import type { WardrobeItem } from "@/lib/aura-types";

type Draft = DetectedItemDraft & {
  id: string;
  jobId: string;
  bbox: BBox | null;
  cropUrl: string | null;
  photoUrl: string | null;
  dedupe: DedupeResult;
  included: boolean;
  bgRemoved: boolean;
  embedding: number[] | null;
};

async function cropFromUrl(src: string, bbox: BBox | null): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image load failed"));
      el.src = src;
    });
    const b = bbox ?? { x: 0, y: 0, width: 1, height: 1 };
    const sx = Math.round(b.x * img.naturalWidth);
    const sy = Math.round(b.y * img.naturalHeight);
    const sw = Math.max(8, Math.round(b.width * img.naturalWidth));
    const sh = Math.max(8, Math.round(b.height * img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

export function BatchReview({ go, scanId }: { go: (s: Screen) => void; scanId: string }) {
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
  const load = useServerFn(listDetectedItems);
  const confirm = useServerFn(confirmDetectedItems);
  const reject = useServerFn(rejectDetectedItem);
  const removeBackgroundPremium = useServerFn(removeBackground);
  const findVisualDupes = useServerFn(findVisualDuplicates);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [bulkBgRunning, setBulkBgRunning] = useState(false);
  const [bulkBgProgress, setBulkBgProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [res, wardrobeRes] = await Promise.all([
          load({ data: { scanId } }) as unknown as Promise<{
           items: Array<{
              id: string; job_id: string; category: string | null; subcategory: string | null;
              colors: string[] | null; material: string[] | null; season: string | null;
              description: string | null; bbox: BBox | null;
              brand: string | null; price: number | null; currency: string | null;
              style: string | null; occasion: string | null;
              sleeve_length: string | null; formality: number | null; day_evening: string | null;
              length: string | null; fit: string | null; heel_height: string | null;
              toe_shape: string | null; closure: string | null; gender: string | null;
              style_tags: string[] | null;
            }>;
            jobs: Array<{ id: string; image_path: string }>;
          }>,
          user
            ? supabase.from("wardrobe_items").select("*").eq("user_id", user.id)
            : Promise.resolve({ data: [] as WardrobeItem[] }),
        ]);
        const wardrobe = (wardrobeRes.data ?? []) as WardrobeItem[];

        const pathById = new Map(res.jobs.map((j) => [j.id, j.image_path]));
        const signed = new Map<string, string>();
        for (const j of res.jobs) {
          const { data } = await supabase.storage.from("wardrobe").createSignedUrl(j.image_path, 3600);
          if (data?.signedUrl) signed.set(j.image_path, data.signedUrl);
        }

        const built: Draft[] = [];
        clearSegmentationCache();
        setLoadProgress({ done: 0, total: res.items.length });
        for (const it of res.items) {
          try {
            const path = pathById.get(it.job_id);
            const src = path ? signed.get(path) : undefined;
            let cropUrl: string | null = null;
            if (src && path) {
              try {
                cropUrl = await cropItemFromSegmentation(path, src, it.category ?? "", it.bbox);
              } catch (segErr) {
                console.error("[AURA batch-review] segmentation failed for item, falling back to plain crop", it.id, segErr);
              }
            }
            if (!cropUrl) {
              cropUrl = src ? (await cropFromUrl(src, it.bbox)) ?? src : null;
            }

            const category = it.category ?? "";
            const colors = it.colors ?? [];
            let dedupe = findBestMatch(
              { category, subcategory: it.subcategory ?? undefined, colors },
              wardrobe,
            );
            let embedding: number[] | null = null;
            if (cropUrl) {
              try {
                const { computeGarmentEmbedding } = await import("@/lib/visual-embedding");
                embedding = await computeGarmentEmbedding(cropUrl);
                if (dedupe.verdict !== "certain" && category && embedding) {
                  const res = await findVisualDupes({ data: { category, embedding } });
                  if (res.ok && res.matches.length) {
                    const best = res.matches[0];
                    if (best.visualSimilarity > dedupe.score) {
                      const matchedItem = wardrobe.find((w) => w.id === best.wardrobeItemId) ?? null;
                      if (matchedItem) {
                        dedupe = {
                          score: best.visualSimilarity,
                          match: matchedItem,
                          verdict: best.visualSimilarity >= 0.9 ? "certain" : best.visualSimilarity >= 0.6 ? "maybe" : "new",
                        };
                      }
                    }
                  }
                }
              } catch (e) {
                console.error("[AURA batch-review] visual embedding/dedup failed, keeping attribute-only result", it.id, e);
              }
            }
            built.push({
              id: it.id,
              jobId: it.job_id,
              bbox: it.bbox,
              cropUrl,
              photoUrl: src ?? null,
              category,
              subcategory: it.subcategory ?? "",
              colors,
              materials: it.material ?? [],
              embedding,
              seasons: it.season ? [it.season] : [],
              brand: it.brand ?? "",
              description: it.description ?? "",
              price: it.price != null ? String(it.price) : "",
              currency: it.currency ?? "EUR",
              size: "",
                            styles: it.style ? it.style.split(",").map((s) => s.trim()).filter(Boolean) : [],
              occasions: it.occasion ? it.occasion.split(",").map((s) => s.trim()).filter(Boolean) : [],
              purchaseDate: new Date().toISOString().slice(0, 10),
              sleeveLength: it.sleeve_length ?? "",
              formality: it.formality ?? null,
              dayEvening: it.day_evening ?? "",
              length: it.length ?? "",
              fit: it.fit ?? "",
              heelHeight: it.heel_height ?? "",
              toeShape: it.toe_shape ?? "",
              closure: it.closure ?? "",
              gender: it.gender ?? "",
              styleTags: it.style_tags ?? [],
              model: "",
              bagSizeClass: "",
              dedupe,
              included: dedupe.verdict !== "certain",
              bgRemoved: false,
            });
          } catch (itemErr) {
            console.error("[AURA batch-review] failed to process item, skipping it", it.id, itemErr);
          } finally {
            setLoadProgress((p) => ({ ...p, done: p.done + 1 }));
            if (!cancelled) setDrafts([...built]);
          }
        }
      } catch (e) {
        console.error("[AURA batch-review] load failed", e);
        toast.error(t("batchReview.couldntLoadBatch"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  const update = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const adjustingDraft = drafts.find((d) => d.id === adjustingId) ?? null;
  const [removingBgId, setRemovingBgId] = useState<string | null>(null);
  const [copyFromId, setCopyFromId] = useState<string | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
  const COPYABLE_FIELDS: { key: keyof Draft; labelKey: string }[] = [
    { key: "category", labelKey: "batchReview.fieldCategory" },
    { key: "subcategory", labelKey: "batchReview.fieldSubcategory" },
    { key: "colors", labelKey: "batchReview.fieldColor" },
    { key: "materials", labelKey: "batchReview.fieldMaterial" },
    { key: "seasons", labelKey: "batchReview.fieldSeason" },
    { key: "brand", labelKey: "batchReview.fieldBrand" },
    { key: "styles", labelKey: "batchReview.fieldStyle" },
    { key: "occasions", labelKey: "batchReview.fieldOccasion" },
    { key: "price", labelKey: "batchReview.fieldPrice" },
    { key: "currency", labelKey: "batchReview.fieldCurrency" },
    { key: "size", labelKey: "batchReview.fieldSize" },
    { key: "purchaseDate", labelKey: "batchReview.fieldPurchaseDate" },
  ];
  const [copyFields, setCopyFields] = useState<Set<keyof Draft>>(
    new Set(COPYABLE_FIELDS.map((f) => f.key).filter((k) => k !== "colors")),
  );
  const toggleCopyField = (key: keyof Draft) => {
    setCopyFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const openCopySheet = (id: string) => {
    setCopyFromId(id);
    setCopyTargets(new Set());
  };

  const toggleCopyTarget = (id: string) => {
    setCopyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applyCopy = () => {
    const source = drafts.find((d) => d.id === copyFromId);
    if (!source || copyTargets.size === 0) { setCopyFromId(null); return; }
    const patch: Partial<Draft> = {};
    for (const { key } of COPYABLE_FIELDS) {
      if (copyFields.has(key)) (patch as Record<string, unknown>)[key] = source[key];
    }
    setDrafts((prev) => prev.map((d) => (
      copyTargets.has(d.id) ? { ...d, ...patch } : d
    )));
    toast.success(t("batchReview.copiedToPieces", { count: copyTargets.size }));
    setCopyFromId(null);
  };

  const hasVisibleContent = (dataUrl: string): Promise<boolean> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(true); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let filled = 0;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          const isWhiteish = data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245;
          if (alpha > 20 && !isWhiteish) filled++;
        }
        resolve(filled / (size * size) > 0.02);
      };
      img.onerror = () => resolve(true);
      img.src = dataUrl;
    });

  const performBgRemoval = async (id: string, url: string): Promise<boolean> => {
    try {
      let bg = await removeBackgroundClient(url);
      let attempt = 1;
      while (!bg.ok && attempt < 3) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        bg = await removeBackgroundClient(url);
        attempt++;
      }
      if (!bg.ok) return false;
      const quality = await analyzeCutoutQuality(bg.imageDataUrl);
      if (!quality.ok) {
        console.warn(`[AURA batch-review] free result failed quality check (${quality.reason}), trying remove.bg`, id);
        try {
          const premium = await removeBackgroundPremium({ data: { imageDataUrl: url } });
          if (premium.ok) bg = premium;
        } catch (e) {
          console.error("[AURA batch-review] remove.bg fallback failed", id, e);
        }
      }
      const trimmed = await trimWhiteMargins(bg.imageDataUrl);
      if (!(await hasVisibleContent(trimmed.dataUrl))) {
        console.warn("[AURA batch-review] bg removal produced a near-blank result, keeping original", id);
        return false;
      }
      setDrafts((prev) => prev.map((x) => (x.id === id ? { ...x, cropUrl: trimmed.dataUrl, bgRemoved: true } : x)));
      return true;
    } catch (e) {
      console.error("[AURA batch-review] bg removal failed", id, e);
      return false;
    }
  };

  const removeBg = async (id: string, sourceUrl?: string) => {
    const url = sourceUrl ?? drafts.find((x) => x.id === id)?.cropUrl;
    if (!url) return;
    setRemovingBgId(id);
    try {
      const ok = await performBgRemoval(id, url);
      if (!ok) toast.error(t("batchReview.couldntRemoveBgKept"));
    } finally {
      setRemovingBgId(null);
    }
  };

  const removeBgFromAll = async () => {
    const targets = drafts.filter((d) => !d.bgRemoved && d.cropUrl);
    if (!targets.length) { toast(t("batchReview.everyPieceAlreadyHasBg")); return; }
    setBulkBgRunning(true);
    setBulkBgProgress({ done: 0, total: targets.length });
    let failed = 0;
    for (const d of targets) {
      const url = drafts.find((x) => x.id === d.id)?.cropUrl ?? d.cropUrl;
      if (!url) { failed++; setBulkBgProgress((p) => ({ ...p, done: p.done + 1 })); continue; }
      const ok = await performBgRemoval(d.id, url);
      if (!ok) failed++;
      setBulkBgProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setBulkBgRunning(false);
    toast.success(
      failed
        ? t("batchReview.bgRemovedSomeFailed", { done: targets.length - failed, failed })
        : t("batchReview.bgRemovedAll", { count: targets.length }),
    );
  };

  const applyManualCrop = async (id: string, dataUrl: string, box: FractionalBox) => {
    const hadBgRemoved = drafts.find((d) => d.id === id)?.bgRemoved ?? false;
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, cropUrl: dataUrl, bbox: box, bgRemoved: false } : d)));
    if (hadBgRemoved) {
      await removeBg(id, dataUrl);
    }
  };

  const discard = async (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    try {
      await reject({ data: { id } });
    } catch (e) {
      console.error("[AURA batch-review] reject failed", e);
    }
  };

  const toSave = drafts.filter((d) => d.included);
  const skippedCount = drafts.length - toSave.length;

  const saveAll = async () => {
    if (!user || toSave.length === 0) return;
    setSaving(true);
    try {
      const stillNeedBg = toSave.filter((d) => !d.bgRemoved && d.cropUrl);
      if (stillNeedBg.length) {
        setBulkBgRunning(true);
        setBulkBgProgress({ done: 0, total: stillNeedBg.length });
        for (const d of stillNeedBg) {
          const url = drafts.find((x) => x.id === d.id)?.cropUrl ?? d.cropUrl;
          if (url) await performBgRemoval(d.id, url);
          setBulkBgProgress((p) => ({ ...p, done: p.done + 1 }));
        }
        setBulkBgRunning(false);
      }
      const finalToSave = drafts.filter((d) => toSave.some((t) => t.id === d.id));

      const payload: Array<{
        id: string; image_path: string; thumbnail_path: string | null; category: string; subcategory: string;
        brand: string; colors: string[]; material: string[]; season: string | null;
        price: number | null; currency: string | null; size: string | null;
        style: string | null; occasion: string | null; purchase_date: string | null;
        sleeve_length: string | null; formality: number | null; day_evening: string | null;
        length: string | null; fit: string | null; heel_height: string | null; toe_shape: string | null;
        closure: string | null; gender: string | null; style_tags: string[];
        model: string | null; bag_size_class: string | null;
      }> = [];

      for (let i = 0; i < finalToSave.length; i++) {
        const d = finalToSave[i];
        if (!d.cropUrl) continue;
        const path = `${user.id}/batch-item-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}.png`;
        const trimmed = await trimWhiteMargins(d.cropUrl);
        const file = await dataUrlToFile(trimmed.dataUrl, "item.png");
        const { error } = await supabase.storage.from("wardrobe").upload(path, file, {
          cacheControl: "3600", upsert: false, contentType: "image/png",
        });
        if (error) throw error;

        let thumbnailPath: string | null = null;
        try {
          const thumbFile = await compressImageForUpload(file, 400, 0.75);
          const thumbPath = `${user.id}/thumb-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}.jpg`;
          const { error: thumbErr } = await supabase.storage.from("wardrobe").upload(thumbPath, thumbFile, {
            cacheControl: "3600", upsert: false, contentType: thumbFile.type || "image/jpeg",
          });
          if (!thumbErr) thumbnailPath = thumbPath;
        } catch (e) {
          console.error("[AURA batch-review] thumbnail generation failed for item, grid will use full image", d.id, e);
        }

        const priceNum = (() => {
          const n = parseFloat(d.price.replace(",", "."));
          return Number.isFinite(n) && n > 0 ? n : null;
        })();
        payload.push({
          id: d.id,
          image_path: path,
          thumbnail_path: thumbnailPath,
          category: d.category,
          subcategory: d.subcategory,
          brand: d.brand,
          colors: d.colors,
          material: d.materials,
          season: d.seasons.join(", ") || null,
          price: priceNum,
          currency: priceNum != null ? d.currency : null,
          size: d.size.trim() || null,
                    style: d.styles.join(", ") || null,
          occasion: d.occasions.join(", ") || null,
          purchase_date: d.purchaseDate || null,
          sleeve_length: d.sleeveLength || null,
          formality: d.formality,
          day_evening: d.dayEvening || null,
          length: d.length || null,
          fit: d.fit || null,
          heel_height: d.heelHeight || null,
          toe_shape: d.toeShape || null,
          closure: d.closure || null,
          gender: d.gender || null,
          style_tags: d.styleTags,
          model: d.model.trim() || null,
          bag_size_class: d.bagSizeClass || null,
          embedding: d.embedding,
        });
      }

      if (!payload.length) {
        toast.error(t("batchReview.nothingToSave"));
        return;
      }

      const res = (await confirm({ data: { items: payload } })) as unknown as {
        confirmed: number;
        results: { id: string; ok: boolean; error?: string }[];
      };

      if (res.confirmed > 0) {
        const dupNote = skippedCount ? t("batchReview.skippedAsDuplicates", { count: skippedCount }) : "";
        toast.success(t("batchReview.addedToCloset", { count: res.confirmed }) + dupNote);
        wardrobeCache.invalidate();
      }
      const failedItems = res.results.filter((r) => !r.ok);
      if (failedItems.length) {
        const reasons = Array.from(new Set(failedItems.map((r) => r.error || t("batchReview.unknownError"))));
        console.error("[AURA batch-review] items not confirmed:", failedItems);
        toast.error(
          t("batchReview.itemsNotSaved", { count: failedItems.length, reasons: reasons.join("; ") }),
        );
      }
      if (res.confirmed > 0) go("wardrobe");
    } catch (e) {
      console.error("[AURA batch-review] save failed", e);
      toast.error(e instanceof Error ? e.message : t("batchReview.someItemsNotSaved"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      <header className="px-6 pt-14 pb-2 flex items-center gap-3">
        <button onClick={() => go("batch-scan")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("batchReview.batchScan")}</p>
          <h1 className="font-serif text-2xl italic leading-tight">{t("batchReview.reviewPieces")}</h1>
        </div>
      </header>

      {loading && (
        <div className="mx-6 mt-16 text-center text-muted-foreground">
          <Loader2 size={18} className="mx-auto animate-spin" />
          {loadProgress.total > 0 ? (
            <>
              <p className="mt-3 text-sm">{t("batchReview.cuttingOutPieces", { done: loadProgress.done, total: loadProgress.total })}</p>
              <div className="mt-3 mx-auto h-1.5 w-48 rounded-full bg-secondary/60 overflow-hidden">
                <div
                  className="h-full bg-foreground transition-all duration-300"
                  style={{ width: `${Math.round((loadProgress.done / loadProgress.total) * 100)}%` }}
                />
              </div>
              {drafts.length > 0 && (
                <p className="mt-3 text-[11px]">{t("batchReview.finishedPiecesReady")}</p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm">{t("batchReview.loadingBatch")}</p>
          )}
        </div>
      )}

      {!loading && drafts.length === 0 && (
        <p className="mx-6 mt-10 text-sm text-muted-foreground">
          {t("batchReview.nothingLeftToReview")}
        </p>
      )}

      {drafts.length > 0 && (
        <div className="mx-6 mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("batchReview.suggestedPieces", { count: drafts.length })}
          </p>

          {drafts.map((d) => (
            <div key={d.id} className="relative">
              {d.dedupe.verdict === "certain" && (
                <div className="mb-1.5 flex items-center justify-between gap-2 rounded-full bg-secondary/70 px-3 py-1">
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <AlertTriangle size={11} />
                    {d.included ? t("batchReview.looksLikeDuplicateWillAdd") : t("batchReview.alreadyInClosetWontAdd")}
                  </span>
                  <button
                    onClick={() => update(d.id, { included: !d.included })}
                    className="shrink-0 text-[10px] uppercase tracking-widest underline"
                  >{d.included ? t("batchReview.skipIt") : t("batchReview.addAnyway")}</button>
                </div>
              )}
              {d.dedupe.verdict === "maybe" && (
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-widest bg-amber-100 text-amber-800">
                  <AlertTriangle size={11} />
                  {t("batchReview.looksSimilarToOwned")}
                </div>
              )}
              <DetectedItemCard
                item={d}
                imageUrl={d.cropUrl}
                onChange={(patch) => update(d.id, patch)}
                onRemove={() => discard(d.id)}
                existingBrands={existingBrands}
                footer={
                  d.photoUrl && (
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAdjustingId(d.id)}
                          className="flex-1 h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] text-muted-foreground active:scale-[0.98]"
                        >{t("batchReview.adjustCrop")}</button>
                        <button
                          onClick={() => void removeBg(d.id)}
                          disabled={removingBgId === d.id}
                          className="flex-1 h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] text-muted-foreground active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >{removingBgId === d.id ? <Loader2 size={11} className="animate-spin" /> : null}{d.bgRemoved ? t("batchReview.backgroundRemoved") : t("batchReview.removeBackground")}</button>
                      </div>
                      {drafts.length > 1 && (
                        <button
                          onClick={() => openCopySheet(d.id)}
                          className="w-full h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] text-muted-foreground active:scale-[0.98] flex items-center justify-center gap-1.5"
                        ><Copy size={11} /> {t("batchReview.copyDetailsToOthers")}</button>
                      )}
                    </div>
                  )
                }
              />
            </div>
          ))}

          {adjustingDraft?.photoUrl && (
            <ItemCropAdjuster
              src={adjustingDraft.photoUrl}
              initialBox={adjustingDraft.bbox}
              onCancel={() => setAdjustingId(null)}
              onSave={({ dataUrl, box }) => {
                void applyManualCrop(adjustingDraft.id, dataUrl, box);
                setAdjustingId(null);
              }}
            />
          )}

          {copyFromId && (() => {
            const others = drafts.filter((d) => d.id !== copyFromId);
            const source = drafts.find((d) => d.id === copyFromId);
            const sourceLabel = source ? [source.colors[0], source.subcategory || source.category].filter(Boolean).join(" ") || t("batchReview.thisPiece") : t("batchReview.thisPiece");
            return (
              <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end" onClick={() => setCopyFromId(null)}>
                <div onClick={(e) => e.stopPropagation()} className="w-full max-h-[85dvh] bg-card rounded-t-3xl border-t border-border p-5 flex flex-col">
                  <div className="flex items-center justify-between shrink-0">
                    <p className="font-serif italic text-lg">{t("batchReview.copyDetailsToWhich")}</p>
                    <button onClick={() => setCopyFromId(null)} aria-label={t("batchReview.closeAria")} className="h-8 w-8 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90"><X size={14} /></button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground shrink-0">
                    {t("batchReview.copyingFrom")} <span className="font-medium text-foreground">{sourceLabel}</span> — {t("batchReview.copyingFromDetails")}
                  </p>
                  <button
                    onClick={() => setCopyTargets(new Set(others.map((d) => d.id)))}
                    className="mt-2 self-start text-[10px] uppercase tracking-[0.2em] text-muted-foreground underline shrink-0"
                  >{t("batchReview.selectAll", { count: others.length })}</button>

                  <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-muted-foreground shrink-0">{t("batchReview.whichDetailsToCopy")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 shrink-0">
                    {COPYABLE_FIELDS.map(({ key, labelKey }) => {
                      const on = copyFields.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => toggleCopyField(key)}
                          className={`h-8 px-3 rounded-full text-[11px] border ${on ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground"}`}
                        >{t(labelKey)}</button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                    {others.map((d) => {
                      const on = copyTargets.has(d.id);
                      const label = [d.colors[0], d.subcategory || d.category].filter(Boolean).join(" ") || t("batchReview.untitledPiece");
                      return (
                        <button
                          key={d.id}
                          onClick={() => toggleCopyTarget(d.id)}
                          className={`relative rounded-xl overflow-hidden border-2 text-left ${on ? "border-foreground" : "border-border/60"}`}
                        >
                          <div className="aspect-square" style={{ background: "#FFFFFF" }}>
                            {d.cropUrl ? <img src={d.cropUrl} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : null}
                            {on && (
                              <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-foreground text-background flex items-center justify-center">
                                <Check size={11} />
                              </span>
                            )}
                          </div>
                          <p className={`px-2 py-1.5 text-[10px] truncate ${on ? "bg-foreground text-background" : "bg-secondary/60"}`}>{label}</p>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={applyCopy}
                    disabled={copyTargets.size === 0 || copyFields.size === 0}
                    className="mt-1 w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] disabled:opacity-50 shrink-0"
                  >{t("batchReview.copyToPieces", { count: copyTargets.size })}</button>
                </div>
              </div>
            );
          })()}

          {!loading && drafts.some((d) => !d.bgRemoved) && (
            <div className="rounded-2xl border border-border/60 bg-card p-3">
              <button
                onClick={() => void removeBgFromAll()}
                disabled={bulkBgRunning}
                className="w-full h-11 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {bulkBgRunning ? <Loader2 size={13} className="animate-spin" /> : null}
                {bulkBgRunning ? t("batchReview.removingBackgrounds", { done: bulkBgProgress.done, total: bulkBgProgress.total }) : t("batchReview.removeBackgroundFromAll")}
              </button>
              {bulkBgRunning && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-secondary/60 overflow-hidden">
                  <div
                    className="h-full bg-foreground transition-all duration-300"
                    style={{ width: `${Math.round((bulkBgProgress.done / Math.max(1, bulkBgProgress.total)) * 100)}%` }}
                  />
                </div>
              )}
              {!bulkBgRunning && (
                <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
                  {t("batchReview.onlyAppliesToPiecesWithout")}
                </p>
              )}
            </div>
          )}

          <div className="pt-2 pb-4">
            <button
              onClick={saveAll}
              disabled={saving || toSave.length === 0}
              className="w-full h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving && bulkBgRunning
                ? t("batchReview.removingBackgrounds", { done: bulkBgProgress.done, total: bulkBgProgress.total })
                : <>{t("batchReview.addItems", { count: toSave.length })}{skippedCount ? t("batchReview.duplicatesSkippedParen", { count: skippedCount }) : ""}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
