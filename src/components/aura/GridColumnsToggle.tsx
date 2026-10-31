import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LayoutGrid } from "lucide-react";

// Grids of pieces and outfits: 2 (bigger) or 3 (smaller) per row, chosen by the person once and
// kept on this device for every screen (wardrobe, pickers, saved outfits, library).
const KEY = "aura.gridColumns";
const EVENT = "aura:grid-columns";
export type GridColumns = 2 | 3;

function read(fallback: GridColumns): GridColumns {
  try {
    const v = localStorage.getItem(KEY);
    return v === "3" ? 3 : v === "2" ? 2 : fallback;
  } catch { return fallback; }
}

/** The chosen number of columns; `fallback` until the person picks one. */
export function useGridColumns(fallback: GridColumns = 2): [GridColumns, (n: GridColumns) => void] {
  const [cols, setCols] = useState<GridColumns>(() => read(fallback));
  useEffect(() => {
    const on = () => setCols(read(fallback));
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [fallback]);
  const set = (n: GridColumns) => {
    setCols(n);
    try { localStorage.setItem(KEY, String(n)); } catch { /* this screen only */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return [cols, set];
}

export function GridColumnsToggle({ value, onChange, className = "" }: { value: GridColumns; onChange: (n: GridColumns) => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={`flex gap-1 ${className}`}>
      {([2, 3] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={t("grid.columnsAria", { count: n })}
          aria-pressed={value === n}
          className={`h-7 px-3 rounded-full text-[10px] uppercase tracking-[0.15em] inline-flex items-center gap-1 ${value === n ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}
        ><LayoutGrid size={11} /> {n}</button>
      ))}
    </div>
  );
}

/** Tailwind classes for a grid of `n` columns (cards in 2, tighter in 3). */
export const gridClass = (n: GridColumns) => (n === 3 ? "grid-cols-3 gap-x-2 gap-y-4" : "grid-cols-2 gap-x-3 gap-y-5");
