import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/telemetry-client";
import { newsText, nextNews, type FeatureNews } from "@/lib/feature-news";
import type { Screen } from "./AuraApp";

const GUIDE_ARTICLE_KEY = "aura.guideArticle";

/** «Novità» (feature-news.ts): on Home, once per app start, the newest feature this person hasn't
 *  used yet and hasn't been told about. Told once per account (user_metadata.news_seen). */
export function FeatureNewsSheet({ user, screen, go }: {
  user: { id: string; created_at?: string; user_metadata?: Record<string, unknown> };
  screen: Screen;
  go: (s: Screen) => void;
}) {
  const { i18n } = useTranslation();
  const [news, setNews] = useState<FeatureNews | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (screen !== "home" || checkedRef.current) return;
    checkedRef.current = true;
    const told = new Set(Array.isArray(user.user_metadata?.news_seen) ? (user.user_metadata!.news_seen as string[]) : []);
    // Nothing to tell an account created after the newest feature: the tour covers it.
    if (!nextNews({ signedUpAt: user.created_at, told, used: new Set() })) return;
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        const [wish, compare] = await Promise.all([
          supabase.from("wishlist_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
          supabase.from("ai_usage_ledger").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("feature", "advisor_compare"),
        ]);
        const used = new Set<string>();
        if ((wish.count ?? 0) > 0) used.add("wishlist");
        if ((compare.count ?? 0) > 0) used.add("compare");
        const n = nextNews({ signedUpAt: user.created_at, told, used });
        if (alive && n) { setNews(n); track("flow_step", { feature: "news", step: `shown_${n.id}` }); }
      })().catch(() => { /* told another time */ });
    }, 1500);
    return () => { alive = false; clearTimeout(timer); };
  }, [screen, user]);

  if (!news) return null;
  const tx = newsText(i18n.language, news.id);

  const close = (step: "try" | "guide" | "dismiss") => {
    track("flow_step", { feature: "news", step: `${step}_${news.id}` });
    const seen = Array.isArray(user.user_metadata?.news_seen) ? (user.user_metadata!.news_seen as string[]) : [];
    void supabase.auth.updateUser({ data: { news_seen: [...new Set([...seen, news.id])] } });
    setNews(null);
    if (step === "try") go(news.open);
    if (step === "guide") {
      try { sessionStorage.setItem(GUIDE_ARTICLE_KEY, news.guide); } catch { /* the guide opens on its index */ }
      go("settings-guide");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[88] bg-background/80 backdrop-blur flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md bg-card rounded-t-3xl border-t sm:border-x border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <button onClick={() => close("dismiss")} aria-label="✕"
          className="absolute top-4 right-4 h-8 w-8 rounded-full border border-border bg-background flex items-center justify-center"><X size={14} /></button>
        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center"><Sparkles size={17} /></div>
        <p className="mt-3 font-serif italic text-xl leading-tight pr-10">{tx.title}</p>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{tx.body}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={() => close("guide")}
            className="h-12 rounded-full border border-border text-[10px] uppercase tracking-[0.2em]">{i18n.t("featureNews.howTo")}</button>
          <button onClick={() => close("try")}
            className="h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.2em]">{i18n.t("featureNews.tryIt")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Reads and clears the guide article asked for by a «Novità» card. */
export function takeGuideArticle(): string | null {
  try {
    const id = sessionStorage.getItem(GUIDE_ARTICLE_KEY);
    if (id) sessionStorage.removeItem(GUIDE_ARTICLE_KEY);
    return id;
  } catch {
    return null;
  }
}
