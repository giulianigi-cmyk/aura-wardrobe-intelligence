import { Link } from "@tanstack/react-router";
import { LegalMarkdown } from "./LegalDocs";
import { legalDocText, type LegalDoc } from "@/lib/legal/legal";
import { BRAND_NAME } from "@/lib/brand";

/** Privacy policy or terms of use as a public page, readable without an account: the address given to
 *  Google and Microsoft for the calendar sign-in, and to anyone who asks. Italian by default (the
 *  authoritative text), English with ?lang=en. */
export function LegalPublicPage({ doc, lang }: { doc: LegalDoc; lang: "it" | "en" }) {
  const path = doc === "privacy" ? "/privacy" : "/terms";
  const other = doc === "privacy" ? "/terms" : "/privacy";
  const otherLabel = lang === "it"
    ? (doc === "privacy" ? "Termini d'uso" : "Informativa privacy")
    : (doc === "privacy" ? "Terms of use" : "Privacy policy");
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
        <header className="flex items-center justify-between gap-3 mb-6">
          <a href="/" className="font-serif italic text-xl">{BRAND_NAME}</a>
          <nav className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            <Link to={path} search={{}} className={lang === "it" ? "text-foreground" : ""}>IT</Link>
            <Link to={path} search={{ lang: "en" }} className={lang === "en" ? "text-foreground" : ""}>EN</Link>
          </nav>
        </header>
        <LegalMarkdown text={legalDocText(doc, lang)} />
        <footer className="mt-10 pt-4 border-t border-border/60 text-[12px] text-muted-foreground">
          <Link to={other} search={lang === "en" ? { lang } : {}} className="underline underline-offset-2">{otherLabel}</Link>
        </footer>
      </div>
    </main>
  );
}

/** ?lang=en for English; nothing (Italian) otherwise, so the plain address does not redirect. */
export const legalSearch = (s: Record<string, unknown>): { lang?: "en" } => (s.lang === "en" ? { lang: "en" } : {});
