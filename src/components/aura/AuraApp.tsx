import { useCallback, useEffect, useState } from "react";
import { Splash } from "./screens/Splash";
import { Onboarding } from "./screens/Onboarding";
import { Auth } from "./screens/Auth";
import { ResetPassword } from "./screens/ResetPassword";
import { ProfileSetup } from "./screens/ProfileSetup";
import { Home } from "./screens/Home";
import { Wardrobe } from "./screens/Wardrobe";
import { AddItem } from "./screens/AddItem";
import { AIStylist } from "./screens/AIStylist";
import { StylistChat } from "./screens/StylistChat";
import { OutfitScan } from "./screens/OutfitScan";
import { BatchScan } from "./screens/BatchScan";
import { BatchReview } from "./screens/BatchReview";
import { Trips } from "./screens/Trips";
import { TripCreate } from "./screens/TripCreate";
import { TripDetail } from "./screens/TripDetail";
import { EssentialPresets } from "./screens/EssentialPresets";
import { Planner } from "./screens/Planner";
import { Shop } from "./screens/Shop";
import { ColorLab } from "./screens/ColorLab";
import { Community } from "./screens/Community";
import { Profile } from "./screens/Profile";
import { Insights } from "./screens/Insights";
import { Settings } from "./screens/Settings";
import { PersonalInfo } from "./screens/PersonalInfo";
import { StylePreferences } from "./screens/StylePreferences";
import { SettingsSizes } from "./screens/SettingsSizes";
import { SettingsLanguage } from "./screens/SettingsLanguage";
import { SettingsWardrobeLocations } from "./screens/SettingsWardrobeLocations";
import { SettingsDressPreferences } from "./screens/SettingsDressPreferences";
import { NotificationSettings } from "./screens/NotificationSettings";
import { SettingsCalendar } from "./screens/SettingsCalendar";
import { PrivacySettings } from "./screens/PrivacySettings";
import { Notifications } from "./screens/Notifications";
import { Invite } from "./screens/Invite";
import { StorageDebug } from "./screens/StorageDebug";
import { Chats } from "./screens/Chats";
import { ChatThread } from "./screens/ChatThread";
import { OutfitBuilder } from "./screens/OutfitBuilder";
import { PersonalColorAnalysis } from "./screens/PersonalColorAnalysis";
import { Avatar } from "./screens/Avatar";
import { AvatarTryOn } from "./screens/AvatarTryOn";
import { LogWear } from "./screens/LogWear";
import { UserProfile } from "./screens/UserProfile";

import { TabBar } from "./TabBar";
import { ErrorBoundary } from "./ErrorBoundary";
import { PhoneFrame } from "./PhoneFrame";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { useChatNotifications } from "@/hooks/use-chat-notifications";

export type Screen =
    | "splash" | "onboarding" | "auth" | "reset" | "profile-setup"
    | "home" | "wardrobe" | "add" | "ai" | "planner" | "shop" | "community" | "profile"
      | "insights" | "saved-outfits" | "notifications" | "invite" | "builder" | "color-lab" | "color-analysis" | "stylist-chat" | "outfit-scan" | "batch-scan" | "batch-review" | "storage-debug"
      | "trips" | "trip-create" | "trip-detail" | "essential-presets"
            | "chats" | "chat-thread" | "user-profile"
      | "settings" | "settings-personal" | "settings-sizes" | "settings-style-prefs" | "settings-language"
      | "settings-wardrobe-locations" | "settings-dress-preferences" | "settings-notifications" | "settings-calendar" | "settings-privacy"
      | "avatar" | "avatar-tryon" | "log-wear";





export type BuilderInit = {
  itemIds: string[];
  name?: string;
  occasion?: string;
  notes?: string;
  outfitId?: string;
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
  const { profile, loading: profileLoading } = useProfile();
  const [screen, setScreen] = useState<Screen>("splash");
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

  useEffect(() => {
    if (recovery) setScreen("reset");
  }, [recovery]);

  // Backfill thumbnails for outfits saved before the thumbnail pipeline
  // existed. Idle, best-effort, once per session — the picker keeps
  // falling back to the original image for anything not yet processed.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      void import("@/lib/outfit-thumb").then((m) => m.backfillOutfitThumbs(user.id));
    }, 4000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (screen !== "splash") return;
    if (recovery) { setScreen("reset"); return; }
    const t = setTimeout(() => {
      if (!onboarded) setScreen("onboarding");
      else if (!user) setScreen("auth");
      else if (!profileLoading && profile && !profile.setup_complete) setScreen("profile-setup");
      else setScreen("home");
    }, 1600);
    return () => clearTimeout(t);
  }, [loading, profileLoading, screen, onboarded, user, profile, recovery]);

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
      <div className="relative h-full w-full overflow-hidden bg-background">
        {mountedTabs.has("home") && (
          <div className={`absolute inset-0 ${screen === "home" ? "" : "hidden"}`}>
            <ErrorBoundary onReset={() => go("home")}>
              <Home go={go} openAvatarTryOn={openAvatarTryOn} openBuilder={openBuilder} />
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
          {screen === "splash" && <Splash go={go} />}
          {screen === "onboarding" && <Onboarding onDone={finishOnboarding} />}
          {screen === "auth" && <Auth />}
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
          {screen === "settings-privacy" && <PrivacySettings go={go} />}

                    {screen === "insights" && <Insights go={go} openWardrobeGap={(f) => { setWardrobeGapFilter(f); go("wardrobe"); }} openBuilder={openBuilder} />}

                        {screen === "saved-outfits" && <AIStylist go={go} openBuilder={openBuilder} openAvatarTryOn={openAvatarTryOn} />}
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
          </ErrorBoundary>
        </div>
        )}
        {showTabs && <TabBar current={screen} go={go} />}
      </div>
    </PhoneFrame>
  );
}


export function AuraApp() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}
