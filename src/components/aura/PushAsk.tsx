import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BellRing, Share, SquarePlus } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { morningTimeOf } from "@/lib/morning-look";
import { currentSubscription, enablePush, pushAvailability } from "@/lib/push-client";
import { askedMoments, markAsked, PUSH_ASK_EVENT, pushAskAllowed, type PushAskMoment } from "@/lib/push-ask";
import { isShareAskOpen } from "@/lib/share-library-ask";
import { track } from "@/lib/telemetry-client";

/** The question «Vuoi ricevere le notifiche?» (push-ask.ts), mounted once in the app. */
export function PushAsk({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { profile, update } = useProfile();
  const [open, setOpen] = useState<{ moment: PushAskMoment; install: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAsk = (e: Event) => {
      const moment = (e as CustomEvent<PushAskMoment>).detail === "outfit" ? "outfit" : "piece";
      // After the save's own toast and any other question that just opened.
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (isShareAskOpen()) return; // its turn comes at the next piece
        const availability = pushAvailability();
        const deviceOn = !!(await currentSubscription().catch(() => null));
        if (!pushAskAllowed({ availability, deviceOn, asked: askedMoments(userId), moment })) return;
        markAsked(userId, moment);
        track("flow_step", { feature: "push_ask", step: "shown", moment, install: availability === "needs-install" ? 1 : 0 });
        setOpen({ moment, install: availability === "needs-install" });
      }, 900);
    };
    window.addEventListener(PUSH_ASK_EVENT, onAsk);
    return () => { clearTimeout(timer); window.removeEventListener(PUSH_ASK_EVENT, onAsk); };
  }, [userId]);

  if (!open) return null;

  const close = (step: "not_now" | "install_ok") => { track("flow_step", { feature: "push_ask", step, moment: open.moment }); setOpen(null); };
  const turnOn = async () => {
    setBusy(true);
    const r = await enablePush();
    if (r !== "ok") {
      setBusy(false);
      track("flow_step", { feature: "push_ask", step: r, moment: open.moment });
      toast.error(t(r === "denied" ? "morningLook.permissionDenied" : "morningLook.enableFailed"));
      setOpen(null);
      return;
    }
    // The morning look is what the question promised: on, at the time already chosen or 07:30.
    const prefs = profile?.notification_preferences ?? null;
    const time = morningTimeOf(prefs);
    const { error } = await update({ notification_preferences: { ...(prefs ?? {}), morning_look: true, morning_look_time: time } as never });
    setBusy(false);
    track("flow_step", { feature: "push_ask", step: "on", moment: open.moment });
    if (error) toast.error(t("morningLook.enableFailed"));
    else toast.success(t("pushAsk.done", { time }));
    setOpen(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-background/80 backdrop-blur flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-card rounded-t-3xl border-t sm:border-x border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center"><BellRing size={17} /></div>
        <p className="mt-3 font-serif italic text-xl leading-tight">{t("pushAsk.title")}</p>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t(open.moment === "outfit" ? "pushAsk.bodyOutfit" : "pushAsk.bodyPiece")}</p>
        <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">{t("pushAsk.detail")}</p>
        {open.install ? (
          <>
            <div className="mt-4 rounded-2xl bg-secondary/50 px-3.5 py-3 text-[12px] leading-relaxed">
              <p className="font-medium">{t("morningLook.installTitle")}</p>
              <ol className="mt-1.5 space-y-1 text-muted-foreground">
                <li className="flex items-center gap-1.5">1. {t("morningLook.installStep1")} <Share size={13} className="shrink-0" /></li>
                <li className="flex items-center gap-1.5">2. {t("morningLook.installStep2")} <SquarePlus size={13} className="shrink-0" /></li>
                <li>3. {t("pushAsk.installStep3")}</li>
              </ol>
            </div>
            <button onClick={() => close("install_ok")}
              className="mt-5 w-full h-12 rounded-full border border-border text-[10px] uppercase tracking-[0.2em]">{t("pushAsk.gotIt")}</button>
          </>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => close("not_now")}
              className="h-12 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] disabled:opacity-60">{t("pushAsk.notNow")}</button>
            <button disabled={busy} onClick={() => void turnOn()}
              className="h-12 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] disabled:opacity-60">{t("pushAsk.yes")}</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
