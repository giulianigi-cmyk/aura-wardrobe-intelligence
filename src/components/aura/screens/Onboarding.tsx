import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Bell, CalendarDays, Camera, Check, CloudSun, Plane } from "lucide-react";
import { BRAND_WORDMARK } from "@/lib/brand";
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n/config";
import { applyDeviceLanguageOnce, setDeviceLanguage } from "@/lib/device-language";

/** What the app does, in three screens, before the account: like the store apps, no language
 *  question first (the phone's language is used; a small switch in the corner changes it). Each
 *  screen has an example (generated pictures of unbranded pieces), not a real wardrobe. */
const SLIDES = ["outfits", "scan", "morning"] as const;
type Slide = (typeof SLIDES)[number];

function Tile({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-card border border-border/70 shadow-sm flex items-center justify-center ${className}`}>{children}</div>;
}

// Example pieces (generated pictures, no brand) and their outfit composed by the app's own canvas
// (compose-outfit-canvas.ts), in public/onboarding.
const PIECES = ["sweater", "jeans", "sneakers", "bag"] as const;
const SCANNED = ["trench", "skirt", "sweater"] as const;

/** The example at the top of each screen. */
function Example({ slide }: { slide: Slide }) {
  const { t } = useTranslation();
  if (slide === "outfits") {
    return (
      // The pieces small, the outfit made from them clearly the main thing.
      <div className="flex items-center gap-3">
        <div className="grid grid-cols-2 gap-1.5">
          {PIECES.map((p) => (
            <Tile key={p} className="h-14 w-14 rounded-xl overflow-hidden"><img src={`/onboarding/${p}.webp`} alt="" className="h-full w-full object-contain p-1.5" /></Tile>
          ))}
        </div>
        <ArrowRight size={18} className="text-muted-foreground shrink-0" />
        <Tile className="w-44 aspect-[4/5] overflow-hidden"><img src="/onboarding/look.webp" alt={t("onboarding.exampleLook")} className="h-full w-full object-contain" /></Tile>
      </div>
    );
  }
  if (slide === "scan") {
    return (
      <div className="relative">
        {/* Every piece and its check stay inside the frame of the photo. */}
        <Tile className="h-44 w-72 relative overflow-hidden">
          <div className="absolute inset-3 rounded-xl border-2 border-dashed border-foreground/25" />
          <div className="flex gap-2.5">
            {SCANNED.map((p) => (
              <div key={p} className="relative h-[88px] w-[70px] rounded-xl bg-secondary/40 overflow-hidden">
                <img src={`/onboarding/${p}.webp`} alt="" className="h-full w-full object-contain p-2" />
                <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-foreground text-background flex items-center justify-center"><Check size={9} /></span>
              </div>
            ))}
          </div>
        </Tile>
        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-10 w-10 rounded-full bg-foreground text-background flex items-center justify-center shadow-luxe"><Camera size={17} /></span>
      </div>
    );
  }
  return (
    <div className="w-72 space-y-2.5">
      <Tile className="h-auto justify-start gap-3 px-4 py-3">
        <Bell size={16} className="shrink-0" />
        <div className="text-left min-w-0">
          <p className="text-[12px] font-medium">07:30 · {t("onboarding.exampleMorning")}</p>
          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><CloudSun size={12} /> 14° · {t("onboarding.exampleWeather")}</p>
        </div>
      </Tile>
      <div className="flex gap-2">
        <Tile className="h-auto flex-1 justify-start gap-2 px-3 py-2.5 text-[11px]"><CalendarDays size={14} className="shrink-0" />{t("onboarding.exampleEvent")}</Tile>
        <Tile className="h-auto flex-1 justify-start gap-2 px-3 py-2.5 text-[11px]"><Plane size={14} className="shrink-0" />{t("onboarding.exampleTrip")}</Tile>
      </div>
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: (mode: "signup" | "signin") => void }) {
  const { t, i18n } = useTranslation();
  const [i, setI] = useState(0);
  useEffect(() => { applyDeviceLanguageOnce(); }, []);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;
  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language) ? (i18n.language as SupportedLanguage) : "en";

  return (
    <div className="relative h-full w-full flex flex-col">
      {/* The example takes about half the screen and the words follow right under it; the buttons
          stay at the bottom (with the whole height to the example, the page looked empty). */}
      <div className="relative h-[56%] shrink-0 overflow-hidden gradient-warm">
        <div className="absolute inset-0 grain opacity-40" />
        <div className="absolute top-12 inset-x-6 flex items-center justify-between z-10">
          <label className="text-[11px] uppercase tracking-[0.2em] text-foreground/70">
            <span className="sr-only">{t("onboarding.languageAria")}</span>
            <select
              value={current}
              onChange={(e) => setDeviceLanguage(e.target.value as SupportedLanguage)}
              className="bg-transparent outline-none appearance-none pr-1"
            >
              {SUPPORTED_LANGUAGES.map((code) => <option key={code} value={code}>{LANGUAGE_LABELS[code]}</option>)}
            </select>
            <span aria-hidden> ▾</span>
          </label>
          <button onClick={() => onDone("signin")} className="text-[11px] uppercase tracking-[0.25em] text-foreground/70">
            {t("onboarding.skip")}
          </button>
        </div>
        <p className="absolute top-22 inset-x-0 text-center font-serif text-3xl italic text-foreground/85">{BRAND_WORDMARK}</p>
        <div key={slide} className="absolute inset-x-0 top-36 bottom-4 flex items-center justify-center animate-fade-up">
          <Example slide={slide} />
        </div>
      </div>

      <div className="flex-1 flex flex-col px-8 pt-7 pb-10 relative z-10">
        <div>
          <div key={i}>
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground animate-fade-up">{t(`onboarding.${slide}Eyebrow`)}</p>
            <h1 className="mt-3 font-serif text-[36px] leading-[1.05] text-foreground whitespace-pre-line animate-fade-up" style={{ animationDelay: "0.1s" }}>
              {t(`onboarding.${slide}Title`)}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground max-w-[300px] animate-fade-up" style={{ animationDelay: "0.2s" }}>
              {t(`onboarding.${slide}Body`)}
            </p>
          </div>
        </div>

        {last ? (
          <div className="mt-auto pt-7 space-y-2">
            <button onClick={() => onDone("signup")}
              className="w-full h-12 rounded-full bg-foreground text-background text-[11px] uppercase tracking-[0.25em] active:scale-[0.98]">
              {t("onboarding.createAccount")}
            </button>
            <button onClick={() => onDone("signin")}
              className="w-full h-12 rounded-full border border-border text-[11px] uppercase tracking-[0.25em] active:scale-[0.98]">
              {t("onboarding.haveAccount")}
            </button>
          </div>
        ) : (
          <div className="mt-auto pt-7 flex items-center justify-between">
            <div className="flex gap-1.5">
              {SLIDES.map((_, idx) => (
                <span key={idx} className={`h-1 rounded-full transition-all ${idx === i ? "w-8 bg-foreground" : "w-1 bg-foreground/25"}`} />
              ))}
            </div>
            <button
              onClick={() => setI(i + 1)}
              aria-label={t("onboarding.next")}
              className="group flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background transition-all active:scale-90 shadow-luxe"
            >
              <ArrowRight size={18} className="transition-transform group-active:translate-x-0.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
