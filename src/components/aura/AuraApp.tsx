import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Splash } from "./screens/Splash";
import { Onboarding } from "./screens/Onboarding";
import { Auth } from "./screens/Auth";
import { Home } from "./screens/Home";
import { Wardrobe } from "./screens/Wardrobe";
import { AIStylist } from "./screens/AIStylist";
import { Planner } from "./screens/Planner";
import { Profile } from "./screens/Profile";

// A deploy replaces the hashed chunk files, so a tab left open across a release can fail to
// download a screen it hasn't opened yet. Reload once to pick up the new build instead of
// showing the error screen; the session flag prevents a reload loop if the network is down.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyScreen<M extends Record<K, ComponentType<any>>, K extends keyof M & string>(
  load: () => Promise<M>,
  name: K,
) {
  return lazy(() =>
    load().then(
      (m) => {
        try { sessionStorage.removeItem("aura:chunk-reload"); } catch { /* ignore */ }
        return { default: m[name] };
      },
      (err) => {
        if (typeof window !== "undefined") {
          try {
            if (!sessionStorage.getItem("aura:chunk-reload")) {
              sessionStorage.setItem("aura:chunk-reload", "1");
              window.location.reload();
            }
          } catch { /* storage unavailable: fall through to the error boundary */ }
        }
        throw err;
      },
    ),
  );
}

// Screens outside the five tabs and the entry flow are code-split: each one is downloaded the
// first time it is needed instead of being part of the initial bundle. `screenLoaders` is also
// used to prefetch the most common ones once the app is idle (see the effect in Inner), so
// opening them later is normally instant.
const screenLoaders = {
  ResetPassword: () => import("./screens/ResetPassword"),
  ProfileSetup: () => import("./screens/ProfileSetup"),
  AddItem: () => import("./screens/AddItem"),
  StylistChat: () => import("./screens/StylistChat"),
  OutfitScan: () => import("./screens/OutfitScan"),
  BatchScan: () => import("./screens/BatchScan"),
  BatchReview: () => import("./screens/BatchReview"),
  Trips: () => import("./screens/Trips"),
  TripCreate: () => import("./screens/TripCreate"),
  TripDetail: () => import("./screens/TripDetail"),
  EssentialPresets: () => import("./screens/EssentialPresets"),
  Shop: () => import("./screens/Shop"),
  ColorLab: () => import("./screens/ColorLab"),
  Community: () => import("./screens/Community"),
  Insights: () => import("./screens/Insights"),
  Settings: () => import("./screens/Settings"),
  PersonalInfo: () => import("./screens/PersonalInfo"),
  StylePreferences: () => import("./screens/StylePreferences"),
  SettingsSizes: () => import("./screens/SettingsSizes"),
  SettingsLanguage: () => import("./screens/SettingsLanguage"),
  SettingsWardrobeLocations: () => import("./screens/SettingsWardrobeLocations"),
  SettingsDressPreferences: () => import("./screens/SettingsDressPreferences"),
  NotificationSettings: () => import("./screens/NotificationSettings"),
  SettingsCalendar: () => import("./screens/SettingsCalendar"),
  SettingsUsage: () => import("./screens/SettingsUsage"),
  SettingsReportProblem: () => import("./screens/SettingsReportProblem"),
  SettingsGuide: () => import("./screens/SettingsGuide"),
  PrivacySettings: () => import("./screens/PrivacySettings"),
  Notifications: () => import("./screens/Notifications"),
  Invite: () => import("./screens/Invite"),
  StorageDebug: () => import("./screens/StorageDebug"),
  Chats: () => import("./screens/Chats"),
  ChatThread: () => import("./screens/ChatThread"),
  OutfitBuilder: () => import("./screens/OutfitBuilder"),
  PersonalColorAnalysis: () => import("./screens/PersonalColorAnalysis"),
  Avatar: () => import("./screens/Avatar"),
  AvatarTryOn: () => import("./screens/AvatarTryOn"),
  LogWear: () => import("./screens/LogWear"),
  UserProfile: () => import("./screens/UserProfile"),
} as const;

const ResetPassword = lazyScreen(screenLoaders.ResetPassword, "ResetPassword");
const ProfileSetup = lazyScreen(screenLoaders.ProfileSetup, "ProfileSetup");
const AddItem = lazyScreen(screenLoaders.AddItem, "AddItem");
const StylistChat = lazyScreen(screenLoaders.StylistChat, "StylistChat");
const OutfitScan = lazyScreen(screenLoaders.OutfitScan, "OutfitScan");
const BatchScan = lazyScreen(screenLoaders.BatchScan, "BatchScan");
const BatchReview = lazyScreen(screenLoaders.BatchReview, "BatchReview");
const Trips = lazyScreen(screenLoaders.Trips, "Trips");
const TripCreate = lazyScreen(screenLoaders.TripCreate, "TripCreate");
const TripDetail = lazyScreen(screenLoaders.TripDetail, "TripDetail");
const EssentialPresets = lazyScreen(screenLoaders.EssentialPresets, "EssentialPresets");
const Shop = lazyScreen(screenLoaders.Shop, "Shop");
const ColorLab = lazyScreen(screenLoaders.ColorLab, "ColorLab");
const Community = lazyScreen(screenLoaders.Community, "Community");
const Insights = lazyScreen(screenLoaders.Insights, "Insights");
const Settings = lazyScreen(screenLoaders.Settings, "Settings");
const PersonalInfo = lazyScreen(screenLoaders.PersonalInfo, "PersonalInfo");
const StylePreferences = lazyScreen(screenLoaders.StylePreferences, "StylePreferences");
const SettingsSizes = lazyScreen(screenLoaders.SettingsSizes, "SettingsSizes");
const SettingsLanguage = lazyScreen(screenLoaders.SettingsLanguage, "SettingsLanguage");
const SettingsWardrobeLocations = lazyScreen(screenLoaders.SettingsWardrobeLocations, "SettingsWardrobeLocations");
const SettingsDressPreferences = lazyScreen(screenLoaders.SettingsDressPreferences, "SettingsDressPreferences");
const NotificationSettings = lazyScreen(screenLoaders.NotificationSettings, "NotificationSettings");
const SettingsCalendar = lazyScreen(screenLoaders.SettingsCalendar, "SettingsCalendar");
const SettingsUsage = lazyScreen(screenLoaders.SettingsUsage, "SettingsUsage");
const SettingsReportProblem = lazyScreen(screenLoaders.SettingsReportProblem, "SettingsReportProblem");
const SettingsGuide = lazyScreen(screenLoaders.SettingsGuide, "SettingsGuide");
const PrivacySettings = lazyScreen(screenLoaders.PrivacySettings, "PrivacySettings");
const Notifications = lazyScreen(screenLoaders.Notifications, "Notifications");
const Invite = lazyScreen(screenLoaders.Invite, "Invite");
const StorageDebug = lazyScreen(screenLoaders.StorageDebug, "StorageDebug");
const Chats = lazyScreen(screenLoaders.Chats, "Chats");
const ChatThread = lazyScreen(screenLoaders.ChatThread, "ChatThread");
const OutfitBuilder = lazyScreen(screenLoaders.OutfitBuilder, "OutfitBuilder");
const PersonalColorAnalysis = lazyScreen(screenLoaders.PersonalColorAnalysis, "PersonalColorAnalysis");
const Avatar = lazyScreen(screenLoaders.Avatar, "Avatar");
const AvatarTryOn = lazyScreen(screenLoaders.AvatarTryOn, "AvatarTryOn");
const LogWear = lazyScreen(screenLoaders.LogWear, "LogWear");
const UserProfile = lazyScreen(screenLoaders.UserProfile, "UserProfile");

import { TabBar } from "./TabBar";
import { GuidedTour } from "./GuidedTour";
import { shouldAutoStartTour, tourSeenKey } from "@/lib/guided-tour";
import { ErrorBoundary } from "./ErrorBoundary";
import { PhoneFrame } from "./PhoneFrame";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useWardrobeCompletion } from "@/hooks/use-wardrobe-completion";
import { useTimeZoneSync } from "@/hooks/use-time-zone-sync";
import { setScreen as setTelemetryScreen, setSignedIn as setTelemetrySignedIn, startTelemetry, track } from "@/lib/telemetry-client";
import { useProfile } from "@/hooks/use-profile";
import { useChatNotifications } from "@/hooks/use-chat-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateWardrobeItems } from "@/lib/wardrobe-query";
import { applyStoredLanguage } from "@/i18n/config";

export type Screen =
    | "splash" | "onboarding" | "auth" | "reset" | "profile-setup"
    | "home" | "wardrobe" | "add" | "ai" | "planner" | "shop" | "community" | "profile"
      | "insights" | "saved-outfits" | "notifications" | "invite" | "builder" | "color-lab" | "color-analysis" | "stylist-chat" | "outfit-scan" | "batch-scan" | "batch-review" | "storage-debug"
      | "trips" | "trip-create" | "trip-detail" | "essential-presets"
            | "chats" | "chat-thread" | "user-profile"
      | "settings" | "settings-personal" | "settings-sizes" | "settings-style-prefs" | "settings-language"
      | "settings-wardrobe-locations" | "settings-dress-preferences" | "settings-notifications" | "settings-calendar" | "settings-privacy" | "settings-usage" | "settings-report-problem" | "settings-guide"
      | "avatar" | "avatar-tryon" | "log-wear";





export type BuilderInit = {
  itemIds: string[];
  name?: string;
  occasion?: string;
  notes?: string;
  outfitId?: string;
  /** Set when editing a still-upcoming outfit_plans row (not yet a saved "outfit") reached via
   *  Stylist's own inline canvas editor — see AIStylist.tsx's lookButtons/onEdit for the plans
   *  list. Without this, saving from the canvas always created a brand-new, disconnected `outfits`
   *  row and left the actual plan the person was looking at completely untouched: they'd remove a
   *  piece, add another, hit save, and find the OLD piece still there next time, because nothing
   *  ever touched outfit_plans.item_ids in the first place. Mutually exclusive with outfitId. */
  planId?: string;
  /** From Insights' "hasn't been worn in a while" flow: OutfitBuilder
   *  auto-triggers AI Suggest on mount with this item pinned as
   *  mandatory, instead of waiting for a manual tap — the whole point is
   *  a ready-made idea the moment the person lands here, not one more
   *  step before they see anything. */
  anchorItemId?: string;
  /** The exact canvas position of every piece (x, y, scale, rotation,
   *  z), when reopening an outfit that has one saved — restores the
   *  real layout instead of re-guessing positions from each item's
   *  category. Absent for a brand-new outfit, or one saved before this
   *  existed (falls back to the original auto-placement). */
  layout?: { itemId: string; x: number; y: number; scale: number; rotation: number; z: number }[] | null;
} | null;

export type StylistChatInit = {
  message: string;
  temperature: number | null;
  condition: string | null;
  date?: string | null;
  eventId?: string | null;
  /** The event's own start_time, already available on the caller's
   *  ImportedEvent object (Planner.tsx) — passed directly rather than
   *  re-fetched by id in StylistChat.tsx, since that id doesn't always
   *  correspond to a calendar_events_cache row (an event merged in from
   *  the device's native calendar can carry a different id scheme),
   *  which was silently failing that lookup. Null for an all-day event
   *  or one truly missing a time. */
  eventTime?: string | null;
} | null;


function Inner() {
  const { user, loading, recovery } = useAuth();
  // Fills missing type / attributes / details of the wardrobe pieces from their photos, in the
  // background (use-wardrobe-completion.ts).
  useWardrobeCompletion(user?.id);
  // Daily plan counters follow the phone's time zone (e.g. on a trip), at most one change a day.
  useTimeZoneSync(user?.id);
  const { profile, loading: profileLoading, settled: profileSettled } = useProfile();
  const [screen, setScreen] = useState<Screen>("splash");
  // Usage statistics and error monitoring (telemetry-client.ts): screens seen, app opens, errors.
  useEffect(() => { startTelemetry(); }, []);
  useEffect(() => {
    setTelemetrySignedIn(!!user);
    if (user) track("app_open");
  }, [user?.id]);
  useEffect(() => { setTelemetryScreen(screen); }, [screen]);
  const [builderInit, setBuilderInit] = useState<BuilderInit>(null);
  const [stylistChatInit, setStylistChatInit] = useState<StylistChatInit>(null);
  const [reviewScanId, setReviewScanId] = useState<string | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [userProfileBack, setUserProfileBack] = useState<Screen>("community");
  const [wardrobeGapFilter, setWardrobeGapFilter] = useState<"price" | "purchase_date" | null>(null);
  const [plannerFocus, setPlannerFocus] = useState<{ date: string; planId: string | null } | null>(null);
  const [tripFocusActivityId, setTripFocusActivityId] = useState<string | null>(null);
  const [avatarTryOnItemIds, setAvatarTryOnItemIds] = useState<string[] | undefined>(undefined);
  const [onboarded, setOnboarded] = useState<boolean>(() =>
    typeof window !== "undefined" && localStorage.getItem("aura.onboarded") === "1"
  );

  const go = (s: Screen) => {
    if (s !== "builder") setBuilderInit(null);
    else if (s === "builder") {
      setBuilderInit(null);
    }
    if (s !== "stylist-chat") setStylistChatInit(null);
    if (s !== "avatar-tryon") setAvatarTryOnItemIds(undefined);
    setScreen(s);
  };

  const openBatchReview = (scanId: string) => {
    setReviewScanId(scanId);
    setScreen("batch-review");
  };

  const openBuilder = (init: BuilderInit) => {
    setBuilderInit(init);
    setScreen("builder");
  };

  const [addItemInitialGarment, setAddItemInitialGarment] = useState<{ photoDataUrl: string; category?: string; colors?: string[]; materials?: string[] } | null>(null);
  /** From LogWear: a detection with no wardrobe match, cropped to just
   *  that garment — hands it straight to "add a piece" instead of a
   *  blank form, so buy-it-online or add-it-here doesn't mean retyping
   *  what AURA already saw. */
  const openAddItemWithGarment = (garment: { photoDataUrl: string; category?: string; colors?: string[]; materials?: string[] }) => {
    setAddItemInitialGarment(garment);
    setScreen("add");
  };

  const openStylistChat = (init: NonNullable<StylistChatInit>) => {
    setStylistChatInit(init);
    setScreen("stylist-chat");
  };

  /** itemIds omitted → the standalone "choose pieces yourself" entry point;
   *  passed → skips straight to generating for an outfit already chosen
   *  elsewhere (AIStylist, SavedOutfits, TripDetail, OutfitBuilder). */
  const openAvatarTryOn = (itemIds?: string[]) => {
    setAvatarTryOnItemIds(itemIds);
    setScreen("avatar-tryon");
  };

  const openConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setScreen("chat-thread");
  }, []);

  const openUserProfile = useCallback((id: string) => {
    setActiveUserId(id);
    setUserProfileBack((prev) => (screen === "user-profile" ? prev : screen));
    setScreen("user-profile");
  }, [screen]);

  // Weather-change proposals deep-link into whichever surface owns the
  // plan: the Planner day sheet, or the trip activity that plan dresses.
  const openPlanner = useCallback((date: string, planId?: string | null) => {
    setPlannerFocus({ date, planId: planId ?? null });
    setScreen("planner");
  }, []);

  const openTripActivity = useCallback((tripId: string, activityId: string) => {
    setActiveTripId(tripId);
    setTripFocusActivityId(activityId);
    setScreen("trip-detail");
  }, []);


  useChatNotifications(openConversation);

  // A tapped notification: "/?day=YYYY-MM-DD" (tomorrow's appointments) opens Calendar on that day.
  // Arrives in the URL when the app starts from the notification, or as a message from the service
  // worker (public/sw.js) when the app was already open.
  const openFromNotification = useCallback((url: string) => {
    try {
      const day = new URL(url, window.location.origin).searchParams.get("day");
      if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
        track("flow_step", { feature: "event_reminder", step: "opened" });
        openPlanner(day);
      }
    } catch { /* not a link of ours */ }
  }, [openPlanner]);
  useEffect(() => {
    if (!user || !["home", "wardrobe", "ai", "planner", "profile"].includes(screen)) return;
    if (!window.location.search.includes("day=")) return;
    openFromNotification(window.location.href);
    window.history.replaceState(null, "", window.location.pathname);
  }, [user, screen, openFromNotification]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "aura-open" && typeof e.data.url === "string") openFromNotification(e.data.url);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [openFromNotification]);

  // Guided tour (guided-tour.ts): starts on its own the first time a new account reaches Home with
  // a wardrobe still being built; the Guide reopens it. Seen once per account on this device.
  const frameRef = useRef<HTMLDivElement>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const tourSeen = (): boolean => {
    if (!user) return true;
    try { return localStorage.getItem(tourSeenKey(user.id)) === "1"; } catch { return true; }
  };
  const markTourSeen = () => {
    if (!user) return;
    try { localStorage.setItem(tourSeenKey(user.id), "1"); } catch { /* storage unavailable: shown again next time */ }
  };
  const onWardrobeKnown = useCallback((pieces: number) => {
    if (shouldAutoStartTour({ seen: tourSeen(), pieces })) setTourOpen(true);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const startTour = () => { setScreen("home"); setTourOpen(true); };
  const closeTour = () => { markTourSeen(); setTourOpen(false); };

  // Once a signed-in user is on a main tab and the browser is idle, download the screens people
  // open most often, so tapping into them doesn't wait on the network. Screens that pull in
  // heavy on-device models (colour analysis, avatar, try-on, batch review, outfit scan) are
  // deliberately left out and load only when opened.
  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const frequent = [
      screenLoaders.AddItem, screenLoaders.OutfitBuilder, screenLoaders.StylistChat,
      screenLoaders.LogWear, screenLoaders.Trips, screenLoaders.TripDetail, screenLoaders.TripCreate,
      screenLoaders.Shop, screenLoaders.Insights, screenLoaders.Settings, screenLoaders.Notifications,
      screenLoaders.Community, screenLoaders.Chats, screenLoaders.ChatThread, screenLoaders.UserProfile,
    ];
    let cancelled = false;
    const idle = (cb: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 2000 });
      else setTimeout(cb, 200);
    };
    const t = setTimeout(() => {
      const next = () => {
        const load = frequent.shift();
        if (cancelled || !load) return;
        load().catch(() => { /* prefetch only — the real navigation retries */ }).finally(() => idle(next));
      };
      idle(next);
    }, 1500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user]);

  useEffect(() => {
    if (recovery) setScreen("reset");
  }, [recovery]);

  const queryClient = useQueryClient();
  // Backfill thumbnails for outfits saved before the thumbnail pipeline
  // existed. Idle, best-effort, once per session — the picker keeps
  // falling back to the original image for anything not yet processed.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      void import("@/lib/outfit-thumb").then((m) => m.backfillOutfitThumbs(user.id));
      // Outfits saved with only their pieces get their canvas image composed here.
      void import("@/lib/outfit-canvas-backfill")
        .then((m) => m.backfillOutfitCanvases(user.id))
        .then((n) => { if (n > 0) void import("@/lib/outfits-query").then((q) => q.invalidateOutfits(queryClient, user.id)); });
    }, 4000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user, queryClient]);

  // One-off thumbnail backfill for older wardrobe items (owner account only for now — see
  // wardrobe-thumb-backfill.ts). Starts after the outfit backfill, runs in batches in the
  // background, and refreshes the wardrobe list once it has written anything.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      void import("@/lib/wardrobe-thumb-backfill").then(async (m) => {
        if (user.id !== m.THUMB_BACKFILL_OWNER_ID) return;
        const res = await m.backfillWardrobeThumbs(user.id);
        if (res.done > 0) invalidateWardrobeItems(queryClient, user.id);
      });
    }, 8000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user, queryClient]);

  // Leave the splash as soon as the app actually knows where to go — no fixed wait. A signed-in
  // user still waits for the profile fetch (normally a single fast query) so a fresh sign-up is
  // routed to profile setup instead of landing on Home with an incomplete profile.
  useEffect(() => {
    if (loading) return;
    if (screen !== "splash") return;
    if (recovery) { setScreen("reset"); return; }
    if (!onboarded) setScreen("onboarding");
    else if (!user) setScreen("auth");
    else if (!profileSettled) return;
    else if (profile && !profile.setup_complete) setScreen("profile-setup");
    else setScreen("home");
  }, [loading, profileSettled, screen, onboarded, user, profile, recovery]);

  useEffect(() => {
    if (loading || screen === "splash" || screen === "reset") return;
    if (!user && !["onboarding", "auth"].includes(screen)) {
      setScreen("auth");
      return;
    }
    if (user && ["auth"].includes(screen)) {
      if (typeof window !== "undefined") {
        try {
          const addBack = window.localStorage.getItem("aura:add_friend_return");
          if (addBack && addBack.startsWith("/add/")) {
            window.localStorage.removeItem("aura:add_friend_return");
            window.location.replace(addBack);
            return;
          }
        } catch { /* ignore */ }
        try {
          const back = window.localStorage.getItem("aura:mcp_consent_return");
          if (back && back.startsWith("/.lovable/oauth/consent")) {
            window.localStorage.removeItem("aura:mcp_consent_return");
            window.location.replace(back);
            return;
          }
        } catch { /* ignore */ }
      }
      if (!profileLoading && profile && !profile.setup_complete) setScreen("profile-setup");
      else if (!profileLoading) setScreen("home");
    }
    if (user && screen === "onboarding") {
      if (!profileLoading && profile && !profile.setup_complete) setScreen("profile-setup");
    }
  }, [user, loading, screen, profile, profileLoading]);

  const finishOnboarding = () => {
    localStorage.setItem("aura.onboarded", "1");
    setOnboarded(true);
    if (!user) setScreen("auth");
    else if (profile && !profile.setup_complete) setScreen("profile-setup");
    else setScreen("home");
  };

  const showTabs = user && !["splash", "onboarding", "auth", "reset", "profile-setup", "add", "builder", "stylist-chat", "chat-thread"].includes(screen);

  // The 5 screens reachable from the bottom tab bar stay mounted for the
  // whole session once first visited, shown/hidden with CSS instead of
  // being torn down and rebuilt every time — this is what makes
  // "Home → Wardrobe → Stylist → Wardrobe" instant on the second visit
  // instead of re-running every data fetch from scratch. Everything else
  // (AddItem, LogWear, OutfitBuilder, Settings, TripDetail, etc.) keeps
  // the original mount-on-demand/unmount-on-leave behavior: these are
  // flows people finish or back out of, not places they bounce between
  // all session long, so there's no real benefit to keeping them alive
  // and a real cost (memory) to doing so.
  //
  // Each persistent tab only actually mounts the FIRST time it's
  // visited (mountedTabs), not all five up front on cold start — so the
  // very first screen a person lands on doesn't pay for four others
  // they may never open this session.
  const MAIN_TABS = ["home", "wardrobe", "ai", "planner", "profile"] as const;
  const isMainTab = (MAIN_TABS as readonly string[]).includes(screen);
  const [mountedTabs, setMountedTabs] = useState<Set<Screen>>(new Set());
  useEffect(() => {
    if (isMainTab && !mountedTabs.has(screen)) {
      setMountedTabs((prev) => new Set(prev).add(screen));
    }
  }, [screen, isMainTab, mountedTabs]);

  return (
    <PhoneFrame>
      <div ref={frameRef} className="relative h-full w-full overflow-hidden bg-background">
        {mountedTabs.has("home") && (
          <div className={`absolute inset-0 ${screen === "home" ? "" : "hidden"}`}>
            <ErrorBoundary onReset={() => go("home")}>
              <Home go={go} openAvatarTryOn={openAvatarTryOn} openBuilder={openBuilder} active={screen === "home"} onWardrobeKnown={onWardrobeKnown} />
            </ErrorBoundary>
          </div>
        )}
        {mountedTabs.has("wardrobe") && (
          <div className={`absolute inset-0 ${screen === "wardrobe" ? "" : "hidden"}`}>
            <ErrorBoundary onReset={() => go("home")}>
              <Wardrobe go={go} gapFilter={wardrobeGapFilter} onClearGapFilter={() => setWardrobeGapFilter(null)} openBuilder={openBuilder} />
            </ErrorBoundary>
          </div>
        )}
        {mountedTabs.has("ai") && (
          <div className={`absolute inset-0 ${screen === "ai" ? "" : "hidden"}`}>
            <ErrorBoundary onReset={() => go("home")}>
              <AIStylist go={go} openBuilder={openBuilder} openAvatarTryOn={openAvatarTryOn} active={screen === "ai"} />
            </ErrorBoundary>
          </div>
        )}
        {mountedTabs.has("planner") && (
          <div className={`absolute inset-0 ${screen === "planner" ? "" : "hidden"}`}>
            <ErrorBoundary onReset={() => go("home")}>
              <Planner go={go} openStylistChat={openStylistChat} openBuilder={openBuilder} openAvatarTryOn={openAvatarTryOn} focus={plannerFocus} active={screen === "planner"} />
            </ErrorBoundary>
          </div>
        )}
        {mountedTabs.has("profile") && (
          <div className={`absolute inset-0 ${screen === "profile" ? "" : "hidden"}`}>
            <ErrorBoundary onReset={() => go("home")}>
              <Profile go={go} openConversation={openConversation} openUserProfile={openUserProfile} />
            </ErrorBoundary>
          </div>
        )}

        {/* Everything else — unchanged mount-on-demand behavior. */}
        {!isMainTab && (
        <div key={screen} className="absolute inset-0 animate-fade-in">
          <ErrorBoundary onReset={() => go("home")}>
          {/* Entry screens are not code-split and stay OUTSIDE the Suspense boundary: React hydrates
              Suspense content later than the rest, after AuraApp has already switched to the saved
              language, which would make the server-rendered splash mismatch again (#418). */}
          {screen === "splash" && <Splash go={go} />}
          {screen === "onboarding" && <Onboarding onDone={finishOnboarding} />}
          {screen === "auth" && <Auth />}
          {/* Plain background while a code-split screen downloads (usually already prefetched). */}
          <Suspense fallback={<div className="h-full w-full bg-background" />}>
          {screen === "reset" && <ResetPassword onDone={() => setScreen(user ? "home" : "auth")} />}
          {screen === "profile-setup" && <ProfileSetup onDone={() => setScreen("home")} />}

          {screen === "add" && (
            <AddItem
              onClose={() => { setAddItemInitialGarment(null); go("wardrobe"); }}
              initialGarment={addItemInitialGarment}
            />
          )}
          {screen === "stylist-chat" && <StylistChat go={go} openBuilder={openBuilder} initialMessage={stylistChatInit} />}
          {screen === "outfit-scan" && <OutfitScan go={go} />}
          {screen === "batch-scan" && <BatchScan go={go} openReview={openBatchReview} />}
                    {screen === "batch-review" && reviewScanId && <BatchReview go={go} scanId={reviewScanId} />}
          {screen === "trips" && <Trips go={go} openTrip={(id) => { setActiveTripId(id); setTripFocusActivityId(null); setScreen("trip-detail"); }} />}
          {screen === "trip-create" && <TripCreate go={go} onCreated={(id) => { setActiveTripId(id); setScreen("trip-detail"); }} />}
          {screen === "trip-detail" && activeTripId && <TripDetail go={go} tripId={activeTripId} focusActivityId={tripFocusActivityId} openBuilder={openBuilder} openAvatarTryOn={openAvatarTryOn} />}
          {screen === "essential-presets" && <EssentialPresets go={go} />}
          {screen === "shop" && <Shop go={go} />}
          {screen === "color-lab" && <ColorLab go={go} />}
          {screen === "community" && <Community go={go} openConversation={openConversation} openUserProfile={openUserProfile} />}
          {screen === "settings" && <Settings go={go} />}
          {screen === "settings-personal" && <PersonalInfo go={go} />}
          {screen === "settings-style-prefs" && <StylePreferences go={go} />}
          {screen === "settings-sizes" && <SettingsSizes go={go} />}
          {screen === "settings-language" && <SettingsLanguage go={go} />}
          {screen === "settings-wardrobe-locations" && <SettingsWardrobeLocations go={go} />}
          {screen === "settings-dress-preferences" && <SettingsDressPreferences go={go} />}
          {screen === "settings-notifications" && <NotificationSettings go={go} />}
          {screen === "settings-calendar" && <SettingsCalendar go={go} />}
          {screen === "settings-usage" && <SettingsUsage go={go} />}
          {screen === "settings-report-problem" && <SettingsReportProblem go={go} />}
          {screen === "settings-guide" && <SettingsGuide go={go} replayTour={startTour} />}
          {screen === "settings-privacy" && <PrivacySettings go={go} />}

                    {screen === "insights" && <Insights go={go} openWardrobeGap={(f) => { setWardrobeGapFilter(f); go("wardrobe"); }} openBuilder={openBuilder} />}

                        {screen === "saved-outfits" && <AIStylist go={go} openBuilder={openBuilder} openAvatarTryOn={openAvatarTryOn} active={screen === "saved-outfits"} />}
          {screen === "notifications" && (
            <Notifications go={go} openThread={openConversation} openPlanner={openPlanner} openTripActivity={openTripActivity} />
          )}
          {screen === "invite" && <Invite go={go} />}
          {screen === "storage-debug" && <StorageDebug go={go} />}
          {screen === "chats" && <Chats go={go} openThread={openConversation} />}
          {screen === "chat-thread" && activeConversationId && (
            <ChatThread go={go} conversationId={activeConversationId} onBack={() => setScreen("chats")} />
          )}
          {screen === "builder" && <OutfitBuilder go={go} init={builderInit} openAvatarTryOn={openAvatarTryOn} />}
          {screen === "color-analysis" && <PersonalColorAnalysis go={go} />}
          {screen === "avatar" && <Avatar go={go} />}
          {screen === "avatar-tryon" && <AvatarTryOn go={go} itemIds={avatarTryOnItemIds} />}
          {screen === "log-wear" && <LogWear go={go} openBuilder={openBuilder} openAddItemWithGarment={openAddItemWithGarment} />}
          {screen === "user-profile" && (
            activeUserId
              ? <UserProfile userId={activeUserId} go={go} onBack={() => setScreen(userProfileBack)} />
              : <div className="h-full flex items-center justify-center px-8 text-center text-sm text-muted-foreground">
                  This profile is not available.
                </div>
          )}
          </Suspense>
          </ErrorBoundary>
        </div>
        )}
        {showTabs && <TabBar current={screen} go={go} />}
        {tourOpen && screen === "home" && <GuidedTour container={frameRef} onClose={closeTour} />}
      </div>
    </PhoneFrame>
  );
}


export function AuraApp() {
  // Server and first client render both use English (no hydration mismatch); the language saved
  // on this device is applied right after hydration. See i18n/config.ts.
  useEffect(() => { applyStoredLanguage(); }, []);
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}
