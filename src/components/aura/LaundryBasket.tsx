import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

export type LaundryPiece = {
  id: string; label: string; imageUrl: string; since: string;
  material?: string[] | null; category?: string | null; colors?: string[] | null;
};

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

function PieceRow({ p, action, onAction }: { p: LaundryPiece; action: string; onAction: () => void }) {
  const { t } = useTranslation();
  return (
    <li className="flex gap-3 items-center rounded-2xl border border-border p-2">
      <div className="h-12 w-12 shrink-0 rounded-lg overflow-hidden" style={{ background: "#FFFFFF" }}>
        {p.imageUrl && <img src={p.imageUrl} alt="" className="h-full w-full object-contain p-1" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug truncate">{p.label}</p>
        <p className="text-[11px] text-muted-foreground">{t("laundry.daysAgo", { count: daysAgo(p.since) })}</p>
      </div>
      <button onClick={onAction} className="shrink-0 rounded-full border border-border px-3 py-1 text-[11px]">{action}</button>
    </li>
  );
}

/** The laundry basket: one list, "Lavati" for all of it or one piece at a time. Not split by machine
 *  load: colour and material are often missing or approximate, and a wrong load can ruin a piece.
 *  Pieces left in it go back to the wardrobe after 10 days. */
export function LaundryBasketSheet({ pieces, onWashed, onClose }: {
  pieces: LaundryPiece[]; onWashed: (ids: string[]) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return createPortal(
    <div className="fixed inset-0 z-[85] bg-background/80 backdrop-blur flex items-end justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card rounded-t-3xl border-t sm:border-x border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif italic text-xl leading-tight">{t("laundry.basketTitle")}</p>
          <button onClick={onClose} aria-label={t("wardrobe.closeAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t("laundry.basketIntro")}</p>
        {pieces.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("laundry.basketEmpty")}</p>
        ) : (
          <>
            <button onClick={() => onWashed(pieces.map((p) => p.id))}
              className="mt-4 w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em]">
              {t("laundry.washedAll")}
            </button>
            <ul className="mt-4 space-y-2">
              {pieces.map((p) => <PieceRow key={p.id} p={p} action={t("laundry.washed")} onAction={() => onWashed([p.id])} />)}
            </ul>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Pieces at the dry cleaner: they never come back on their own; "Ritirati" brings them home. */
export function DryCleanerSheet({ pieces, onCollected, onClose }: {
  pieces: LaundryPiece[]; onCollected: (ids: string[]) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return createPortal(
    <div className="fixed inset-0 z-[85] bg-background/80 backdrop-blur flex items-end justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card rounded-t-3xl border-t sm:border-x border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif italic text-xl leading-tight">{t("laundry.dryCleanerTitle")}</p>
          <button onClick={onClose} aria-label={t("wardrobe.closeAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t("laundry.dryCleanerIntro")}</p>
        {pieces.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("laundry.dryCleanerEmpty")}</p>
        ) : (
          <>
            <button onClick={() => onCollected(pieces.map((p) => p.id))}
              className="mt-4 w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em]">
              {t("laundry.collectedAll")}
            </button>
            <ul className="mt-4 space-y-2">
              {pieces.map((p) => <PieceRow key={p.id} p={p} action={t("laundry.collected")} onAction={() => onCollected([p.id])} />)}
            </ul>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
