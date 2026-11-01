import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Share, SquarePlus, Smartphone, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  consumeInstallPrompt, dismissInstallHint, installHintDismissed, installPlatform, installPromptEvent,
  isStandaloneDisplay, onInstallPromptChange, shouldShowInstallHint, type InstallPlatform,
} from "@/lib/install-hint";
import { track } from "@/lib/telemetry-client";

/** Home card: how to add Nimbèa to the phone's Home Screen (install-hint.ts). */
export function InstallHint() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [visible, setVisible] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    if (!user) return;
    const p = installPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
    setPlatform(p);
    const show = shouldShowInstallHint({ platform: p, standalone: isStandaloneDisplay(), dismissed: installHintDismissed(user.id) });
    setVisible(show);
    if (show) track("flow_step", { feature: "install_hint", step: "shown", platform: p ?? "" });
    setCanPrompt(!!installPromptEvent());
    return onInstallPromptChange(() => setCanPrompt(!!installPromptEvent()));
  }, [user]);

  if (!user || !visible || !platform) return null;

  const close = (step: "got_it" | "installed") => {
    dismissInstallHint(user.id);
    track("flow_step", { feature: "install_hint", step, platform });
    setVisible(false);
  };
  const install = async () => {
    const e = installPromptEvent();
    if (!e) return;
    await e.prompt();
    const { outcome } = await e.userChoice;
    consumeInstallPrompt();
    setCanPrompt(false);
    if (outcome === "accepted") close("installed");
  };

  return (
    <section className="mx-6 mt-4 rounded-2xl border border-border bg-secondary/40 p-3.5 animate-fade-up relative">
      <button onClick={() => close("got_it")} aria-label={t("installHint.gotIt")}
        className="absolute top-2.5 right-2.5 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground">
        <X size={14} />
      </button>
      <p className="text-xs font-medium flex items-center gap-1.5 pr-8"><Smartphone size={13} /> {t("installHint.title")}</p>
      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{t("installHint.body")}</p>
      {platform === "in-app" ? (
        <p className="mt-2 text-[11px] leading-relaxed">{t("installHint.inApp")}</p>
      ) : platform === "android" && canPrompt ? (
        <button onClick={() => void install()}
          className="mt-2.5 h-9 px-5 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.2em]">
          {t("installHint.install")}
        </button>
      ) : (
        <ol className="mt-2 space-y-1 text-[11px] leading-relaxed">
          {platform === "ios" ? (
            <>
              <li className="flex items-center gap-1.5">1. {t("installHint.iosStep1")} <Share size={12} className="shrink-0" /></li>
              <li className="flex items-center gap-1.5">2. {t("installHint.iosStep2")} <SquarePlus size={12} className="shrink-0" /></li>
            </>
          ) : (
            <>
              <li>1. {t("installHint.androidStep1")}</li>
              <li>2. {t("installHint.androidStep2")}</li>
            </>
          )}
          <li>3. {t("installHint.step3")}</li>
        </ol>
      )}
    </section>
  );
}
