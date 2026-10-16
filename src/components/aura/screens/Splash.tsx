import { useTranslation } from "react-i18next";
import type { Screen } from "../AuraApp";
import { BRAND_WORDMARK } from "@/lib/brand";

export function Splash({ go }: { go: (s: Screen) => void }) {
  const { t } = useTranslation();
  return (
    <div className="relative h-full w-full overflow-hidden gradient-warm">
      <div className="absolute inset-0 grain opacity-40" />
      {/* Only the wordmark, the rule and the tagline, centred on the screen (reported: the block sat
          low, and the rest of the page was noise). The line box leaves more air above the italic
          glyphs than below, so the block is lifted by 10px to be centred optically. */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+10px)] text-center">
        <div className="animate-scale-in">
          <h1 className="font-serif text-[88px] leading-none italic text-foreground tracking-tight">
            {BRAND_WORDMARK}
            <span className="sr-only"> — {t("splash.tagline")}</span>
          </h1>
          <div className="mx-auto mt-4 h-px w-16 bg-foreground/30" />
          <p className="mt-4 whitespace-nowrap text-[10px] uppercase tracking-[0.45em] text-muted-foreground">
            {t("splash.tagline")}
          </p>
        </div>
      </div>

      {/* Descriptive summary + navigable actions for screen readers and AI agents: kept in the page
          but not shown — the splash leaves on its own as soon as the app knows where to go. */}
      <section className="sr-only" aria-label={t("splash.introAria")}>
        <p className="text-sm text-foreground/80 leading-relaxed max-w-xs mx-auto">
          {t("splash.description")}
        </p>
        <nav className="mt-5 flex flex-col items-center gap-2" aria-label={t("splash.getStartedAria")}>
          <button
            type="button"
            onClick={() => go("onboarding")}
            className="rounded-full bg-foreground text-background px-6 py-2.5 text-xs uppercase tracking-widest active:scale-95 transition"
          >
            {t("splash.getStarted")}
          </button>
          <button
            type="button"
            onClick={() => go("auth")}
            className="text-xs text-muted-foreground underline underline-offset-4 active:scale-95 transition"
          >
            {t("splash.signIn")}
          </button>
        </nav>
      </section>

    </div>
  );
}
