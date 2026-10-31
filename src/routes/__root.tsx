import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";

import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import appCss from "../styles.css?url";
import { BRAND_NAME } from "@/lib/brand";
import { SOCIAL_LINKS } from "@/lib/social";

// Title and description in the visitor's market: Italian on nimbea.it, English on nimbea.app (and
// anywhere else). What Google and link previews (WhatsApp, LinkedIn) show; the app itself then uses
// the phone's language. hreflang tells Google the two domains are the same app in two languages.
const pageHost = createIsomorphicFn()
  .server(() => { try { return new URL(getRequest().url).hostname; } catch { return ""; } })
  .client(() => window.location.hostname);

const META = {
  it: {
    title: `${BRAND_NAME} — Outfit con i vestiti che hai già`,
    description: "Fotografa i tuoi capi, anche più insieme, e ricevi ogni mattina l'outfit giusto per il meteo e i tuoi impegni. Armadio digitale, stylist AI e valigia per i viaggi.",
    url: "https://nimbea.it/", locale: "it_IT",
  },
  en: {
    title: `${BRAND_NAME} — Outfits from the clothes you already own`,
    description: "Photograph your clothes, several at once, and get the right outfit every morning for the weather and your plans. Digital wardrobe, AI stylist and trip packing.",
    url: "https://nimbea.app/", locale: "en_US",
  },
} as const;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div>
        <p className="font-serif text-6xl italic text-foreground">404</p>
        <p className="mt-3 text-sm tracking-widest uppercase text-muted-foreground">Lost in the wardrobe</p>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div>
        <p className="font-serif text-3xl">Something slipped</p>
        <p className="mt-3 text-xs text-muted-foreground break-words max-w-sm mx-auto">{message}</p>
        {/* TEMPORARY diagnostic: shows exactly which file/line threw this,
         *  instead of just the bare message — remove once the root cause
         *  behind the sizeEquivalences crash is confirmed and fixed. */}
        {stack && (
          <pre className="mt-4 max-w-sm mx-auto text-left text-[10px] leading-snug text-muted-foreground/80 whitespace-pre-wrap break-words bg-secondary/40 rounded-xl p-3">
            {stack}
          </pre>
        )}
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-full bg-primary px-6 py-2.5 text-xs uppercase tracking-widest text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => ({ host: pageHost() }),
  head: ({ loaderData }) => {
    const m = /(^|\.)nimbea\.it$/i.test(loaderData?.host ?? "") ? META.it : META.en;
    return ({
    meta: [
      { charSet: "utf-8" },
      { name: "google-site-verification", content: "7TkfNyEP6vqwtTnXjrdNwlHrH6SerKwUHA864Mu_eFs" },
      { name: "google", content: "notranslate" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" },
      { title: m.title },
      { name: "description", content: m.description },
      { name: "theme-color", content: "#f5efe6" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: `${BRAND_NAME}` },
      { property: "og:title", content: m.title },
      { property: "og:description", content: m.description },
      { property: "og:url", content: m.url },
      { property: "og:locale", content: m.locale },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: m.title },
      { name: "twitter:description", content: m.description },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "canonical", href: m.url },
      { rel: "alternate", hrefLang: "it", href: META.it.url },
      { rel: "alternate", hrefLang: "en", href: META.en.url },
      { rel: "alternate", hrefLang: "x-default", href: META.en.url },
      // Installable app (Add to Home Screen) — needed on iPhone for the morning notification.
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.ico?v=12", sizes: "16x16 32x32 48x48" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png?v=12" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=12" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Inter:wght@300;400;500;600&display=swap" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: `${BRAND_NAME}`,
          url: m.url,
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: `${BRAND_NAME}`,
          url: m.url,
          description: m.description,
          sameAs: SOCIAL_LINKS.map((s) => s.url),
        }),
      },
    ],
  });
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" translate="no">
  <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
