import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import {
  applyPresetsToTrip, listEssentialPresets,
  type EssentialPreset, type EssentialPresetItem, type TripEssential,
} from "@/lib/essentials.functions";

type PresetWithItems = EssentialPreset & { items: EssentialPresetItem[] };

/** "Add a list" on a trip that already exists: the saved essentials lists (work, gym, running…)
 *  are not exclusive — tick one or several and their items join this trip's list, each list in its
 *  own section, without duplicating what is already there. Before, lists could only be picked when
 *  the trip was created. */
export function TripPresetsSheet({
  tripId, onClose, onAdded, onManage,
}: {
  tripId: string;
  onClose: () => void;
  onAdded: (added: TripEssential[]) => void;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<PresetWithItems[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    listEssentialPresets()
      .then((r) => { if (alive) setPresets(r.presets as PresetWithItems[]); })
      .catch((e) => { if (alive) { setPresets([]); toast.error(e instanceof Error ? e.message : "Couldn't load your lists."); } });
    return () => { alive = false; };
  }, []);

  const toggle = (id: string) =>
    setChecked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const submit = async () => {
    if (!checked.size || busy) return;
    setBusy(true);
    try {
      const res = await applyPresetsToTrip({ data: { tripId, presetIds: Array.from(checked) } });
      onAdded(res.items);
      toast.success(res.added > 0
        ? t("tripDetail.essentialsCopied", { count: res.added, defaultValue: "{{count}} items added to your list" })
        : t("tripDetail.listsAlreadyOnTrip", { defaultValue: "Everything in these lists is already on this trip" }));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the lists.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-background/80 backdrop-blur flex items-end" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-card rounded-t-3xl border-t border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto overscroll-contain"
      >
        <div className="flex items-center justify-between mb-1">
          <p className="font-serif italic text-lg">{t("tripDetail.addLists", { defaultValue: "Add saved lists" })}</p>
          <button onClick={onClose} aria-label={t("avatar.backAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">{t("tripDetail.addListsHint", { defaultValue: "Pick one or more: they add up, nothing already on the list is repeated." })}</p>

        {presets === null ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : presets.length === 0 ? (
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t("tripDetail.noSavedLists", { defaultValue: "You don't have any saved lists yet." })}</p>
            <button onClick={onManage} className="text-[11px] text-muted-foreground underline">{t("tripCreate.setUpEssentialsListHint")}</button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {presets.map((p) => {
                const on = checked.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className="w-full flex items-center gap-2 rounded-xl bg-secondary/40 px-3 py-3 text-left"
                  >
                    <span className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${on ? "bg-foreground border-foreground" : "border-border"}`}>
                      {on && <Check size={11} className="text-background" />}
                    </span>
                    <span className="flex-1 text-sm">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground">{t("tripDetail.listItemCount", { count: p.items.length, defaultValue: "{{count}} items" })}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => void submit()}
              disabled={busy || checked.size === 0}
              className="mt-4 w-full h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {t("tripDetail.addListsCta", { count: checked.size, defaultValue: "Add {{count}} lists" })}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
