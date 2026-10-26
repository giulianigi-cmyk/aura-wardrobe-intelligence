import { useId } from "react";
import type { FoldDiagramKind } from "@/lib/storage-tips";

/** Step-by-step line drawings for the "how to fold" tips of the cambio stagione: three panels per
 *  garment (laid flat with the fold lines, sides folded to the centre, folded or rolled up).
 *  Drawn in currentColor so they follow light and dark mode; the same in every language. */

type Panel = { shape: string; extra?: string; folds?: string; arrows?: string[] };

const DIAGRAMS: Record<FoldDiagramKind, Panel[]> = {
  sweater: [
    {
      shape: "M35 18 L45 14 Q50 18 55 14 L65 18 L65 78 L35 78 Z M35 18 L13 52 L21 57 L35 36 M65 18 L87 52 L79 57 L65 36",
      folds: "M42 15 V78 M58 15 V78",
      arrows: ["M17 44 Q26 30 39 34", "M83 44 Q74 30 61 34"],
    },
    {
      shape: "M42 16 L58 16 L58 78 L42 78 Z M46 17 Q50 20 54 17",
      extra: "M46 24 V62 M54 24 V62",
      folds: "M39 37 H61 M39 57 H61",
      arrows: ["M63 72 Q74 60 63 47"],
    },
    {
      shape: "M34 34 L62 34 L62 70 L34 70 Z",
      extra: "M37 30 H66 V66 M40 26 H70 V62",
    },
  ],
  shirt: [
    {
      shape: "M35 18 L44 14 L50 20 L56 14 L65 18 L65 78 L35 78 Z M44 14 L47 23 L50 20 L53 23 L56 14 M35 18 L12 64 L20 67 L35 38 M65 18 L88 64 L80 67 L65 38",
      extra: "M50 20 V78",
      folds: "M42 15 V78 M58 15 V78",
      arrows: ["M16 50 Q26 32 39 36", "M84 50 Q74 32 61 36"],
    },
    {
      shape: "M42 16 L58 16 L58 78 L42 78 Z M44 16 L47 23 L50 20 L53 23 L56 16",
      extra: "M50 20 V78",
      folds: "M39 37 H61 M39 57 H61",
      arrows: ["M63 72 Q74 60 63 47"],
    },
    {
      shape: "M34 28 L66 28 L66 72 L34 72 Z M38 28 L44 40 L50 35 L56 40 L62 28",
      extra: "M50 35 V72",
    },
  ],
  trousers: [
    {
      shape: "M30 12 L70 12 L70 18 L30 18 Z M30 18 L26 80 L46 80 L50 34 L54 80 L74 80 L70 18",
      folds: "M50 10 V82",
      arrows: ["M66 56 Q58 42 44 50"],
    },
    {
      shape: "M30 12 L50 12 L50 18 L54 80 L26 80 L30 18 Z M30 18 H50",
      folds: "M22 46 H58",
      arrows: ["M57 74 Q68 62 57 50"],
    },
    {
      shape: "M28 12 L52 12 L52 46 L28 46 Z M28 18 H52",
      extra: "M30 48.5 H54 V14.5",
    },
  ],
  roll: [
    {
      shape: "M35 22 L44 18 Q50 22 56 18 L65 22 L65 74 L35 74 Z M35 22 L20 34 L26 42 L35 34 M65 22 L80 34 L74 42 L65 34",
      folds: "M42 19 V74 M58 19 V74",
      arrows: ["M22 30 Q30 22 39 28", "M78 30 Q70 22 61 28"],
    },
    {
      shape: "M42 18 L58 18 L58 74 L42 74 Z M46 19 Q50 22 54 19",
      arrows: ["M62 74 Q70 70 66 62 Q62 56 58 60"],
    },
    {
      shape: "M50 30 A18 18 0 1 1 49.9 30 Z",
      extra: "M50 48 m0 -5 a5 5 0 1 1 -5 5 a10 10 0 1 0 10 -10 a14 14 0 0 0 -14 -1",
    },
  ],
};

export function FoldingDiagram({ kind, label }: { kind: FoldDiagramKind; label: string }) {
  const markerId = `fold-arrow-${useId().replace(/:/g, "")}`;
  const panels = DIAGRAMS[kind];
  return (
    <div role="img" aria-label={label} className="mt-2 grid grid-cols-3 gap-2 text-foreground">
      {panels.map((p, i) => (
        <div key={i} className="rounded-xl bg-secondary/40 pt-1 pb-1.5 flex flex-col items-center">
          <svg viewBox="0 0 100 90" className="w-full h-auto" aria-hidden="true">
            <defs>
              <marker id={`${markerId}-${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 Z" fill="currentColor" />
              </marker>
            </defs>
            <path d={p.shape} fill="currentColor" fillOpacity={0.06} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
            {p.extra && <path d={p.extra} fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />}
            {p.folds && <path d={p.folds} fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.1} strokeDasharray="3 3" />}
            {p.arrows?.map((d) => <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth={1.4} markerEnd={`url(#${markerId}-${i})`} />)}
          </svg>
          <span className="text-[10px] text-muted-foreground tabular-nums">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
