import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, Briefcase, Palmtree, Shuffle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { Screen } from "../AuraApp";
import { createTrip, type TripType } from "@/lib/trips.functions";
import { applyPresetsToTrip } from "@/lib/essentials.functions";
import { listEssentialPresets, type EssentialPreset } from "@/lib/essentials.functions";
import { useWardrobeLocations } from "@/lib/wardrobe-locations-query";
import type { WardrobeLocation } from "@/lib/wardrobe-location";
import { searchDestinations, type DestinationSearchResult } from "@/lib/destination-search";

const TYPE_KEYS: { value: TripType; labelKey: string; icon: typeof Briefcase }[] = [
  { value: "work", labelKey: "tripCreate.typeWork", icon: Briefcase },
  { value: "leisure", labelKey: "tripCreate.typeLeisure", icon: Palmtree },
  { value: "mixed", labelKey: "tripCreate.typeMixed", icon: Shuffle },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDaysIso = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const newLegId = () => `leg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** One stop of a (possibly multi-destination) trip: its own place, dates and search state,
 *  independent of every other leg — see addLeg/removeLeg/updateLeg below. */
type Leg = {
  id: string;
  destinationName: string;
  latitude: number | null;
  longitude: number | null;
  query: string;
  results: DestinationSearchResult[];
  searching: boolean;
  startDate: string;
  endDate: string;
};
const blankLeg = (startDate: string): Leg => ({
  id: newLegId(), destinationName: "", latitude: null, longitude: null,
  query: "", results: [], searching: false, startDate, endDate: startDate,
});

export function TripCreate({ go, onCreated }: { go: (s: Screen) => void; onCreated: (tripId: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [tripType, setTripType] = useState<TripType>("leisure");
  // A trip is one or more legs in order — most trips are a single destination, so this starts
  // with exactly one blank leg and the whole multi-stop machinery stays invisible until the
  // person actually taps "+ Aggiungi tappa". The backend (createTrip) already accepted an
  // ordered array of destinations; only this screen ever collapsed it down to one.
  const [legs, setLegs] = useState<Leg[]>(() => [blankLeg(todayIso())]);
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [laundryAvailable, setLaundryAvailable] = useState(false);
  const [culturalMode, setCulturalMode] = useState(false);

  // Shared cache (see wardrobe-locations-query.ts) — same key
  // AIStylist/TripDetail read from.
  const { data: locationsData, isLoading: locationsLoading } = useWardrobeLocations();
  const locations = locationsData?.locations ?? [];
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [presets, setPresets] = useState<EssentialPreset[]>([]);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // No locations set up yet (the common single-home case) — that's
    // fine, the outfit engine already treats "no active location" as
    // "use the whole wardrobe". Only pre-select when there's a real
    // choice to make.
    if (locationsData?.activeLocationId) setSelectedLocationIds([locationsData.activeLocationId]);
  }, [locationsData]);

  useEffect(() => {
    listEssentialPresets()
      .then((presetRes) => {
        setPresets(presetRes.presets.map((p) => ({ id: p.id, user_id: p.user_id, name: p.name, created_at: p.created_at })));
      })
      .catch((e) => console.error("[AURA trip-create] presets load failed", e))
      .finally(() => setLoadingContext(false));
  }, []);

  // Per-leg search, debounced independently per row (a timer keyed by leg id) rather than one
  // shared effect — each stop's search box behaves exactly like the old single one did, and
  // typing in one row never cancels or interferes with another row's in-flight search.
  const queryLeg = (legId: string, query: string) => {
    setLegs((prev) => prev.map((l) => (l.id === legId ? { ...l, query, destinationName: "", latitude: null, longitude: null, results: [] } : l)));
    if (searchTimers.current[legId]) clearTimeout(searchTimers.current[legId]);
    if (query.trim().length < 2) return;
    setLegs((prev) => prev.map((l) => (l.id === legId ? { ...l, searching: true } : l)));
    searchTimers.current[legId] = setTimeout(() => {
      searchDestinations(query)
        .then((results) => setLegs((prev) => prev.map((l) => (l.id === legId ? { ...l, results, searching: false } : l))))
        .catch(() => setLegs((prev) => prev.map((l) => (l.id === legId ? { ...l, searching: false } : l))));
    }, 350);
  };

  const pickLegDestination = (legId: string, r: DestinationSearchResult) => {
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
    setLegs((prev) => prev.map((l) => (l.id === legId ? { ...l, destinationName: label, query: label, latitude: r.latitude, longitude: r.longitude, results: [] } : l)));
  };

  const updateLegDate = (legId: string, field: "startDate" | "endDate", value: string) =>
    setLegs((prev) => prev.map((l) => (l.id === legId ? { ...l, [field]: value } : l)));

  const addLeg = () =>
    setLegs((prev) => {
      const last = prev[prev.length - 1];
      // The next stop starts the day the previous one ends, by default — consecutive legs read
      // naturally as a continuous itinerary; easy to adjust either date afterward.
      const nextStart = last ? last.endDate : todayIso();
      return [...prev, blankLeg(nextStart)];
    });

  const removeLeg = (legId: string) =>
    setLegs((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== legId) : prev));

  const toggleLocation = (id: string) =>
    setSelectedLocationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const togglePreset = (id: string) =>
    setSelectedPresetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const canCreate = legs.every((l) => l.destinationName.trim().length > 0 && l.latitude != null && l.startDate && l.endDate && l.endDate >= l.startDate)
    && (locations.length === 0 || selectedLocationIds.length > 0);

  const create = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      // No locations configured at all — fall back to the wardrobe as a
      // whole (matches how the rest of the app treats "no Locations set
      // up"). Once a person creates one, createTrip requires an explicit
      // choice, same rule as everywhere else this matters.
      const sourceLocationIds = locations.length === 0 ? [] : selectedLocationIds;
      const res = await createTrip({
        data: {
          name: name.trim() || null,
          tripType,
          laundryAvailable,
          culturalMode,
          sourceLocationIds,
          destinations: legs.map((l) => ({ destinationName: l.destinationName.trim(), latitude: l.latitude, longitude: l.longitude, startDate: l.startDate, endDate: l.endDate })),
        },
      });
      if (selectedPresetIds.length) {
        await applyPresetsToTrip({ data: { tripId: res.trip.id, presetIds: selectedPresetIds } });
      }
      toast.success(t("tripCreate.tripCreated"));
      onCreated(res.trip.id);
    } catch (e) {
      console.error("[AURA trip-create] failed", e);
      toast.error(e instanceof Error ? e.message : t("tripCreate.couldntCreateTrip"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      <header className="px-6 pt-14 pb-2 flex items-center gap-3">
        <button onClick={() => go("trips")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("tripCreate.tripPlanner")}</p>
          <h1 className="font-serif text-3xl mt-1">{t("tripCreate.planATrip")}</h1>
        </div>
      </header>

      {(loadingContext || locationsLoading) ? (
        <div className="flex justify-center mt-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="px-6 mt-6 space-y-5">
          <div className="space-y-4">
            {legs.map((leg, idx) => (
              <div key={leg.id} className={legs.length > 1 ? "rounded-2xl border border-border/60 p-4 space-y-3" : "space-y-3"}>
                {legs.length > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("tripCreate.stopLabel", { n: idx + 1 })}</p>
                    <button
                      onClick={() => removeLeg(leg.id)}
                      aria-label={t("tripCreate.removeStopAria")}
                      className="h-7 w-7 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90"
                    ><X size={13} /></button>
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("tripCreate.whereAreYouGoing")}</p>
                  <input
                    value={leg.query}
                    onChange={(e) => queryLeg(leg.id, e.target.value)}
                    placeholder={t("tripCreate.searchCityPlaceholder")}
                    className="w-full bg-secondary/60 rounded-full px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {leg.searching && <p className="mt-1.5 text-[11px] text-muted-foreground">{t("tripCreate.searching")}</p>}
                  {leg.results.length > 0 && (
                    <div className="mt-2 rounded-2xl border border-border/60 bg-card overflow-hidden">
                      {leg.results.map((r, i) => (
                        <button
                          key={`${r.name}-${r.latitude}-${i}`}
                          onClick={() => pickLegDestination(leg.id, r)}
                          className="w-full px-4 py-2.5 text-left text-sm border-b border-border/40 last:border-b-0 active:bg-secondary/40"
                        >
                          {r.name}
                          <span className="text-muted-foreground">{[r.admin1, r.country].filter(Boolean).length ? ` — ${[r.admin1, r.country].filter(Boolean).join(", ")}` : ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {leg.latitude != null && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{t("tripCreate.weatherWillUseLocation")}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("tripCreate.from")}</p>
                    <input
                      type="date"
                      value={leg.startDate}
                      onChange={(e) => updateLegDate(leg.id, "startDate", e.target.value)}
                      className="w-full bg-secondary/60 rounded-full px-4 py-2.5 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("tripCreate.to")}</p>
                    <input
                      type="date"
                      value={leg.endDate}
                      min={leg.startDate}
                      onChange={(e) => updateLegDate(leg.id, "endDate", e.target.value)}
                      className="w-full bg-secondary/60 rounded-full px-4 py-2.5 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={addLeg}
              className="w-full h-11 rounded-full border border-dashed border-border text-[11px] uppercase tracking-[0.25em] text-muted-foreground flex items-center justify-center gap-2 active:scale-[0.98]"
            ><Plus size={13} /> {t("tripCreate.addStop")}</button>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("tripCreate.tripType")}</p>
            <div className="flex gap-2">
              {TYPE_KEYS.map(({ value, labelKey, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTripType(value)}
                  className={`flex-1 h-16 rounded-2xl border flex flex-col items-center justify-center gap-1 ${tripType === value ? "bg-foreground text-background border-foreground" : "border-border"}`}
                >
                  <Icon size={16} />
                  <span className="text-[10px] uppercase tracking-widest">{t(labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {locations.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("tripCreate.packFromWhichWardrobe")}</p>
              <div className="flex flex-wrap gap-2">
                {locations.map((loc) => {
                  const on = selectedLocationIds.includes(loc.id);
                  return (
                    <button
                      key={loc.id}
                      onClick={() => toggleLocation(loc.id)}
                      className={`rounded-full px-3 py-1.5 text-xs border ${on ? "bg-foreground text-background border-foreground" : "border-border bg-background"}`}
                    >{loc.name}</button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{t("tripCreate.selectMoreThanOneHint")}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("tripCreate.laundryAtDestination")}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setLaundryAvailable(true)}
                className={`flex-1 h-11 rounded-full border text-xs uppercase tracking-widest ${laundryAvailable ? "bg-foreground text-background border-foreground" : "border-border"}`}
              >{t("tripCreate.yes")}</button>
              <button
                onClick={() => setLaundryAvailable(false)}
                className={`flex-1 h-11 rounded-full border text-xs uppercase tracking-widest ${!laundryAvailable ? "bg-foreground text-background border-foreground" : "border-border"}`}
              >{t("tripCreate.no")}</button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {laundryAvailable ? t("tripCreate.laundryYesHint") : t("tripCreate.laundryNoHint")}
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("tripCreate.culturalMode")}</p>
            {/* Never inferred from destination or nationality — always
             *  this explicit choice, asked once per trip. YES lets
             *  local customs act as a soft ranking signal later; NO
             *  means general cultural norms are never applied as a
             *  preference (a venue's own genuine requirement — e.g. a
             *  mosque's dress code — is a separate, always-respected
             *  rule regardless of this toggle). */}
            <div className="flex gap-2">
              <button
                onClick={() => setCulturalMode(true)}
                className={`flex-1 h-11 rounded-full border text-xs uppercase tracking-widest ${culturalMode ? "bg-foreground text-background border-foreground" : "border-border"}`}
              >{t("tripCreate.yes")}</button>
              <button
                onClick={() => setCulturalMode(false)}
                className={`flex-1 h-11 rounded-full border text-xs uppercase tracking-widest ${!culturalMode ? "bg-foreground text-background border-foreground" : "border-border"}`}
              >{t("tripCreate.no")}</button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t("tripCreate.culturalModeHint")}</p>
          </div>

          {presets.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("tripCreate.applyEssentialsList")}</p>
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => {
                  const on = selectedPresetIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePreset(p.id)}
                      className={`rounded-full px-3 py-1.5 text-xs border ${on ? "bg-foreground text-background border-foreground" : "border-border bg-background"}`}
                    >{p.name}</button>
                  );
                })}
              </div>
            </div>
          )}
          {presets.length === 0 && (
            <button
              onClick={() => go("essential-presets")}
              className="text-[11px] text-muted-foreground underline"
            >{t("tripCreate.setUpEssentialsListHint")}</button>
          )}

          <button
            onClick={() => void create()}
            disabled={!canCreate || creating}
            className="w-full h-12 rounded-full bg-foreground text-background text-xs uppercase tracking-[0.3em] active:scale-[0.98] shadow-luxe disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {creating && <Loader2 size={14} className="animate-spin" />}
            {t("tripCreate.createTrip")}
          </button>
        </div>
      )}
    </div>
  );
}
