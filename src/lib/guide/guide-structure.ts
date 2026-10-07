// The in-app Guide (Settings › Guida di AURA): chapters, articles and, for each step, the piece of
// the app to tap, drawn as it really looks (GuideVisual). The text of every article lives in one
// file per language (guide-text.<lang>.ts), loaded only when the Guide is opened; this file holds
// what is the same in every language. Labels on the drawn buttons come from the app's own
// translations (labelKey), so the Guide always shows the words the screen shows.
import type { Screen } from "@/components/aura/AuraApp";

export type GuideIcon =
  | "plus" | "images" | "camera" | "link" | "sparkles" | "calendar" | "luggage" | "settings"
  | "mic" | "share" | "check" | "palette" | "user" | "shirt" | "home" | "pin" | "chart" | "qr";

export type GuideTab = "home" | "wardrobe" | "ai" | "planner" | "profile";

export type GuideVisual =
  /** The bottom bar with one tab highlighted. */
  | { kind: "tab"; tab: GuideTab }
  /** A pill button, filled (main action) or outlined. */
  | { kind: "button"; labelKey: string; icon?: GuideIcon; variant: "solid" | "outline" }
  /** A round icon button (the + in Wardrobe, the suitcase in Calendar, the gear in You). */
  | { kind: "round"; icon: GuideIcon; labelKey: string; dark?: boolean }
  /** A choice in a sheet: icon, title and the one-line hint under it. */
  | { kind: "option"; icon: GuideIcon; labelKey: string; hintKey?: string }
  /** A row of a list (Settings, You). */
  | { kind: "row"; labelKey: string; subKey?: string }
  /** Several small labels side by side (tabs at the top of a screen, filters). */
  | { kind: "chips"; labelKeys: string[] };

export type GuideArticleDef = {
  id: string;
  /** "Apri" in the article goes straight to this screen. */
  open?: Screen;
  /** One entry per step of the article's text, in order (null: a step with nothing to draw). */
  visuals: (GuideVisual | null)[];
};

export type GuideChapterDef = { id: string; articles: GuideArticleDef[] };

const tab = (t: GuideTab): GuideVisual => ({ kind: "tab", tab: t });
const plus: GuideVisual = { kind: "round", icon: "plus", labelKey: "wardrobe.addPiecesAria", dark: true };
const gear: GuideVisual = { kind: "round", icon: "settings", labelKey: "profileScreen.settingsAria" };
const row = (labelKey: string, subKey?: string): GuideVisual => ({ kind: "row", labelKey, subKey });

export const GUIDE: GuideChapterDef[] = [
  {
    id: "start",
    articles: [
      { id: "about", open: "home", visuals: [tab("home"), tab("wardrobe"), tab("ai"), tab("planner"), tab("profile")] },
      {
        id: "first-pieces", open: "batch-scan",
        visuals: [
          { kind: "button", labelKey: "firstSteps.addMany", icon: "images", variant: "solid" },
          { kind: "button", labelKey: "batchScan.choosePhotos", icon: "images", variant: "outline" },
          null,
          { kind: "button", labelKey: "batchScan.review", variant: "outline" },
        ],
      },
      {
        id: "first-look", open: "home",
        visuals: [tab("home"), { kind: "button", labelKey: "home.styleALook", variant: "outline" }, null],
      },
    ],
  },
  {
    id: "wardrobe",
    articles: [
      {
        id: "add-one", open: "add",
        visuals: [
          tab("wardrobe"),
          plus,
          { kind: "option", icon: "plus", labelKey: "addSourceSheet.addOnePiece", hintKey: "addSourceSheet.addOnePieceHint" },
          { kind: "button", labelKey: "addItem.photoLibrary", icon: "images", variant: "outline" },
          null,
          { kind: "button", labelKey: "addItem.saveToCloset", variant: "solid" },
        ],
      },
      {
        id: "add-link", open: "add",
        visuals: [
          plus,
          { kind: "button", labelKey: "addItem.pasteProductLink", icon: "link", variant: "outline" },
          { kind: "button", labelKey: "addItem.pasteFromClipboard", variant: "outline" },
          { kind: "button", labelKey: "addItem.importProduct", icon: "link", variant: "solid" },
        ],
      },
      {
        id: "batch", open: "batch-scan",
        visuals: [
          plus,
          { kind: "option", icon: "images", labelKey: "addSourceSheet.batchScanPhotos", hintKey: "addSourceSheet.batchScanPhotosHint" },
          { kind: "chips", labelKeys: ["batchScan.choosePhotos", "batchScan.addUrl"] },
          null,
          { kind: "button", labelKey: "batchScan.review", variant: "outline" },
        ],
      },
      {
        id: "outfit-scan", open: "outfit-scan",
        visuals: [
          plus,
          { kind: "option", icon: "camera", labelKey: "addSourceSheet.scanOneOutfit", hintKey: "addSourceSheet.scanOneOutfitHint" },
          null,
          { kind: "button", labelKey: "outfitScan.yesLogAsWorn", variant: "solid" },
        ],
      },
      {
        id: "find", open: "wardrobe",
        visuals: [tab("wardrobe"), { kind: "chips", labelKeys: ["wardrobe.thisSeason", "wardrobe.allSeasons"] }, null],
      },
      {
        id: "item-card", open: "wardrobe",
        visuals: [
          null,
          { kind: "chips", labelKeys: ["wardrobe.editDetailsButton", "wardrobe.removeBackgroundButton", "wardrobe.adjustCropButton"] },
          { kind: "button", labelKey: "wardrobe.createOutfitFromThisButton", variant: "outline" },
          { kind: "chips", labelKeys: ["wardrobe.lendItemButton", "wardrobe.archiveOutOfRotation"] },
        ],
      },
      {
        id: "locations", open: "settings-wardrobe-locations",
        visuals: [tab("profile"), gear, row("settings.wardrobeLocations")],
      },
    ],
  },
  {
    id: "outfits",
    articles: [
      { id: "today", open: "home", visuals: [tab("home"), { kind: "button", labelKey: "home.useLocation", icon: "pin", variant: "outline" }, null] },
      {
        id: "canvas", open: "builder",
        visuals: [
          tab("ai"),
          { kind: "button", labelKey: "aiStylist.buildManually", variant: "solid" },
          { kind: "button", labelKey: "outfitBuilder.addFromCloset", icon: "plus", variant: "outline" },
          null,
          { kind: "button", labelKey: "outfitBuilder.saveOutfit", variant: "solid" },
        ],
      },
      {
        id: "ask-stylist", open: "stylist-chat",
        visuals: [
          tab("ai"),
          { kind: "button", labelKey: "aiStylist.askYourStylist", icon: "sparkles", variant: "outline" },
          { kind: "round", icon: "mic", labelKey: "guide.visual.mic" },
          { kind: "chips", labelKeys: ["stylistChat.saveToCanvas", "stylistChat.addToCalendar"] },
        ],
      },
      {
        id: "ai-suggest", open: "ai",
        visuals: [
          tab("ai"),
          { kind: "chips", labelKeys: ["home.occasionWork", "home.occasionWeekend", "home.occasionEvening"] },
          { kind: "button", labelKey: "aiStylist.aiSuggest", icon: "sparkles", variant: "outline" },
        ],
      },
      {
        id: "work-week", open: "ai",
        visuals: [
          tab("ai"),
          { kind: "button", labelKey: "aiStylist.createWorkOutfits", icon: "calendar", variant: "outline" },
          { kind: "button", labelKey: "aiStylist.generate", variant: "solid" },
          row("settings.stylePrefs", "settings.stylePrefsSub"),
        ],
      },
      {
        id: "my-outfits", open: "saved-outfits",
        visuals: [
          tab("ai"),
          { kind: "chips", labelKeys: ["aiStylist.tabUpcoming", "aiStylist.tabWorn", "aiStylist.tabMyOutfitPhotos", "aiStylist.tabSaved", "aiStylist.tabArchive"] },
          { kind: "round", icon: "share", labelKey: "aiStylist.shareOutfitAria" },
        ],
      },
      {
        id: "worn", open: "ai",
        visuals: [
          { kind: "button", labelKey: "aiStylist.yesThisIsWhatIWore", icon: "check", variant: "solid" },
          { kind: "button", labelKey: "planner.markAsWorn", icon: "check", variant: "outline" },
          { kind: "option", icon: "camera", labelKey: "addSourceSheet.scanOneOutfit", hintKey: "addSourceSheet.scanOneOutfitHint" },
        ],
      },
    ],
  },
  {
    id: "calendar",
    articles: [
      {
        id: "plan-day", open: "planner",
        visuals: [
          tab("planner"),
          null,
          { kind: "chips", labelKeys: ["planner.planOutfit", "planner.askStylist", "planner.choosePieces"] },
          { kind: "button", labelKey: "planner.markAsWorn", icon: "check", variant: "outline" },
        ],
      },
      {
        id: "connect-calendar", open: "settings-calendar",
        visuals: [tab("profile"), gear, row("settings.calendar"), null],
      },
      {
        id: "trips", open: "trips",
        visuals: [
          tab("planner"),
          { kind: "round", icon: "luggage", labelKey: "planner.tripsAria" },
          { kind: "button", labelKey: "trips.planATrip", variant: "solid" },
          null,
          null,
        ],
      },
    ],
  },
  {
    id: "avatar",
    articles: [
      {
        id: "create-avatar", open: "avatar",
        visuals: [
          tab("profile"),
          row("avatar.title", "avatar.setupEyebrow"),
          { kind: "button", labelKey: "avatar.addPhoto", icon: "camera", variant: "solid" },
          null,
        ],
      },
      {
        id: "try-on", open: "avatar-tryon",
        visuals: [
          { kind: "button", labelKey: "avatar.tryOnCta", icon: "sparkles", variant: "outline" },
          { kind: "button", labelKey: "avatar.generate", variant: "solid" },
          { kind: "chips", labelKeys: ["avatar.save", "avatar.regenerate"] },
          row("settings.usage", "settings.usageSub"),
        ],
      },
    ],
  },
  {
    id: "colors-shopping",
    articles: [
      {
        id: "color-analysis", open: "color-analysis",
        visuals: [tab("profile"), row("profileScreen.colorAnalysis", "profileScreen.discoverYourSeason"), null, { kind: "button", labelKey: "colorAnalysis.saveToProfileButton", variant: "solid" }],
      },
      { id: "color-lab", open: "color-lab", visuals: [tab("home"), row("home.colorLab", "home.colorHarmony"), null] },
      {
        id: "shop", open: "shop",
        visuals: [tab("home"), row("home.theEdit", "home.shopYourGaps"), { kind: "button", labelKey: "shop.shouldIBuyIt", variant: "outline" }],
      },
      { id: "insights", open: "insights", visuals: [tab("profile"), row("profileScreen.wardrobeInsights"), null] },
    ],
  },
  {
    id: "community",
    articles: [
      {
        id: "friends", open: "community",
        visuals: [tab("profile"), row("profileScreen.community"), { kind: "round", icon: "qr", labelKey: "profileScreen.myQrCodeAria" }, { kind: "round", icon: "share", labelKey: "aiStylist.shareOutfitAria" }, row("profileScreen.inviteFriends")],
      },
    ],
  },
  {
    id: "account",
    articles: [
      {
        id: "profile-settings", open: "settings",
        visuals: [gear, row("settings.personalInfo", "settings.personalInfoSub"), row("settings.sizes"), row("settings.stylePrefs", "settings.stylePrefsSub"), row("settings.dressPreferences"), row("settings.language")],
      },
      { id: "notifications-privacy", open: "settings", visuals: [row("settings.notifications"), row("settings.privacy")] },
      { id: "plan", open: "settings-usage", visuals: [row("settings.usage", "settings.usageSub"), null] },
      { id: "problem", open: "settings-report-problem", visuals: [row("settings.reportProblem", "settings.reportProblemSub"), null] },
      { id: "delete-account", open: "settings", visuals: [row("settings.deleteAccount", "settings.deleteAccountSub"), null] },
    ],
  },
];

/** The text of the Guide in one language: a title per chapter, and per article a title, an
 *  optional intro, one sentence per step (as many as the article has visuals) and an optional tip. */
export type GuideText = {
  title: string;
  intro: string;
  searchPlaceholder: string;
  noResults: string;
  open: string;
  replayTour: string;
  chapters: Record<string, string>;
  articles: Record<string, { title: string; intro?: string; steps: string[]; tip?: string }>;
};

export const GUIDE_LANGUAGES = ["it", "en", "es", "fr"] as const;
export type GuideLanguage = (typeof GUIDE_LANGUAGES)[number];

/** Each language's text, downloaded only when the Guide opens. */
export const guideTextLoaders: Record<GuideLanguage, () => Promise<{ default: GuideText }>> = {
  it: () => import("./guide-text.it"),
  en: () => import("./guide-text.en"),
  es: () => import("./guide-text.es"),
  fr: () => import("./guide-text.fr"),
};

/** Articles whose title, intro, steps or tip contain every word of the query (accents and case
 *  ignored). */
export function searchGuide(text: GuideText, query: string): string[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return GUIDE.flatMap((c) => c.articles.map((a) => a.id)).filter((id) => {
    const a = text.articles[id];
    if (!a) return false;
    const hay = norm([a.title, a.intro ?? "", ...a.steps, a.tip ?? ""].join(" "));
    return words.every((w) => hay.includes(w));
  });
}
