import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, Plus, Link as LinkIcon, Check, HelpCircle, X as XIcon, Camera, Tag, ExternalLink, Minus } from "lucide-react";
import type { Screen } from "../AuraApp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { WardrobeItem } from "@/lib/aura-types";
import { resolveWardrobeUrls, toStoragePath } from "@/lib/wardrobe-image";
import { analyzeWardrobeGap, type GapSuggestion } from "@/lib/wardrobe-gap.functions";
import { analyzePurchase, comparePurchases, type PurchaseAdvisorResult, type ComparePurchasesResult, type CachedFacts } from "@/lib/purchase-advisor.functions";
import { findColorByName } from "@/lib/color-palette";
import { productKey } from "@/lib/wardrobe-feedback";
import { colorNameSimilarity } from "@/lib/outfit-match";
import { colorName, garmentName, localizeLabel } from "@/lib/garment-names";
import { toast } from "sonner";

type LinkMode = "url" | "photo" | "label";
// The comparison slots deliberately support only the two most common ways someone has a specific
// product in hand to compare — a link, or a photo — not the full label/photo+label combination the
// single-item flow offers. Keeping four independent multi-mode inputs (up to 4 items) simple was a
// deliberate trade-off against replicating every single-item input mode for every slot.
type CompareMode = "url" | "photo";
type CompareSlot = { mode: CompareMode; url: string; photoDataUrl: string | null };
const blankCompareSlot = (): CompareSlot => ({ mode: "url", url: "", photoDataUrl: null });

function readFileAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(f);
  });
}

export function Shop({ go }: { go: (s: Screen) => void }) {
  const { t, i18n } = useTranslation();
  // Colour and garment names are stored in English: shown in the person's language.
  const L = (label: string) => localizeLabel(label, i18n.language);
  const { user } = useAuth();
  const analyzeGap = useServerFn(analyzeWardrobeGap);
  const analyzePurchaseFn = useServerFn(analyzePurchase);
  const [loading, setLoading] = useState(true);
  const [itemCount, setItemCount] = useState(0);
  const [suggestion, setSuggestion] = useState<GapSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemsById, setItemsById] = useState<Record<string, WardrobeItem>>({});
  const [signed, setSigned] = useState<Record<string, string>>({});
  // "Ce l'ho già" on the gap suggestion: pick which owned piece it is (or say it isn't uploaded).
  const [gapRefresh, setGapRefresh] = useState(0);
  const [ownPickerOpen, setOwnPickerOpen] = useState(false);
  const [ownCandidatesSigned, setOwnCandidatesSigned] = useState<Record<string, string>>({});
  const [savingFeedback, setSavingFeedback] = useState(false);

  // ---- Purchase Advisor state ----
  const [advisorMode, setAdvisorMode] = useState<"single" | "compare">("single");
  const [mode, setMode] = useState<LinkMode>("url");
  const [linkUrl, setLinkUrl] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [labelDataUrl, setLabelDataUrl] = useState<string | null>(null);
  const [includeLabelWithPhoto, setIncludeLabelWithPhoto] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PurchaseAdvisorResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const labelForPhotoRef = useRef<HTMLInputElement>(null);
  const labelOnlyRef = useRef<HTMLInputElement>(null);

  // ---- Compare (2-4 pieces) state — kept separate from the single-item state above
  // rather than trying to reuse it, since the two flows genuinely diverge (an array of
  // slots vs. one set of fields) and forcing them to share state risked a subtle bug
  // where switching modes leaves a stale field behind.
  const comparePurchaseFn = useServerFn(comparePurchases);
  const [compareSlots, setCompareSlots] = useState<CompareSlot[]>([blankCompareSlot(), blankCompareSlot()]);
  const comparePhotoRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<ComparePurchasesResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const updateCompareSlot = (i: number, patch: Partial<CompareSlot>) =>
    setCompareSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const MAX_COMPARE = 6;
  const addCompareSlot = () => setCompareSlots((prev) => (prev.length < MAX_COMPARE ? [...prev, blankCompareSlot()] : prev));

  const removeCompareSlot = (i: number) => setCompareSlots((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
  const resetCompare = () => {
    setCompareResult(null); setCompareError(null); setCompareSlots([blankCompareSlot(), blankCompareSlot()]);
    urlFactsCache.current = {};
  };
  const compareSlotReady = (s: CompareSlot) => (s.mode === "url" ? s.url.trim().length > 0 : !!s.photoDataUrl);

  // Facts already resolved for a given product URL, from the last successful compare — reused so
  // that adding one more piece and comparing again doesn't silently re-scrape and re-read pieces
  // already shown, which was flipping their own duplicate/verdict call at random (a borderline
  // vision read landing differently on a second look, unconnected to anything actually changing).
  const urlFactsCache = useRef<Record<string, CachedFacts>>({});

  const runCompare = async () => {
    if (!compareSlots.every(compareSlotReady)) return;
    setComparing(true); setCompareResult(null); setCompareError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const items = compareSlots.map((s) => {
        if (s.mode === "url") {
          const cached = urlFactsCache.current[s.url.trim()];
          if (cached) return cached;
          return { source: "url" as const, url: s.url.trim(), accessToken: sess.session?.access_token };
        }
        return { source: "photo" as const, imageDataUrl: s.photoDataUrl! };
      });
      const res = await comparePurchaseFn({ data: { items } });
      if (res.ok) {
        setCompareResult(res);
        // Remember this result's facts for every URL slot, so the next compare (after adding or
        // removing a piece) can skip re-resolving anything unchanged.
        res.items.forEach((it, i) => {
          const slot = compareSlots[i];
          if (slot?.mode === "url") urlFactsCache.current[slot.url.trim()] = it.cacheKey;
        });
      } else {
        setCompareError(res.error);
      }
    } catch (e) {
      console.error("[AURA shop] compare failed", e);
      setCompareError(t("shop.purchaseAnalysisFailed"));
    } finally {
      setComparing(false);
    }
  };

  // A native file input never fires onChange again for the SAME file
  // path (browsers only fire it on a value change) — without clearing
  // .value here, picking the identical photo a second time after a
  // reset would silently do nothing.
  const resetAdvisor = () => {
    setResult(null); setCheckError(null);
    setPhotoDataUrl(null); setLabelDataUrl(null); setIncludeLabelWithPhoto(false);
    setLinkUrl("");
    if (photoRef.current) photoRef.current.value = "";
    if (labelForPhotoRef.current) labelForPhotoRef.current.value = "";
    if (labelOnlyRef.current) labelOnlyRef.current.value = "";
  };

  const runCheck = async () => {
    setChecking(true); setResult(null); setCheckError(null);
    try {
      let res: PurchaseAdvisorResult;
      if (mode === "url") {
        const raw = linkUrl.trim();
        if (!raw) { setChecking(false); return; }
        const { data: sess } = await supabase.auth.getSession();
        res = await analyzePurchaseFn({ data: { source: "url", url: raw, accessToken: sess.session?.access_token } });
      } else if (mode === "photo") {
        if (!photoDataUrl) { setChecking(false); return; }
        res = includeLabelWithPhoto && labelDataUrl
          ? await analyzePurchaseFn({ data: { source: "photos", garmentImageDataUrl: photoDataUrl, labelImageDataUrl: labelDataUrl } })
          : await analyzePurchaseFn({ data: { source: "photo", imageDataUrl: photoDataUrl } });
      } else {
        if (!labelDataUrl) { setChecking(false); return; }
        res = await analyzePurchaseFn({ data: { source: "label", imageDataUrl: labelDataUrl } });
      }
      if (res.ok) setResult(res);
      else setCheckError(res.error);
    } catch (e) {
      console.error("[AURA shop] purchase advisor failed", e);
      setCheckError(t("shop.purchaseAnalysisFailed"));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void (async () => {
      setLoading(true);
      const { data } = await supabase.from("wardrobe_items").select("*").eq("user_id", user.id);
      const items = (data ?? []) as WardrobeItem[];
      setItemCount(items.length);
      const map: Record<string, WardrobeItem> = {};
      items.forEach((it) => { map[it.id] = it; });
      setItemsById(map);

      if (items.length < 5) {
        setLoading(false);
        return;
      }
      const res = await analyzeGap({
        data: {
          items: items.map((it) => ({
            id: it.id, category: it.category, subcategory: it.subcategory,
            colors: it.colors ?? (it.color ? [it.color] : []),
            style: it.style ? (Array.isArray(it.style) ? it.style : [it.style]) : [],
            brand: it.brand ?? null,
            model: (it as { model?: string | null }).model ?? null,
            details: (it as { details?: string[] | null }).details ?? null,
            material: it.material ?? null,
            season: it.season ?? null,
          })),
        },
      });
      if (res.ok) {
        setSuggestion(res.suggestion);
        const matching = items.filter((it) => res.suggestion.pairsWithIds.includes(it.id));
        setSigned(await resolveWardrobeUrls(matching));
      } else {
        setError(res.error ?? t("shop.couldNotAnalyze"));
      }
      setLoading(false);
    })();
  }, [user, gapRefresh]);

  // ---- Corrections (wardrobe-feedback.ts) ----
  const ownCandidates = suggestion
    ? Object.values(itemsById)
        .filter((it) => it.category === suggestion.category && !(it as { archived?: boolean }).archived)
        .map((it) => ({ it, score: Math.max(0, ...suggestion.colors.flatMap((c) => (it.colors ?? []).map((o) => (o === c ? 1 : colorNameSimilarity(c, o) ?? 0)))) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 24)
        .map((x) => x.it)
    : [];

  const openOwnPicker = async () => {
    setOwnPickerOpen(true);
    if (ownCandidates.length) setOwnCandidatesSigned(await resolveWardrobeUrls(ownCandidates));
  };

  /** "Ce l'ho già": remembered for this person, and when they point at the piece and its type was
   *  missing, the type (and for bags how it's carried) is written on it — that's what they said. */
  const saveAlreadyOwn = async (ownedItem: WardrobeItem | null) => {
    if (!user || !suggestion || savingFeedback) return;
    setSavingFeedback(true);
    try {
      const { error } = await supabase.from("wardrobe_feedback").insert({
        user_id: user.id, kind: "already_own", category: suggestion.category, subcategory: suggestion.subcategory,
        colors: suggestion.colors, owned_item_id: ownedItem?.id ?? null,
      });
      if (error) throw error;
      if (ownedItem) {
        const edited = (ownedItem as { user_edited_fields?: string[] | null }).user_edited_fields ?? [];
        const patch: Record<string, unknown> = {};
        if (!ownedItem.subcategory) {
          patch.subcategory = suggestion.subcategory;
          patch.user_edited_fields = [...new Set([...edited, "subcategory"])];
        }
        const carry = suggestion.category === "Bags" && (suggestion.subcategory === "Crossbody" ? "crossbody" : suggestion.subcategory === "Shoulder Bag" ? "shoulder" : null);
        const details = (ownedItem as { details?: string[] | null }).details ?? [];
        if (carry && !details.includes(carry)) patch.details = [...details, carry];
        if (Object.keys(patch).length) await supabase.from("wardrobe_items").update(patch as never).eq("id", ownedItem.id);
      }
      setOwnPickerOpen(false);
      toast.success(t("shop.feedbackSaved"));
      setGapRefresh((n) => n + 1);
    } catch (e) {
      console.error("[AURA shop] feedback save failed", e);
      toast.error(t("shop.feedbackFailed"));
    } finally {
      setSavingFeedback(false);
    }
  };

  /** Purchase advisor corrections: "Non è simile" (that owned piece isn't like this product) or
   *  "Ce l'ho già" (I already own one like it). The analysis is then run again. */
  const saveAdvisorFeedback = async (kind: "not_similar" | "already_own") => {
    if (!user || !result || !result.ok || savingFeedback) return;
    setSavingFeedback(true);
    try {
      const { error } = await supabase.from("wardrobe_feedback").insert({
        user_id: user.id, kind,
        category: result.analysis.category, subcategory: result.analysis.subcategory, colors: result.analysis.colors,
        product_key: productKey(result.product),
        owned_item_id: kind === "not_similar" && result.wardrobe.duplicate && result.wardrobe.duplicate.itemId !== "said-owned" ? result.wardrobe.duplicate.itemId : null,
      });
      if (error) throw error;
      toast.success(t("shop.feedbackSaved"));
      void runCheck();
    } catch (e) {
      console.error("[AURA shop] feedback save failed", e);
      toast.error(t("shop.feedbackFailed"));
    } finally {
      setSavingFeedback(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      <header className="px-6 pt-14 pb-3">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("shop.theEdit")}</p>
        <h1 className="font-serif italic text-4xl mt-1">{t("shop.headerPrefix")} {t("shop.headerEmphasis")}</h1>
      </header>

      <section className="px-6 mt-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("shop.shouldIBuyIt")}</p>

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => { setAdvisorMode("single"); resetCompare(); }}
            className={`flex-1 h-9 rounded-full text-[10px] uppercase tracking-widest transition ${advisorMode === "single" ? "bg-foreground text-background" : "bg-secondary/40 text-muted-foreground"}`}
          >{t("shop.advisorModeSingle")}</button>
          <button
            onClick={() => { setAdvisorMode("compare"); resetAdvisor(); }}
            className={`flex-1 h-9 rounded-full inline-flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest transition ${advisorMode === "compare" ? "bg-foreground text-background" : "bg-secondary/40 text-muted-foreground"}`}
          >{t("shop.advisorModeCompare")}</button>
        </div>

        {advisorMode === "compare" ? (
          <div className="rounded-2xl bg-secondary/40 p-4">
            <div className="space-y-3">
              {compareSlots.map((slot, i) => (
                <div key={i} className="rounded-2xl bg-background border border-border/60 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{t("shop.compareSlotLabel", { n: i + 1 })}</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCompareSlot(i, { mode: slot.mode === "url" ? "photo" : "url", url: "", photoDataUrl: null })}
                        className="text-[10px] uppercase tracking-widest text-muted-foreground underline"
                      >{slot.mode === "url" ? t("shop.modePhoto") : t("shop.modeUrl")}</button>
                      {compareSlots.length > 2 && (
                        <button onClick={() => removeCompareSlot(i)} aria-label={t("shop.removeCompareSlot")} className="h-6 w-6 rounded-full bg-secondary/60 flex items-center justify-center">
                          <Minus size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  {slot.mode === "url" ? (
                    <div className="flex items-center gap-2 rounded-full bg-secondary/40 px-4 py-2.5">
                      <LinkIcon size={13} className="text-muted-foreground shrink-0" />
                      <input
                        value={slot.url}
                        onChange={(e) => updateCompareSlot(i, { url: e.target.value })}
                        placeholder={t("shop.pasteProductLinkPlaceholder")}
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                      />
                    </div>
                  ) : (
                    <>
                      <input
                        ref={(el) => { comparePhotoRefs.current[i] = el; }}
                        type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={async (e) => { const f = e.target.files?.[0]; if (f) updateCompareSlot(i, { photoDataUrl: await readFileAsDataUrl(f) }); }}
                      />
                      <button
                        onClick={() => comparePhotoRefs.current[i]?.click()}
                        className="w-full h-20 rounded-xl border border-dashed border-border bg-secondary/40 flex items-center justify-center overflow-hidden"
                      >
                        {slot.photoDataUrl ? (
                          <img src={slot.photoDataUrl} alt="" className="h-full w-full object-contain p-1" />
                        ) : (
                          <span className="flex flex-col items-center gap-1 text-muted-foreground">
                            <Camera size={16} />
                            <span className="text-[10px] uppercase tracking-widest">{t("shop.photoGarmentButton")}</span>
                          </span>
                        )}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {compareSlots.length < MAX_COMPARE && (
              <button
                onClick={addCompareSlot}
                className="mt-3 w-full h-10 rounded-full border border-dashed border-border text-[10px] uppercase tracking-[0.25em] text-muted-foreground flex items-center justify-center gap-2"
              ><Plus size={12} /> {t("shop.addAnotherToCompare")}</button>
            )}

            <button
              onClick={() => void runCompare()}
              disabled={comparing || !compareSlots.every(compareSlotReady)}
              className="mt-3 w-full h-11 rounded-full bg-foreground text-background flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] disabled:opacity-60"
            >
              {comparing && <Loader2 size={13} className="animate-spin" />}
              {t("shop.compareThesePieces")}
            </button>

            {compareError && <p className="mt-3 text-xs text-muted-foreground text-center">{compareError}</p>}

            {compareResult && compareResult.ok && (
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  {compareResult.ranking.map((itemIndex, rank) => {
                    const it = compareResult.items[itemIndex];
                    return (
                      <div key={itemIndex} className={`rounded-2xl border p-3 flex gap-3 ${rank === 0 ? "border-foreground bg-card" : "border-border/60 bg-card/60"}`}>
                        {it.product.imageUrl && (
                          <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-white border border-border/60">
                            <img src={it.product.imageUrl} alt="" className="h-full w-full object-contain p-1" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] uppercase tracking-widest bg-foreground text-background rounded-full h-4 w-4 shrink-0 flex items-center justify-center">{rank + 1}</span>
                            {it.product.brand && <p className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{it.product.brand}</p>}
                          </div>
                          <p className="font-serif text-sm leading-tight truncate mt-0.5">{it.product.title || t("shop.unknownPiece")}</p>
                          {it.product.price && <p className="text-xs text-muted-foreground mt-0.5">{it.product.price}</p>}
                          <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-widest ${
                            it.verdict === "buy" ? "bg-foreground text-background" :
                            it.verdict === "maybe" ? "bg-[var(--champagne)]/40 text-foreground" :
                            "bg-secondary text-muted-foreground"
                          }`}>
                            {it.verdict === "buy" ? <Check size={9} /> : it.verdict === "maybe" ? <HelpCircle size={9} /> : <XIcon size={9} />}
                            {it.verdict === "buy" ? t("shop.verdictBuy") : it.verdict === "maybe" ? t("shop.verdictMaybe") : t("shop.verdictSkip")}
                          </div>
                          {it.wardrobe.dressPreferenceViolation && (
                            <p className="mt-1 text-[11px] text-destructive leading-snug">
                              {[t("shop.notInLineWithYou"), ...(it.wardrobe.dressConflicts ?? []).map((c) => t(`shop.dressConflict.${c}`))].join(" — ")}
                            </p>
                          )}
                          {it.wardrobe.similarTo && !it.wardrobe.differsFrom && (
                            <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{it.wardrobe.similarTo === "said-owned" ? t("shop.saidOwned") : t("shop.similarTo", { label: L(it.wardrobe.similarTo) })}</p>
                          )}
                          {it.alternative && (
                            <p className="mt-1 text-[11px] text-foreground/80 leading-snug">
                              {it.alternative.identical
                                ? t(it.alternative.preferred ? "shop.samePieceCheaper" : "shop.samePieceDearer", { names: it.alternative.withNames.join(", ") })
                                : it.alternative.preferred
                                ? t("shop.alternativePreferred", { names: it.alternative.withNames.join(", ") })
                                : t("shop.alternativeOther", { names: it.alternative.withNames.join(", ") })}
                            </p>
                          )}
                          <FashionAndDifferences fashion={it.fashion} differsFrom={it.wardrobe.differsFrom} sameModel={it.wardrobe.sameModel} price={it.wardrobe.price} cpw={it.wardrobe.cpw} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{compareResult.reason}</p>
              </div>
            )}

            <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">{t("shop.linkDisclaimer")}</p>
          </div>
        ) : (
        <div className="rounded-2xl bg-secondary/40 p-4">
          <div className="flex gap-2">
            {([
              { key: "url" as const, label: t("shop.modeUrl"), icon: LinkIcon },
              { key: "photo" as const, label: t("shop.modePhoto"), icon: Camera },
              { key: "label" as const, label: t("shop.modeLabel"), icon: Tag },
            ]).map((m) => (
              <button
                key={m.key}
                onClick={() => { setMode(m.key); resetAdvisor(); }}
                className={`flex-1 h-10 rounded-full flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest transition ${mode === m.key ? "bg-foreground text-background" : "bg-background border border-border text-muted-foreground"}`}
              >
                <m.icon size={12} /> {m.label}
              </button>
            ))}
          </div>

          {mode === "url" && (
            <div className="mt-3 flex items-center gap-2 rounded-full bg-background border border-border px-4 py-2.5">
              <LinkIcon size={14} className="text-muted-foreground shrink-0" />
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void runCheck(); }}
                placeholder={t("shop.pasteProductLinkPlaceholder")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          )}

          {mode === "photo" && (
            <div className="mt-3">
              <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhotoDataUrl(await readFileAsDataUrl(f)); }} />
              <input ref={labelForPhotoRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setLabelDataUrl(await readFileAsDataUrl(f)); setIncludeLabelWithPhoto(true); } }} />
              <button
                onClick={() => photoRef.current?.click()}
                className="w-full h-24 rounded-2xl border border-dashed border-border bg-background flex items-center justify-center overflow-hidden"
              >
                {photoDataUrl ? (
                  <img src={photoDataUrl} alt="" className="h-full w-full object-contain p-1" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-muted-foreground">
                    <Camera size={18} />
                    <span className="text-[10px] uppercase tracking-widest">{t("shop.photoGarmentButton")}</span>
                  </span>
                )}
              </button>
              {photoDataUrl && (
                <button
                  onClick={() => labelForPhotoRef.current?.click()}
                  className="mt-2 w-full h-9 rounded-full border border-border text-[10px] uppercase tracking-widest text-muted-foreground flex items-center justify-center gap-1.5"
                >
                  <Tag size={11} />
                  {labelDataUrl ? t("shop.labelPhotoAdded") : t("shop.addLabelPhotoOptional")}
                </button>
              )}
            </div>
          )}

          {mode === "label" && (
            <div className="mt-3">
              <input ref={labelOnlyRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) setLabelDataUrl(await readFileAsDataUrl(f)); }} />
              <button
                onClick={() => labelOnlyRef.current?.click()}
                className="w-full h-24 rounded-2xl border border-dashed border-border bg-background flex items-center justify-center overflow-hidden"
              >
                {labelDataUrl ? (
                  <img src={labelDataUrl} alt="" className="h-full w-full object-contain p-1" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-muted-foreground">
                    <Tag size={18} />
                    <span className="text-[10px] uppercase tracking-widest">{t("shop.photoLabelButton")}</span>
                  </span>
                )}
              </button>
            </div>
          )}

          <button
            onClick={() => void runCheck()}
            disabled={checking || (mode === "url" ? !linkUrl.trim() : mode === "photo" ? !photoDataUrl : !labelDataUrl)}
            className="mt-3 w-full h-11 rounded-full bg-foreground text-background flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] disabled:opacity-60"
          >
            {checking ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {t("shop.checkThisPiece")}
          </button>

          {checkError && (
            <p className="mt-3 text-xs text-muted-foreground text-center">{checkError}</p>
          )}

          {result && result.ok && (
            <div className="mt-4 rounded-2xl bg-card border border-border/60 p-4">
              <div className="flex gap-3">
                {result.product.imageUrl && (
                  <div className="h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-white border border-border/60">
                    <img src={result.product.imageUrl} alt="" className="h-full w-full object-contain p-1" />
                  </div>
                )}
                <div className="min-w-0">
                  {result.product.brand && <p className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{result.product.brand}</p>}
                  <p className="font-serif text-base leading-tight truncate">{result.product.title || [result.analysis.subcategory, result.analysis.category].filter((x): x is string => !!x).map((x) => garmentName(x, i18n.language)).join(" · ") || t("shop.unknownPiece")}</p>
                  {result.product.price && (
                    <p className="text-xs text-muted-foreground mt-0.5">{result.product.price}</p>
                  )}
                  {result.product.sourceUrl && (
                    <a
                      href={result.product.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground underline"
                    >
                      <ExternalLink size={10} /> {t("shop.viewOnSite")}
                    </a>
                  )}
                </div>
              </div>

              <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-widest ${
                result.verdict === "buy" ? "bg-foreground text-background" :
                result.verdict === "maybe" ? "bg-[var(--champagne)]/40 text-foreground" :
                "bg-secondary text-muted-foreground"
              }`}>
                {result.verdict === "buy" ? <Check size={11} /> : result.verdict === "maybe" ? <HelpCircle size={11} /> : <XIcon size={11} />}
                {result.verdict === "buy" ? t("shop.verdictBuy") : result.verdict === "maybe" ? t("shop.verdictMaybe") : t("shop.verdictSkip")}
              </div>
              <FashionAndDifferences fashion={result.fashion} differsFrom={result.wardrobe.differsFrom} sameModel={result.wardrobe.sameModel} price={result.wardrobe.price} cpw={result.wardrobe.cpw} />
              <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{result.reason}</p>
              {/* Corrections: remembered for this person and the analysis runs again. */}
              {result.analysis.category && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.wardrobe.duplicate && result.wardrobe.duplicate.itemId !== "said-owned" ? (
                    <button disabled={savingFeedback || checking} onClick={() => void saveAdvisorFeedback("not_similar")}
                      className="h-8 px-3 rounded-full border border-border text-[10px] uppercase tracking-widest text-muted-foreground disabled:opacity-60">{t("shop.notSimilar")}</button>
                  ) : !result.wardrobe.duplicate ? (
                    <button disabled={savingFeedback || checking} onClick={() => void saveAdvisorFeedback("already_own")}
                      className="h-8 px-3 rounded-full border border-border text-[10px] uppercase tracking-widest text-muted-foreground disabled:opacity-60">{t("shop.alreadyOwnSimilar")}</button>
                  ) : null}
                </div>
              )}

              {/* A dress-preference violation is a hard, explicit personal
                  rule, not an AI opinion — never blend it in with the other
                  muted informational notes below, where it could read as
                  just one more soft suggestion. */}
              {result.rules.dressPreferenceViolation && (
                <div className="mt-3 rounded-xl bg-destructive/10 border border-destructive/30 px-3 py-2">
                  <p className="text-[11px] font-medium text-destructive">{t("shop.notInLineWithYou")}</p>
                  {/* Which of their own "never" rules it breaks, in their words. */}
                  {(result.rules.dressConflicts ?? []).map((c) => (
                    <p key={c} className="text-[11px] text-destructive/90">{t(`shop.dressConflict.${c}`)}</p>
                  ))}
                </div>
              )}

              <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                {result.wardrobe.duplicate?.itemId === "said-owned" ? (
                  <p>{t("shop.saidOwned")}</p>
                ) : (
                  <>
                    {result.wardrobe.duplicate?.verdict === "certain" && (
                      <p className="font-medium text-foreground/80">{result.wardrobe.duplicate.label ? t("shop.duplicateOf", { label: L(result.wardrobe.duplicate.label) }) : t("shop.looksLikeDuplicate")}</p>
                    )}
                    {result.wardrobe.duplicate?.verdict === "maybe" && !result.wardrobe.differsFrom && (
                      <p>{result.wardrobe.duplicate.label ? t("shop.similarTo", { label: L(result.wardrobe.duplicate.label) }) : t("shop.looksSimilarToOwned")}</p>
                    )}
                  </>
                )}
                {result.wardrobe.pairsWithCount > 0 && (
                  <p>{t("shop.wouldPairWithLink", { count: result.wardrobe.pairsWithCount })}</p>
                )}
                {result.wardrobe.wardrobeGap && (
                  <p>{t("shop.fillsAGap")}</p>
                )}
                {result.confidence === "low" && (
                  <p>{t("shop.lowConfidenceNote")}</p>
                )}
              </div>
            </div>
          )}

          <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
            {t("shop.linkDisclaimer")}
          </p>
        </div>
        )}
      </section>

      <section className="px-6 mt-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("shop.orWardrobeIsMissing")}</p>
        {loading ? (
          <div className="rounded-[2rem] bg-secondary/40 aspect-[4/3] flex items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : itemCount < 5 ? (
          <div className="rounded-[2rem] bg-secondary/40 p-6 text-center">
            <p className="font-serif text-lg italic">{t("shop.notEnoughPieces")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("shop.notEnoughPiecesHint")}
            </p>
            <button
              onClick={() => go("add")}
              className="mt-4 h-11 px-6 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] inline-flex items-center gap-2"
            ><Plus size={12} /> {t("shop.addAPiece")}</button>
          </div>
        ) : error || !suggestion ? (
          <div className="rounded-[2rem] bg-secondary/40 p-6 text-center">
            <p className="text-sm text-muted-foreground">{error ?? t("shop.couldNotAnalyzeRightNow")}</p>
          </div>
        ) : (
          <>
            <div className="relative rounded-[2rem] overflow-hidden shadow-luxe gradient-warm p-6">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-background/60 px-3 py-1.5">
                <Sparkles size={11} />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("shop.wardrobeIsMissing")}</span>
              </div>
              <p className="font-serif text-2xl italic mt-4">{suggestion.title}</p>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{suggestion.reason}</p>
              <div className="mt-4 flex gap-2">
                {suggestion.colors.map((c) => (
                  <span
                    key={c}
                    className="h-7 w-7 rounded-full border border-border/60"
                    style={{ background: findColorByName(c)?.hex ?? "#CCCCCC" }}
                    title={c}
                  />
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => go("add")}
                  className="h-11 px-6 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] inline-flex items-center gap-2"
                ><Plus size={12} /> {t("shop.addThisPiece")}</button>
                <button
                  onClick={() => void openOwnPicker()}
                  className="h-11 px-5 rounded-full border border-foreground/40 text-[10px] uppercase tracking-[0.3em] inline-flex items-center gap-2"
                ><Check size={12} /> {t("shop.alreadyOwnIt")}</button>
              </div>
            </div>

            {ownPickerOpen && (
              <div className="fixed inset-0 z-[70] bg-background/80 backdrop-blur flex items-end justify-center" onClick={() => setOwnPickerOpen(false)}>
                <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg max-h-[80dvh] overflow-y-auto bg-card rounded-t-3xl border-t border-border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                  <p className="font-serif italic text-lg">{t("shop.whichOneIsIt")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("shop.whichOneHint")}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {ownCandidates.map((it) => {
                      const path = toStoragePath(it.image_url);
                      const src = path ? ownCandidatesSigned[path] : null;
                      return (
                        <button key={it.id} disabled={savingFeedback} onClick={() => void saveAlreadyOwn(it)} className="text-left active:scale-95 disabled:opacity-60">
                          <div className="aspect-square rounded-xl overflow-hidden bg-white border border-border/60">
                            {src && <img src={src} alt="" className="h-full w-full object-contain p-1" />}
                          </div>
                          <p className="mt-1 text-[10px] truncate">{[it.brand, it.colors?.[0]].filter(Boolean).join(" · ")}</p>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    disabled={savingFeedback}
                    onClick={() => void saveAlreadyOwn(null)}
                    className="mt-4 w-full h-11 rounded-full border border-border text-[10px] uppercase tracking-[0.25em] disabled:opacity-60"
                  >{t("shop.notUploadedYet")}</button>
                </div>
              </div>
            )}

            {suggestion.pairsWithIds.length > 0 && (
              <div className="mt-6">
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
                  {t("shop.wouldPairWith", { count: suggestion.pairsWithIds.length })}
                </p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {suggestion.pairsWithIds.map((id) => {
                    const it = itemsById[id];
                    if (!it) return null;
                    const path = toStoragePath(it.image_url);
                    const src = path ? signed[path] : null;
                    return (
                      <div key={id} className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-white border border-border/60">
                        {src && <img src={src} alt="" className="h-full w-full object-contain p-1" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <p className="px-6 mt-6 text-[11px] text-muted-foreground leading-relaxed">
        {t("shop.disclaimer")}
      </p>
    </div>
  );
}

/** Fashion value (iconic, timeless, trend, status) and how the piece differs from the closest owned
 *  one of the same kind — shown under a verdict so it's clear what the advice is based on. */
function FashionAndDifferences({ fashion, differsFrom, sameModel, price, cpw }: {
  cpw?: { wearsPerYear: number; years: number; costPerWearEur: number; rotatingWith: number; basis?: string; reasons?: string[] } | null;
  sameModel?: { count: number; name: string; colors: string[] } | null;
  price?: { priceEur: number; usualEur: number; topEur?: number; tier: "above_usual" | "upper_range" | "usual" | "below_usual"; sameModelPaidEur?: number | null } | null;
  fashion: { iconic: boolean; timeless: boolean; onTrend: boolean; statusPiece: boolean } | null | undefined;
  differsFrom: { label: string; differences: string[]; wear?: { changes: string[]; newOccasions: string[] } | null; visual?: { similarity: number; note: string } | null } | null | undefined;
}) {
  const { t, i18n } = useTranslation();
  // Colour and garment names are stored in English: shown in the person's language.
  const L = (label: string) => localizeLabel(label, i18n.language);
  const chips = fashion ? (["iconic", "timeless", "onTrend", "statusPiece"] as const).filter((k) => fashion[k]) : [];
  // How it is worn differently from the closest owned piece (heel, day/evening, occasions) — not the
  // list of construction details it "adds", which read as a description of the owned piece.
  const wear = differsFrom?.wear;
  const wearBits = wear
    ? [
        ...wear.changes.map((c) => t(`shop.wear.${c}`)),
        ...(wear.newOccasions.length ? [t("shop.wear.alsoFor", { occasions: wear.newOccasions.map((o) => t(`shop.occasion.${o.replace(/\s+/g, "")}`, { defaultValue: o })).join(", ") })] : []),
      ]
    : [];
  const visual = differsFrom?.visual ?? null;
  if (!chips.length && !wearBits.length && !sameModel && !price && !visual && !cpw) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((k) => (
            <span key={k} className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase tracking-widest text-foreground/70">{t(`shop.fashion.${k}`)}</span>
          ))}
        </div>
      )}
      {/* The same model already owned, and the price against what the person usually spends. */}
      {sameModel && (
        <p className="text-[11px] text-foreground/80 leading-snug">
          {t("shop.sameModelOwned", { count: sameModel.count, name: sameModel.name, colors: sameModel.colors.map((c) => colorName(c, i18n.language)).join(", ") })}
        </p>
      )}
      {price && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {t(`shop.priceVsUsual.${price.tier}`, { price: price.priceEur, usual: price.usualEur, top: price.topEur ?? price.usualEur })}
          {price.sameModelPaidEur != null && sameModel ? ` ${t("shop.priceVsUsual.sameModelPaid", { name: sameModel.name, paid: price.sameModelPaidEur })}` : ""}
        </p>
      )}
      {/* The owned piece that LOOKS most like it, judged from the photos, and what differs. */}
      {/* What it costs per wear: worn often justifies more. */}
      {cpw && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {t(cpw.basis === "history" ? "shop.costPerWearHistory" : "shop.costPerWear", { count: cpw.wearsPerYear, years: cpw.years, cpw: cpw.costPerWearEur })}
          {/* Why: the estimate comes from how usable the piece is. */}
          {cpw.reasons?.length
            ? ` (${cpw.reasons.map((r) => t(`shop.wearReason.${r}`, { count: cpw.rotatingWith })).join(", ")})`
            : ""}
        </p>
      )}
      {differsFrom && visual && (
        <p className="text-[11px] text-foreground/80 leading-snug">
          {visual.note
            ? t("shop.visualClosest", { label: L(differsFrom.label), note: visual.note })
            : t("shop.visualClosestNoNote", { label: L(differsFrom.label) })}
        </p>
      )}
      {differsFrom && wearBits.length > 0 && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {t("shop.wornDifferently", { label: L(differsFrom.label), details: wearBits.join(", ") })}
        </p>
      )}
    </div>
  );
}
