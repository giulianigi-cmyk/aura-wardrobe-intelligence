import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { careExtrasFor, careProfileFor, laundryTextFor, PROFILE_SYMBOLS, SYMBOL_GROUPS } from "@/lib/laundry-care";
import { CareSymbol } from "@/components/aura/CareSymbol";

/** Guida al lavaggio: every care-label symbol drawn and explained, the washing-machine programmes and
 *  general tips. Opened from the Wardrobe and from the "Come lavarlo" box of any piece. */
export function LaundryGuideSheet({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const text = laundryTextFor(i18n.language);
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-background/80 backdrop-blur flex items-end justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card rounded-t-3xl border-t sm:border-x border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto overscroll-contain"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif italic text-xl leading-tight">{text.title}</p>
          <button onClick={onClose} aria-label={t("wardrobe.closeAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">{text.intro}</p>
        <div className="mt-5 space-y-6">
          {SYMBOL_GROUPS.map((group) => (
            <section key={group.id}>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{text.groupTitles[group.id]}</p>
              <ul className="space-y-2">
                {group.symbols.map((kind) => (
                  <li key={kind} className="flex items-center gap-3 text-sm leading-snug">
                    <CareSymbol kind={kind} label={text.symbolLabels[kind]} />
                    <span>{text.symbolLabels[kind]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{text.programmesTitle}</p>
            <ul className="space-y-2.5">
              {text.programmes.map((p) => (
                <li key={p.name} className="text-sm leading-relaxed">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground"> · {p.use}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{text.tipsTitle}</p>
            <ul className="space-y-2.5">
              {text.tips.map((tip, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-foreground/60 shrink-0" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** "Come lavarlo" at the bottom of a piece, under its material: the likely label symbols and how to wash,
 *  dry and iron it, worked out from what it is made of (the most delicate fibre of a mix wins). */
export function CareBox({ materials, category, subcategory, onOpenGuide, bare = false }: {
  materials: readonly string[]; category?: string | null; subcategory?: string | null; onOpenGuide: () => void;
  /** Inside a DetailSection, which already draws the frame and the title. */
  bare?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const text = laundryTextFor(i18n.language);
  const profile = careProfileFor(materials, category);
  const extras = careExtrasFor(category, subcategory);
  return (
    <div className={bare ? "" : "rounded-2xl bg-secondary/40 p-4"}>
      {!bare && <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("wardrobe.careBoxTitle")}</p>}
      {materials.length > 0 && (
        <p className={`${bare ? "" : "mt-2 "}text-[13px]`}>
          <span className="text-muted-foreground">{t("wardrobe.materialLabel")}: </span>
          {materials.map((m) => t(`materials.${m}`, { defaultValue: m })).join(", ")}
        </p>
      )}
      {profile ? (
        <>
          <p className="mt-2 text-sm font-medium">{text.profiles[profile].name}</p>
          <ul className="mt-2 space-y-1.5">
            {[...text.profiles[profile].lines, ...extras.map((e) => text.extras[e])].map((line, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                <span className="mt-[0.55rem] h-1 w-1 rounded-full bg-foreground/60 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {PROFILE_SYMBOLS[profile].length > 0 && (
            <>
              <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{text.symbolsTitle}</p>
              <ul className="mt-2 space-y-1.5">
                {PROFILE_SYMBOLS[profile].map((kind) => (
                  <li key={kind} className="flex items-center gap-3 text-[13px] leading-snug">
                    <CareSymbol kind={kind} size={30} label={text.symbolLabels[kind]} />
                    <span>{text.symbolLabels[kind]}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-[12px] leading-snug text-foreground/60">{text.disclaimer}</p>
        </>
      ) : (
        <p className="mt-2 text-[13px] text-muted-foreground">{text.careBoxEmpty}</p>
      )}
      <button onClick={onOpenGuide} className="mt-3 text-[12px] underline underline-offset-2 text-foreground/80">
        {text.openGuide} ›
      </button>
    </div>
  );
}
