import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Bell, Search, Sparkles, TrendingUp, MapPin, Loader2 } from "lucide-react";
import type { Screen, BuilderInit } from "../AuraApp";
import { useProfile } from "@/hooks/use-profile";
import { useLocation } from "@/hooks/use-location";
import { useWeather } from "@/hooks/use-weather";
import { describeWeather, suggestOutfit, weatherLabelKey } from "@/lib/weather";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { WardrobeItem } from "@/lib/aura-types";
import { resolveWardrobeUrls, toStoragePath } from "@/lib/wardrobe-image";
import { composeAndUploadOutfitImage, type ComposeItem } from "@/lib/compose-outfit-canvas";
import { OutfitViewerSheet } from "@/components/aura/OutfitViewerSheet";
import { useWardrobeItems } from "@/lib/wardrobe-query";
import { loadDressRules } from "@/lib/dress-preferences";
import { suggestDailyLooks, type DailyLook } from "@/lib/suggest-daily-looks.functions";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { WardrobeLocationExpiryBanner } from "@/components/aura/WardrobeLocationExpiryBanner";
import i18n, { type SupportedLanguage } from "@/i18n/config";

function todayISO(): string {

  return new Date().toISOString().slice(0, 10);
}

const CURATED_OCCASION_KEYS: Record<string, string> = {
  Work: "home.occasionWork",
  Weekend: "home.occasionWeekend",
  Evening: "home.occasionEvening",
};

export function Home({ go, openAvatarTryOn, openBuilder }: { go: (s: Screen) => void; openAvatarTryOn: (itemIds?: string[]) => void; openBuilder: (init: BuilderInit) => void }) {
  const { t } = useTranslation();
  const unreadCount = useUnreadNotifications();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { city, latitude, longitude, status, detect, setManual } = useLocation();
  const { data: weather, loading: wxLoading } = useWeather(latitude, longitude);

  // Sync the UI language to the user's saved preference once the profile
  // loads. Defaults to English (see i18n/config.ts) until then, and stays
  // English if the user never set a preference. This is the only screen
  // wired up to i18n so far (Phase 1) — once more screens are translated,
  // this sync belongs in a shared top-level place instead of here.
  useEffect(() => {
    const lang = profile?.language as SupportedLanguage | undefined;
    if (lang && lang !== i18n.language) void i18n.changeLanguage(lang);
  }, [profile?.language]);

  const generateLooks = useServerFn(suggestDailyLooks);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCity, setManualCity] = useState("");
  const [autoTried, setAutoTried] = useState(false);
  const [recentSigned, setRecentSigned] = useState<Record<string, string>>({});
  const [todayLook, setTodayLook] = useState<DailyLook | null>(null);
  const [curatedLooks, setCuratedLooks] = useState<DailyLook[]>([]);
  const [looksSigned, setLooksSigned] = useState<Record<string, string>>({});
  // Real composed outfit images (see compose-outfit-canvas.ts) —
  // storage paths kept alongside the looks themselves, signed URLs kept
  // separately since signed URLs expire and item thumbnails don't need
  // the same treatment.
  const [todayImagePath, setTodayImagePath] = useState<string | null>(null);
  const [curatedImagePaths, setCuratedImagePaths] = useState<(string | null)[]>([]);
  const [signedLookImages, setSignedLookImages] = useState<Record<string, string>>({});
  const [looksLoading, setLooksLoading] = useState(true);
  const [looksError, setLooksError] = useState<string | null>(null);
  // Look opened full-screen by tapping a card (see OutfitPreviewSheet).
  const [preview, setPreview] = useState<{ look: DailyLook; imagePath: string | null } | null>(null);

  // Shared cache (see src/lib/wardrobe-query.ts) — replaces this
  // screen's own independent full-table fetch. `pieces`/`worn`/`recent`
  // are all derived from the same shared data instead of a second
  // supabase call; the outfits count below is unrelated to the wardrobe
  // and was already using head:true correctly, so it's untouched.
  const itemsQuery = useWardrobeItems();
  const allItems = itemsQuery.data ?? [];
  const itemsLoaded = itemsQuery.isSuccess;
  const [outfitsCount, setOutfitsCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    void supabase.from("outfits").select("id", { count: "exact", head: true }).eq("user_id", user.id)
      .then(({ count }) => setOutfitsCount(count ?? 0));
  }, [user]);
  const stats = useMemo(() => {
    const pieces = allItems.length;
    const worn = allItems.filter((i) => (i.worn_count ?? 0) > 0).length;
    return { pieces, outfits: outfitsCount, wearRate: pieces ? Math.round((worn / pieces) * 100) : 0 };
  }, [allItems, outfitsCount]);
  const recent = useMemo(() => allItems.slice(0, 3), [allItems]);
  useEffect(() => {
    if (!recent.length) { setRecentSigned({}); return; }
    void resolveWardrobeUrls(recent).then(setRecentSigned);
  }, [recent]);

  useEffect(() => {
    if (!user || !itemsLoaded) return;
    // An empty wardrobe has nothing to suggest from — stop the spinner
    // instead of waiting for items that will never arrive.
    if (allItems.length === 0) { setLooksLoading(false); return; }
    // Wait for weather to settle before generating: generating immediately
    // would run this effect twice — once with temperature: null, once with
    // the real reading — and the cache validity check below (cacheStillValid)
    // only compares date + wardrobe fingerprint, not weather, so the first
    // "weatherless" run gets cached and silently blocks the correctly
    // weather-aware one for the rest of the day. If no location is set at
    // all, weather will never arrive, so don't wait forever in that case.
    if (latitude != null && longitude != null && wxLoading) return;

    void (async () => {
      setLooksLoading(true);
      setLooksError(null);
      let today_: DailyLook | null = null;
      let curated_: DailyLook[] = [];

      try {
        const today = todayISO();

        const latestEdit = allItems.reduce((max, it) => {
          const t = (it as unknown as { updated_at?: string }).updated_at ?? it.created_at;
          return t && t > max ? t : max;
        }, "");
        const fingerprint = `${allItems.length}:${latestEdit}`;

        type CachedRow = {
          date: string; wardrobe_fingerprint: string; today_item_ids: string[];
          today_occasion: string | null; today_explanation: string | null; curated: DailyLook[] | null;
          today_image_path: string | null; curated_image_paths: (string | null)[] | null;
        };
        let cachedRow: CachedRow | null = null;
        try {
          const { data: cached } = await (supabase.from("home_suggestions" as never) as any)
            .select("*").eq("user_id", user.id).maybeSingle();
          cachedRow = cached as CachedRow | null;
        } catch (err) {
          console.error("[AURA home] failed to read suggestion cache", err);
        }

        const realIds = new Set(allItems.map((it) => it.id));
        const cacheStillValid = (row: CachedRow | null) => {
          if (!row || row.date !== today || row.wardrobe_fingerprint !== fingerprint) return false;
          const ids = [...(row.today_item_ids ?? []), ...((row.curated ?? []).flatMap((l) => l.item_ids))];
          return ids.length > 0 && ids.every((id) => realIds.has(id));
        };
        const cacheItemsStillReal = (row: CachedRow | null) => {
          if (!row) return false;
          const ids = [...(row.today_item_ids ?? []), ...((row.curated ?? []).flatMap((l) => l.item_ids))];
          return ids.length > 0 && ids.every((id) => realIds.has(id));
        };
        const useRow = (row: CachedRow) => {
          today_ = { item_ids: row.today_item_ids ?? [], occasion: row.today_occasion ?? "", explanation: row.today_explanation ?? "" };
          curated_ = row.curated ?? [];
          setTodayImagePath(row.today_image_path ?? null);
          setCuratedImagePaths(row.curated_image_paths ?? []);
        };

        // Composes a real outfit image for `today` + every curated look
        // (see compose-outfit-canvas.ts) and persists the resulting
        // storage paths onto the SAME home_suggestions row — either as
        // part of the fresh-generation upsert below, or as a lightweight
        // backfill update when a row was cached before this feature
        // existed and has valid item_ids but no images yet. Best-effort:
        // a composition failure (a broken image URL, canvas unsupported)
        // just leaves that image null, and the render below falls back
        // to the plain thumbnail grid for that one look — never blocks
        // the suggestion itself from showing.
        const composeImagesFor = async (
          todayLookForImage: DailyLook | null,
          curatedForImages: DailyLook[],
        ): Promise<{ todayPath: string | null; curatedPaths: (string | null)[] }> => {
          const toComposeItems = async (ids: string[]): Promise<ComposeItem[]> => {
            const picks = ids.map((id) => allItems.find((it) => it.id === id)).filter((it): it is WardrobeItem => Boolean(it));
            const signedForPicks = await resolveWardrobeUrls(picks);
            return picks
              .map((it) => {
                const path = toStoragePath(it.image_url);
                const url = path ? signedForPicks[path] : null;
                return url ? { id: it.id, imgUrl: url, category: it.category, subcategory: it.subcategory, length: it.length } : null;
              })
              .filter((x): x is ComposeItem => Boolean(x));
          };

          const todayPath = todayLookForImage?.item_ids.length
            ? await composeAndUploadOutfitImage(user.id, await toComposeItems(todayLookForImage.item_ids))
            : null;
          const curatedPaths = await Promise.all(
            curatedForImages.map(async (l) =>
              l.item_ids.length ? await composeAndUploadOutfitImage(user.id, await toComposeItems(l.item_ids)) : null,
            ),
          );
          return { todayPath, curatedPaths };
        };

        if (cacheStillValid(cachedRow)) {
          useRow(cachedRow!);
          // Backfill for a row cached before this feature existed —
          // valid item_ids, no composed image yet. Fire-and-forget: the
          // grid fallback already covers this visit, no reason to make
          // the person wait on it.
          if (!cachedRow!.today_image_path && !(cachedRow!.curated_image_paths?.length)) {
            void (async () => {
              const { todayPath, curatedPaths } = await composeImagesFor(today_, curated_);
              setTodayImagePath(todayPath);
              setCuratedImagePaths(curatedPaths);
              try {
                await (supabase.from("home_suggestions" as never) as any)
                  .update({ today_image_path: todayPath, curated_image_paths: curatedPaths })
                  .eq("user_id", user.id);
              } catch (err) {
                console.error("[AURA home] failed to backfill suggestion images", err);
              }
            })();
          }
        } else if (allItems.length >= 3) {
          try {
            const dressRules = await loadDressRules(user.id);
            const res = await generateLooks({
              data: {
                temperature: weather?.current.temperature ?? null,
                condition: weather ? describeWeather(weather.current.weatherCode, weather.current.isDay).label : null,
                dressRules,
                items: allItems.map((it) => ({
                  id: it.id, category: it.category, subcategory: it.subcategory,
                  colors: it.colors ?? (it.color ? [it.color] : []),
                  style: it.style ? (Array.isArray(it.style) ? it.style : [it.style]) : [],
                  season: it.season, brand: it.brand,
                  formality: it.formality ?? null,
                  dayEvening: it.day_evening ?? "",
                  styleTags: it.style_tags ?? [],
                  sleeveLength: it.sleeve_length ?? "",
                  length: it.length ?? "",
                  material: Array.isArray(it.material) ? it.material : [],
                  toeShape: it.toe_shape ?? "",
                  occasion: it.occasion ?? "",
                })),
                language: i18n.language,
              },
            });
            if (res.ok) {
              today_ = res.result.today;
              curated_ = res.result.curated;
              const { todayPath, curatedPaths } = await composeImagesFor(today_, curated_);
              setTodayImagePath(todayPath);
              setCuratedImagePaths(curatedPaths);
              try {
                await (supabase.from("home_suggestions" as never) as any).upsert({
                  user_id: user.id,
                  date: today,
                  wardrobe_fingerprint: fingerprint,
                  today_item_ids: today_.item_ids,
                  today_occasion: today_.occasion,
                  today_explanation: today_.explanation,
                  curated: curated_,
                  today_image_path: todayPath,
                  curated_image_paths: curatedPaths,
                  generated_at: new Date().toISOString(),
                } as never);
              } catch (err) {
                console.error("[AURA home] failed to save suggestion cache", err);
              }
            } else if (cacheItemsStillReal(cachedRow)) {
              useRow(cachedRow!);
            } else {
              setLooksError(res.error ?? "Couldn't generate today's looks.");
            }
          } catch (err) {
            console.error("[AURA home] look generation failed", err);
            if (cacheItemsStillReal(cachedRow)) {
              useRow(cachedRow!);
            } else {
              setLooksError("Couldn't generate today's looks.");
            }
          }
        } else if (cacheItemsStillReal(cachedRow)) {
          useRow(cachedRow!);
        }
      } catch (err) {
        console.error("[AURA home] daily looks effect failed", err);
        setLooksError("Couldn't load today's looks.");
      } finally {
        setTodayLook(today_);
        setCuratedLooks(curated_);
        try {
          const ids = new Set<string>();
          if (today_) (today_ as DailyLook).item_ids.forEach((id) => ids.add(id));
          curated_.forEach((l) => l.item_ids.forEach((id) => ids.add(id)));
          const referenced = allItems.filter((it) => ids.has(it.id));
          setLooksSigned(await resolveWardrobeUrls(referenced));
        } catch (err) {
          console.error("[AURA home] failed to sign look thumbnails", err);
        }
        setLooksLoading(false);
      }
    })();
  }, [user, itemsLoaded, allItems, weather, wxLoading, latitude, longitude]);

  // Signs the composed images once their storage paths are known — kept
  // separate from looksSigned (item thumbnails) since these are a
  // different kind of asset (outfits bucket, not wardrobe) and don't
  // need to be recomputed on every item-thumbnail-driven re-render.
  useEffect(() => {
    void (async () => {
      const paths = [todayImagePath, ...curatedImagePaths].filter((p): p is string => Boolean(p));
      if (!paths.length) { setSignedLookImages({}); return; }
      const { data: urls, error } = await supabase.storage.from("outfits").createSignedUrls(paths, 60 * 60);
      if (error) { console.error("[AURA home] failed to sign composed look images", error); return; }
      const map: Record<string, string> = {};
      urls?.forEach((r, i) => { if (r.signedUrl) map[paths[i]] = r.signedUrl; });
      setSignedLookImages(map);
    })();
  }, [todayImagePath, curatedImagePaths]);


  const itemById = useMemo(() => {
    const map: Record<string, WardrobeItem> = {};
    allItems.forEach((it) => { map[it.id] = it; });
    return map;
  }, [allItems]);

  const thumbFor = (id: string): string | null => {
    const it = itemById[id];
    if (!it) return null;
    const path = toStoragePath(it.image_url);
    return path ? looksSigned[path] ?? null : null;
  };

  useEffect(() => {
    if (autoTried) return;
    if (profile && !city && status === "idle") {
      setAutoTried(true);
      detect();
    }
  }, [profile, city, status, detect, autoTried]);

      const fullName = profile?.full_name?.trim();
  const greeting = fullName ? t("home.greetingWithName", { name: fullName }) : t("home.greetingNoName");
  const today = new Date().toLocaleDateString(i18n.language, { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      {/* Header */}
      <header className="px-6 pt-14 pb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{today}</p>
          <h1 className="font-serif text-3xl mt-1">{t("home.title")}</h1>
          <p className="font-serif text-lg italic text-muted-foreground mt-1">{greeting}</p>
        </div>
        <div className="flex gap-2">
          <button aria-label={t("home.searchAria")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-95 transition">
            <Search size={16} />
          </button>
          <button onClick={() => go("notifications")} aria-label={t("home.notificationsAria")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-95 transition relative">
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2.5 h-1.5 w-1.5 rounded-full bg-[var(--champagne)]" />
            )}
          </button>
        </div>
      </header>

      <WardrobeLocationExpiryBanner />

           {/* Weather / location strip */}
      <div className="mx-6 mt-2 rounded-2xl bg-secondary/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl shrink-0">
              {weather ? describeWeather(weather.current.weatherCode, weather.current.isDay).icon : "📍"}
            </span>
            <div className="min-w-0">
              <p className="text-sm truncate">
                {city
                  ? weather
                    ? `${city} · ${Math.round(weather.current.temperature)}${weather.units.temp}`
                    : wxLoading ? `${city} · ${t("home.loading")}` : city
                  : t("home.setLocation")}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">
                {weather
                  ? `${t(weatherLabelKey(weather.current.weatherCode))} · ${suggestOutfit(weather.current).headline}`
                  : city ? t("home.forTailoredEdits") : t("home.forWeatherStyling")}
              </p>
            </div>
          </div>
          <button
            onClick={() => { if (city) setManualOpen(v => !v); else detect(); }}
            className="shrink-0 ml-2 h-8 px-3 rounded-full bg-background border border-border text-[10px] uppercase tracking-widest flex items-center gap-1.5 active:scale-95"
          >
            {status === "loading" ? <Loader2 size={11} className="animate-spin" /> : <MapPin size={11} />}
            {city ? t("home.change") : t("home.useLocation")}
          </button>
        </div>
        {(manualOpen || status === "denied" || status === "unsupported" || status === "error") && (
          <form
            onSubmit={(e) => { e.preventDefault(); setManual(manualCity); setManualCity(""); setManualOpen(false); }}
            className="mt-3 flex gap-2 animate-fade-up"
          >
            <input
              value={manualCity} onChange={e => setManualCity(e.target.value)}
              placeholder={t("home.cityPlaceholder")}
              className="flex-1 bg-background border border-border rounded-full px-4 py-2 text-sm outline-none focus:border-foreground"
            />
            <button type="submit" className="h-9 px-4 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-95">{t("home.save")}</button>
          </form>
        )}
      </div>


            {/* Today's edit */}
      <section className="px-6 mt-8 animate-fade-up">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-2xl italic">{t("home.todaysEdit")}</h2>
          <button onClick={() => go("ai")} className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{t("home.styleALook")}</button>
        </div>

       {looksLoading ? (
          <div className="rounded-[2rem] gradient-warm aspect-[4/5] flex items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : todayLook && todayLook.item_ids.length > 0 ? (
          <button onClick={() => setPreview({ look: todayLook, imagePath: todayImagePath })} className="block w-full text-left">
            <div className="relative overflow-hidden rounded-[2rem] shadow-luxe gradient-warm p-4">
              {todayImagePath && signedLookImages[todayImagePath] ? (
                <div className="rounded-xl overflow-hidden aspect-[4/5]" style={{ background: "#FFFFFF" }}>
                  <img src={signedLookImages[todayImagePath]} alt="" className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {todayLook.item_ids.slice(0, 4).map((id) => {
                    const src = thumbFor(id);
                    return (
                      <div key={id} className="aspect-square rounded-xl overflow-hidden bg-secondary/30 flex items-center justify-center">
                        {src ? <img src={src} alt="" className="h-full w-full object-contain p-1.5" /> : null}
                      </div>
                    );
                  })}
                </div>
              )}
                           <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1.5">
                <Sparkles size={11} />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{todayLook.occasion || t("home.todayFallback")}</span>
              </div>

              <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{todayLook.explanation}</p>
            </div>
          </button>
        ) : (
                    <div className="rounded-[2rem] gradient-warm p-6 text-center">
            <p className="font-serif text-lg italic">
              {looksError ?? (stats.pieces < 3 ? t("home.addMorePiecesFirst") : t("home.noLookYet"))}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {stats.pieces < 3
                ? t("home.needThreePieces")
                : t("home.tapStyleALook")}
            </p>
          </div>

        )}
      </section>

        {/* Quick nav */}
      <section className="px-6 mt-7 grid grid-cols-2 gap-3" aria-labelledby="home-quick-nav">
        <h2 id="home-quick-nav" className="sr-only col-span-2">{t("home.quickNav")}</h2>
        <button onClick={() => go("shop")} className="text-left rounded-2xl bg-[var(--champagne)]/30 border border-[var(--champagne)]/50 p-4 active:scale-[0.98] transition">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("home.theEdit")}</p>
          <p className="font-serif text-lg mt-1">{t("home.shopYourGaps")}</p>
        </button>
        <button onClick={() => go("community")} className="text-left rounded-2xl bg-secondary/60 p-4 active:scale-[0.98] transition">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("home.atelier")}</p>
          <p className="font-serif text-lg mt-1">{t("home.community")}</p>
        </button>
      </section>

      {/* Color Lab */}
      <section className="px-6 mt-3" aria-labelledby="home-color-lab">
        <h2 id="home-color-lab" className="sr-only">{t("home.colorLab")}</h2>
        <button
          onClick={() => go("color-lab")}
          className="w-full text-left rounded-2xl p-4 active:scale-[0.98] transition border border-border/60"
          style={{ background: "linear-gradient(135deg, #F2C6C2 0%, #B0E0E6 50%, #F6E27A 100%)" }}
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-background/80 mix-blend-difference">{t("home.colorLab")}</p>
          <p className="font-serif text-lg mt-1 text-background mix-blend-difference">{t("home.colorHarmony")}</p>
        </button>
      </section>

      {/* Stats */}
      <section className="px-6 mt-5 grid grid-cols-3 gap-3" aria-labelledby="home-stats">
        <h2 id="home-stats" className="sr-only col-span-3">Stats</h2>
        {[
          { n: String(stats.pieces), l: t("home.pieces"), to: "wardrobe" as Screen },
          { n: String(stats.outfits), l: t("home.outfits"), to: "saved-outfits" as Screen },
          { n: `${stats.wearRate}%`, l: t("home.wearRate"), to: "insights" as Screen | null },
        ].map(s => (

          <button
            key={s.l}
            onClick={() => s.to && go(s.to)}
            disabled={!s.to}
            className="text-left rounded-2xl bg-card border border-border/60 p-4 active:scale-[0.98] transition disabled:active:scale-100 disabled:cursor-default"
          >
            <p className="font-serif text-3xl">{s.n}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{s.l}</p>
          </button>
        ))}
      </section>

            {/* Curated for you */}
      <section className="mt-10 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <div className="flex items-baseline justify-between px-6 mb-3">
          <h2 className="font-serif text-2xl italic">{t("home.curatedForYou")}</h2>
          <button onClick={() => go("saved-outfits")} className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{t("home.seeAll")}</button>
        </div>
        {looksLoading ? (
          <div className="mx-6 rounded-2xl bg-secondary/40 h-44 flex items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground" size={18} />
          </div>
        ) : curatedLooks.length === 0 ? (
          <div className="mx-6 rounded-2xl bg-secondary/40 p-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {stats.pieces < 3
                ? t("home.addMoreForCurated")
                : t("home.curateRetry")}
            </p>
          </div>
        ) : (

          <div className="flex gap-3 overflow-x-auto no-scrollbar px-6">
            {curatedLooks.map((look, i) => {
              const imagePath = curatedImagePaths[i];
              const signedImage = imagePath ? signedLookImages[imagePath] : null;
              return (
                <button key={i} onClick={() => setPreview({ look, imagePath: imagePath ?? null })} className="shrink-0 w-40 text-left active:scale-[0.98] transition">
                  <div className="overflow-hidden rounded-2xl shadow-soft aspect-[4/5] bg-[#FFFFFF]">
                    {signedImage ? (
                      <img src={signedImage} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <div className="h-full w-full p-2 grid grid-cols-2 gap-1.5">
                        {look.item_ids.slice(0, 4).map((id) => {
                          const src = thumbFor(id);
                          return (
                            <div key={id} className="rounded-lg overflow-hidden bg-secondary/30 flex items-center justify-center">
                              {src ? <img src={src} alt="" className="h-full w-full object-contain p-1" /> : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{look.occasion ? (CURATED_OCCASION_KEYS[look.occasion] ? t(CURATED_OCCASION_KEYS[look.occasion]) : look.occasion) : t("home.lookFallback")}</p>
                  <p className="text-xs text-muted-foreground truncate">{look.explanation}</p>
                </button>
              );
            })}
          </div>
        )}
      </section>

            {/* From your wardrobe */}
      <section className="px-6 mt-10 animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-2xl italic">{t("home.fromYourWardrobe")}</h2>
          <TrendingUp size={14} className="text-muted-foreground" />
        </div>
        {recent.length === 0 ? (
          <button
            onClick={() => go("wardrobe")}
            className="w-full text-left rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"
          >{t("home.addFirstPieces")}</button>
        ) : (

          <div className="grid grid-cols-3 gap-2">
            {recent.map((it) => {
              const path = toStoragePath(it.image_url);
              const src = path ? recentSigned[path] : null;
              return (
                <button
                  key={it.id}
                  onClick={() => go("wardrobe")}
                  className="rounded-xl overflow-hidden aspect-square active:scale-[0.98]"
                  style={{ background: "#FFFFFF" }}
                >
                  {src ? (
                    <img src={src} alt={it.category ?? "wardrobe item"} className="h-full w-full object-contain p-1.5" loading="lazy" />
                  ) : (
                                       <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">{t("home.noImage")}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {preview && (
        <OutfitViewerSheet
          itemIds={preview.look.item_ids}
          occasion={preview.look.occasion}
          explanation={preview.look.explanation}
          canvasPath={preview.imagePath}
          canvasUrl={preview.imagePath ? signedLookImages[preview.imagePath] ?? null : null}
          onEditOnCanvas={(layout) => {
            const look = preview.look;
            setPreview(null);
            openBuilder({ itemIds: look.item_ids, occasion: look.occasion || undefined, layout });
          }}
          onClose={() => setPreview(null)}
          onTryOn={(ids) => { setPreview(null); openAvatarTryOn(ids); }}
          onSaved={() => setOutfitsCount((c) => c + 1)}
        />
      )}
    </div>

  );
}
