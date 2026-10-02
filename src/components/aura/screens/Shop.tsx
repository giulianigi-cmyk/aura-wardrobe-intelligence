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
  const { t } = useTranslation();
  const { user } = useAuth();
  const analyzeGap = useServerFn(analyzeWardrobeGap);
  const analyzePurchaseFn = useServerFn(analyzePurchase);
  const [loading, setLoading] = useState(true);
  const [itemCount, setItemCount] = useState(0);
  const [suggestion, setSuggestion] = useState<GapSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemsById, setItemsById] = useState<Record<string, WardrobeItem>>({});
  const [signed, setSigned] = useState<Record<string, string>>({});

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
  }, [user]);

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      <header className="px-6 pt-14 pb-3">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("shop.theEdit")}</p>
        <h1 className="font-serif text-4xl mt-1">{t("shop.headerPrefix")} <span className="italic">{t("shop.headerEmphasis")}</span></h1>
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
                  <p className="font-serif text-base leading-tight truncate">{result.product.title || [result.analysis.subcategory, result.analysis.category].filter(Boolean).join(" · ") || t("shop.unknownPiece")}</p>
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
              <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{result.reason}</p>

              {/* A dress-preference violation is a hard, explicit personal
                  rule, not an AI opinion — never blend it in with the other
                  muted informational notes below, where it could read as
                  just one more soft suggestion. */}
              {result.rules.dressPreferenceViolation && (
                <div className="mt-3 rounded-xl bg-destructive/10 border border-destructive/30 px-3 py-2">
                  <p className="text-[11px] font-medium text-destructive">{t("shop.conflictsWithPreferences")}</p>
                </div>
              )}

              <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                {result.wardrobe.duplicate?.verdict === "certain" && (
                  <p className="font-medium text-foreground/80">{t("shop.looksLikeDuplicate")}</p>
                )}
                {result.wardrobe.duplicate?.verdict === "maybe" && (
                  <p>{t("shop.looksSimilarToOwned")}</p>
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
              <button
                onClick={() => go("add")}
                className="mt-5 h-11 px-6 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] inline-flex items-center gap-2"
              ><Plus size={12} /> {t("shop.addThisPiece")}</button>
            </div>

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
