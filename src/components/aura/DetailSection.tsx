import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** A row of a piece's card that opens on tap: the title and a one-line summary when closed, the full
 *  content when open. Keeps the piece's card and its edit form short. */
export function DetailSection({ title, summary, defaultOpen = false, children }: {
  title: string; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-secondary/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="shrink-0 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{title}</span>
        <span className="flex-1 min-w-0 flex justify-end text-[13px] text-foreground/80 truncate">{!open && summary}</span>
        <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
