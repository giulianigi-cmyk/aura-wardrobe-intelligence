import { createFileRoute } from "@tanstack/react-router";
import { LegalPublicPage, legalSearch } from "@/components/aura/LegalPublicPage";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/privacy")({
  validateSearch: legalSearch,
  head: () => ({
    meta: [
      { title: `Informativa privacy · ${BRAND_NAME}` },
      { name: "description", content: `Come ${BRAND_NAME} tratta i tuoi dati.` },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { lang } = Route.useSearch();
  return <LegalPublicPage doc="privacy" lang={lang ?? "it"} />;
}
