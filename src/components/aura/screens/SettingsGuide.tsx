import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronDown, Compass, Lightbulb, Loader2, Search } from "lucide-react";
import type { Screen } from "../AuraApp";
import { GuideVisual } from "../GuideVisual";
import { GUIDE, GUIDE_LANGUAGES, guideTextLoaders, searchGuide, type GuideArticleDef, type GuideLanguage, type GuideText } from "@/lib/guide/guide-structure";
import { track } from "@/lib/telemetry-client";

function guideLanguage(lang: string): GuideLanguage {
  const base = lang.slice(0, 2) as GuideLanguage;
  return (GUIDE_LANGUAGES as readonly string[]).includes(base) ? base : "en";
}

/** Settings › Guida di AURA: the user manual, chapter by chapter, in the app's language. */
export function SettingsGuide({ go, replayTour }: { go: (s: Screen) => void; replayTour: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = guideLanguage(i18n.language);
  const [text, setText] = useState<GuideText | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    guideTextLoaders[lang]()
      .then((m) => { if (!cancelled) setText(m.default); })
      .catch((e) => { if (!cancelled) { setFailed(true); console.warn("[AURA guide] text failed to load", e); } });
    return () => { cancelled = true; };
  }, [lang]);

  const results = useMemo(() => (text && query.trim() ? searchGuide(text, query) : null), [text, query]);
  const articleById = useMemo(() => new Map(GUIDE.flatMap((c) => c.articles).map((a) => [a.id, a])), []);

  const toggle = (id: string) => {
    setOpenId((cur) => (cur === id ? null : id));
    if (openId !== id) track("flow_step", { feature: "guide", step: id.replace(/[^a-z0-9_-]/g, "") });
  };

  const article = (def: GuideArticleDef, forceOpen = false) => {
    const a = text?.articles[def.id];
    if (!a || !text) return null;
    const isOpen = forceOpen || openId === def.id;
    return (
      <div key={def.id} className="border-b border-border last:border-b-0">
        <button
          onClick={() => !forceOpen && toggle(def.id)}
          aria-expanded={isOpen}
          className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-secondary/40 transition"
        >
          <span className="text-sm">{a.title}</span>
          {!forceOpen && <ChevronDown size={15} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />}
        </button>
        {isOpen && (
          <div className="px-4 pb-5 animate-fade-in">
            {a.intro && <p className="text-sm text-muted-foreground leading-relaxed">{a.intro}</p>}
            <ol className="mt-3 space-y-4">
              {a.steps.map((s, idx) => {
                const v = def.visuals[idx];
                return (
                  <li key={idx}>
                    <div className="flex gap-3">
                      <span className="h-6 w-6 rounded-full bg-foreground text-background text-[11px] flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</span>
                      <p className="min-w-0 flex-1 text-sm leading-relaxed">{s}</p>
                    </div>
                    {/* Full width under the step: the drawn bottom bar needs the room. */}
                    {v && <GuideVisual visual={v} />}
                  </li>
                );
              })}
            </ol>
            {a.tip && (
              <p className="mt-4 flex gap-2 rounded-2xl bg-[var(--champagne)]/20 border border-[var(--champagne)]/40 px-3.5 py-3 text-xs leading-relaxed">
                <Lightbulb size={14} className="shrink-0 mt-0.5" /> <span>{a.tip}</span>
              </p>
            )}
            {def.open && (
              <button
                onClick={() => { track("flow_step", { feature: "guide", step: "open" }); go(def.open!); }}
                className="mt-4 h-11 px-6 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-95"
              >
                {text.open}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28 bg-background">
      <header className="px-6 pt-14 pb-2 flex items-center justify-between">
        <button onClick={() => go("settings")} aria-label={t("addSourceSheet.backAria")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={15} />
        </button>
        <p className="font-serif text-lg italic">{text?.title ?? t("guide.settingsRow")}</p>
        <span className="w-10" />
      </header>

      {!text ? (
        <div className="px-6 pt-16 flex justify-center text-sm text-muted-foreground">
          {failed ? t("guide.loadFailed") : <Loader2 className="animate-spin" />}
        </div>
      ) : (
        <>
          <p className="px-6 mt-2 text-sm text-muted-foreground leading-relaxed">{text.intro}</p>

          <div className="px-6 mt-4">
            <button
              onClick={() => { track("flow_step", { feature: "guide", step: "replay_tour" }); replayTour(); }}
              className="w-full h-12 rounded-full border border-border flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] active:scale-[0.98]"
            >
              <Compass size={14} /> {text.replayTour}
            </button>
          </div>

          <div className="px-6 mt-4">
            <label className="flex items-center gap-2 rounded-full bg-secondary/60 px-4 h-11">
              <Search size={15} className="text-muted-foreground shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={text.searchPlaceholder}
                type="search"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </label>
          </div>

          {results ? (
            <div className="mx-6 mt-4 rounded-[20px] bg-card border border-border overflow-hidden">
              {results.length
                ? results.map((id) => article(articleById.get(id)!, false))
                : <p className="px-4 py-6 text-sm text-muted-foreground text-center">{text.noResults}</p>}
            </div>
          ) : (
            GUIDE.map((chapter) => (
              <section key={chapter.id} aria-labelledby={`guide-${chapter.id}`}>
                <h2 id={`guide-${chapter.id}`} className="px-6 pt-5 pb-1.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  {text.chapters[chapter.id]}
                </h2>
                <div className="mx-6 rounded-[20px] bg-card border border-border overflow-hidden">
                  {chapter.articles.map((def) => article(def))}
                </div>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
