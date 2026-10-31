import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Download, X } from "lucide-react";
import { track } from "@/lib/telemetry-client";
import { buildListing, SELL_CONDITIONS, suggestedPrice, type SellCondition } from "@/lib/sell-listing";
import { colorName, garmentWithColor } from "@/lib/garment-names";

// No buttons to named resale sites on purpose: the person pastes the listing wherever they like.
// Sending sellers to a platform is worth a commission, so a named, tracked link only comes with an
// agreement; meanwhile copied listings and sold pieces are counted (anonymously) as the figures for it.

export type SellPiece = {
  id: string; brand?: string | null; category?: string | null; subcategory?: string | null;
  colors?: string[] | null; size?: string | null; material?: string[] | null; currency?: string | null;
};

/** A small "copy" button next to one field of the listing: resale sites ask for each in its own box. */
function CopyField({ label, onCopy }: { label: string; onCopy: () => void }) {
  return (
    <button type="button" onClick={onCopy} aria-label={label} title={label}
      className="h-8 w-8 shrink-0 rounded-full border border-border flex items-center justify-center active:scale-90">
      <Copy size={13} />
    </button>
  );
}

/** "Vendi questo capo": the listing ready to paste on any resale site — title, description,
 *  condition, suggested price (from the resale range of the piece's "Valore") and its photo, already
 *  without background. Each field has its own copy button (sites ask for them one by one), plus one
 *  to copy everything. "Segna come venduto" archives the piece. */
export function SellSheet({ piece, imageUrl, resaleLow, resaleHigh, onSold, onClose }: {
  piece: SellPiece; imageUrl: string; resaleLow: number | null; resaleHigh: number | null;
  onSold: () => void; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [condition, setCondition] = useState<SellCondition>("veryGood");
  const garment = garmentWithColor(piece.subcategory || piece.category || "", piece.colors?.[0] ?? null, i18n.language);
  const listing = useMemo(() => buildListing({
    brand: piece.brand, garment, size: piece.size,
    colorLabel: piece.colors?.length ? piece.colors.map((c) => colorName(c, i18n.language)).join(", ") : null,
    materials: (piece.material ?? []).map((m) => t(`materials.${m}`, { defaultValue: m })),
    condition,
  }, {
    conditionLabels: Object.fromEntries(SELL_CONDITIONS.map((c) => [c, t(`sell.conditions.${c}`)])) as Record<SellCondition, string>,
    size: t("sell.size"), materials: t("sell.materials"), color: t("sell.color"), condition: t("sell.condition"), brand: t("sell.brand"),
  }), [piece, garment, condition, i18n.language, t]);
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const price = suggestedPrice(resaleLow, resaleHigh, condition);
  const symbol = piece.currency === "USD" ? "$" : piece.currency === "GBP" ? "£" : "€";

  const copyText = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      track("flow_step", { feature: "sell", step: "copied", condition, field });
      toast.success(field === "all" ? t("sell.copied") : t("sell.fieldCopied"));
    } catch {
      toast.error(t("sell.copyFailed"));
    }
  };
  const copy = () => copyText(
    [title ?? listing.title, "", description ?? listing.description, price != null ? `\n${t("sell.priceLine", { price: `${price} ${symbol}` })}` : ""].join("\n").trim(),
    "all",
  );
  // The details the sites ask for in their own boxes, each to copy on its own.
  const details = [
    { key: "brand", label: t("sell.brand"), value: piece.brand?.trim() || null },
    { key: "size", label: t("sell.size"), value: piece.size?.trim() || null },
    { key: "color", label: t("sell.color"), value: piece.colors?.length ? piece.colors.map((c) => colorName(c, i18n.language)).join(", ") : null },
    { key: "materials", label: t("sell.materials"), value: (piece.material ?? []).map((m) => t(`materials.${m}`, { defaultValue: m })).join(", ") || null },
    { key: "condition", label: t("sell.condition"), value: t(`sell.conditions.${condition}`) },
  ].filter((d): d is { key: string; label: string; value: string } => !!d.value);

  const savePhoto = async () => {
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], `${(piece.brand ?? "nimbea").replace(/\W+/g, "-")}.${blob.type.includes("png") ? "png" : "jpg"}`, { type: blob.type || "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return; // the person closed the share sheet
      toast.error(t("sell.photoFailed"));
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-background/80 backdrop-blur flex items-end justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card rounded-t-3xl border-t sm:border-x border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[88vh] overflow-y-auto overscroll-contain"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif italic text-xl leading-tight">{t("sell.title")}</p>
          <button onClick={onClose} aria-label={t("wardrobe.closeAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>

        <div className="mt-4 flex gap-3 items-center">
          <div className="h-24 w-24 shrink-0 rounded-xl overflow-hidden" style={{ background: "#FFFFFF" }}>
            {imageUrl && <img src={imageUrl} alt="" className="h-full w-full object-contain p-1.5" />}
          </div>
          <div className="min-w-0">
            <button onClick={() => void savePhoto()} disabled={!imageUrl} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] disabled:opacity-40">
              <Download size={12} /> {t("sell.savePhoto")}
            </button>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{t("sell.photoHint")}</p>
          </div>
        </div>

        <p className="mt-5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{t("sell.condition")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SELL_CONDITIONS.map((c) => (
            <button key={c} onClick={() => setCondition(c)}
              className={`rounded-full px-3 py-1.5 text-xs ${condition === c ? "bg-foreground text-background" : "bg-secondary/60"}`}>
              {t(`sell.conditions.${c}`)}
            </button>
          ))}
        </div>

        <p className="mt-5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{t("sell.suggestedPrice")}</p>
        {price != null ? (
          <>
            <div className="mt-1 flex items-center gap-2">
              <p className="font-serif text-2xl">{price} {symbol}</p>
              <CopyField label={t("sell.copyField", { field: t("sell.suggestedPrice") })} onCopy={() => void copyText(String(price), "price")} />
            </div>
            <p className="text-[11px] text-muted-foreground">{t("sell.priceHint")}</p>
          </>
        ) : (
          <p className="mt-1 text-[12px] text-muted-foreground">{t("sell.noPrice")}</p>
        )}

        <label className="block mt-5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{t("sell.titleLabel")}</label>
        <div className="mt-1.5 flex items-center gap-2">
          <input value={title ?? listing.title} onChange={(e) => setTitle(e.target.value.slice(0, 60))}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          <CopyField label={t("sell.copyField", { field: t("sell.titleLabel") })} onCopy={() => void copyText(title ?? listing.title, "title")} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <label className="block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{t("sell.descriptionLabel")}</label>
          <CopyField label={t("sell.copyField", { field: t("sell.descriptionLabel") })} onCopy={() => void copyText(description ?? listing.description, "description")} />
        </div>
        <textarea value={description ?? listing.description} onChange={(e) => setDescription(e.target.value)} rows={7}
          className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] leading-relaxed" />

        {details.length > 0 && (
          <ul className="mt-4 divide-y divide-border/60 rounded-xl border border-border">
            {details.map((d) => (
              <li key={d.key} className="flex items-center gap-2 px-3 py-1.5">
                <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{d.label}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{d.value}</span>
                <CopyField label={t("sell.copyField", { field: d.label })} onCopy={() => void copyText(d.value, d.key)} />
              </li>
            ))}
          </ul>
        )}

        <button onClick={() => void copy()}
          className="mt-5 w-full h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] inline-flex items-center justify-center gap-1.5 active:scale-95">
          <Copy size={13} /> {t("sell.copy")}
        </button>
        <button onClick={() => { track("flow_step", { feature: "sell", step: "sold" }); onSold(); }} className="mt-4 w-full text-center text-[12px] underline underline-offset-2 text-foreground/80">
          {t("sell.markSold")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// "Lo tengo": not suggested again for a year. Remembered on this device only — a suggestion coming
// back on another phone is harmless, and it needs no new database field.
const keepKey = (userId: string) => `aura.sellKeep.${userId}`;
export function readKeptPieces(userId: string): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(keepKey(userId)) ?? "{}") as Record<string, number>; } catch { return {}; }
}
export function keepPiece(userId: string, itemId: string): void {
  try {
    const kept = readKeptPieces(userId);
    kept[itemId] = Date.now() + 365 * 86_400_000;
    localStorage.setItem(keepKey(userId), JSON.stringify(kept));
  } catch { /* storage unavailable: it may be suggested again */ }
}

/** The pieces worth selling, each with why and two choices: prepare the listing, or keep it. */
export function SellSuggestionsSheet({ pieces, onPrepare, onKeep, onClose }: {
  pieces: { id: string; label: string; imageUrl: string; reason: string }[];
  onPrepare: (id: string) => void; onKeep: (id: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return createPortal(
    <div className="fixed inset-0 z-[85] bg-background/80 backdrop-blur flex items-end justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card rounded-t-3xl border-t sm:border-x border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif italic text-xl leading-tight">{t("sell.suggestionsTitle")}</p>
          <button onClick={onClose} aria-label={t("wardrobe.closeAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t("sell.suggestionsIntro")}</p>
        <ul className="mt-4 space-y-3">
          {pieces.map((p) => (
            <li key={p.id} className="flex gap-3 items-center rounded-2xl border border-border p-2.5">
              <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden" style={{ background: "#FFFFFF" }}>
                {p.imageUrl && <img src={p.imageUrl} alt="" className="h-full w-full object-contain p-1" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug truncate">{p.label}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{p.reason}</p>
                <div className="mt-1.5 flex gap-2">
                  <button onClick={() => onPrepare(p.id)} className="rounded-full bg-foreground text-background px-3 py-1 text-[11px]">{t("sell.prepare")}</button>
                  <button onClick={() => onKeep(p.id)} className="rounded-full border border-border px-3 py-1 text-[11px]">{t("sell.keep")}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
