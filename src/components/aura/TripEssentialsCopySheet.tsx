import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { listTrips, getTrip, type Trip, type TripDestination } from "@/lib/trips.functions";
import { copyEssentialsToTrip, type TripEssential } from "@/lib/essentials.functions";

type TripRow = Trip & { destinations: TripDestination[] };

const keyOf = (category: string | null | undefined, name: string) => `${(category ?? "").trim().toLowerCase()}|${name.trim().toLowerCase()}`;

/** "Copy the list from another trip": two trips (work vs leisure) usually share
 *  most of their essentials and differ in a few, so instead of retyping the
 *  shared part, pick a trip, tick what you want (everything that is not already
 *  on this trip's list starts ticked) and add it in one go. Everything copied
 *  starts as "to pack". */
export function TripEssentialsCopySheet({
  toTripId, currentEssentials, onClose, onCopied,
}: {
  toTripId: string;
  currentEssentials: TripEssential[];
  onClose: () => void;
  onCopied: (added: TripEssential[]) => void;
}) {
  const { t } = useTranslation();
  const [trips, setTrips] = useState<TripRow[] | null>(null);
  const [picked, setPicked] = useState<TripRow | null>(null);
  const [source, setSource] = useState<TripEssential[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const already = useMemo(() => new Set(currentEssentials.map((e) => keyOf(e.category, e.name))), [currentEssentials]);

  useEffect(() => {
    let alive = true;
    listTrips()
      .then((r) => { if (alive) setTrips(((r.trips ?? []) as TripRow[]).filter((x) => x.id !== toTripId)); })
      .catch((e) => { if (alive) { setTrips([]); toast.error(e instanceof Error ? e.message : "Couldn't load your trips."); } });
    return () => { alive = false; };
  }, [toTripId]);

  const choose = async (trip: TripRow) => {
    setPicked(trip);
    setSource(null);
    try {
      const res = await getTrip({ data: { tripId: trip.id } });
      const list = (res.essentials ?? []) as TripEssential[];
      setSource(list);
      setChecked(new Set(list.filter((e) => !already.has(keyOf(e.category, e.name))).map((e) => e.id)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load that list.");
      setPicked(null);
    }
  };

  const toggle = (id: string) =>
    setChecked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const grouped = useMemo(() => {
    const map = new Map<string, TripEssential[]>();
    (source ?? []).forEach((e) => {
      const k = e.category || t("tripDetail.uncategorized", { defaultValue: "Other" });
      map.set(k, [...(map.get(k) ?? []), e]);
    });
    return Array.from(map.entries());
  }, [source, t]);

  const submit = async () => {
    const chosen = (source ?? []).filter((e) => checked.has(e.id));
    if (!chosen.length || busy) return;
    setBusy(true);
    try {
      const res = await copyEssentialsToTrip({
        data: { toTripId, items: chosen.map((e) => ({ category: e.category, name: e.name, quantity: e.quantity })) },
      });
      onCopied(res.items);
      toast.success(t("tripDetail.essentialsCopied", { count: res.added, defaultValue: "{{count}} items added to your list" }));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy the list.");
    } finally {
      setBusy(false);
    }
  };

  const tripTitle = (tr: TripRow) => tr.name || tr.destinations[0]?.destination_name || t("tripDetail.untitledTrip", { defaultValue: "Trip" });
  const tripKind = (tr: TripRow) =>
    tr.trip_type === "work" ? t("tripDetail.kindWork", { defaultValue: "Work" })
      : tr.trip_type === "leisure" ? t("tripDetail.kindLeisure", { defaultValue: "Leisure" })
      : t("tripDetail.kindMixed", { defaultValue: "Mixed" });

  const selectable = (source ?? []).filter((e) => !already.has(keyOf(e.category, e.name)));

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-background/80 backdrop-blur flex items-end" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-card rounded-t-3xl border-t border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto overscroll-contain"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {picked && (
              <button onClick={() => { setPicked(null); setSource(null); }} aria-label={t("avatar.backAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0">
                <ArrowLeft size={15} />
              </button>
            )}
            <p className="font-serif italic text-lg truncate">
              {picked ? tripTitle(picked) : t("tripDetail.copyFromTrip", { defaultValue: "Copy from another trip" })}
            </p>
          </div>
          <button onClick={onClose} aria-label={t("avatar.backAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>

        {!picked ? (
          trips === null ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : trips.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t("tripDetail.noOtherTrips", { defaultValue: "You don't have another trip to copy from yet." })}</p>
          ) : (
            <div className="space-y-2">
              {trips.map((tr) => (
                <button key={tr.id} onClick={() => void choose(tr)} className="w-full text-left rounded-2xl bg-secondary/40 px-4 py-3 active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{tripTitle(tr)}</p>
                    <span className="shrink-0 text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-background text-muted-foreground">{tripKind(tr)}</span>
                  </div>
                  {tr.destinations[0]?.start_date && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(tr.destinations[0].start_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )
        ) : source === null ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : source.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t("tripDetail.noEssentialsThere", { defaultValue: "That trip has no essentials list yet." })}</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                {t("tripDetail.selectedCount", { count: checked.size, defaultValue: "{{count}} selected" })}
              </p>
              <button
                onClick={() => setChecked(checked.size === selectable.length ? new Set() : new Set(selectable.map((e) => e.id)))}
                className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground"
              >{checked.size === selectable.length ? t("tripDetail.selectNone", { defaultValue: "None" }) : t("tripDetail.selectAll", { defaultValue: "All" })}</button>
            </div>
            <div className="space-y-4">
              {grouped.map(([category, list]) => (
                <div key={category}>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1.5">{category}</p>
                  <div className="space-y-1.5">
                    {list.map((e) => {
                      const have = already.has(keyOf(e.category, e.name));
                      const on = checked.has(e.id);
                      return (
                        <button
                          key={e.id}
                          disabled={have}
                          onClick={() => toggle(e.id)}
                          className="w-full flex items-center gap-2 rounded-xl bg-secondary/40 px-3 py-2.5 text-left disabled:opacity-50"
                        >
                          <span className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${on ? "bg-foreground border-foreground" : "border-border"}`}>
                            {on && <Check size={11} className="text-background" />}
                          </span>
                          <span className="flex-1 text-sm">{e.name} ×{e.quantity}</span>
                          {have && <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{t("tripDetail.alreadyOnList", { defaultValue: "Already here" })}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => void submit()}
              disabled={busy || checked.size === 0}
              className="mt-4 w-full h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {t("tripDetail.addSelected", { count: checked.size, defaultValue: "Add {{count}} to this trip" })}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
