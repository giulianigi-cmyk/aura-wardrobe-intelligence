import { useEffect, useState } from "react";
import { ArrowLeft, Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Screen } from "../AuraApp";
import { useProfile } from "@/hooks/use-profile";
import { syncMySharedLibrary } from "@/lib/shared-library.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { CONSENT_KEYS, consentsFrom, consentTextFor, type ConsentKey } from "@/lib/legal/legal";

const SHARING_DEFINITIONS = [
  { termKey: "settings.sharingWhatIsSharedTerm", descKey: "settings.sharingWhatIsSharedDesc" },
  { termKey: "settings.sharingWhatIsNeverSharedTerm", descKey: "settings.sharingWhatIsNeverSharedDesc" },
  { termKey: "settings.sharingTurningOffTerm", descKey: "settings.sharingTurningOffDesc" },
];

export function PrivacySettings({ go }: { go: (s: Screen) => void }) {
  const { t, i18n } = useTranslation();
  const { profile, update } = useProfile();
  const { user } = useAuth();
  const consentText = consentTextFor(i18n.language);
  const [consents, setConsents] = useState(() => consentsFrom(user?.user_metadata));
  useEffect(() => { setConsents(consentsFrom(user?.user_metadata)); }, [user]);

  // Optional data choices (offers by email, partner offers, anonymous statistics), saved on the account.
  const toggleConsent = async (key: ConsentKey) => {
    const next = { ...consents, [key]: !consents[key] };
    setConsents(next);
    const { error } = await supabase.auth.updateUser({ data: { consents: { ...next, updated_at: new Date().toISOString() } } });
    if (error) { toast.error(consentText.error); setConsents(consents); }
  };
  const [shareLibrary, setShareLibrary] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setShareLibrary(Boolean(profile.share_wardrobe_to_library));
  }, [profile]);

  const toggle = async () => {
    const next = !shareLibrary;
    setShareLibrary(next);
    const { error } = await update({ share_wardrobe_to_library: next });
    if (error) { toast.error(error); setShareLibrary(!next); return; }
    // Il consenso è appena cambiato: riallinea (o svuota) la libreria condivisa.
    if (next) void syncMySharedLibrary().catch(() => {});
    else await syncMySharedLibrary().catch(() => {});
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28 bg-background">
      <header className="px-6 pt-14 pb-2 flex items-center justify-between">
        <button onClick={() => go("settings")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={15} />
        </button>
        <p className="font-serif text-lg italic">{t("settings.privacy")}</p>
        <span className="w-10" />
      </header>

      <section className="mx-6 mt-6">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("settings.sharedLibrary")}</p>
          <button onClick={() => setInfoOpen(true)} aria-label={t("settings.whatDoesThisMean")} className="text-muted-foreground active:scale-90">
            <Info size={12} />
          </button>
        </div>
        <button
          role="switch" aria-checked={shareLibrary} onClick={() => void toggle()}
          className="mt-2 w-full flex items-start gap-3 rounded-2xl border border-border bg-card p-3 text-left active:scale-[0.99] transition"
        >
          <span className={`mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${shareLibrary ? "bg-foreground" : "bg-border"}`}>
            <span className={`block h-4 w-4 mt-0.5 rounded-full bg-background transition-transform ${shareLibrary ? "translate-x-[1.15rem]" : "translate-x-0.5"}`} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm">{t("settings.sharedLibraryLabel")}</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">{t("settings.sharedLibraryDesc")}</span>
          </span>
        </button>
      </section>

      <section className="mx-6 mt-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{consentText.choicesTitle}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{consentText.choicesNote}</p>
        <div className="mt-2 space-y-2">
          {CONSENT_KEYS.map((key) => (
            <button
              key={key} role="switch" aria-checked={consents[key]} onClick={() => void toggleConsent(key)}
              className="w-full flex items-start gap-3 rounded-2xl border border-border bg-card p-3 text-left active:scale-[0.99] transition"
            >
              <span className={`mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${consents[key] ? "bg-foreground" : "bg-border"}`}>
                <span className={`block h-4 w-4 mt-0.5 rounded-full bg-background transition-transform ${consents[key] ? "translate-x-[1.15rem]" : "translate-x-0.5"}`} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm">{consentText.options[key].label}</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">{consentText.options[key].desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {infoOpen && (
        <div className="fixed inset-0 z-[90] bg-background/70 backdrop-blur-sm flex items-center justify-center px-6" onClick={() => setInfoOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-luxe max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="font-serif text-lg italic">{t("settings.sharedLibrary")}</p>
              <button onClick={() => setInfoOpen(false)} aria-label={t("settings.close")} className="h-8 w-8 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90">
                <X size={14} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {SHARING_DEFINITIONS.map((d) => (
                <div key={d.termKey}>
                  <p className="text-sm font-medium">{t(d.termKey)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t(d.descKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
