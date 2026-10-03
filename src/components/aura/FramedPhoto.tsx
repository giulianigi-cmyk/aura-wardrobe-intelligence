import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useSheetCanClose } from "@/hooks/use-sheet-can-close";
import { clampFraming, fittedSize, FIT_FRAMING, MAX_SCALE, type PhotoFraming } from "@/lib/photo-framing";

/** A My Outfit photo in its 4:5 frame, fitted (never cropped by default, never distorted) and then
 *  zoomed/panned by the person's own framing. */
export function FramedPhoto({ src, framing, className = "" }: { src: string; framing?: PhotoFraming | null; className?: string }) {
  const [aspect, setAspect] = useState<number | null>(null);
  const f = aspect ? clampFraming(framing ?? FIT_FRAMING, aspect) : FIT_FRAMING;
  const size = aspect ? fittedSize(aspect) : { w: 1, h: 1 };
  return (
    <div className={`relative w-full aspect-[4/5] overflow-hidden bg-secondary/40 ${className}`}>
      <img
        src={src}
        alt=""
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight);
        }}
        className="absolute max-w-none select-none pointer-events-none"
        style={{
          left: `${50 + f.x * 100}%`,
          top: `${50 + f.y * 100}%`,
          width: `${size.w * f.scale * 100}%`,
          height: `${size.h * f.scale * 100}%`,
          transform: "translate(-50%, -50%)",
          objectFit: "contain",
        }}
      />
    </div>
  );
}

/** Manual framing: drag to move, pinch / slider / wheel to zoom, in the real 4:5 frame. "Adatta alla
 *  foto" shows the whole photo, "Centra" re-centres it at the current zoom. */
export function PhotoFramingEditor({
  src, initial, onCancel, onConfirm,
}: {
  src: string;
  initial: PhotoFraming | null;
  onCancel: () => void;
  onConfirm: (f: PhotoFraming) => void;
}) {
  const { t } = useTranslation();
  const canClose = useSheetCanClose(true);
  const [aspect, setAspect] = useState<number | null>(null);
  const [framing, setFraming] = useState<PhotoFraming>(initial ?? FIT_FRAMING);
  const frameRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: PhotoFraming; cx: number; cy: number; dist: number } | null>(null);

  const set = (f: PhotoFraming) => setFraming(aspect ? clampFraming(f, aspect) : f);

  const snapshot = () => {
    const pts = [...pointers.current.values()];
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    return { cx, cy, dist };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { start: framing, ...snapshot() };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current || !frameRef.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = frameRef.current.getBoundingClientRect();
    const now = snapshot();
    const g = gesture.current;
    const scale = g.dist > 0 && now.dist > 0 ? g.start.scale * (now.dist / g.dist) : g.start.scale;
    set({ scale, x: g.start.x + (now.cx - g.cx) / rect.width, y: g.start.y + (now.cy - g.cy) / rect.height });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    gesture.current = pointers.current.size ? { start: framing, ...snapshot() } : null;
  };

  const size = aspect ? fittedSize(aspect) : { w: 1, h: 1 };
  const f = aspect ? clampFraming(framing, aspect) : framing;

  return (
    <div className="fixed inset-0 z-[60] bg-background/90 backdrop-blur flex items-end sm:items-center justify-center" onClick={() => { if (canClose) onCancel(); }}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <p className="font-serif italic text-lg">{t("photoFraming.title")}</p>
          <button onClick={onCancel} aria-label={t("photoFraming.cancel")} className="h-9 w-9 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90"><X size={16} /></button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("photoFraming.hint")}</p>

        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => set({ ...f, scale: f.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08) })}
          className="relative mt-3 mx-auto w-full max-w-[320px] aspect-[4/5] overflow-hidden rounded-xl bg-secondary/40 touch-none cursor-grab active:cursor-grabbing"
        >
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                const a = img.naturalWidth / img.naturalHeight;
                setAspect(a);
                setFraming((cur) => clampFraming(cur, a));
              }
            }}
            className="absolute max-w-none select-none pointer-events-none"
            style={{
              left: `${50 + f.x * 100}%`,
              top: `${50 + f.y * 100}%`,
              width: `${size.w * f.scale * 100}%`,
              height: `${size.h * f.scale * 100}%`,
              transform: "translate(-50%, -50%)",
              objectFit: "contain",
            }}
          />
          <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-foreground/20 pointer-events-none" />
        </div>

        <input
          type="range"
          min={1}
          max={MAX_SCALE}
          step={0.01}
          value={f.scale}
          onChange={(e) => set({ ...f, scale: Number(e.target.value) })}
          aria-label={t("photoFraming.zoom")}
          className="mt-4 w-full accent-foreground"
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => set(FIT_FRAMING)} className="h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] active:scale-[0.98]">{t("photoFraming.fit")}</button>
          <button onClick={() => set({ ...f, x: 0, y: 0 })} className="h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] active:scale-[0.98]">{t("photoFraming.center")}</button>
          <button onClick={onCancel} className="h-11 rounded-full bg-secondary/60 text-[10px] uppercase tracking-[0.3em] active:scale-[0.98]">{t("photoFraming.cancel")}</button>
          <button onClick={() => onConfirm(f)} className="h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98]">{t("photoFraming.confirm")}</button>
        </div>
      </div>
    </div>
  );
}
