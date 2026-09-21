import { Copy, Loader2, Share2, Sparkles, Search, Calendar as CalendarIcon, Trash2, Check, X, Archive, ArchiveRestore, Plus, Pencil, LayoutGrid, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSheetCanClose } from "@/hooks/use-sheet-can-close";
import { useServerFn } from "@tanstack/react-start";
import { updateTripOutfitPlanItems } from "@/lib/trips.functions";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { BuilderInit, Screen } from "../AuraApp";
import { supabase } from "@/integrations/supabase/client";
import type { Outfit, WardrobeItem } from "@/lib/aura-types";
import { useAuth } from "@/hooks/use-auth";
import { ShareOutfitSheet } from "../ShareOutfitSheet";
import { ItemImageViewer } from "../ItemImageViewer";
import { OutfitViewerSheet } from "../OutfitViewerSheet";
import { useLocation } from "@/hooks/use-location";
import { useWeather } from "@/hooks/use-weather";
import { describeWeather } from "@/lib/weather";
import { suggestOutfitAI } from "@/lib/ai-suggest-outfit.functions";
import { generateWeeklyOutfits } from "@/lib/weekly-outfits.functions";
import { useWardrobeLocations } from "@/lib/wardrobe-locations-query";
import type { WardrobeLocation } from "@/lib/wardrobe-location";
import { loadDressRules } from "@/lib/dress-preferences";
import { logWardrobeEvent, confirmOutfitPlanWorn, deleteWornEvent, updateWornEvent } from "@/lib/wardrobe-events";
import { resolveWardrobeUrls, toStoragePath } from "@/lib/wardrobe-image";
import { useWardrobeItems, useWardrobeImages, useWardrobeCacheActions } from "@/lib/wardrobe-query";
import { useOutfitPlans, outfitPlansQueryKey, useOutfitPlansCacheActions } from "@/lib/outfit-plans-query";
import { useOutfits, useOutfitsCacheActions } from "@/lib/outfits-query";
import { useQueryClient } from "@tanstack/react-query";
import { ITEM_CATEGORIES } from "@/lib/wardrobe-options";
import { resolvePlanSlot } from "@/lib/outfit-plan-slot";
import i18n from "@/i18n/config";
const OCCASIONS = ["Everyday", "Work", "Evening", "Weekend", "Travel", "Formal", "Sport"];
// Stable, shared reference for the "no outfits yet" case — see its use
// alongside useOutfits() below for why a fresh [] on every render was a
// real bug, not just style.
const EMPTY_OUTFITS: Outfit[] = [];

type OutfitPlan = {
  id: string; date: string; item_ids: string[]; occasion: string | null;
  notes: string | null; status: string; weather_temp: number | null; weather_condition: string | null;
  calendar_event_id?: string | null;
};

type WornEntry = {
  eventId: string; date: string; itemIds: string[]; outfitName: string | null; occasion: string | null;
  /** Only present for wear events confirmed from a LogWear photo — the
   *  actual selfie/outfit shot, not just the item thumbnails below it.
   *  Signed URL, resolved once when this tab loads. */
  photoUrl: string | null;
};
type CalEvent = { id: string; title: string | null; start_time: string; all_day: boolean };

/** A look opened in the shared outfit viewer (canvas / pieces / photo, avatar, save, calendar, share). */
type ViewingLook = {
  itemIds: string[]; title?: string; occasion?: string | null; notes?: string | null;
  photoUrl?: string | null; canvasPath?: string | null; outfitId?: string | null;
  savedLayout?: { itemId: string; x: number; y: number; scale: number; rotation: number; z: number }[] | null;
  /** how "open on canvas" behaves for a saved outfit (its own editor entry) */
  onEdit?: () => void;
};

type OutfitTab = "upcoming" | "worn" | "myOutfitPhotos" | "saved" | "archive";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The Stylist tab: outfit creation, and now the full home for "what do
 *  I have and what has it meant to me" — Today's Look, catching up on
 *  unconfirmed past plans, and the four-way outfit library (Upcoming,
 *  Worn, Saved, Archive). Deliberately distinct from the Calendar tab:
 *  Calendar answers "when do I wear this", this tab answers "what do I
 *  have". Reuses wardrobe_events / outfit_plans / outfits as-is — no new
 *  tables, this is an interface consolidating data that already existed
 *  across three separate screens.
 */
export function AIStylist({ go, openBuilder, openAvatarTryOn }: { go: (s: Screen) => void; openBuilder: (init: BuilderInit) => void; openAvatarTryOn: (itemIds?: string[]) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { latitude, longitude } = useLocation();
  const { data: weather } = useWeather(latitude, longitude);
  // Shared cache (see src/lib/wardrobe-query.ts) — replaces this
  // screen's own independent wardrobe_items fetch, which used to run
  // inside the combined load() below alongside outfits/plans/worn
  // events. Those four stay as this screen's own fetch (not shared with
  // other screens yet — see Phase 4 for which OTHER data is worth
  // sharing); only the wardrobe items list itself moves to the cache.
  const itemsQuery = useWardrobeItems();
  const wardrobeCache = useWardrobeCacheActions();
  const items = itemsQuery.data ?? [];
  // Shared image cache (see wardrobe-query.ts) — same set of items
  // Wardrobe.tsx itself resolves, so once either screen has loaded them
  // once this session, the other reads instantly instead of re-signing.
  const { data: itemSigned = {} } = useWardrobeImages(items);
  // Shared cache (see outfits-query.ts) — replaces this screen's own
  // independent fetch inside load() below. Critical now that AIStylist
  // is a persistent tab: saving a new outfit elsewhere (OutfitBuilder)
  // no longer triggers a natural remount+refetch here, so an explicit
  // invalidation after save/delete/archive is what makes it show up.
  const { data: outfitsData } = useOutfits();
  // Memoized on outfitsData itself (a stable reference from react-query,
  // changing only when the underlying data actually changes) rather than
  // `outfitsData ?? []`, which allocates a NEW empty array on every
  // single render whenever outfitsData is undefined. That fed straight
  // into the effect below (dependency [outfits]) and into setSigned({})
  // — also a fresh object every time — each state update triggering
  // another render, another new [], another effect run: a genuine
  // infinite loop, not just an inefficiency.
  const outfits = useMemo(() => outfitsData ?? EMPTY_OUTFITS, [outfitsData]);
  const outfitsCache = useOutfitsCacheActions();
  const [signed, setSigned] = useState<Record<string, string>>({});
  useEffect(() => {
    void (async () => {
      const paths = outfits.map((x) => x.canvas_image_url).filter(Boolean) as string[];
      if (!paths.length) {
        // Only actually updates state if there's something to clear —
        // setSigned({}) unconditionally was the other half of the loop
        // above: even with `outfits` now stable, calling this every time
        // paths is empty would still re-trigger for any OTHER reason
        // this effect re-runs. Belt and braces, not just the one fix.
        setSigned((prev) => (Object.keys(prev).length ? {} : prev));
        return;
      }
      // Errors here were previously silent — createSignedUrls failing
      // (a permissions issue, a path that no longer exists in storage)
      // left `signed` simply empty with nothing logged, so a broken
      // canvas thumbnail in the "My Outfits" grid had zero diagnostic
      // trace. Logs and skips only the missing ones now, instead of
      // failing the whole batch silently.
      const { data: urls, error: signErr } = await supabase.storage.from("outfits").createSignedUrls(paths, 60 * 60);
      if (signErr) console.error("[AURA my-outfits] canvas thumbnail signing failed", signErr);
      const map: Record<string, string> = {};
      urls?.forEach((r, idx) => {
        if (r.signedUrl) map[paths[idx]] = r.signedUrl;
        else if (r.error) console.error("[AURA my-outfits] no signed URL for outfit canvas", paths[idx], r.error);
      });
      setSigned(map);
    })();
  }, [outfits]);
  // Shared cache (see outfit-plans-query.ts) — same duplication fix as
  // wardrobe items: Planner reads from this same key. The shim below
  // keeps every existing optimistic setPlans call in this file working
  // unchanged, same pattern as Wardrobe.tsx's setItems shim.
  const queryClient = useQueryClient();
  const outfitPlansCache = useOutfitPlansCacheActions();
  const plansQuery = useOutfitPlans();
  const plans = (plansQuery.data ?? []) as OutfitPlan[];
  const setPlans = useCallback(
    (updater: OutfitPlan[] | ((prev: OutfitPlan[]) => OutfitPlan[])) => {
      queryClient.setQueryData<OutfitPlan[]>(
        outfitPlansQueryKey(user?.id),
        (prev) => (typeof updater === "function" ? updater((prev ?? []) as OutfitPlan[]) : updater) as never,
      );
    },
    [queryClient, user?.id],
  );
  const [wornEntries, setWornEntries] = useState<WornEntry[]>([]);
  // Split for two tabs instead of one mixed list — a plain "worn" log
  // entry (no photo) reads very differently from an actual outfit
  // selfie from LogWear, and mixing them together read as cluttered.
  const wornItemEntries = useMemo(() => wornEntries.filter((w) => !w.photoUrl), [wornEntries]);
  const myOutfitPhotoEntries = useMemo(() => wornEntries.filter((w) => w.photoUrl), [wornEntries]);
  const [deletingWornId, setDeletingWornId] = useState<string | null>(null);
  const [confirmDeleteWorn, setConfirmDeleteWorn] = useState<WornEntry | null>(null);
  const [editingWorn, setEditingWorn] = useState<WornEntry | null>(null);
  const [editWornItemIds, setEditWornItemIds] = useState<string[]>([]);
  const [editWornDate, setEditWornDate] = useState("");
  const [wornPickerFor, setWornPickerFor] = useState<string | null>(null);
  const [savingWornEdit, setSavingWornEdit] = useState(false);

  const startEditWorn = (w: WornEntry) => {
    setEditingWorn(w);
    setEditWornItemIds(w.itemIds);
    setEditWornDate(w.date);
  };
  const removeFromWornEdit = (itemId: string) =>
    setEditWornItemIds((prev) => prev.filter((id) => id !== itemId));
  const addToWornEdit = (itemId: string) => {
    setEditWornItemIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
    setWornPickerFor(null);
  };
  const saveEditWorn = async () => {
    if (!editingWorn || !user || !editWornItemIds.length) return;
    setSavingWornEdit(true);
    const { error } = await updateWornEvent(editingWorn.eventId, editingWorn.itemIds, editWornItemIds, editWornDate, user.id);
    setSavingWornEdit(false);
    if (error) { toast.error(error); return; }
    setWornEntries((prev) => prev.map((w) => (w.eventId === editingWorn.eventId ? { ...w, itemIds: editWornItemIds, date: editWornDate } : w)));
    wardrobeCache.invalidate();
    setEditingWorn(null);
    toast.success(t("aiStylist.toastWornEntryUpdated"));
  };

  const removeWornEntry = async (entry: WornEntry) => {
    if (!user) return;
    setDeletingWornId(entry.eventId);
    const { error } = await deleteWornEvent(entry.eventId, entry.itemIds, user.id);
    setDeletingWornId(null);
    setConfirmDeleteWorn(null);
    if (error) { toast.error(error); return; }
    setWornEntries((prev) => prev.filter((w) => w.eventId !== entry.eventId));
    // worn_count/last_worn changed on the affected items — the shared
    // wardrobe cache (see wardrobe-query.ts) needs to know, same
    // reasoning as LogWear's own confirm flow.
    wardrobeCache.invalidate();
    toast.success(t("aiStylist.toastWornEntryDeleted"));
  };
  const [todayCalEvents, setTodayCalEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [occasion, setOccasion] = useState<string>("Everyday");
  const [aiBusy, setAiBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [shareFor, setShareFor] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ViewingLook | null>(null);
  const [assignFor, setAssignFor] = useState<Outfit | null>(null);
  const assignForCanClose = useSheetCanClose(!!assignFor);
  const [assignDate, setAssignDate] = useState<string>(() => todayIso());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [outfitTab, setOutfitTab] = useState<OutfitTab>("upcoming");
  const [confirmingPlanId, setConfirmingPlanId] = useState<string | null>(null);
  const [editedItems, setEditedItems] = useState<Record<string, string[]>>({});
  const [pickerForPlan, setPickerForPlan] = useState<string | null>(null);
  const [viewerImage, setViewerImage] = useState<{ src: string; alt: string } | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCat, setPickerCat] = useState("All");
  // Shared cache (see wardrobe-locations-query.ts) — replaces this
  // screen's own independent fetch; TripCreate/TripDetail read from the
  // same key.
  const { data: locationsData } = useWardrobeLocations();
  const locations = locationsData?.locations ?? [];
  const [weeklySheetOpen, setWeeklySheetOpen] = useState(false);
  const weeklySheetCanClose = useSheetCanClose(weeklySheetOpen);
  const [weeklyDays, setWeeklyDays] = useState<7 | 14>(7);
    // Multi-select on purpose (see suggestOutfitCore's locationIdsOverride):
  // a trip means both the main wardrobe and a second home can be
  // eligible for the same batch, not an either/or choice.
  const [weeklyLocationIds, setWeeklyLocationIds] = useState<string[]>([]);
  const [weeklyGenerating, setWeeklyGenerating] = useState(false);
  const [weeklyResult, setWeeklyResult] = useState<{ created: number; skippedExisting: number; failed: number } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
    const today = todayIso();
    const [{ data: ev }, { data: cal }] = await Promise.all([
      (supabase.from("wardrobe_events" as never) as any)
        .select("id, event_date, occasion, outfit_id, source_photo_detection_id")
        .eq("user_id", user.id).eq("event_type", "worn")
        .order("event_date", { ascending: false }).limit(30),
      (supabase.from("calendar_events_cache" as never) as any)
        .select("id, title, start_time, all_day")
        .eq("user_id", user.id)
        .gte("start_time", `${today}T00:00:00`).lt("start_time", `${today}T23:59:59`),
    ]);

    setTodayCalEvents((cal ?? []) as CalEvent[]);

    const wornEvents = (ev ?? []) as { id: string; event_date: string; occasion: string | null; outfit_id: string | null; source_photo_detection_id: string | null }[];
    if (wornEvents.length) {
      const { data: evItems } = await (supabase.from("wardrobe_event_items" as never) as any)
        .select("event_id, item_id").in("event_id", wornEvents.map((e) => e.id));
      const itemsByEvent = new Map<string, string[]>();
      (evItems ?? []).forEach((r: { event_id: string; item_id: string }) => {
        const arr = itemsByEvent.get(r.event_id) ?? [];
        arr.push(r.item_id);
        itemsByEvent.set(r.event_id, arr);
      });

      // The actual photo the person uploaded, for events that came from
      // LogWear — a wear event confirmed from Ask Your Stylist or the
      // calendar never had a photo to begin with, so this map stays
      // empty for those, which is correct, not a bug.
      const photoDetectionIds = wornEvents.map((e) => e.source_photo_detection_id).filter((id): id is string => Boolean(id));
      const photoByDetectionId = new Map<string, string>();
      if (photoDetectionIds.length) {
        const { data: detections } = await (supabase.from("outfit_photo_detections" as never) as any)
          .select("id, photo_path").in("id", photoDetectionIds);
        for (const d of (detections ?? []) as { id: string; photo_path: string | null }[]) {
          if (!d.photo_path) continue; // photo retention disabled, or already cleared
          const { data: signed } = await supabase.storage.from("outfit-photos").createSignedUrl(d.photo_path, 3600);
          if (signed?.signedUrl) photoByDetectionId.set(d.id, signed.signedUrl);
        }
      }

      const outfitNameById = new Map(outfits.map((x) => [x.id, x.name]));
      setWornEntries(wornEvents.map((e) => ({
        eventId: e.id,
        date: e.event_date,
        itemIds: itemsByEvent.get(e.id) ?? [],
        outfitName: e.outfit_id ? outfitNameById.get(e.outfit_id) ?? null : null,
        occasion: e.occasion,
        photoUrl: e.source_photo_detection_id ? photoByDetectionId.get(e.source_photo_detection_id) ?? null : null,
      })).filter((w) => w.itemIds.length > 0));
    } else {
      setWornEntries([]);
    }

    } catch (e) {
      // Whatever goes wrong here, the screen must never be left stuck
      // on a permanent spinner over it — that was the actual reported
      // bug (a stale variable reference threw before setLoading(false)
      // was ever reached). Logged for diagnosis, not surfaced as a
      // blocking error toast: the rest of the screen (items, outfits,
      // plans) may still be perfectly usable even if today's worn
      // entries failed to load.
      console.error("[AURA stylist] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [user, outfits]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (locationsData?.activeLocationId) setWeeklyLocationIds([locationsData.activeLocationId]);
  }, [locationsData]);

  const aiPick = async () => {
    const activeItems = items.filter((it) => !(it as unknown as { archived?: boolean }).archived);
    if (activeItems.length < 3) {
      toast.error(t("aiStylist.notEnoughActivePieces", { count: activeItems.length }));
      return;
    }
    const categories = Array.from(new Set(activeItems.map((it) => it.category).filter(Boolean)));
    if (categories.length < 2) {
      toast.error(
        categories.length === 0
          ? t("aiStylist.noCategoriesSet")
          : t("aiStylist.allSameCategory", { category: categories[0] })
      );
      return;
    }
    setAiBusy(true);
    try {
      const desc = weather ? describeWeather(weather.current.weatherCode, weather.current.isDay).label : null;
            const dressRules = await loadDressRules(user?.id, occasion);
      const res = await suggestOutfitAI({
        data: {
          dressRules,
          temperature: weather?.current.temperature ?? null,
          condition: desc,
          occasion,
          items: activeItems.map((it) => ({
            id: it.id,
            category: it.category,
            subcategory: it.subcategory,
            colors: it.colors ?? (it.color ? [it.color] : []),
            style: it.style ? (Array.isArray(it.style) ? it.style : [it.style]) : [],
            season: it.season,
            brand: it.brand,
            material: it.material ?? [],
            locationId: (it as unknown as { location_id?: string | null }).location_id ?? null,
            formality: it.formality ?? null,
            dayEvening: it.day_evening ?? "",
            sleeveLength: it.sleeve_length ?? "",
            length: it.length ?? "",
            fit: it.fit ?? "",
            heelHeight: it.heel_height ?? "",
            toeShape: it.toe_shape ?? "",
            closure: it.closure ?? "",
            gender: it.gender ?? "",
            styleTags: it.style_tags ?? [],
            occasion: it.occasion ?? "",
          })),
        },
      });

      if (!res.ok) {
        toast.error(res.error || t("aiStylist.aiSuggestionFailed"));
        return;
      }
      if (!res.item_ids.length) {
        toast.error(t("aiStylist.notEnoughMatchingPieces"));
        return;
      }
      openBuilder({
        itemIds: res.item_ids,
        name: t("aiStylist.aiStyledLook"),
        occasion,
        notes: res.explanation || undefined,
      });
    } catch (e) {
      console.error(e);
      toast.error(t("aiStylist.aiSuggestFailed"));
    } finally {
      setAiBusy(false);
    }
  };

  const runWeeklyGeneration = async () => {
    if (!user) return;
    setWeeklyGenerating(true);
    setWeeklyResult(null);
    try {
      const start = new Date();
      start.setDate(start.getDate() + 1); // start tomorrow — today is handled by Today's Look already
      const startDate = start.toISOString().slice(0, 10);

      const dailyWeather = (weather?.daily ?? [])
        .filter((d) => d.date >= startDate)
        .slice(0, weeklyDays)
        .map((d) => ({ date: d.date, tempMin: d.tempMin, tempMax: d.tempMax, weatherCode: d.weatherCode }));

      const res = await generateWeeklyOutfits({
                data: { startDate, numDays: weeklyDays, locationIds: weeklyLocationIds, dailyWeather },
      });
      setWeeklyResult({ created: res.created, skippedExisting: res.skippedExisting, failed: res.failed.length });
      if (res.created > 0) void load();
    } catch (e) {
      console.error("[AURA weekly-outfits]", e);
      toast.error(e instanceof Error ? e.message : t("aiStylist.couldNotGenerateWorkOutfits"));
    } finally {
      setWeeklyGenerating(false);
    }
  };

  const savedOutfits = outfits.filter((o) => !(o as unknown as { archived?: boolean }).archived);
  const archivedOutfits = outfits.filter((o) => (o as unknown as { archived?: boolean }).archived);

  const filteredOutfits = (outfitTab === "archive" ? archivedOutfits : savedOutfits).filter((o) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const hay = `${o.name} ${(o.occasion ?? []).join(" ")} ${(o.season ?? []).join(" ")} ${o.notes ?? ""}`.toLowerCase();
    return hay.includes(q);
  });

  const today = todayIso();
  const todayPlans = plans.filter((p) => p.date === today && p.status !== "cancelled");

  const pendingConfirmation = plans
    .filter((p) => p.date < today && p.status === "planned")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  const upcomingPlans = plans
    .filter((p) => p.date > today && p.status === "planned")
    .sort((a, b) => a.date.localeCompare(b.date));

  const openOutfit = (o: Outfit) => openBuilder({
    itemIds: o.item_ids, name: o.name, occasion: o.occasion?.[0],
    notes: o.notes ?? undefined, outfitId: o.id,
    // Not in the generated Outfit type yet (see outfit_canvas_layout.sql
    // — added after the last type regeneration), hence the cast. Absent
    // on any outfit saved before this existed, which is fine: the
    // canvas falls back to its original auto-placement in that case.
    layout: (o as unknown as { layout?: { itemId: string; x: number; y: number; scale: number; rotation: number; z: number }[] | null }).layout ?? null,
  });
  const viewOutfit = (o: Outfit) => setViewing({
    itemIds: o.item_ids, title: o.name, occasion: o.occasion?.[0] ?? null, notes: o.notes ?? null,
    canvasPath: o.canvas_image_url ?? null, outfitId: o.id,
    savedLayout: (o as unknown as { layout?: ViewingLook["savedLayout"] }).layout ?? null,
    onEdit: () => openOutfit(o),
  });
  const duplicateOutfit = (o: Outfit) => openBuilder({
    itemIds: o.item_ids, name: `${o.name} Copy`, occasion: o.occasion?.[0],
    notes: o.notes ?? undefined,
  });

  const toggleArchive = async (o: Outfit, archived: boolean) => {
    const { error } = await (supabase.from("outfits" as never) as any).update({ archived }).eq("id", o.id);
    if (error) { toast.error(error.message); return; }
    outfitsCache.updateOutfit({ ...o, archived } as Outfit);
    toast.success(archived ? t("aiStylist.toastArchived") : t("aiStylist.toastRestoredToSaved"));
  };

  const assignToDay = async () => {
    if (!assignFor || !user) return;
    // General slot only — assigning a saved outfit to a day isn't tied to a
    // calendar event, so it conflicts on (user_id, general_date).
    const { data, error } = await supabase.from("outfit_plans").upsert({
      user_id: user.id,
      date: assignDate,
      item_ids: assignFor.item_ids,
      occasion: assignFor.occasion?.[0] ?? null,
      notes: assignFor.notes ?? assignFor.name ?? null,
      status: "planned",
      calendar_event_id: null,
    } as never, { onConflict: resolvePlanSlot({}).onConflict }).select("id").single();
    if (error) { toast.error(error.message); return; }
    const { error: eventErr } = await logWardrobeEvent({
            userId: user.id,
      eventType: "planned",
      date: assignDate,
      itemIds: assignFor.item_ids,
      outfitPlanId: (data as { id: string }).id,
      outfitId: assignFor.id,
      occasion: assignFor.occasion?.[0] ?? null,
      notes: assignFor.notes ?? assignFor.name ?? null,
    });
    if (eventErr) console.error("[AURA wardrobe-events] log failed", eventErr);
    toast.success(t("aiStylist.toastAddedToCalendar"));
    setAssignFor(null);
    outfitPlansCache.invalidate();
    void load();
  };

  const deleteOutfit = async (id: string) => {
    if (!user) return;
    const outfit = outfits.find((o) => o.id === id);
    setDeleting(true);
    const { error } = await supabase.from("outfits").delete().eq("id", id).eq("user_id", user.id);
    if (error) { setDeleting(false); toast.error(error.message); return; }
    if (outfit?.canvas_image_url) {
      try { await supabase.storage.from("outfits").remove([outfit.canvas_image_url]); } catch { /* best-effort */ }
    }
    outfitsCache.removeOutfit(id);
    setConfirmDelete(null);
    setDeleting(false);
    toast.success(t("aiStylist.toastOutfitDeleted"));
  };

  const getWornIds = (plan: OutfitPlan) => editedItems[plan.id] ?? plan.item_ids;

  const removeFromPlan = (planId: string, itemId: string) => {
    setEditedItems((prev) => {
      const current = prev[planId] ?? plans.find((p) => p.id === planId)?.item_ids ?? [];
      return { ...prev, [planId]: current.filter((id) => id !== itemId) };
    });
  };

  const addToPlan = (planId: string, itemId: string) => {
    setEditedItems((prev) => {
      const current = prev[planId] ?? plans.find((p) => p.id === planId)?.item_ids ?? [];
      if (current.includes(itemId)) return prev;
      return { ...prev, [planId]: [...current, itemId] };
    });
    setPickerForPlan(null);
    setPickerQuery("");
    setPickerCat("All");
  };

  const confirmWorn = async (plan: OutfitPlan) => {
    if (!user) return;
    setConfirmingPlanId(plan.id);
    const actual = editedItems[plan.id];
    const { error } = await confirmOutfitPlanWorn(plan, user.id, actual);
    setConfirmingPlanId(null);
    if (error) { toast.error(error); return; }
    setEditedItems((prev) => { const next = { ...prev }; delete next[plan.id]; return next; });
    toast.success(t("aiStylist.toastMarkedAsWorn"));
    outfitPlansCache.invalidate();
    void load();
  };

  const dismissPlan = async (plan: OutfitPlan) => {
    if (!user) return;
    setConfirmingPlanId(plan.id);
    const { error } = await supabase.from("outfit_plans").update({ status: "cancelled" } as never).eq("id", plan.id);
    setConfirmingPlanId(null);
    if (error) { toast.error(error.message); return; }
    void logWardrobeEvent({ userId: user.id, eventType: "cancelled", date: plan.date, itemIds: plan.item_ids, outfitPlanId: plan.id });
    outfitPlansCache.invalidate();
    void load();
  };

  // Inline per-piece editing for a still-upcoming (not yet worn) plan —
  // unlike getWornIds/editedItems above (which only stage changes
  // locally until "mark as worn" is tapped), every change here writes
  // straight to outfit_plans.item_ids immediately: this plan may already
  // be live in a Trip Capsule or the Calendar, and those must see the
  // same edit, not a local-only view of it. updateTripOutfitPlanItems is
  // a plain "update this outfit_plans row" call despite its name — no
  // trip-specific filtering — so this is exactly the same row whichever
  // surface reads it next.
  const updatePlanItems = useServerFn(updateTripOutfitPlanItems);
  const [upcomingBusyPlanId, setUpcomingBusyPlanId] = useState<string | null>(null);
  const [upcomingPickerFor, setUpcomingPickerFor] = useState<string | null>(null);
  const pickerCanClose = useSheetCanClose(!!(pickerForPlan || upcomingPickerFor || wornPickerFor));
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const detailItemCanClose = useSheetCanClose(!!detailItemId);

  const persistUpcomingItems = async (planId: string, nextIds: string[]) => {
    setUpcomingBusyPlanId(planId);
    try {
      await updatePlanItems({ data: { planId, itemIds: nextIds } });
      setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, item_ids: nextIds } : p)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("aiStylist.couldntUpdateOutfit"));
    } finally {
      setUpcomingBusyPlanId(null);
    }
  };

  const removeFromUpcomingPlan = (plan: OutfitPlan, itemId: string) =>
    void persistUpcomingItems(plan.id, plan.item_ids.filter((id) => id !== itemId));

  const addToUpcomingPlan = (planId: string, itemId: string) => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan || plan.item_ids.includes(itemId)) { setUpcomingPickerFor(null); return; }
    setUpcomingPickerFor(null);
    void persistUpcomingItems(planId, [...plan.item_ids, itemId]);
  };

  /** "Canvas" + "Avatar" shortcuts under a look's thumbnails. */
  const lookButtons = (look: ViewingLook) => (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        onClick={() => setViewing(look)}
        className="flex-1 h-9 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-1.5 active:scale-[0.98]"
      ><LayoutGrid size={12} /> {t("outfitViewer.canvas", { defaultValue: "Canvas" })}</button>
      <button
        type="button"
        onClick={() => openAvatarTryOn(look.itemIds)}
        className="flex-1 h-9 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-1.5 active:scale-[0.98]"
      ><User size={12} /> {t("outfitViewer.onAvatar", { defaultValue: "Avatar" })}</button>
    </div>
  );

  const ItemThumbs = ({ ids, size = "h-16 w-16" }: { ids: string[]; size?: string }) => (
    <div className="flex gap-2 overflow-x-auto no-scrollbar">
      {ids.map((id) => {
        const it = items.find((x) => x.id === id);
        const path = it ? toStoragePath(it.image_url) : null;
        const src = path ? itemSigned[path] : null;
        const alt = it ? [it.brand, it.category].filter(Boolean).join(" ") : "";
        return (
          <button
            key={id}
            type="button"
            onClick={() => src && setViewerImage({ src, alt })}
            className={`${size} shrink-0 rounded-xl overflow-hidden border border-border/60`}
            style={{ background: "#FFFFFF" }}
          >
            {src ? <img src={src} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : null}
          </button>
        );
      })}
    </div>
  );

  /** Same idea as ItemThumbs, but for confirming what was ACTUALLY worn:
   *  each piece can be removed (swapped the bag, etc.), and a tile at the
   *  end opens a searchable picker to add whatever replaced it. */
  const EditableItemThumbs = ({ planId, ids, size = "h-16 w-16" }: { planId: string; ids: string[]; size?: string }) => (
    <div className="flex gap-2 overflow-x-auto no-scrollbar">
      {ids.map((id) => {
        const it = items.find((x) => x.id === id);
        const path = it ? toStoragePath(it.image_url) : null;
        const src = path ? itemSigned[path] : null;
        const alt = it ? [it.brand, it.category].filter(Boolean).join(" ") : "";
        return (
          <div
            key={id}
            onClick={() => src && setViewerImage({ src, alt })}
            className={`${size} shrink-0 relative rounded-xl overflow-hidden border border-border/60`}
            style={{ background: "#FFFFFF" }}
          >
            {src ? <img src={src} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : null}
            <button
              onClick={(e) => { e.stopPropagation(); removeFromPlan(planId, id); }}
              aria-label={t("aiStylist.removeThisPieceAria")}
              className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/90 border border-border flex items-center justify-center"
            ><X size={10} /></button>
          </div>
        );
      })}
      <button
        onClick={() => setPickerForPlan(planId)}
        aria-label={t("aiStylist.addAPieceAria")}
        className={`${size} shrink-0 rounded-xl border border-dashed border-border flex items-center justify-center text-muted-foreground`}
      ><Plus size={16} /></button>
    </div>
  );

  const dateLabel = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(i18n.language, { weekday: "short", month: "short", day: "numeric" });
    return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      <header className="px-6 pt-14">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("aiStylist.atelier")}</p>
        <h1 className="font-serif text-4xl mt-1 italic">{t("aiStylist.stylist")}</h1>
      </header>

      {!loading && todayPlans.length > 0 && (
        <section className="mx-6 mt-5 space-y-3">
          {todayPlans.map((tp) => {
            const linkedEvent = tp.calendar_event_id ? todayCalEvents.find((e) => e.id === tp.calendar_event_id) : null;
            const label = tp.calendar_event_id ? (linkedEvent?.title || t("aiStylist.eventFallback")) : t("aiStylist.generalLabel");
            return (
              <div key={tp.id} className="rounded-3xl gradient-warm border border-border/60 p-4 animate-fade-up">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("aiStylist.todaysLook")}</p>
                    <p className="text-xs mt-0.5">{label}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full ${tp.status === "worn" ? "bg-foreground text-background" : "bg-secondary/60 text-muted-foreground"}`}>
                      {tp.status === "worn" ? t("aiStylist.worn") : t("aiStylist.planned")}
                    </span>
                    {tp.status !== "worn" && (
                      <button
                        onClick={() => void dismissPlan(tp)}
                        disabled={confirmingPlanId === tp.id}
                        aria-label={t("aiStylist.removePlannedOutfitAria")}
                        className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-muted-foreground disabled:opacity-50"
                      ><X size={13} /></button>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  {tp.status === "worn"
                    ? <ItemThumbs ids={tp.item_ids} />
                    : <EditableItemThumbs planId={tp.id} ids={getWornIds(tp)} />}
                </div>
                {tp.weather_temp != null && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {Math.round(tp.weather_temp)}°{tp.weather_condition ? ` · ${tp.weather_condition}` : ""}
                  </p>
                )}
                <button
                  onClick={() => openAvatarTryOn(getWornIds(tp))}
                  className="mt-3 w-full h-10 rounded-full border border-foreground/15 bg-secondary/40 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.25em] active:scale-[0.98] transition"
                ><Sparkles size={13} /> {t("avatar.tryOnCta")}</button>
                {tp.status !== "worn" && (
                  <button
                    onClick={() => void confirmWorn(tp)}
                    disabled={confirmingPlanId === tp.id || getWornIds(tp).length === 0}
                    className="mt-3 w-full h-9 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-1.5 disabled:opacity-60"
                  ><Check size={12} /> {t("aiStylist.thisIsWhatImWearing")}</button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {!loading && pendingConfirmation.length > 0 && (
        <section className="mx-6 mt-4 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("aiStylist.didYouWearThis")}</p>
          {pendingConfirmation.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border/60 bg-card p-3 animate-fade-up">
              <p className="text-xs text-muted-foreground mb-2">{dateLabel(p.date)}{p.occasion ? ` · ${p.occasion}` : ""}</p>
              <EditableItemThumbs planId={p.id} ids={getWornIds(p)} size="h-14 w-14" />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void confirmWorn(p)}
                  disabled={confirmingPlanId === p.id || getWornIds(p).length === 0}
                  className="flex-1 h-9 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-1.5 disabled:opacity-60"
                ><Check size={12} /> {t("aiStylist.yesThisIsWhatIWore")}</button>
                <button
                  onClick={() => void dismissPlan(p)}
                  disabled={confirmingPlanId === p.id}
                  className="h-9 w-9 rounded-full border border-border flex items-center justify-center disabled:opacity-60"
                  aria-label={t("aiStylist.iDidntWearThisAria")}
                ><X size={14} /></button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="px-6 mt-8">
        <h2 className="font-serif text-2xl italic mb-3">{t("aiStylist.myOutfits")}</h2>
        <div className="flex rounded-full border border-border p-1 mb-4">
          {([
            { key: "upcoming", label: t("aiStylist.tabUpcoming") },
            { key: "worn", label: t("aiStylist.tabWorn") },
            { key: "myOutfitPhotos", label: t("aiStylist.tabMyOutfitPhotos") },
            { key: "saved", label: t("aiStylist.tabSaved") },
            { key: "archive", label: t("aiStylist.tabArchive") },
          ] as { key: OutfitTab; label: string }[]).map((t2) => (
            <button
              key={t2.key}
              onClick={() => setOutfitTab(t2.key)}
              className={`flex-1 h-8 rounded-full text-[10px] uppercase tracking-[0.15em] ${outfitTab === t2.key ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >{t2.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : outfitTab === "upcoming" ? (
          upcomingPlans.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aiStylist.noUpcomingLooks")}</p>
          ) : (
            <div className="space-y-2">
              {upcomingPlans.map((p) => (
                <div key={p.id} className="rounded-2xl border border-border/60 bg-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">{dateLabel(p.date)}{p.occasion ? ` · ${p.occasion}` : ""}</p>
                    <button
                      onClick={() => void dismissPlan(p)}
                      disabled={confirmingPlanId === p.id}
                      aria-label={t("aiStylist.removePlannedOutfitAria")}
                      className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-muted-foreground disabled:opacity-50"
                    ><X size={13} /></button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {p.item_ids.map((id) => {
                      const it = items.find((x) => x.id === id);
                      const path = it ? toStoragePath(it.image_url) : null;
                      const src = path ? itemSigned[path] : null;
                      return (
                        <div
                          key={id}
                          onClick={() => setDetailItemId(id)}
                          className="h-14 w-14 shrink-0 relative rounded-xl overflow-hidden border border-border/60"
                          style={{ background: "#FFFFFF" }}
                        >
                          {src ? <img src={src} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : null}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFromUpcomingPlan(p, id); }}
                            disabled={upcomingBusyPlanId === p.id}
                            aria-label={t("aiStylist.removeThisPieceAria")}
                            className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/90 border border-border flex items-center justify-center disabled:opacity-50"
                          ><X size={10} /></button>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => setUpcomingPickerFor(p.id)}
                      disabled={upcomingBusyPlanId === p.id}
                      className="h-14 w-14 shrink-0 rounded-xl border border-dashed border-border flex items-center justify-center text-muted-foreground disabled:opacity-50"
                    >
                      {upcomingBusyPlanId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
                    </button>
                  </div>
                  {lookButtons({ itemIds: p.item_ids, title: `${dateLabel(p.date)}${p.occasion ? ` · ${p.occasion}` : ""}`, occasion: p.occasion, notes: p.notes })}
                </div>
              ))}
            </div>
          )
        ) : outfitTab === "worn" ? (
          wornItemEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aiStylist.nothingLoggedAsWorn")}</p>
          ) : (
            <div className="space-y-2">
              {wornItemEntries.map((w) => (
                <div key={w.eventId} className="rounded-2xl border border-border/60 bg-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">
                      {dateLabel(w.date)}{w.outfitName ? ` · ${w.outfitName}` : w.occasion ? ` · ${w.occasion}` : ""}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEditWorn(w)}
                        aria-label={t("aiStylist.editWornEntryAria")}
                        className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground"
                      ><Pencil size={12} /></button>
                      <button
                        onClick={() => setConfirmDeleteWorn(w)}
                        aria-label={t("aiStylist.deleteWornEntryAria")}
                        className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground"
                      ><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <ItemThumbs ids={w.itemIds} size="h-14 w-14" />
                  {lookButtons({ itemIds: w.itemIds, title: `${dateLabel(w.date)}${w.outfitName ? ` · ${w.outfitName}` : w.occasion ? ` · ${w.occasion}` : ""}`, occasion: w.occasion, photoUrl: w.photoUrl })}
                </div>
              ))}
            </div>
          )
        ) : outfitTab === "myOutfitPhotos" ? (
          myOutfitPhotoEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aiStylist.noOutfitPhotosYet")}</p>
          ) : (
            <div className="space-y-2">
              {myOutfitPhotoEntries.map((w) => (
                <div key={w.eventId} className="rounded-2xl border border-border/60 bg-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">
                      {dateLabel(w.date)}{w.outfitName ? ` · ${w.outfitName}` : w.occasion ? ` · ${w.occasion}` : ""}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEditWorn(w)}
                        aria-label={t("aiStylist.editWornEntryAria")}
                        className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground"
                      ><Pencil size={12} /></button>
                      <button
                        onClick={() => setConfirmDeleteWorn(w)}
                        aria-label={t("aiStylist.deleteWornEntryAria")}
                        className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground"
                      ><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {w.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setViewing({ itemIds: w.itemIds, title: `${dateLabel(w.date)}${w.outfitName ? ` · ${w.outfitName}` : w.occasion ? ` · ${w.occasion}` : ""}`, occasion: w.occasion, photoUrl: w.photoUrl })}
                      className="block w-full mb-2 active:scale-[0.99]"
                    >
                      <img src={w.photoUrl} alt="" className="w-full rounded-xl aspect-[4/5] object-cover" />
                    </button>
                  )}
                  <ItemThumbs ids={w.itemIds} size="h-14 w-14" />
                  {lookButtons({ itemIds: w.itemIds, title: `${dateLabel(w.date)}${w.outfitName ? ` · ${w.outfitName}` : w.occasion ? ` · ${w.occasion}` : ""}`, occasion: w.occasion, photoUrl: w.photoUrl })}
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            {(savedOutfits.length > 0 || archivedOutfits.length > 0) && (
              <div className="mb-4 flex items-center gap-2 rounded-full bg-secondary/60 px-4 py-2.5">
                <Search size={15} className="text-muted-foreground" />
                <input
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("aiStylist.searchByNameOccasionSeason")}
                  className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground outline-none"
                />
              </div>
            )}

            {filteredOutfits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {outfitTab === "archive"
                  ? t("aiStylist.noArchivedOutfits")
                  : t("aiStylist.noOutfitsYet")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredOutfits.map((o) => {
                  const url = o.canvas_image_url ? signed[o.canvas_image_url] : null;
                  return (
                    <div key={o.id} className="animate-fade-up relative rounded-2xl overflow-hidden border border-border/60 bg-card shadow-soft">
                      <button onClick={() => viewOutfit(o)} className="block w-full text-left active:scale-[0.98]">
                        <div className="aspect-square" style={{ background: "#FFFFFF" }}>
                          {url ? (
                            <img src={url} alt={o.name} className="w-full h-full object-contain p-2" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">{t("aiStylist.openCanvas")}</div>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openAvatarTryOn(o.item_ids); }}
                        aria-label={t("avatar.tryOnCta")}
                        className="absolute top-2 left-2 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-90 shadow-soft"
                      ><Sparkles size={14} /></button>
                      {outfitTab === "saved" && (
                                              <>
                          <button
                            onClick={(e) => { e.stopPropagation(); duplicateOutfit(o); }}
                            aria-label={t("aiStylist.duplicateOutfitAria")}
                            className="absolute top-2 right-20 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-90 shadow-soft"
                          ><Copy size={14} /></button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setShareFor(o.id); }}
                            aria-label={t("aiStylist.shareOutfitAria")}
                            className="absolute top-2 right-11 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-90 shadow-soft"
                          ><Share2 size={14} /></button>
                        </>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); void toggleArchive(o, outfitTab !== "archive"); }}
                        aria-label={outfitTab === "archive" ? t("aiStylist.restoreToSavedAria") : t("aiStylist.archiveOutfitAria")}
                        className={`absolute top-2 ${outfitTab === "archive" ? "right-11" : "right-2"} h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-90 shadow-soft`}
                      >{outfitTab === "archive" ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
                      {outfitTab === "archive" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(o.id); }}
                          aria-label={t("aiStylist.deleteOutfitAria")}
                          className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center active:scale-90 shadow-soft"
                        ><Trash2 size={14} /></button>
                      )}
                      <div className="p-3">
                        <button onClick={() => viewOutfit(o)} className="block w-full text-left">
                          <p className="font-serif text-base truncate">{o.name}</p>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("aiStylist.piecesCount", { count: o.item_ids.length })}</p>
                        </button>
                        {outfitTab === "saved" && (
                          <button
                            onClick={() => setAssignFor(o)}
                            className="mt-2 h-8 w-full rounded-full border border-border text-[10px] uppercase tracking-[0.25em] active:scale-[0.98] inline-flex items-center justify-center gap-1.5"
                          ><CalendarIcon size={11} /> {t("aiStylist.plan")}</button>
                        )}
                      </div>

                      {confirmDelete === o.id && (
                        <div className="absolute inset-0 z-10 bg-background/90 backdrop-blur flex flex-col items-center justify-center gap-2 p-3 text-center">
                          <p className="text-xs">{t("aiStylist.deleteThisOutfit")}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="h-8 px-4 rounded-full border border-border text-[10px] uppercase tracking-[0.2em]"
                            >{t("aiStylist.cancel")}</button>
                            <button
                              disabled={deleting}
                              onClick={() => void deleteOutfit(o.id)}
                              className="h-8 px-4 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.2em] disabled:opacity-60"
                            >{deleting ? "…" : t("aiStylist.delete")}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      <section className="px-6 mt-10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("aiStylist.create")}</p>
        <div className="flex gap-2">
          <button
            onClick={() => go("builder")}
            className="flex-1 h-12 rounded-full bg-foreground text-background text-xs uppercase tracking-[0.3em] active:scale-[0.98] shadow-luxe"
          >{t("aiStylist.buildManually")}</button>
        </div>
        <button
          onClick={() => go("stylist-chat")}
          className="mt-2 w-full h-12 rounded-full border border-foreground text-foreground text-xs uppercase tracking-[0.3em] active:scale-[0.98] flex items-center justify-center gap-2"
        ><Sparkles size={13} /> {t("aiStylist.askYourStylist")}</button>

        <button
          onClick={() => setWeeklySheetOpen(true)}
          className="mt-2 w-full h-12 rounded-full border border-border text-foreground text-xs uppercase tracking-[0.3em] active:scale-[0.98] flex items-center justify-center gap-2"
        ><CalendarIcon size={13} /> {t("aiStylist.createWorkOutfits")}</button>

        <details className="mt-4">
          <summary className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground cursor-pointer">{t("aiStylist.moreOptions")}</summary>
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("aiStylist.occasion")}</p>
            <div className="flex flex-wrap gap-1.5">
              {OCCASIONS.map((o) => (
                <button
                  key={o}
                  onClick={() => setOccasion(o)}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${occasion === o ? "bg-foreground text-background" : "bg-secondary/60"}`}
                >{o}</button>
              ))}
            </div>
            <button
              onClick={aiPick}
              disabled={aiBusy}
              className="mt-3 w-full h-11 rounded-full border border-border text-muted-foreground flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"
            >
              {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span className="text-[10px] uppercase tracking-[0.3em]">{t("aiStylist.aiSuggest")}</span>
            </button>
          </div>
        </details>
      </section>

      {detailItemId && (() => {
        const it = items.find((x) => x.id === detailItemId);
        if (!it) return null;
        const path = toStoragePath(it.image_url);
        const src = path ? itemSigned[path] : null;
        const label = it.colors?.[0] ?? it.color ?? it.category ?? "";
        return (
          <div className="fixed inset-0 z-[70] bg-background/80 backdrop-blur flex items-end sm:items-center sm:justify-center" onClick={() => detailItemCanClose && setDetailItemId(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-card rounded-t-3xl sm:rounded-3xl border-t sm:border border-border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <div className="flex justify-end">
                <button onClick={() => setDetailItemId(null)} aria-label={t("aiStylist.closeAria")} className="h-8 w-8 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90"><X size={14} /></button>
              </div>
              <div className="rounded-2xl overflow-hidden mx-auto aspect-square max-w-[220px] -mt-6" style={{ background: "#FFFFFF" }}>
                {src ? <img src={src} alt="" className="h-full w-full object-contain p-3" /> : null}
              </div>
              <div className="mt-4 text-center">
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{it.brand ?? it.category}</p>
                <p className="font-serif text-2xl mt-1">{[label, it.category].filter(Boolean).join(" ")}</p>
                {it.subcategory && <p className="text-xs text-muted-foreground mt-1">{it.subcategory}</p>}
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {(Array.isArray(it.material) ? it.material : []).map((m) => (
                  <span key={m} className="rounded-full bg-secondary/60 px-2.5 py-1 text-[10px] uppercase tracking-widest">{m}</span>
                ))}
                {it.size && <span className="rounded-full bg-secondary/60 px-2.5 py-1 text-[10px] uppercase tracking-widest">{t("aiStylist.sizeLabel", { size: it.size })}</span>}
              </div>
            </div>
          </div>
        );
      })()}

      {shareFor && <ShareOutfitSheet outfitId={shareFor} onClose={() => setShareFor(null)} />}

      {viewing && (
        <OutfitViewerSheet
          itemIds={viewing.itemIds}
          title={viewing.title}
          occasion={viewing.occasion}
          notes={viewing.notes}
          photoUrl={viewing.photoUrl}
          canvasPath={viewing.canvasPath}
          outfitId={viewing.outfitId}
          savedLayout={viewing.savedLayout}
          onClose={() => setViewing(null)}
          onTryOn={(ids) => { setViewing(null); openAvatarTryOn(ids); }}
          onEditOnCanvas={(layout) => {
            const v = viewing;
            setViewing(null);
            if (v.onEdit) v.onEdit();
            else openBuilder({ itemIds: v.itemIds, occasion: v.occasion ?? undefined, layout });
          }}
        />
      )}

      {editingWorn && (
        <div className="fixed inset-0 z-[70] bg-background flex flex-col animate-fade-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 pt-14">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("aiStylist.editWornEntryTitle")}</p>
              <p className="font-serif text-xl italic">{dateLabel(editingWorn.date)}</p>
            </div>
            <button onClick={() => setEditingWorn(null)} aria-label={t("aiStylist.closeAria")} className="h-9 w-9 rounded-full border border-border flex items-center justify-center"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("aiStylist.date")}</p>
              <input
                type="date"
                value={editWornDate}
                onChange={(e) => setEditWornDate(e.target.value)}
                className="w-full bg-secondary/60 rounded-full px-4 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("aiStylist.pieces")}</p>
              <div className="flex flex-wrap gap-2">
                {editWornItemIds.map((id) => {
                  const it = items.find((x) => x.id === id);
                  const path = it ? toStoragePath(it.image_url) : null;
                  const src = path ? itemSigned[path] : null;
                  return (
                    <div key={id} className="relative h-16 w-16 rounded-xl overflow-hidden border border-border/60" style={{ background: "#FFFFFF" }}>
                      {src ? <img src={src} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : null}
                      <button
                        onClick={() => removeFromWornEdit(id)}
                        aria-label={t("aiStylist.removeThisPieceAria")}
                        className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/90 border border-border flex items-center justify-center"
                      ><X size={10} /></button>
                    </div>
                  );
                })}
                <button
                  onClick={() => setWornPickerFor(editingWorn.eventId)}
                  aria-label={t("aiStylist.addAPieceAria")}
                  className="h-16 w-16 rounded-xl border border-dashed border-border flex items-center justify-center text-muted-foreground"
                ><Plus size={16} /></button>
              </div>
            </div>
          </div>
          <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 border-t border-border/60">
            <button
              onClick={() => void saveEditWorn()}
              disabled={savingWornEdit || !editWornItemIds.length}
              className="w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {savingWornEdit ? <Loader2 size={14} className="animate-spin" /> : null}
              {t("aiStylist.saveButton")}
            </button>
          </div>
        </div>
      )}

      {confirmDeleteWorn && (
        <div
          className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => !deletingWornId && setConfirmDeleteWorn(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl border border-border bg-card p-5 shadow-luxe">
            <p className="font-serif text-lg text-center">{t("aiStylist.deleteWornEntryTitle")}</p>
            <p className="text-xs text-muted-foreground text-center mt-1">{t("aiStylist.deleteWornEntryHint")}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirmDeleteWorn(null)}
                disabled={!!deletingWornId}
                className="h-11 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] disabled:opacity-60"
              >{t("aiStylist.cancel")}</button>
              <button
                onClick={() => void removeWornEntry(confirmDeleteWorn)}
                disabled={!!deletingWornId}
                className="h-11 rounded-full bg-destructive text-destructive-foreground text-[10px] uppercase tracking-[0.3em] inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {deletingWornId && <Loader2 size={12} className="animate-spin" />}
                {t("aiStylist.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignFor && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end" onClick={() => assignForCanClose && setAssignFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-card rounded-t-3xl border-t border-border p-5 space-y-3">
            <p className="font-serif italic text-lg">{t("aiStylist.assignToADate")}</p>
            <input
              type="date"
              value={assignDate}
              onChange={(e) => setAssignDate(e.target.value)}
              className="w-full bg-secondary/60 rounded-full px-4 py-2.5 text-sm outline-none"
            />
            <button
              onClick={() => void assignToDay()}
              className="w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98]"
            >{t("aiStylist.saveToCalendar")}</button>
          </div>
        </div>
      )}

      {(pickerForPlan || upcomingPickerFor || wornPickerFor) && (() => {
        const activePlanId = (pickerForPlan ?? upcomingPickerFor ?? wornPickerFor) as string;
        const closePicker = () => { if (!pickerCanClose) return; setPickerForPlan(null); setUpcomingPickerFor(null); setWornPickerFor(null); };
        const currentIds = new Set(
          pickerForPlan
            ? (editedItems[pickerForPlan] ?? plans.find((p) => p.id === pickerForPlan)?.item_ids ?? [])
            : wornPickerFor
            ? editWornItemIds
            : (plans.find((p) => p.id === upcomingPickerFor)?.item_ids ?? [])
        );
        const activeOnly = items.filter((it) => !(it as unknown as { archived?: boolean }).archived);
        const q = pickerQuery.trim().toLowerCase();
        const matches = activeOnly.filter((it) => {
          if (currentIds.has(it.id)) return false;
          if (pickerCat !== "All" && it.category !== pickerCat) return false;
          if (!q) return true;
          return [it.brand, it.category, it.subcategory, it.color, ...(it.colors ?? [])]
            .some((v) => v?.toLowerCase().includes(q));
        });
        return (
          <div className="fixed inset-0 z-[80] bg-background/80 backdrop-blur flex items-end" onClick={closePicker}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-h-[85dvh] bg-card rounded-t-3xl border-t border-border p-5 flex flex-col">
              <div className="flex items-center justify-between shrink-0">
                <p className="font-serif italic text-lg">{pickerForPlan ? t("aiStylist.whatDidYouWearInstead") : t("aiStylist.addAPiece")}</p>
                <button onClick={closePicker} aria-label={t("aiStylist.closeAria")} className="h-8 w-8 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90"><X size={14} /></button>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-full bg-secondary/60 px-4 py-2.5 shrink-0">
                <Search size={15} className="text-muted-foreground" />
                <input
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder={t("aiStylist.searchByColorBrandFabric")}
                  className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground outline-none"
                />
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
                {["All", ...ITEM_CATEGORIES].map((c) => (
                  <button
                    key={c}
                    onClick={() => setPickerCat(c)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] ${pickerCat === c ? "bg-foreground text-background" : "bg-secondary/60 text-foreground/70"}`}
                  >{c}</button>
                ))}
              </div>
                           <div className="mt-3 overflow-y-auto grid grid-cols-2 gap-x-3 gap-y-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                {matches.length === 0 ? (
                  <p className="col-span-2 text-sm text-muted-foreground py-6 text-center">{t("aiStylist.noPiecesMatch")}</p>
                ) : matches.map((it) => {
                  const path = toStoragePath(it.image_url);
                  const src = path ? itemSigned[path] : null;
                  const label = it.colors?.[0] ?? it.color ?? it.category ?? "";
                  return (
                    <button
                      key={it.id}
                      onClick={() => (pickerForPlan ? addToPlan(pickerForPlan, it.id) : wornPickerFor ? addToWornEdit(it.id) : addToUpcomingPlan(activePlanId, it.id))}
                      className="text-left"
                    >
                      <div
                        className="relative overflow-hidden rounded-[1.25rem] border border-border/50 aspect-[4/5]"
                        style={{ background: "#FFFFFF" }}
                      >
                        {src ? <img src={src} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : null}
                      </div>
                      <div className="px-0.5 mt-1.5">
                        <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground truncate">{it.brand ?? it.category}</p>
                        <p className="font-serif text-[15px] leading-tight truncate">{[label, it.category].filter(Boolean).join(" ")}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {weeklySheetOpen && (
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end" onClick={() => weeklySheetCanClose && !weeklyGenerating && setWeeklySheetOpen(false)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full bg-card rounded-t-3xl border-t border-border p-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] space-y-4 max-h-[85vh] overflow-y-auto">

            <p className="font-serif italic text-lg">{t("aiStylist.createWorkOutfits")}</p>

            {weeklyResult ? (
              <div className="text-center py-2">
                <p className="font-serif text-2xl">{t("aiStylist.outfitsCreated", { count: weeklyResult.created })}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {weeklyResult.skippedExisting > 0 ? `${t("aiStylist.daysAlreadyHadPlan", { count: weeklyResult.skippedExisting })} ` : ""}
                  {weeklyResult.failed > 0 ? t("aiStylist.daysCouldntBeGenerated", { count: weeklyResult.failed }) : ""}
                </p>
                <button
                  onClick={() => { setWeeklySheetOpen(false); setWeeklyResult(null); }}
                  className="mt-4 w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em]"
                >{t("aiStylist.done")}</button>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("aiStylist.period")}</p>
                  <div className="flex gap-2">
                    {([7, 14] as const).map((n) => (
                      <button
                        key={n}
                        onClick={() => setWeeklyDays(n)}
                        className={`flex-1 h-10 rounded-full text-xs ${weeklyDays === n ? "bg-foreground text-background" : "bg-secondary/60"}`}
                      >{t("aiStylist.nDays", { count: n })}</button>
                    ))}
                  </div>
                </div>
                                {locations.length > 1 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">{t("aiStylist.wardrobeToUse")}</p>
                    <div className="flex flex-wrap gap-2">
                      {locations.map((loc) => {
                        const on = weeklyLocationIds.includes(loc.id);
                        return (
                          <button
                            key={loc.id}
                            onClick={() => setWeeklyLocationIds((prev) =>
                              on ? prev.filter((id) => id !== loc.id) : [...prev, loc.id]
                            )}
                            className={`rounded-full px-3 py-1.5 text-xs border ${on ? "bg-foreground text-background border-foreground" : "border-border bg-background"}`}
                          >{loc.name}</button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {t("aiStylist.multiLocationHint")}
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {t("aiStylist.fillsInWorkDaysOnly")}
                </p>
                <button
                  onClick={() => void runWeeklyGeneration()}
                  disabled={weeklyGenerating}
                  className="w-full h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {weeklyGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {t("aiStylist.generate")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {viewerImage && (
        <ItemImageViewer src={viewerImage.src} alt={viewerImage.alt} onClose={() => setViewerImage(null)} />
      )}
    </div>
  );
}
