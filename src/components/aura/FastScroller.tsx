import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp } from "lucide-react";

/** A rail on the right edge for long lists (the closet with hundreds of pieces): drag the handle,
 *  or tap anywhere on the rail, to jump straight to that point of the list; the arrow on top goes
 *  back to the beginning. Shown only when the list is at least three screens long. `contentKey`
 *  changes whenever the list does (filters, a different view), so the length is measured again. */
export function FastScroller({ target, contentKey }: { target: RefObject<HTMLElement | null>; contentKey: unknown }) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ visible: false, progress: 0, scrolled: false });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      setState({
        visible: max > el.clientHeight * 2,
        progress: max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0,
        scrolled: el.scrollTop > el.clientHeight,
      });
    };
    update();
    // Pictures arriving change the list's height without any scroll: measure again.
    const ro = new ResizeObserver(update);
    Array.from(el.children).forEach((c) => ro.observe(c));
    el.addEventListener("scroll", update, { passive: true });
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [target, contentKey]);

  const jumpTo = (clientY: number) => {
    const el = target.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const r = track.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    el.scrollTop = p * (el.scrollHeight - el.clientHeight);
  };

  if (!state.visible) return null;
  return (
    <div className="fixed right-0.5 z-30 flex flex-col items-center gap-2 top-[calc(env(safe-area-inset-top)+9rem)] bottom-[calc(env(safe-area-inset-bottom)+7.5rem)]">
      <button
        onClick={() => target.current?.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label={t("wardrobe.backToTopAria")}
        className={`h-8 w-8 shrink-0 rounded-full bg-card/90 border border-border shadow-sm flex items-center justify-center transition-opacity ${state.scrolled ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <ArrowUp size={14} />
      </button>
      <div
        ref={trackRef}
        role="scrollbar"
        aria-orientation="vertical"
        aria-label={t("wardrobe.fastScrollAria")}
        aria-valuenow={Math.round(state.progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative flex-1 w-6 touch-none cursor-pointer"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); jumpTo(e.clientY); }}
        onPointerMove={(e) => { if (dragging) jumpTo(e.clientY); }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[3px] rounded-full bg-foreground/10" />
        <div
          className={`absolute left-1/2 -translate-x-1/2 h-12 rounded-full bg-foreground/55 transition-[width] ${dragging ? "w-2.5" : "w-1.5"}`}
          style={{ top: `calc(${state.progress} * (100% - 3rem))` }}
        />
      </div>
    </div>
  );
}
