import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { essentialCategoryLabel, essentialNameLabel } from "@/lib/essential-labels";
import {
  copyEssentialsToTrip, listEssentialPresets,
  type EssentialPreset, type EssentialPresetItem, type TripEssential,
} from "@/lib/essentials.functions";

type PresetWithItems = EssentialPreset & { items: EssentialPresetItem[] };
/** One item of a chosen list, as it would land on the trip (no category → the list's name). */
type Candidate = { key: string; category: string; name: string; quantity: number; already: boolean; suggested: boolean };

const keyOf = (category: string | null | undefined, name: string) => `${(category ?? "").trim().toLowerCase()}|${name.trim().toLowerCase()}`;

/** "Add a list" on a trip that already exists: the saved essentials lists (work, gym, running…)
 *  are not exclusive — tick one or several and their items join this trip's list, each list in its
 *  own section, without duplicating what is already there. Before, lists could only be picked when
 *  the trip was created. A second step shows every item of the chosen lists, all ticked: untick
 *  what this trip doesn't need (the saved lists stay as they are). */
export function TripPresetsSheet({
  tripId, currentEssentials, onClose, onAdded, onManage,
}: {
  tripId: string;
  currentEssentials: TripEssential[];
  onClose: () => void;
  onAdded: (added: TripEssential[]) => void;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<PresetWithItems[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const already = useMemo(() => new Set(currentEssentials.map((e) => keyOf(e.category, e.name))), [currentEssentials]);
  const candidates = useMemo<Candidate[]>(() => {
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const p of presets ?? []) {
      if (!checked.has(p.id)) continue;
      for (const it of p.items) {
        const category = it.category?.trim() || p.name;
        const key = keyOf(category, it.name);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, category, name: it.name, quantity: it.quantity, already: already.has(key), suggested: it.always_include });
      }
    }
    return out;
  }, [presets, checked, already]);

  useEffect(() => {
    let alive = true;
    listEssentialPresets()
      .then((r) => { if (alive) setPresets(r.presets as PresetWithItems[]); })
      .catch((e) => { if (alive) { setPresets([]); toast.error(e instanceof Error ? e.message : "Couldn't load your lists."); } });
    return () => { alive = false; };
  }, []);

  const toggle = (id: string) =>
    setChecked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const review = () => {
    if (!checked.size) return;
    // everything ticked except what the trip already has and the list's optional suggestions
    setPicked(new Set(candidates.filter((c) => !c.already && c.suggested).map((c) => c.key)));
    setReviewing(true);
  };

  const togglePicked = (key: string) =>
    setPicked((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  const selectable = candidates.filter((c) => !c.already);
  const grouped = useMemo(() => {
    const map = new Map<string, Candidate[]>();
    candidates.forEach((c) => map.set(c.category, [...(map.get(c.category) ?? []), c]));
    return Array.from(map.entries());
  }, [candidates]);

  const submit = async () => {
    const chosen = candidates.filter((c) => picked.has(c.key) && !c.already);
    if (!chosen.length || busy) return;
    setBusy(true);
    try {
      const res = await copyEssentialsToTrip({
        data: { toTripId: tripId, items: chosen.map((c) => ({ category: c.category.slice(0, 60), name: c.name, quantity: c.quantity })) },
      });
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
          <div className="flex items-center gap-2 min-w-0">
            {reviewing && (
              <button onClick={() => setReviewing(false)} aria-label={t("avatar.backAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0">
                <ArrowLeft size={15} />
              </button>
            )}
            <p className="font-serif italic text-lg truncate">{t("tripDetail.addLists", { defaultValue: "Add saved lists" })}</p>
          </div>
          <button onClick={onClose} aria-label={t("avatar.backAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          {reviewing
            ? t("tripDetail.reviewListsHint", { defaultValue: "Untick what you don't need on this trip — your saved lists don't change." })
            : t("tripDetail.addListsHint", { defaultValue: "Pick one or more: they add up, nothing already on the list is repeated." })}
        </p>

        {reviewing ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                {t("tripDetail.selectedCount", { count: picked.size, defaultValue: "{{count}} selected" })}
              </p>
              <button
                onClick={() => setPicked(picked.size === selectable.length ? new Set() : new Set(selectable.map((c) => c.key)))}
                className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground"
              >{picked.size === selectable.length ? t("tripDetail.selectNone", { defaultValue: "None" }) : t("tripDetail.selectAll", { defaultValue: "All" })}</button>
            </div>
            <div className="space-y-4">
              {grouped.map(([category, list]) => (
                <div key={category}>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1.5">{essentialCategoryLabel(t, category)}</p>
                  <div className="space-y-1.5">
                    {list.map((c) => {
                      const on = picked.has(c.key);
                      return (
                        <button
                          key={c.key}
                          disabled={c.already}
                          onClick={() => togglePicked(c.key)}
                          className="w-full flex items-center gap-2 rounded-xl bg-secondary/40 px-3 py-2.5 text-left disabled:opacity-50"
                        >
                          <span className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${on ? "bg-foreground border-foreground" : "border-border"}`}>
                            {on && <Check size={11} className="text-background" />}
                          </span>
                          <span className="flex-1 text-sm">{essentialNameLabel(t, c.name)} ×{c.quantity}</span>
                          {c.already && <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{t("tripDetail.alreadyOnList", { defaultValue: "Already here" })}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => void submit()}
              disabled={busy || picked.size === 0}
              className="mt-4 w-full h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {t("tripDetail.addSelected", { count: picked.size, defaultValue: "Add {{count}} to this trip" })}
            </button>
          </>
        ) : presets === null ? (
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
              onClick={review}
              disabled={checked.size === 0}
              className="mt-4 w-full h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              {t("tripDetail.reviewListsCta", { defaultValue: "Next: choose the items" })}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
