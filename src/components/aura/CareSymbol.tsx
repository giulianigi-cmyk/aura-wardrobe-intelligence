import type { CareSymbolKind } from "@/lib/laundry-care";

/** Care-label symbols drawn as thin line icons (the ISO 3758 shapes: tub, triangle, square, iron, circle). */
const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" } as const;

const Cross = () => <path {...STROKE} d="M5 5 L35 35 M35 5 L5 35" />;
const Dots = ({ n, y, cx = 20 }: { n: number; y: number; cx?: number }) => (
  <>{Array.from({ length: n }, (_, i) => <circle key={i} cx={cx + (i - (n - 1) / 2) * 5} cy={y} r={1.3} fill="currentColor" />)}</>
);

function Tub({ temp, bars = 0, hand = false }: { temp?: string; bars?: number; hand?: boolean }) {
  return (
    <>
      <path {...STROKE} d="M5 12 L9 31 H31 L35 12" />
      <path {...STROKE} d="M5 12 Q8.75 9 12.5 12 T20 12 T27.5 12 T35 12" />
      {temp && <text x="20" y="26.5" textAnchor="middle" fontSize="10" fill="currentColor" fontFamily="system-ui, sans-serif">{temp}</text>}
      {hand && <path {...STROKE} d="M14 27 V20 M17 26 V17.5 M20 26 V17 M23 26 V18 M14 27 Q15 30 20 30 Q26 30 26 25 L28 21" />}
      {bars >= 1 && <path {...STROKE} d="M8 34.5 H32" />}
      {bars >= 2 && <path {...STROKE} d="M8 37.5 H32" />}
    </>
  );
}

const Triangle = () => <path {...STROKE} d="M20 6 L35 33 H5 Z" />;
const Square = () => <rect {...STROKE} x="6" y="6" width="28" height="28" />;
const Iron = () => <path {...STROKE} d="M6 31 H34 L32.5 21 Q31.5 15 25 15 H13 Q8.5 15 7.5 21 Z M14 15 Q14 10 19 10 H27" />;
const Circle = () => <circle {...STROKE} cx="20" cy="20" r="13" />;

function draw(kind: CareSymbolKind) {
  switch (kind) {
    case "wash-30": return <Tub temp="30" />;
    case "wash-40": return <Tub temp="40" />;
    case "wash-60": return <Tub temp="60" />;
    case "wash-30-gentle": return <Tub temp="30" bars={1} />;
    case "wash-40-gentle": return <Tub temp="40" bars={1} />;
    case "wash-30-very-gentle": return <Tub temp="30" bars={2} />;
    case "wash-hand": return <Tub hand />;
    case "wash-no": return <><Tub /><Cross /></>;
    case "bleach-any": return <Triangle />;
    case "bleach-oxygen": return <><Triangle /><path {...STROKE} d="M16 29 L21 17 M20 29 L25 17" /></>;
    case "bleach-no": return <><Triangle /><Cross /></>;
    case "tumble-normal": return <><Square /><circle {...STROKE} cx="20" cy="20" r="10" /><Dots n={2} y={20} /></>;
    case "tumble-low": return <><Square /><circle {...STROKE} cx="20" cy="20" r="10" /><Dots n={1} y={20} /></>;
    case "tumble-no": return <><Square /><circle {...STROKE} cx="20" cy="20" r="10" /><Cross /></>;
    case "dry-line": return <><Square /><path {...STROKE} d="M6 12 Q20 22 34 12" /></>;
    case "dry-flat": return <><Square /><path {...STROKE} d="M11 20 H29" /></>;
    case "dry-drip": return <><Square /><path {...STROKE} d="M14 11 V29 M20 11 V29 M26 11 V29" /></>;
    case "dry-shade": return <><Square /><path {...STROKE} d="M6 15 L15 6 M6 21 L21 6" /></>;
    case "iron-3": return <><Iron /><Dots n={3} y={24} /></>;
    case "iron-2": return <><Iron /><Dots n={2} y={24} /></>;
    case "iron-1": return <><Iron /><Dots n={1} y={24} /></>;
    case "iron-no": return <><Iron /><Cross /></>;
    case "dryclean-P":
    case "dryclean-F":
    case "dryclean-W":
      return <><Circle /><text x="20" y="24.5" textAnchor="middle" fontSize="12" fill="currentColor" fontFamily="system-ui, sans-serif">{kind.slice(-1)}</text></>;
    case "dryclean-no": return <><Circle /><Cross /></>;
  }
}

export function CareSymbol({ kind, size = 36, label }: { kind: CareSymbolKind; size?: number; label?: string }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} role="img" aria-label={label} className="shrink-0 text-foreground/80" style={{ flexShrink: 0 }}>
      {draw(kind)}
    </svg>
  );
}
