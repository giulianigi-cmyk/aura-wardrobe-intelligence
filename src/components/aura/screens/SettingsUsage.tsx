import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Screen } from "../AuraApp";
import { getMyUsage } from "@/lib/plans.functions";
import type { UsageSummary } from "@/lib/plans.server";

/** The person's plan and, for each limit, how much is used in the current day / month. */
export function SettingsUsage({ go }: { go: (s: Screen) => void }) {
  const { t, i18n } = useTranslation();
  const fetchUsage = useServerFn(getMyUsage);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeZone: string | null = null;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      timeZone = null;
    }
    fetchUsage({ data: { timeZone } })
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch((e) => {
        console.error("[AURA usage] load failed", e);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [fetchUsage]);

  const fmt = (n: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(n);

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28 bg-background">
      <header className="px-6 pt-14 pb-2 flex items-center justify-between">
        <button onClick={() => go("settings")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={15} />
        </button>
        <p className="font-serif text-lg italic">{t("usage.title")}</p>
        <span className="w-10" />
      </header>

      {!summary && !failed && <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>}
      {failed && <p className="px-6 mt-6 text-sm text-muted-foreground">{t("usage.loadFailed")}</p>}

      {summary && (
        <div className="px-6 mt-4 space-y-5 animate-fade-up">
          <div className="rounded-3xl border border-border p-5">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("usage.yourPlan")}</p>
            <p className="font-serif text-3xl italic mt-1">{t(`usage.plan.${summary.plan}`)}</p>
            {summary.inTrial && summary.trialEndsAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("usage.trialUntil", { date: new Date(summary.trialEndsAt).toLocaleDateString(i18n.language, { day: "numeric", month: "long" }) })}
              </p>
            )}
            {summary.plan === "owner" && <p className="mt-1 text-xs text-muted-foreground">{t("usage.ownerNote")}</p>}
          </div>

          <div className="rounded-3xl border border-border divide-y divide-border">
            {summary.lines.filter((l) => l.used != null || l.max != null).map((l) => {
              const included = l.max == null || l.max > 0;
              const pct = l.max && l.used != null ? Math.min(100, (l.used / l.max) * 100) : 0;
              return (
                <div key={l.key} className="px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm">{t(`usage.limit.${l.key}`)}</p>
                    <p className="text-xs text-muted-foreground shrink-0">
                      {!included
                        ? t("usage.notIncluded")
                        : l.period === "request"
                          ? (l.max == null ? t("usage.unlimited") : t("usage.perRequest", { max: fmt(l.max) }))
                          : l.max == null
                            ? t(`usage.usedUnlimited_${l.period}`, { used: fmt(l.used ?? 0) })
                            : t(`usage.usedOf_${l.period}`, { used: fmt(l.used ?? 0), max: fmt(l.max) })}
                    </p>
                  </div>
                  {l.max != null && l.max > 0 && l.period !== "request" && (
                    <div className="mt-2 h-1 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-foreground/70" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!summary.enforced && summary.plan !== "owner" && (
            <p className="text-xs text-muted-foreground leading-relaxed">{t("usage.observeNote")}</p>
          )}
        </div>
      )}
    </div>
  );
}
