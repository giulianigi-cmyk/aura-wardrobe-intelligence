import { useRef, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Camera, Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Screen } from "../AuraApp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWardrobeCacheActions } from "@/lib/wardrobe-query";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { WardrobeItem } from "@/lib/aura-types";
import { DetectedItemCard } from "@/components/aura/DetectedItemCard";
import { PiecePicker } from "../PiecePicker";
import { detectOutfitPhotoItems } from "@/lib/outfit-scan-detect.functions";
import { cropItemFromSegmentation } from "@/lib/outfit-segmentation";
import { findBestMatch, findTopMatches, type DedupeResult } from "@/lib/outfit-dedupe";
import { findVisualDuplicates, confirmWearEvent } from "@/lib/outfit-wear.functions";
import { startGarmentExtraction, checkGarmentExtraction } from "@/lib/outfit-garment-extract.functions";
import { trimFileMargins } from "@/lib/auto-crop";
import { resolveWardrobeUrls, toStoragePath } from "@/lib/wardrobe-image";

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
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
  // Alternative candidates from the wardrobe, ranked — see findTopMatches. Lets the "is this the
  // same item?" card offer real alternatives (with their own match %) instead of a single guess
  // the person could only accept or reject outright with no other option but a full manual search.
  candidates: { item: WardrobeItem; score: number }[];
  candidateIndex: number;
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
  // For the "reconstruct hidden parts" action below — the full original
  // outfit photo plus this item's own full-photo-aligned mask, kept
  // only for as long as the review screen is open (never saved to the
  // wardrobe). See outfit-segmentation.ts's fullPhotoMaskDataUrl for
  // why the mask has to be full-photo-sized rather than just the crop.
  sourcePhotoDataUrl: string;
  sourceMaskDataUrl: string;
  reconstructing: boolean;
};


export function OutfitScan({ go }: { go: (s: Screen) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Same brand-autocomplete data source as AddItem.tsx and
  // BatchReview.tsx — fetched once, passed to every detected item's
  // card, so a brand already saved anywhere in the wardrobe suggests
  // itself here too instead of needing to be retyped by hand.
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
  const detectOutfitPhotoItemsFn = useServerFn(detectOutfitPhotoItems);
  const findVisualDupes = useServerFn(findVisualDuplicates);
  const confirmWorn = useServerFn(confirmWearEvent);
  const startReconstruction = useServerFn(startGarmentExtraction);
  const checkReconstruction = useServerFn(checkGarmentExtraction);
  
  const fileRef = useRef<HTMLInputElement>(null);

  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "analyzing" | "review" | "saving" | "logWorn">("idle");
  // The full set of item ids this outfit ends up made of once saving finishes — the newly-created
  // ones (captured as each insert succeeds below) plus whichever were already-owned matches the
  // person confirmed as duplicates. Used only if they say yes to "did you wear this today?".
  const [finishedItemIds, setFinishedItemIds] = useState<string[]>([]);
  const [loggingWorn, setLoggingWorn] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [scanItems, setScanItems] = useState<ScanItem[]>([]);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [matchThumbs, setMatchThumbs] = useState<Record<string, string>>({});

  const reset = () => {
    setPhotoDataUrl(null);
    setScanItems([]);
    setStage("idle");
    setProgressLabel("");
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
      // One key for this whole photo — cropItemFromSegmentation caches the (expensive) local
      // segmentation pass per key, so every item below shares the SAME single model run instead
      // of paying for it once per item.
      const photoKey = `outfit-scan-${Date.now()}`;

      const built: ScanItem[] = [];
      for (let i = 0; i < detected.length; i++) {
        const d = detected[i];
        setProgressLabel(t("outfitScan.identifyingItem", { current: i + 1, total: detected.length }));

        const meta = {
          category: d.category, subcategory: d.subcategory, colors: d.colors,
          materials: d.materials, seasons: d.seasons,
          // The multi-item detector doesn't attempt brand/model/bag-size-class — a full outfit
          // photo rarely shows a legible logo the way a close-up single-item photo does, and
          // guessing here would violate the same "never invent" rule as everywhere else. The
          // review card's brand field still autocompletes from existingBrands either way.
          brand: "",
          formality: d.formality ?? null, dayEvening: d.dayEvening || "", sleeveLength: d.sleeveLength || "",
          length: d.length || "", fit: d.fit || "", heelHeight: "", toeShape: "",
          closure: "", gender: d.gender || "", styleTags: d.styleTags ?? [],
          model: "", bagSizeClass: "",
        };

        // Crop: AI-guided segmentation first (uses the detector's own category + bounding box to
        // find the right pixel-level region — much less likely to grab the wrong thing than
        // segmenting blind), a plain bbox rectangle if that finds nothing usable.
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

        let dedupe = findBestMatch(
          { category: meta.category, subcategory: meta.subcategory, colors: meta.colors, brand: meta.brand || null },
          existingList,
        );
        // Same scoring, but keeps the top 3 instead of only the single best — the "is this the
        // same item?" card below offers these as real alternatives (each with its own match %),
        // not just an accept/reject on one guess.
        const candidates = findTopMatches(
          { category: meta.category, subcategory: meta.subcategory, colors: meta.colors, brand: meta.brand || null },
          existingList,
          3,
        ).map((c) => ({ item: c.item, score: c.score }));
        // Visual comparison, second pass — only worth the round-trip when
        // attributes alone weren't already confident. This was the real
        // gap the ADR's original plan aimed at (import dedup, not wear
        // detection): a scan-imported piece was checked for duplicates
        // by attributes only, even after the visual embedding
        // infrastructure existed for LogWear. Silently skipped (never
        // blocks the scan) if the embedding model or the request fails.
        if (dedupe.verdict !== "certain" && meta.category) {
          try {
            const { computeGarmentEmbedding } = await import("@/lib/visual-embedding");
            const embedding = await computeGarmentEmbedding(cropImageUrl);
            const res = await findVisualDupes({ data: { category: meta.category, embedding } });
            if (res.ok && res.matches.length) {
              const best = res.matches[0];
              if (best.visualSimilarity > dedupe.score) {
                const matchedItem = existingList.find((w) => w.id === best.wardrobeItemId) ?? null;
                if (matchedItem) {
                  dedupe = {
                    score: best.visualSimilarity,
                    match: matchedItem,
                    verdict: best.visualSimilarity >= 0.9 ? "certain" : best.visualSimilarity >= 0.6 ? "maybe" : "new",
                  };
                  // Keep `candidates` consistent with what `dedupe` now shows: promote this
                  // visually-boosted match to the front (or insert it) so cycling through
                  // candidates below never contradicts the one already selected.
                  const already = candidates.findIndex((c) => c.item.id === matchedItem.id);
                  if (already >= 0) candidates.splice(already, 1);
                  candidates.unshift({ item: matchedItem, score: best.visualSimilarity });
                }
              }
            }
          } catch (e) {
            console.error("[AURA outfit-scan] visual dedup check failed, keeping attribute-only result", e);
          }
        }
        if (dedupe.match) {
          const path = toStoragePath(dedupe.match.image_url);
          if (path) {
            const map = await resolveWardrobeUrls([dedupe.match]);
            if (map[path]) setMatchThumbs((prev) => ({ ...prev, [dedupe.match!.id]: map[path] }));
          }
        }
        // Thumbnails for every alternative too, not just the top pick — needed as soon as the
        // person cycles to a different candidate.
        if (candidates.length) {
          const urls = await resolveWardrobeUrls(candidates.map((c) => c.item));
          setMatchThumbs((prev) => {
            const next = { ...prev };
            for (const c of candidates) {
              const p = toStoragePath(c.item.image_url);
              if (p && urls[p]) next[c.item.id] = urls[p];
            }
            return next;
          });
        }

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
          status: dedupe.verdict === "certain" ? "confirmed-duplicate" : dedupe.verdict === "maybe" ? "pending" : "confirmed-new",
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
          reconstructing: false,
        });
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

  // Step through the ranked alternatives (see findTopMatches) for one detection's "is this the
  // same item?" card — never past either end of the list.
  const cycleCandidate = (key: string, dir: 1 | -1) =>
    setScanItems((prev) => prev.map((it) => {
      if (it.key !== key || !it.candidates.length) return it;
      const nextIndex = Math.min(it.candidates.length - 1, Math.max(0, it.candidateIndex + dir));
      const c = it.candidates[nextIndex];
      return {
        ...it,
        candidateIndex: nextIndex,
        dedupe: { score: c.score, match: c.item, verdict: c.score >= 0.9 ? "certain" : c.score >= 0.6 ? "maybe" : "new" },
      };
    }));

  // Manual "search the wardrobe" fallback, for when none of the ranked candidates are actually
  // right — the same escape hatch LogWear's wear-confirmation already gives, ported here.
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
  const pickFromWardrobeSearch = (item: WardrobeItem) => {
    if (!searchForKey) return;
    const path = toStoragePath(item.image_url);
    if (path && wardrobeSigned[path]) setMatchThumbs((prev) => ({ ...prev, [item.id]: wardrobeSigned[path] }));
    updateItem(searchForKey, {
      dedupe: { score: 1, match: item, verdict: "certain" },
      // Choosing a specific item via search IS the confirmation — unlike cycling through the
      // ranked candidates above, there's no reason to ask "is this the same item?" again about
      // the exact piece the person just looked for and picked themselves.
      status: "confirmed-duplicate",
      candidates: [{ item, score: 1 }],
      candidateIndex: 0,
    });
    setSearchForKey(null);
  };

  // Sends the item through FASHN's Edit model (see
  // outfit-garment-extract.functions.ts) to reconstruct whatever's
  // hidden behind an arm, another garment, or a fold — for the crops
  // that came out looking obviously wrong (a sleeve cut off, a chunk
  // missing) rather than every item by default, since each call has a
  // real cost. Same submit-then-poll pattern as the avatar try-on
  // feature: short, repeated status checks rather than one long
  // request, which is what actually holds up on flaky connections.
  const reconstructItem = async (key: string) => {
    const item = scanItems.find((it) => it.key === key);
    if (!item || item.reconstructing) return;
    updateItem(key, { reconstructing: true });
    try {
      const garmentDescription = [item.colors[0], item.subcategory || item.category].filter(Boolean).join(" ");
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
      const predictionId = started.predictionId;
      const deadline = Date.now() + 90_000; // matches the avatar try-on feature's own ceiling
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const check = await checkReconstruction({ data: { predictionId } });
        if (!check.ok) {
          toast.error(check.error || t("outfitScan.reconstructionFailed"));
          return;
        }
        if (check.done) {
          updateItem(key, { imageDataUrl: check.imageDataUrl, transparent: false });
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
    // An outfit that turned out to be entirely pieces already owned has nothing new to upload,
    // but should still reach the "did you wear this today?" step below rather than silently doing
    // nothing — skip straight there instead of returning early.
    if (toSave.length === 0) {
      setFinishedItemIds(duplicateIds);
      setStage(duplicateIds.length ? "logWorn" : "idle");
      if (!duplicateIds.length) { reset(); go("wardrobe"); }
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

        // Fire-and-forget, same as AddItem.tsx's save() — a piece added
        // via outfit scan gets a visual fingerprint too, not just one
        // added through the single-item flow. Without this, every
        // batch-scanned piece stayed invisible to visual dedup/matching
        // forever unless someone later ran the wardrobe-wide backfill.
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

        // See AddItem.tsx for why this replaces the old DOM event —
        // same reasoning, batch-scanned pieces now reach every screen's
        // cache directly instead of depending on one happening to be
        // mounted.
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
    // Every piece this outfit is actually made of: the ones just saved as new, plus whichever
    // confirmed-duplicate detections point at a piece already owned (computed once, above) — both
    // count if the person says yes to having worn this today.
    setFinishedItemIds([...newIds, ...duplicateIds]);
    if (newIds.length + duplicateIds.length > 0) {
      setStage("logWorn");
    } else {
      setStage("idle");
      reset();
      go("wardrobe");
    }
  };

  const logAsWornToday = async () => {
    setLoggingWorn(true);
    try {
      const wornAt = new Date().toISOString().slice(0, 10);
      const res = await confirmWorn({ data: { itemIds: finishedItemIds, wornAt } });
      if (!res.ok) throw new Error(res.error);
      toast.success(t("outfitScan.loggedAsWornToday"));
    } catch (e) {
      console.error("[AURA outfit-scan] logging as worn failed", e);
      toast.error(t("outfitScan.couldNotLogWorn"));
    } finally {
      setLoggingWorn(false);
      setStage("idle");
      reset();
      go("wardrobe");
    }
  };

  const skipLoggingWorn = () => {
    setStage("idle");
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
                    {thumb ? <img src={thumb} alt="" className="h-full w-full object-contain p-1" /> : (
                      <img src={it.imageDataUrl} alt="" className="h-full w-full object-contain p-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{t("outfitScan.alreadyInCloset")}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{it.description}</p>
                  </div>
                  <button
                    onClick={() => updateItem(it.key, { status: "confirmed-new" })}
                    className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground underline"
                  >{t("outfitScan.addAnyway")}</button>
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
                          aria-label={t("outfitScan.previousCandidate")}
                          className="h-6 w-6 rounded-full bg-secondary/60 flex items-center justify-center disabled:opacity-30"
                        >‹</button>
                        <div className="h-20 w-20 rounded-xl overflow-hidden" style={{ background: "#FFFFFF" }}>
                          {thumb && <img src={thumb} alt="" className="h-full w-full object-contain p-1.5" />}
                        </div>
                        <button
                          onClick={() => cycleCandidate(it.key, 1)}
                          disabled={!hasNext}
                          aria-label={t("outfitScan.nextCandidate")}
                          className="h-6 w-6 rounded-full bg-secondary/60 flex items-center justify-center disabled:opacity-30"
                        >›</button>
                      </div>
                      <p className="mt-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                        {t("outfitScan.alreadyOwned")} · {Math.round(it.dedupe.score * 100)}%
                      </p>
                    </div>
                  </div>
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
                  >{t("outfitScan.searchWardrobeInstead")}</button>
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
                // No mask (the plain-bbox fallback crop, used when segmentation found no
                // confident region for this category) means there's nothing reliable to tell
                // FASHN's Edit endpoint to reconstruct — hiding the button here beats offering an
                // action that would fail without a clear reason why.
                footer={
                  it.sourceMaskDataUrl ? (
                    <button
                      onClick={() => void reconstructItem(it.key)}
                      disabled={it.reconstructing}
                      className="mt-3 w-full h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] text-muted-foreground active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {it.reconstructing ? <Loader2 size={11} className="animate-spin" /> : null}
                      {it.reconstructing ? t("outfitScan.reconstructing") : t("outfitScan.reconstructHiddenParts")}
                    </button>
                  ) : undefined
                }
              />
            );
          })}

          <div className="pt-2 pb-4 flex gap-2">
            <button
              onClick={reset}
              className="h-12 px-5 rounded-full border border-border text-[10px] uppercase tracking-[0.3em]"
            >{t("outfitScan.startOver")}</button>
            <button
              onClick={save}
              disabled={toSave.length === 0}
              className="flex-1 h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Check size={14} /> {t("outfitScan.saveItemsCount", { count: toSave.length })}
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

      {stage === "logWorn" && (
        <div className="mx-6 mt-16 text-center">
          <p className="font-serif text-2xl italic">{t("outfitScan.didYouWearThisToday")}</p>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t("outfitScan.didYouWearThisTodayHint")}</p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => void logAsWornToday()}
              disabled={loggingWorn}
              className="h-12 rounded-full bg-foreground text-background text-xs uppercase tracking-[0.25em] inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >{loggingWorn && <Loader2 size={14} className="animate-spin" />} {t("outfitScan.yesLogAsWorn")}</button>
            <button
              onClick={skipLoggingWorn}
              disabled={loggingWorn}
              className="h-12 rounded-full border border-border text-xs uppercase tracking-[0.25em] disabled:opacity-50"
            >{t("outfitScan.noJustAddPieces")}</button>
          </div>
        </div>
      )}
      {searchForKey && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="px-6 pt-14 pb-3 flex items-center gap-3 border-b border-border/60">
            <button onClick={() => setSearchForKey(null)} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
              <ArrowLeft size={16} />
            </button>
            <h1 className="font-serif text-xl italic">{t("outfitScan.searchWardrobeTitle")}</h1>
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
              emptyHint={t("outfitScan.wardrobeSearchEmpty")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
