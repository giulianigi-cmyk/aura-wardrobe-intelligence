import { useTranslation } from "react-i18next";
import {
  BarChart3, Calendar, Camera, Check, ChevronRight, Home, Images, Link, Luggage, MapPin, Mic, Palette,
  Plus, Pointer, QrCode, Settings, Share2, Shirt, Sparkles, User, type LucideIcon,
} from "lucide-react";
import type { GuideIcon, GuideTab, GuideVisual as Visual } from "@/lib/guide/guide-structure";

const ICONS: Record<GuideIcon, LucideIcon> = {
  plus: Plus, images: Images, camera: Camera, link: Link, sparkles: Sparkles, calendar: Calendar,
  luggage: Luggage, settings: Settings, mic: Mic, share: Share2, check: Check, palette: Palette,
  user: User, shirt: Shirt, home: Home, pin: MapPin, chart: BarChart3, qr: QrCode,
};

// Same order, icons and labels as TabBar.tsx.
const TABS: { id: GuideTab; labelKey: string; Icon: LucideIcon }[] = [
  { id: "home", labelKey: "tabBar.home", Icon: Home },
  { id: "wardrobe", labelKey: "tabBar.closet", Icon: Shirt },
  { id: "ai", labelKey: "tabBar.stylist", Icon: Sparkles },
  { id: "planner", labelKey: "tabBar.calendar", Icon: Calendar },
  { id: "profile", labelKey: "tabBar.you", Icon: User },
];

/** The finger that marks what to tap. */
function Tap() {
  return <Pointer size={16} className="absolute -bottom-2 -right-1 text-foreground drop-shadow fill-background" aria-hidden />;
}

/** A piece of the app drawn as it looks on screen (guide-structure.ts), with the element to tap
 *  highlighted. Purely an illustration: nothing in it can be tapped. */
export function GuideVisual({ visual }: { visual: Visual }) {
  const { t } = useTranslation();
  const ring = "ring-2 ring-[var(--champagne)] ring-offset-2 ring-offset-secondary";

  const body = (() => {
    switch (visual.kind) {
      case "tab":
        return (
          <div className="w-full rounded-2xl bg-background border border-border/60 grid grid-cols-5 p-1">
            {TABS.map(({ id, labelKey, Icon }) => {
              const on = id === visual.tab;
              return (
                <span key={id} className={`relative min-w-0 flex flex-col items-center gap-1 px-0.5 py-1 rounded-xl ${on ? ring : ""}`}>
                  <Icon size={16} strokeWidth={on ? 2 : 1.4} className={on ? "text-foreground" : "text-muted-foreground"} />
                  <span className={`max-w-full truncate text-[9px] ${on ? "text-foreground font-medium" : "text-muted-foreground"}`}>{t(labelKey)}</span>
                  {on && <Tap />}
                </span>
              );
            })}
          </div>
        );
      case "button": {
        const Icon = visual.icon ? ICONS[visual.icon] : null;
        return (
          <span className={`relative inline-flex h-10 px-5 rounded-full items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.2em] ${ring} ${visual.variant === "solid" ? "bg-foreground text-background" : "border border-foreground/70 bg-background text-foreground"}`}>
            {Icon && <Icon size={13} />}{t(visual.labelKey)}
            <Tap />
          </span>
        );
      }
      case "round": {
        const Icon = ICONS[visual.icon];
        return (
          <span className="inline-flex items-center gap-3">
            <span className={`relative h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${ring} ${visual.dark ? "bg-foreground text-background" : "border border-border bg-background"}`}>
              <Icon size={visual.dark ? 19 : 16} />
              <Tap />
            </span>
            <span className="text-xs text-muted-foreground">{t(visual.labelKey)}</span>
          </span>
        );
      }
      case "option": {
        const Icon = ICONS[visual.icon];
        return (
          <span className={`relative w-full flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left ${ring}`}>
            <Icon size={17} className="shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t(visual.labelKey)}</span>
              {visual.hintKey && <span className="block text-xs text-muted-foreground">{t(visual.hintKey)}</span>}
            </span>
            <Tap />
          </span>
        );
      }
      case "row":
        return (
          <span className={`relative w-full flex items-center justify-between rounded-2xl bg-card border border-border px-4 py-3 text-left ${ring}`}>
            <span className="min-w-0">
              <span className="block text-sm">{t(visual.labelKey)}</span>
              {visual.subKey && <span className="block text-[11px] text-muted-foreground mt-0.5 truncate">{t(visual.subKey)}</span>}
            </span>
            <ChevronRight size={15} className="text-muted-foreground shrink-0 ml-2" />
            <Tap />
          </span>
        );
      case "chips":
        return (
          <span className="flex flex-wrap gap-1.5">
            {visual.labelKeys.map((k) => (
              <span key={k} className="rounded-full px-3 py-1.5 text-xs bg-background border border-border">{t(k)}</span>
            ))}
          </span>
        );
    }
  })();

  return (
    <div className="mt-2 rounded-2xl bg-secondary/50 px-3 py-3.5 flex" aria-hidden>
      {body}
    </div>
  );
}
