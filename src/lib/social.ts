// Nimbèa's own social profiles: «Segui Nimbèa» in Settings, under the sign-in and the legal pages,
// and the Organization's sameAs for search engines.
export type SocialNetwork = "instagram" | "tiktok" | "youtube" | "linkedin";

export const SOCIAL_LINKS: { network: SocialNetwork; label: string; url: string }[] = [
  { network: "instagram", label: "Instagram", url: "https://www.instagram.com/nimbea.app" },
  { network: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@nimbea.app" },
  { network: "youtube", label: "YouTube", url: "https://www.youtube.com/@Nimb%C3%A8a-app" },
  { network: "linkedin", label: "LinkedIn", url: "https://www.linkedin.com/company/nimb%C3%A8a/" },
];
