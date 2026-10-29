import { useTranslation } from "react-i18next";
import { Camera, Check, Images, Search } from "lucide-react";
import { setPendingAddLibrary } from "@/lib/pending-import";
import type { Screen } from "./AuraApp";
import { FIRST_LOOK_MIN, FIRST_STEPS_TARGET, starterProgress } from "@/lib/first-steps";
import { track } from "@/lib/telemetry-client";
import { useProfile } from "@/hooks/use-profile";

/** "Primi passi": shown on Home while the wardrobe has fewer than FIRST_STEPS_TARGET pieces. Says
 *  which pieces to photograph first and opens the fastest way to add them. */
export function FirstSteps({ items, go }: { items: { category: string | null }[]; go: (s: Screen) => void }) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const p = starterProgress(items, profile?.gender);
  const pct = Math.min(100, (p.total / FIRST_STEPS_TARGET) * 100);
  const open = (to: "batch-scan" | "add" | "library") => {
    track("flow_step", { feature: "first_steps", step: to === "add" ? "add_one" : to === "library" ? "library" : "add_batch", count: p.total });
    if (to === "library") setPendingAddLibrary();
    go(to === "library" ? "add" : to);
  };
  return (
    <section className="px-6 mt-6 animate-fade-up" aria-labelledby="first-steps-title" data-tour="first-steps">
      <div className="rounded-[2rem] border border-border p-5">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("firstSteps.eyebrow")}</p>
        <h2 id="first-steps-title" className="font-serif text-2xl italic mt-1">{t("firstSteps.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          {p.total >= FIRST_LOOK_MIN ? t("firstSteps.subtitleLookReady") : t("firstSteps.subtitle")}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-foreground/70 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{t("firstSteps.progress", { count: p.total, target: FIRST_STEPS_TARGET })}</span>
        </div>

        <ul className="mt-4 grid grid-cols-1 gap-1.5">
          {p.groups.map((g) => {
            const done = g.have >= g.want;
            return (
              <li key={g.key} className="flex items-center gap-2.5 text-sm">
                <span className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-foreground text-background" : "border border-border"}`}>
                  {done && <Check size={11} />}
                </span>
                <span className={done ? "text-muted-foreground line-through" : ""}>{t(`firstSteps.group.${g.label}`, { count: g.want })}</span>
                <span className="ml-auto text-xs text-muted-foreground">{Math.min(g.have, g.want)}/{g.want}</span>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={() => open("batch-scan")} className="h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-1 active:scale-[0.98]">
            <Images size={13} /> {t("firstSteps.addMany")}
          </button>
          <button onClick={() => open("add")} className="h-12 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-1 active:scale-[0.98]">
            <Camera size={13} /> {t("firstSteps.addOne")}
          </button>
        </div>
        {/* The quickest start: a piece someone already added, with its photo and details ready. */}
        <button onClick={() => open("library")} className="mt-2 w-full rounded-2xl bg-secondary/50 px-4 py-3 text-left flex items-center gap-3 active:scale-[0.99]">
          <Search size={15} className="shrink-0" />
          <span className="min-w-0">
            <span className="block text-[11px] uppercase tracking-[0.2em]">{t("firstSteps.library")}</span>
            <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">{t("firstSteps.libraryHint")}</span>
          </span>
        </button>
        <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">{t("firstSteps.tip")}</p>
      </div>
    </section>
  );
}
