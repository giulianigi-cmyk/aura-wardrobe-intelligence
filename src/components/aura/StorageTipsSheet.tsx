import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { FOLD_DIAGRAMS, storageTipsFor } from "@/lib/storage-tips";
import { FoldingDiagram } from "@/components/aura/FoldingDiagram";

/** Consigli per il cambio stagione: what to do before putting clothes away, how to fold them,
 *  which containers to buy and where to keep them. Opened from the Cambio stagione view. */
export function StorageTipsSheet({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const tips = storageTipsFor(i18n.language);
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-background/80 backdrop-blur flex items-end" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-card rounded-t-3xl border-t border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto overscroll-contain"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif italic text-xl leading-tight">{tips.title}</p>
          <button onClick={onClose} aria-label={t("wardrobe.closeAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">{tips.intro}</p>
        <div className="mt-5 space-y-6">
          {tips.sections.map((section) => (
            <section key={section.id}>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{section.title}</p>
              <ul className="space-y-2.5">
                {section.tips.map((tip, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    <div className="flex gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-foreground/60 shrink-0" />
                      <span>{tip}</span>
                    </div>
                    {section.id === "fold" && FOLD_DIAGRAMS[i] && <FoldingDiagram kind={FOLD_DIAGRAMS[i]} label={tip} />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
