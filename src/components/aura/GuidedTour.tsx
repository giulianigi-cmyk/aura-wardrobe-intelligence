import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { TOUR_STEPS, cardPlacement } from "@/lib/guided-tour";
import { track } from "@/lib/telemetry-client";

type Rect = { top: number; left: number; width: number; height: number };

/** The guided tour (guided-tour.ts): the element of each stop is highlighted, everything else is
 *  dimmed, and a card explains it. Positions are measured against `container` (the app's frame),
 *  so the tour lines up both edge to edge on a phone and inside the desktop phone frame. */
export function GuidedTour({ container, onClose }: { container: RefObject<HTMLElement | null>; onClose: () => void }) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [height, setHeight] = useState(0);
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;

  const measure = useCallback(() => {
    const root = container.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    setHeight(box.height);
    // Only a visible element counts: hidden tabs keep their markup mounted (display: none → 0×0).
    const el = Array.from(root.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`))
      .find((e) => e.getBoundingClientRect().width > 0);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - box.top, left: r.left - box.left, width: r.width, height: r.height });
  }, [container, step.target]);

  // A stop below the fold (Primi passi on Home) is scrolled into view first, then measured.
  // Done again on the next frame: when the tour mounts in the same render as the frame, the frame's
  // ref is attached only after this effect runs.
  useLayoutEffect(() => {
    const locate = () => {
      const el = Array.from(container.current?.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`) ?? [])
        .find((e) => e.getBoundingClientRect().width > 0);
      // Only the screen's own scrolling list moves (scrollIntoView could also shift the app frame).
      const scroller = el?.closest<HTMLElement>(".overflow-y-auto");
      if (el && scroller) {
        const r = el.getBoundingClientRect();
        const box = scroller.getBoundingClientRect();
        scroller.scrollTop += r.top - box.top - Math.max(0, (box.height - r.height) / 3);
      }
      measure();
    };
    locate();
    const frame = requestAnimationFrame(locate);
    return () => cancelAnimationFrame(frame);
  }, [container, step.target, measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const finish = (outcome: "ok" | "cancelled") => {
    track("flow_step", { feature: "tour", step: outcome === "ok" ? "done" : `skip_${step.id}`, outcome });
    onClose();
  };

  const pad = 6;
  const placement = cardPlacement(rect, height);
  const cardStyle: React.CSSProperties =
    placement === "above" && rect ? { bottom: height - rect.top + 14 }
    : placement === "below" && rect ? { top: rect.top + rect.height + 14 }
    : { top: "50%", transform: "translateY(-50%)" };

  return (
    <div className="absolute inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          className="absolute rounded-2xl pointer-events-none transition-all duration-300"
          style={{
            top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(20, 16, 12, 0.62)",
            outline: "2px solid rgba(255,255,255,0.9)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(20,16,12,0.62)]" />
      )}

      <div className="absolute left-4 right-4 rounded-3xl bg-card border border-border p-5 shadow-luxe animate-fade-up" style={cardStyle}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {t("tour.stepOf", { current: i + 1, total: TOUR_STEPS.length })}
          </p>
          <button onClick={() => finish("cancelled")} aria-label={t("tour.skip")} className="-mt-1 -mr-1 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground active:scale-90">
            <X size={15} />
          </button>
        </div>
        <h2 id="tour-title" className="font-serif text-xl italic mt-1">{t(`tour.steps.${step.id}.title`)}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{t(`tour.steps.${step.id}.body`)}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {TOUR_STEPS.map((s, idx) => (
              <span key={s.id} className={`h-1 rounded-full transition-all ${idx === i ? "w-6 bg-foreground" : "w-1 bg-foreground/25"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="h-10 px-4 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] active:scale-95">
                {t("tour.back")}
              </button>
            )}
            <button
              onClick={() => (last ? finish("ok") : setI(i + 1))}
              className="h-10 px-5 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.2em] active:scale-95"
            >
              {last ? t("tour.done") : t("tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
