import { useId } from "react";
import type { FoldDiagramKind } from "@/lib/storage-tips";

/** Step-by-step line drawings at the end of the cambio stagione tips: three panels per
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
  jacket: [
    {
      shape: "M32 16 L44 12 L50 38 L56 12 L68 16 L68 80 L32 80 Z M44 12 L46 26 L50 38 M56 12 L54 26 L50 38 M32 16 L20 70 L27 72 L33 36 M68 16 L80 70 L73 72 L67 36",
      extra: "M50 38 V80",
      arrows: ["M74 22 Q52 2 32 20"],
    },
    {
      shape: "M36 14 L58 14 L60 80 L38 80 Z M58 14 L52 30",
      folds: "M30 47 H66",
      arrows: ["M64 74 Q74 62 64 50"],
    },
    {
      shape: "M34 30 L62 30 L62 64 L34 64 Z",
      extra: "M37 26 H66 V60",
    },
  ],
  socks: [
    {
      shape: "M38 10 L54 10 L54 54 Q54 64 64 66 L74 68 Q82 71 79 78 L48 78 Q38 78 38 66 Z",
      extra: "M42 13 L58 13 L58 52 Q58 62 68 64 L77 66",
      folds: "M32 42 H62",
      arrows: ["M30 72 Q20 58 32 46"],
    },
    {
      shape: "M36 30 L60 30 L60 66 L36 66 Z",
      extra: "M36 38 H60",
      arrows: ["M64 64 Q74 50 64 38"],
    },
    {
      shape: "M34 36 L62 36 L62 62 L34 62 Z",
      extra: "M34 44 H62",
    },
  ],
  briefs: [
    {
      shape: "M26 24 L74 24 L70 36 Q56 42 54 66 L46 66 Q44 42 30 36 Z M27 29 H73",
      folds: "M40 22 V66 M60 22 V66",
      arrows: ["M20 30 Q24 20 36 26", "M80 30 Q76 20 64 26"],
    },
    {
      shape: "M40 24 L60 24 L58 40 L55 66 L45 66 L42 40 Z M40 29 H60",
      folds: "M34 46 H66",
      arrows: ["M62 62 Q72 52 62 44"],
    },
    {
      shape: "M38 30 L62 30 L62 52 L38 52 Z M38 35 H62",
    },
  ],
  boxers: [
    {
      shape: "M28 18 L72 18 L72 25 L28 25 Z M28 25 L25 66 L47 66 L50 46 L53 66 L75 66 L72 25",
      folds: "M50 14 V70",
      arrows: ["M66 50 Q58 38 42 44"],
    },
    {
      shape: "M28 18 L50 18 L50 25 L52 66 L25 66 L28 25 Z M28 25 H50",
      folds: "M20 42 H58",
      arrows: ["M56 62 Q66 52 56 44"],
    },
    {
      shape: "M28 22 L52 22 L52 46 L28 46 Z M28 29 H52",
    },
  ],
  bra: [
    {
      shape: "M10 52 H90 V58 H10 Z M22 52 Q22 28 46 30 L50 52 M50 52 L54 30 Q78 28 78 52 M30 33 L36 10 M70 33 L64 10",
      arrows: ["M74 40 Q62 20 40 36"],
    },
    {
      shape: "M28 56 Q28 28 54 30 L58 56 Z M58 56 H84 V61 H58",
      extra: "M33 54 Q34 34 54 35 M40 32 L46 14 M50 30 L56 14",
      arrows: ["M80 66 Q70 74 54 62"],
    },
    {
      shape: "M30 58 Q30 30 56 32 L60 58 Z",
      extra: "M35 56 Q36 36 56 37 M40 52 Q46 46 54 50",
    },
  ],
};

export function FoldingDiagram({ kind, label, steps }: { kind: FoldDiagramKind; label: string; steps?: readonly string[] }) {
  const markerId = `fold-arrow-${useId().replace(/:/g, "")}`;
  const panels = DIAGRAMS[kind];
  return (
    <div role="img" aria-label={label} className="mt-2 grid grid-cols-3 gap-2 text-foreground">
      {panels.map((p, i) => (
        <div key={i} className="rounded-xl bg-secondary/40 pt-1 pb-2.5 flex flex-col items-center">
          <svg viewBox="0 0 100 90" className="w-full h-auto" aria-hidden="true">
            <defs>
              <marker id={`${markerId}-${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 Z" fill="currentColor" />
              </marker>
            </defs>
            <path d={p.shape} fill="currentColor" fillOpacity={0.04} stroke="currentColor" strokeOpacity={0.7} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            {p.extra && <path d={p.extra} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
            {p.folds && <path d={p.folds} fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={0.75} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />}
            {p.arrows?.map((d) => <path key={d} d={d} fill="none" stroke="currentColor" strokeOpacity={0.8} strokeWidth={1} vectorEffect="non-scaling-stroke" markerEnd={`url(#${markerId}-${i})`} />)}
          </svg>
          <span className="self-stretch px-2 mt-0.5 text-left text-[13px] leading-snug text-foreground/80">
            <span className="tabular-nums">{i + 1}</span>{steps?.[i] ? `. ${steps[i]}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
