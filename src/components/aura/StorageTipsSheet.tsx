import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { foldDiagramsFor, storageTipsFor } from "@/lib/storage-tips";
import { useProfile } from "@/hooks/use-profile";
import { FoldingDiagram } from "@/components/aura/FoldingDiagram";

/** Consigli per il cambio stagione: what to do before putting clothes away, how to fold them,
 *  which containers to buy and where to keep them, then the folding drawings for this person
 *  (bras for women, boxers for men, both when no gender is set). Opened from the Cambio stagione view. */
export function StorageTipsSheet({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const tips = storageTipsFor(i18n.language);
  const { profile } = useProfile();
  const diagrams = foldDiagramsFor(profile?.gender);
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
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-foreground/60 shrink-0" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{tips.diagramsTitle}</p>
            <div className="space-y-4">
              {diagrams.map((kind) => (
                <div key={kind}>
                  <p className="text-sm">{tips.diagramLabels[kind]}</p>
                  <FoldingDiagram kind={kind} label={tips.diagramLabels[kind]} steps={tips.diagramSteps[kind]} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
