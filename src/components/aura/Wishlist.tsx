import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Camera, Check, ChevronRight, Link as LinkIcon, Loader2, PiggyBank, Plus, Trash2, X } from "lucide-react";
import { useSheetCanClose } from "@/hooks/use-sheet-can-close";
import { supabase } from "@/integrations/supabase/client";
import { signStoragePaths } from "@/lib/signed-url-cache";
import { firstHttpUrl, setPendingImportUrl } from "@/lib/pending-import";
import { importProductFromUrl } from "@/lib/import-url.functions";
import { countPairings } from "@/lib/purchase-pairings";
import { similarOwnedPiece } from "@/lib/purchase-similarity";
import { localizeLabel, garmentName } from "@/lib/garment-names";
import { ITEM_CATEGORIES } from "@/lib/wardrobe-options";
import { monthlyQuestionDue, openWishes, savingsBalance, savingsPlan, wishCostPerWear } from "@/lib/wishlist-savings";
import type { WardrobeItem } from "@/lib/aura-types";
import type { Database } from "@/integrations/supabase/types";
import type { Screen } from "./AuraApp";

type Wish = Database["public"]["Tables"]["wishlist_items"]["Row"];
type Entry = Database["public"]["Tables"]["savings_entries"]["Row"];

const symbolOf = (currency: string | null | undefined) => (currency === "USD" ? "$" : currency === "GBP" ? "£" : "€");
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const thisMonth = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
// "Non questo mese" on the monthly question: remembered on this device for the current month only.
const skipKey = (userId: string) => `aura.savingsAskSkip.${userId}`;
/** "Lista dei desideri" and the money set aside for it, in the Shop screen. Pieces come from the
 *  result of "Devo comprarlo?" (link, photo or label, analysed once there). Nothing here moves real
 *  money: the savings are a note of what the person says they put aside. */
export function WishlistSection({ userId, wardrobe, refreshKey, go }: {
  userId: string; wardrobe: WardrobeItem[]; refreshKey: number; go: (s: Screen) => void;
}) {
  const { t, i18n } = useTranslation();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [addingAmount, setAddingAmount] = useState<"monthly" | "manual" | null>(null);
  const [amountText, setAmountText] = useState("");
  // For each piece, how the person wants to get there: by a date, or with an amount a month. Shown
  // from what is saved on the piece; changed here until a date or an amount is entered.
  const [choiceById, setChoiceById] = useState<Record<string, "date" | "month">>({});
  const [monthlyText, setMonthlyText] = useState<Record<string, string>>({});
  // The piece whose card is open.
  const [openId, setOpenId] = useState<string | null>(null);
  // A piece added by hand, without "Devo comprarlo?": name, and when known brand, type, price, link, photo.
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", brand: "", category: "", price: "", currency: "EUR", url: "" });
  const [draftPhoto, setDraftPhoto] = useState<File | null>(null);
  const [draftPhotoUrl, setDraftPhotoUrl] = useState<string | null>(null);
  // A pasted product link fills the form by itself (same page reader as "Aggiungi un capo").
  const importUrl = useServerFn(importProductFromUrl);
  const [importing, setImporting] = useState(false);
  const lastImportedRef = useRef<string | null>(null);
  const [skippedMonth, setSkippedMonth] = useState<string | null>(() => {
    try { return localStorage.getItem(skipKey(userId)); } catch { return null; }
  });

  const load = useCallback(async () => {
    const [w, e] = await Promise.all([
      supabase.from("wishlist_items").select("*").eq("user_id", userId),
      supabase.from("savings_entries").select("*").eq("user_id", userId),
    ]);
    if (w.error || e.error) { console.error("[AURA wishlist] load failed", w.error ?? e.error); return; }
    setWishes(w.data ?? []);
    setEntries(e.data ?? []);
    const paths = (w.data ?? []).map((x) => x.image_url).filter((u): u is string => !!u && !u.startsWith("http"));
    const signed = paths.length ? (await signStoragePaths("wardrobe", paths, 60 * 60)).urls : {};
    setImages(Object.fromEntries((w.data ?? []).map((x) => [x.id, x.image_url ? (x.image_url.startsWith("http") ? x.image_url : signed[x.image_url] ?? "") : ""])));
  }, [userId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const open = useMemo(() => openWishes(wishes), [wishes]);
  const plan = useMemo(() => savingsPlan(wishes, entries), [wishes, entries]);
  const balance = useMemo(() => savingsBalance(entries), [entries]);
  const rowById = useMemo(() => Object.fromEntries(plan.rows.map((r) => [r.id, r])), [plan]);
  const monthName = (iso: string) => {
    const [y, m] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  };
  const monthlyAmount = plan.monthlyTotal;
  const owned = useMemo(() => wardrobe.filter((it) => !(it as { archived?: boolean }).archived), [wardrobe]);
  const askMonthly = monthlyQuestionDue(monthlyAmount, entries) && skippedMonth !== thisMonth();

  const addEntry = async (amount: number, source: "monthly" | "manual" | "spent", wishId: string | null = null) => {
    const { error } = await supabase.from("savings_entries").insert({ user_id: userId, amount, source, wishlist_item_id: wishId });
    if (error) throw error;
  };

  const saveAmount = async (amount: number, source: "monthly" | "manual") => {
    if (!(amount > 0) || busy) return;
    setBusy(true);
    try {
      await addEntry(Math.round(amount * 100) / 100, source);
      setAddingAmount(null); setAmountText("");
      toast.success(t("wishlist.savedToast", { amount: fmt(amount) }));
      await load();
    } catch (e) {
      console.error("[AURA wishlist] save failed", e);
      toast.error(t("wishlist.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const skipThisMonth = () => {
    const m = thisMonth();
    try { localStorage.setItem(skipKey(userId), m); } catch { /* asked again on the next visit */ }
    setSkippedMonth(m);
  };

  /** Moves a piece one place up or down and stores the new order (0, 1, 2… from the top). */
  const move = async (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= open.length || busy) return;
    const order = [...open];
    [order[index], order[to]] = [order[to], order[index]];
    const changed = order.map((w, i) => ({ w, i })).filter(({ w, i }) => w.priority !== i);
    setWishes((prev) => prev.map((w) => { const i = order.findIndex((o) => o.id === w.id); return i >= 0 ? { ...w, priority: i } : w; }));
    setBusy(true);
    try {
      for (const { w, i } of changed) {
        const { error } = await supabase.from("wishlist_items").update({ priority: i, updated_at: new Date().toISOString() }).eq("id", w.id);
        if (error) throw error;
      }
    } catch (e) {
      console.error("[AURA wishlist] reorder failed", e);
      toast.error(t("wishlist.saveFailed"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  /** A date or an amount a month for a piece: one replaces the other. */
  const setGoal = async (wish: Wish, patch: { target_date: string | null; monthly_amount: number | null }) => {
    setWishes((prev) => prev.map((w) => (w.id === wish.id ? { ...w, ...patch } : w)));
    const { error } = await supabase.from("wishlist_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", wish.id);
    if (error) { console.error("[AURA wishlist] goal failed", error); toast.error(t("wishlist.saveFailed")); await load(); }
  };

  const remove = async (wish: Wish) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("wishlist_items").delete().eq("id", wish.id);
      if (error) throw error;
      if (wish.image_url && !wish.image_url.startsWith("http")) await supabase.storage.from("wardrobe").remove([wish.image_url]);
      toast.success(t("wishlist.removed"));
      await load();
    } catch (e) {
      console.error("[AURA wishlist] remove failed", e);
      toast.error(t("wishlist.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  /** "Comprato": its price comes out of the savings (as far as they go), it leaves the list, and the
   *  add-a-piece screen opens — on its link when it has one — to put it in the wardrobe. */
  const bought = async (wish: Wish) => {
    if (busy) return;
    setBusy(true);
    try {
      const priceEur = rowById[wish.id]?.priceEur ?? null;
      const spent = priceEur == null ? 0 : Math.min(balance, priceEur);
      if (spent > 0) await addEntry(Math.round(spent * 100) / 100, "spent", wish.id);
      const { error } = await supabase.from("wishlist_items").update({ bought_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", wish.id);
      if (error) throw error;
      toast.success(t(wish.product_url ? "wishlist.boughtToastLink" : "wishlist.boughtToastPhoto"));
      if (wish.product_url) setPendingImportUrl(wish.product_url);
      go("add");
    } catch (e) {
      console.error("[AURA wishlist] bought failed", e);
      toast.error(t("wishlist.saveFailed"));
      setBusy(false);
    }
  };

  const openAdd = () => {
    setDraft({ title: "", brand: "", category: "", price: "", currency: "EUR", url: "" });
    setDraftPhoto(null);
    lastImportedRef.current = null;
    setAdding(true);
  };

  useEffect(() => {
    if (!draftPhoto) { setDraftPhotoUrl(null); return; }
    const u = URL.createObjectURL(draftPhoto);
    setDraftPhotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [draftPhoto]);

  /** Reads the product page: name, brand, price and photo fill the fields still empty. */
  const fillFromLink = useCallback(async (link: string) => {
    lastImportedRef.current = link;
    setImporting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await importUrl({ data: { url: link, accessToken: sess.session?.access_token } });
      if (!res.ok) { toast.error(res.error); return; }
      let photo: File | null = null;
      if (res.imageDataUrl) {
        const blob = await (await fetch(res.imageDataUrl)).blob();
        photo = new File([blob], `wish-${Date.now()}.${blob.type.includes("png") ? "png" : "jpg"}`, { type: blob.type || "image/jpeg" });
      }
      setDraft((d) => ({
        ...d,
        title: d.title.trim() ? d.title : (res.title ?? ""),
        brand: d.brand.trim() ? d.brand : (res.brand ?? ""),
        price: d.price.trim() || res.priceValue == null ? d.price : String(res.priceValue),
        currency: d.price.trim() || res.priceValue == null ? d.currency : (res.priceCurrency || "EUR").toUpperCase(),
      }));
      if (photo) setDraftPhoto((p) => p ?? photo);
      toast.success(t("wishlist.importedToast"));
    } catch (e) {
      console.error("[AURA wishlist] link import failed", e);
      toast.error(t("wishlist.importFailed"));
    } finally {
      setImporting(false);
    }
  }, [importUrl, t]);

  useEffect(() => {
    if (!adding) return;
    const link = firstHttpUrl(draft.url);
    if (!link || link === lastImportedRef.current) return;
    const timer = setTimeout(() => void fillFromLink(link), 600);
    return () => clearTimeout(timer);
  }, [adding, draft.url, fillFromLink]);

  /** Adds a piece by hand at the bottom of the list. The link is kept only when it is a web address. */
  const addByHand = async () => {
    const title = draft.title.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      let imagePath: string | null = null;
      if (draftPhoto) {
        const ext = draftPhoto.type.includes("png") ? "png" : "jpg";
        const path = `${userId}/wishlist/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("wardrobe").upload(path, draftPhoto, { cacheControl: "3600", upsert: false, contentType: draftPhoto.type || "image/jpeg" });
        if (!upErr) imagePath = path;
      }
      const price = Number(draft.price.replace(",", "."));
      const url = /^https?:\/\/\S+$/i.test(draft.url.trim()) ? draft.url.trim() : null;
      const last = wishes.filter((w) => !w.bought_at).reduce((m, w) => Math.max(m, w.priority), -1);
      const { error } = await supabase.from("wishlist_items").insert({
        user_id: userId, title, brand: draft.brand.trim() || null, category: draft.category || null,
        price: price > 0 ? Math.round(price * 100) / 100 : null, currency: price > 0 ? draft.currency : null,
        product_url: url, image_url: imagePath, priority: last + 1,
      });
      if (error) throw error;
      setAdding(false);
      toast.success(t("wishlist.addedToast"));
      await load();
    } catch (e) {
      console.error("[AURA wishlist] add failed", e);
      toast.error(t("wishlist.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const wishLabel = (w: Wish) =>
    w.title || [w.subcategory, w.category].filter((x): x is string => !!x).map((x) => garmentName(x, i18n.language)).join(" · ") || t("shop.unknownPiece");

  const statusOf = (w: Wish) => {
    const row = rowById[w.id];
    return !row || row.priceEur == null
      ? t("wishlist.noPrice")
      : row.remaining <= 0
      ? t("wishlist.covered")
      : row.late
      ? t("wishlist.rowLate", { remaining: fmt(row.remaining) })
      : row.reachedOn
      ? t("wishlist.rowReached", { monthly: row.monthly, month: monthName(row.reachedOn), covered: fmt(row.covered) })
      : row.monthly != null
      ? t("wishlist.rowMonthly", { monthly: row.monthly, count: row.months ?? 1, covered: fmt(row.covered) })
      : t("wishlist.rowCovered", { covered: fmt(row.covered), price: fmt(row.priceEur) });
  };

  const selected = open.find((w) => w.id === openId) ?? null;

  return (
    <section className="mx-6 mt-10 pt-8 border-t border-border/60">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("wishlist.title")}</p>
        <button onClick={openAdd}
          className="h-8 px-4 rounded-full border border-border text-[10px] uppercase tracking-widest inline-flex items-center gap-1 shrink-0">
          <Plus size={11} /> {t("wishlist.addAmount")}
        </button>
      </div>

      {open.length === 0 ? (
        <div className="rounded-[2rem] bg-secondary/40 p-6">
          <p className="text-[12px] text-muted-foreground leading-relaxed">{t("wishlist.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {open.map((w, i) => (
            <li key={w.id} className="rounded-2xl border border-border/60 bg-card p-2.5 flex items-center gap-2.5">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button disabled={busy || i === 0} onClick={() => void move(i, -1)} aria-label={t("wishlist.moveUp")} className="h-6 w-6 rounded-full border border-border flex items-center justify-center disabled:opacity-30"><ArrowUp size={11} /></button>
                <span className="text-[9px] bg-foreground text-background rounded-full h-5 w-5 flex items-center justify-center">{i + 1}</span>
                <button disabled={busy || i === open.length - 1} onClick={() => void move(i, 1)} aria-label={t("wishlist.moveDown")} className="h-6 w-6 rounded-full border border-border flex items-center justify-center disabled:opacity-30"><ArrowDown size={11} /></button>
              </div>
              <button onClick={() => setOpenId(w.id)} className="min-w-0 flex-1 flex items-center gap-3 text-left">
                <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-white border border-border/60">
                  {images[w.id] && <img src={images[w.id]} alt="" className="h-full w-full object-contain p-1" />}
                </div>
                <div className="min-w-0 flex-1">
                  {w.brand && <p className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{w.brand}</p>}
                  <p className="font-serif text-sm leading-tight line-clamp-2">{wishLabel(w)}</p>
                  {w.price != null && <p className="text-xs text-muted-foreground mt-0.5">{fmt(Number(w.price))} {symbolOf(w.currency)}</p>}
                  <p className="mt-0.5 text-[11px] leading-snug text-foreground/70 line-clamp-2">{statusOf(w)}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <WishSheet onClose={() => setOpenId(null)} closeLabel={t("wishlist.close")}>
          {renderDetail(selected)}
        </WishSheet>
      )}

      {adding && (
        <WishSheet onClose={() => setAdding(false)} closeLabel={t("wishlist.close")}>
          {renderAdd()}
        </WishSheet>
      )}
    </section>
  );

  /** The card of one piece: what it is, how to get there, the money set aside, bought or removed. */
  function renderDetail(w: Wish) {
    const choice = choiceById[w.id] ?? (w.monthly_amount != null && !w.target_date ? "month" : "date");
    const product = { category: w.category, subcategory: w.subcategory, colors: w.colors ?? [], brand: w.brand, text: w.title };
    const pairs = w.category ? countPairings(w.category, w.colors ?? [], owned) : 0;
    const similar = similarOwnedPiece(product, owned);
    const cpw = wishCostPerWear({ category: w.category, subcategory: w.subcategory, occasion: w.occasion, formality: w.formality, price: w.price, currency: w.currency, material: w.material }, owned);
    return (
      <>
        <div className="flex gap-4">
          <div className="h-28 w-28 shrink-0 rounded-2xl overflow-hidden bg-white border border-border/60">
            {images[w.id] && <img src={images[w.id]} alt="" className="h-full w-full object-contain p-1.5" />}
          </div>
          <div className="min-w-0 flex-1 pr-8">
            {w.brand && <p className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{w.brand}</p>}
            <p className="font-serif text-lg leading-tight">{wishLabel(w)}</p>
            {w.price != null && <p className="text-sm text-muted-foreground mt-0.5">{fmt(Number(w.price))} {symbolOf(w.currency)}</p>}
            <div className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-muted-foreground">
              {pairs > 0 && <p>{t("shop.wouldPairWithLink", { count: pairs })}</p>}
              {similar && <p className="text-foreground/80">{t("wishlist.similarOwned", { label: localizeLabel(similar.label, i18n.language) })}</p>}
              {cpw && <p>{t("wishlist.costPerWear", { cpw: fmt(cpw.costPerWearEur), count: cpw.wearsPerYear })}</p>}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(["date", "month"] as const).map((c) => (
            <button key={c} onClick={() => setChoiceById((m) => ({ ...m, [w.id]: c }))}
              className={`h-7 px-3 rounded-full text-[10px] uppercase tracking-widest ${choice === c ? "bg-foreground text-background" : "bg-background border border-border text-muted-foreground"}`}>
              {t(c === "date" ? "wishlist.modeDate" : "wishlist.modeBudget")}
            </button>
          ))}
          {choice === "date" ? (
            <input type="date" value={w.target_date ?? ""} aria-label={t("wishlist.modeDate")}
              onChange={(e) => void setGoal(w, { target_date: e.target.value || null, monthly_amount: null })}
              className="rounded-full border border-border bg-background px-2 py-1 text-[11px] text-foreground" />
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-[11px]">
              <input inputMode="decimal" placeholder="0" aria-label={t("wishlist.modeBudget")}
                value={monthlyText[w.id] ?? (w.monthly_amount != null ? String(w.monthly_amount) : "")}
                onChange={(e) => setMonthlyText((m) => ({ ...m, [w.id]: e.target.value }))}
                onBlur={() => {
                  const v = Number((monthlyText[w.id] ?? "").replace(",", "."));
                  if (monthlyText[w.id] == null) return;
                  void setGoal(w, { target_date: null, monthly_amount: v > 0 ? Math.round(v * 100) / 100 : null });
                }}
                className="w-14 bg-transparent outline-none text-right" />
              <span className="text-muted-foreground">{t("wishlist.perMonthSuffix")}</span>
            </span>
          )}
        </div>
        <p className="mt-2 text-[12px] leading-snug text-foreground/80">{statusOf(w)}</p>

        {renderSavings()}

        <div className="mt-4 flex gap-2">
          <button disabled={busy} onClick={() => void bought(w)}
            className="h-9 px-4 rounded-full bg-foreground text-background text-[11px] inline-flex items-center gap-1.5 disabled:opacity-60"><Check size={12} /> {t("wishlist.bought")}</button>
          <button disabled={busy} onClick={() => void remove(w)}
            className="h-9 px-4 rounded-full border border-border text-[11px] inline-flex items-center gap-1.5 disabled:opacity-60"><Trash2 size={12} /> {t("wishlist.remove")}</button>
        </div>
      </>
    );
  }

  /** The form to add a piece by hand: only the name is needed. */
  function renderAdd() {
    const field = "w-full rounded-full border border-border bg-background px-4 py-2 text-sm outline-none";
    return (
      <>
        <p className="font-serif italic text-lg pr-10">{t("wishlist.addTitle")}</p>
        <div className="mt-4 space-y-2.5">
          {/* The link first: pasted, it fills the rest by itself. */}
          <div className="flex items-center gap-2 rounded-full border border-border bg-background pl-4 pr-1.5 py-1">
            <LinkIcon size={13} className="shrink-0 text-muted-foreground" />
            <input inputMode="url" value={draft.url} onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
              placeholder={t("wishlist.fieldLink")} aria-label={t("wishlist.fieldLink")} className="flex-1 min-w-0 bg-transparent text-sm outline-none py-1" />
            {importing ? <Loader2 size={15} className="mr-2 animate-spin text-muted-foreground" /> : firstHttpUrl(draft.url) ? (
              <button type="button" onClick={() => { const l = firstHttpUrl(draft.url); if (l) void fillFromLink(l); }}
                className="h-8 px-3 rounded-full bg-secondary text-[10px] uppercase tracking-widest shrink-0">{t("wishlist.fillFromLink")}</button>
            ) : null}
          </div>
          {importing && <p className="text-[11px] text-muted-foreground px-4">{t("wishlist.importing")}</p>}
          <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder={t("wishlist.fieldName")} aria-label={t("wishlist.fieldName")} className={field} />
          <input value={draft.brand} onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
            placeholder={t("wishlist.fieldBrand")} aria-label={t("wishlist.fieldBrand")} className={field} />
          <div className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2">
            <input inputMode="decimal" value={draft.price} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
              placeholder={t("wishlist.fieldPrice")} aria-label={t("wishlist.fieldPrice")} className="flex-1 min-w-0 bg-transparent text-sm outline-none" />
            <span className="text-sm text-muted-foreground">{symbolOf(draft.currency)}</span>
          </div>
        </div>
        <p className="mt-4 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{t("wishlist.fieldCategory")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ITEM_CATEGORIES.filter((c) => c !== "Underwear").map((c) => (
            <button key={c} onClick={() => setDraft((d) => ({ ...d, category: d.category === c ? "" : c }))}
              className={`h-7 px-3 rounded-full text-[11px] ${draft.category === c ? "bg-foreground text-background" : "bg-background border border-border text-muted-foreground"}`}>
              {garmentName(c, i18n.language)}
            </button>
          ))}
        </div>
        <label className="mt-4 h-10 pl-1.5 pr-4 rounded-full border border-border inline-flex items-center gap-2 text-[11px] cursor-pointer">
          {draftPhotoUrl
            ? <img src={draftPhotoUrl} alt="" className="h-7 w-7 rounded-full object-contain bg-white border border-border/60" />
            : <span className="h-7 w-7 flex items-center justify-center"><Camera size={13} /></span>}
          {draftPhoto ? t("wishlist.photoReady") : t("wishlist.fieldPhoto")}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setDraftPhoto(e.target.files?.[0] ?? null)} />
        </label>
        <div className="mt-5">
          <button disabled={busy || !draft.title.trim()} onClick={() => void addByHand()}
            className="h-11 w-full rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] disabled:opacity-50">
            {t("wishlist.addSave")}
          </button>
        </div>
      </>
    );
  }

  /** What is set aside for all the wished pieces together, with this month's question. */
  function renderSavings() {
    return (
      <div className="mt-4 rounded-2xl bg-secondary/40 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-background border border-border flex items-center justify-center shrink-0"><PiggyBank size={17} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{t("wishlist.setAside")}</p>
            <p className="font-serif text-2xl leading-tight">{fmt(balance)} €</p>
          </div>
          <button onClick={() => { setAddingAmount(addingAmount ? null : "manual"); setAmountText(""); }}
            className="h-9 px-4 rounded-full border border-border text-[10px] uppercase tracking-widest inline-flex items-center gap-1 shrink-0">
            <Plus size={11} /> {t("wishlist.addAmount")}
          </button>
        </div>
        {plan.monthlyTotal > 0 && (
          <p className="mt-2 text-[12px] text-foreground/80 leading-snug">{t("wishlist.monthlyNeeded", { amount: plan.monthlyTotal })}</p>
        )}
        {plan.unrealistic && (
          <p className="mt-1.5 text-[11px] text-destructive leading-snug">
            {plan.rows.some((r) => r.late)
              ? t("wishlist.lateWarning")
              : t("wishlist.tightWarning", { amount: plan.monthlyTotal, usual: plan.usualMonthly ?? 0 })}
          </p>
        )}

        {askMonthly && !addingAmount && (
          <div className="mt-3 rounded-xl bg-background border border-border/60 p-3">
            <p className="text-[13px] leading-snug">{t("wishlist.monthlyQuestion", { amount: fmt(monthlyAmount) })}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => void saveAmount(monthlyAmount, "monthly")}
                className="h-8 px-3 rounded-full bg-foreground text-background text-[11px] disabled:opacity-60">{t("wishlist.yes")}</button>
              <button onClick={() => { setAddingAmount("monthly"); setAmountText(""); }}
                className="h-8 px-3 rounded-full border border-border text-[11px]">{t("wishlist.otherAmount")}</button>
              <button onClick={skipThisMonth} className="h-8 px-3 rounded-full text-[11px] text-muted-foreground underline underline-offset-2">{t("wishlist.notThisMonth")}</button>
            </div>
          </div>
        )}

        {addingAmount && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-full bg-background border border-border px-4 py-2">
              <input autoFocus inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)}
                placeholder={t("wishlist.amountPlaceholder")} className="flex-1 min-w-0 bg-transparent text-sm outline-none" />
              <span className="text-sm text-muted-foreground">€</span>
            </div>
            <button disabled={busy || !(Number(amountText.replace(",", ".")) > 0)}
              onClick={() => void saveAmount(Number(amountText.replace(",", ".")), addingAmount)}
              className="h-9 px-4 rounded-full bg-foreground text-background text-[10px] uppercase tracking-widest disabled:opacity-50">{t("wishlist.save")}</button>
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">{t("wishlist.noRealMoney")}</p>
      </div>
    );
  }
}

/** A bottom sheet over the page, like the other sheets of the app. */
function WishSheet({ onClose, closeLabel, children }: { onClose: () => void; closeLabel: string; children: ReactNode }) {
  const canClose = useSheetCanClose(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const content = (
    <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur flex items-end" role="dialog" aria-modal="true"
      onClick={() => { if (canClose) onClose(); }}>
      <div onClick={(e) => e.stopPropagation()}
        className="relative w-full max-h-[90vh] overflow-y-auto bg-card rounded-t-3xl border-t border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <button onClick={onClose} aria-label={closeLabel}
          className="absolute top-4 right-4 h-8 w-8 rounded-full border border-border bg-background flex items-center justify-center"><X size={14} /></button>
        {children}
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
