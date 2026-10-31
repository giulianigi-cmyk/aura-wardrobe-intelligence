import { Instagram, Linkedin, Youtube } from "lucide-react";
import { SOCIAL_LINKS, type SocialNetwork } from "@/lib/social";

/** TikTok's note, drawn like the lucide icons (no TikTok icon in lucide). */
function TikTok({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 2v13.5a4.5 4.5 0 1 1-4.5-4.5" />
      <path d="M14.5 2c.4 3 2.5 5.2 5.5 5.5" />
    </svg>
  );
}

function Icon({ network, size }: { network: SocialNetwork; size: number }) {
  if (network === "instagram") return <Instagram size={size} />;
  if (network === "youtube") return <Youtube size={size} />;
  if (network === "linkedin") return <Linkedin size={size} />;
  return <TikTok size={size} />;
}

/** The four profiles as round icon links, each opening in a new tab. */
export function SocialLinks({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {SOCIAL_LINKS.map((s) => (
        <a key={s.network} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label}
          className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-foreground/80 active:scale-90 transition">
          <Icon network={s.network} size={size} />
        </a>
      ))}
    </div>
  );
}
