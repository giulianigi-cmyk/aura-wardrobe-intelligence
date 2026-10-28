import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Images, Link2, Plus } from "lucide-react";
import { toast } from "sonner";
import { firstHttpUrl, setPendingImportUrl } from "@/lib/pending-import";

export type AddSourceChoice = "add" | "batch-scan" | "outfit-scan";

/**
 * Unified entry point for adding pieces to the closet: one piece with full
 * detail, a batch of up to 50 photos or links processed in the background, or one
 * photo of a full outfit with several pieces detected together and
 * reviewed right away. Kept as three flat, clearly-labelled choices
 * (icon + one-line hint each) rather than folding the outfit-photo option
 * into batch scan — the two solve different moments (building up the
 * wardrobe over time in the background vs. capturing what's on right now
 * and reviewing it immediately) and merging them would make one of the
 * two worse at its own job.
 *
 * There is deliberately no separate "log wear" choice here. "Scansiona un
 * outfit" already covers that need end to end — it matches every detected
 * piece against the wardrobe, lets you search the wardrobe by hand for
 * anything it missed, and ends by asking whether to mark the pieces as
 * worn. A standalone LogWear screen doing a narrower version of the exact
 * same job, reached from its own menu entry, was tried twice (once as its
 * own icon, once as a fourth item here) and reverted both times — not a
 * placement problem, the flow itself was redundant with this one.
 */
export function AddSourceSheet({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (choice: AddSourceChoice) => void;
}) {
  const { t } = useTranslation();
  // Guards against a real mobile Safari quirk: the sheet's backdrop
  // renders at the exact screen position the "+" button was just
  // tapped. Touch devices dispatch the actual "click" event a beat
  // after the physical touch, targeting whatever now occupies that
  // spot — if the backdrop has already mounted there by the time that
  // delayed click fires, it lands on the backdrop's own onClick and
  // closes the sheet in the same gesture that opened it. Reported as
  // "the + button needs 3 taps" — the tap was never actually missed,
  // the sheet was opening and immediately closing itself. Ignoring
  // close attempts for this brief window is the standard fix for this
  // class of bug.
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    if (open) {
      setCanClose(false);
      const timer = setTimeout(() => setCanClose(true), 350);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-background/80 backdrop-blur flex items-end"
      onClick={() => { if (canClose) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={t("addSourceSheet.addPiecesAria")}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-card rounded-t-3xl border-t border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-2"
      >
        <p className="font-serif italic text-lg mb-1">{t("addSourceSheet.addToYourCloset")}</p>

        {/* The fastest way in: a link copied from a shop is read here, in the tap itself (iOS only
            lets a page read the clipboard inside a gesture), and the add screen opens already importing it. */}
        <button
          onClick={() => {
            void (async () => {
              try {
                const url = firstHttpUrl(await navigator.clipboard.readText());
                if (!url) { toast.error(t("addItem.toastClipboardNoLink")); return; }
                setPendingImportUrl(url);
                onChoose("add");
              } catch {
                toast.error(t("addItem.toastClipboardReadFailed"));
              }
            })();
          }}
          className="w-full flex items-center gap-3 rounded-2xl border border-border p-4 text-left active:scale-[0.98] transition"
        >
          <Link2 size={18} />
          <div>
            <p className="text-sm font-medium">{t("addSourceSheet.pasteLink")}</p>
            <p className="text-xs text-muted-foreground">{t("addSourceSheet.pasteLinkHint")}</p>
          </div>
        </button>

        <button
          onClick={() => onChoose("add")}
          className="w-full flex items-center gap-3 rounded-2xl border border-border p-4 text-left active:scale-[0.98] transition"
        >
          <Plus size={18} />
          <div>
            <p className="text-sm font-medium">{t("addSourceSheet.addOnePiece")}</p>
            <p className="text-xs text-muted-foreground">{t("addSourceSheet.addOnePieceHint")}</p>
          </div>
        </button>
        <button
          onClick={() => onChoose("batch-scan")}
          className="w-full flex items-center gap-3 rounded-2xl border border-border p-4 text-left active:scale-[0.98] transition"
        >
          <Images size={18} />
          <div>
            <p className="text-sm font-medium">{t("addSourceSheet.batchScanPhotos")}</p>
            <p className="text-xs text-muted-foreground">{t("addSourceSheet.batchScanPhotosHint")}</p>
          </div>
        </button>
        <button
          onClick={() => onChoose("outfit-scan")}
          className="w-full flex items-center gap-3 rounded-2xl border border-border p-4 text-left active:scale-[0.98] transition"
        >
          <Camera size={18} />
          <div>
            <p className="text-sm font-medium">{t("addSourceSheet.scanOneOutfit")}</p>
            <p className="text-xs text-muted-foreground">{t("addSourceSheet.scanOneOutfitHint")}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
