import { createFileRoute } from "@tanstack/react-router";
import { LegalPublicPage, legalSearch } from "@/components/aura/LegalPublicPage";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/terms")({
  validateSearch: legalSearch,
  head: () => ({
    meta: [
      { title: `Termini d'uso · ${BRAND_NAME}` },
      { name: "description", content: `Le condizioni per usare ${BRAND_NAME}.` },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const { lang } = Route.useSearch();
  return <LegalPublicPage doc="terms" lang={lang ?? "it"} />;
}
