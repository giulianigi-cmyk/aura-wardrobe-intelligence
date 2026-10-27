import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { consentTextFor, LEGAL_VERSION, legalDocText, type LegalDoc } from "@/lib/legal/legal";

/** **bold** inside a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

/** The small subset of Markdown the legal documents use: headings, italic notes, bullets, tables, bold. */
export function LegalMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith("# ")) { out.push(<h1 key={i} className="font-serif italic text-2xl leading-tight">{line.slice(2)}</h1>); continue; }
    if (line.startsWith("## ")) { out.push(<h2 key={i} className="mt-5 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">{line.slice(3)}</h2>); continue; }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!/^\|\s*-/.test(lines[i])) rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      i--;
      out.push(
        <div key={i} className="mt-2 space-y-1.5">
          {rows.slice(1).map((r, ri) => (
            <div key={ri} className="rounded-xl bg-secondary/40 px-3 py-2 text-[13px] leading-snug">
              <p className="font-medium">{inline(r[0])}</p>
              {r.slice(1).map((c, ci) => <p key={ci} className="text-muted-foreground">{inline(c)}</p>)}
            </div>
          ))}
        </div>,
      );
      continue;
    }
    const bullet = /^(\s*)- (.*)$/.exec(line);
    if (bullet) {
      out.push(
        <p key={i} className={`flex gap-2 text-[13px] leading-relaxed ${bullet[1] ? "pl-4" : ""}`}>
          <span className="mt-[0.55rem] h-1 w-1 rounded-full bg-foreground/60 shrink-0" />
          <span>{inline(bullet[2])}</span>
        </p>,
      );
      continue;
    }
    if (/^\*[^*].*\*$/.test(line.trim())) { out.push(<p key={i} className="mt-1 text-[12px] italic text-muted-foreground">{line.trim().slice(1, -1)}</p>); continue; }
    out.push(<p key={i} className="mt-2 text-[13px] leading-relaxed">{inline(line)}</p>);
  }
  return <div>{out}</div>;
}

/** Privacy policy or terms of use, full text in a sheet. Usable before sign-in too (no account needed). */
export function LegalDocSheet({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const { i18n } = useTranslation();
  const text = consentTextFor(i18n.language);
  return createPortal(
    <div className="fixed inset-0 z-[120] bg-background/80 backdrop-blur flex items-end justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card rounded-t-3xl border-t sm:border-x border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[88vh] overflow-y-auto overscroll-contain"
      >
        <div className="flex justify-end">
          <button onClick={onClose} aria-label={text.close} className="h-9 w-9 rounded-full border border-border flex items-center justify-center"><X size={15} /></button>
        </div>
        <LegalMarkdown text={legalDocText(doc, i18n.language)} />
      </div>
    </div>,
    document.body,
  );
}

/** Shown after sign-in to any account that hasn't accepted the current documents (new sign-ups, existing
 *  accounts, and everyone again when LEGAL_VERSION changes). The acceptance and its date are saved on the
 *  account; nothing else in the app is reachable until then. */
export function LegalConsentGate() {
  const { i18n } = useTranslation();
  const text = consentTextFor(i18n.language);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<LegalDoc | null>(null);

  const accept = async () => {
    setSaving(true); setError(false);
    const { error: err } = await supabase.auth.updateUser({ data: { legal_version: LEGAL_VERSION, legal_accepted_at: new Date().toISOString() } });
    setSaving(false);
    if (err) { console.error("[AURA legal] could not save acceptance", err); setError(true); }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-background flex flex-col px-8 pt-20 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
        <h1 className="font-serif italic text-4xl leading-tight">{text.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{text.intro}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button onClick={() => setOpen("privacy")} className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm flex justify-between">{text.privacy}<span className="text-muted-foreground">›</span></button>
          <button onClick={() => setOpen("terms")} className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm flex justify-between">{text.terms}<span className="text-muted-foreground">›</span></button>
        </div>
        <button
          type="button" role="checkbox" aria-checked={checked} onClick={() => setChecked((v) => !v)}
          className="mt-6 flex items-start gap-3 text-left"
        >
          <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center ${checked ? "bg-foreground border-foreground text-background" : "border-border"}`}>
            {checked && <Check size={13} />}
          </span>
          <span className="text-[13px] leading-snug">{text.checkbox}</span>
        </button>
        {error && <p className="mt-3 text-xs text-red-700">{text.error}</p>}
        <button
          onClick={() => void accept()}
          disabled={!checked || saving}
          className="mt-6 w-full h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] inline-flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}{text.accept}
        </button>
      </div>
      {open && <LegalDocSheet doc={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
