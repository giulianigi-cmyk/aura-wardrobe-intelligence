import { useEffect, useState } from "react";
import { ArrowLeft, BellRing, Loader2, Share, SquarePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Screen } from "../AuraApp";
import { useProfile } from "@/hooks/use-profile";
import { useServerFn } from "@tanstack/react-start";
import { MORNING_TIMES, morningTimeOf } from "@/lib/morning-look";
import { currentSubscription, disablePush, enablePush, pushAvailability, type PushAvailability } from "@/lib/push-client";
import { sendTestPush } from "@/lib/push.functions";
import { track } from "@/lib/telemetry-client";

type Prefs = { outfit_share: boolean; weather_change: boolean; system: boolean; morning_look?: boolean; morning_look_time?: string };
const DEFAULTS: Prefs = { outfit_share: true, weather_change: true, system: true, morning_look: false };

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      role="switch" aria-checked={on} onClick={onClick}
      className={`h-6 w-10 shrink-0 rounded-full transition ${on ? "bg-foreground" : "bg-border"}`}
    >
      <span className={`block h-5 w-5 mt-0.5 rounded-full bg-background transition-transform ${on ? "translate-x-[1.15rem]" : "translate-x-0.5"}`} />
    </button>
  );
}

export function NotificationSettings({ go }: { go: (s: Screen) => void }) {
  const { t } = useTranslation();
  const { profile, update } = useProfile();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setPrefs({ ...DEFAULTS, ...(profile.notification_preferences ?? {}) });
  }, [profile]);

  const save = async (next: Prefs): Promise<boolean> => {
    const before = prefs;
    setPrefs(next);
    setSaving(true);
    const { error } = await update({ notification_preferences: next as Required<Prefs> });
    setSaving(false);
    if (error) { toast.error(error); setPrefs(before); return false; }
    return true;
  };
  const setPref = async (key: "outfit_share" | "weather_change" | "system", value: boolean) => {
    await save({ ...prefs, [key]: value });
  };

  // Morning look: on/off and time are saved on the account; the push subscription is per device.
  const [availability, setAvailability] = useState<PushAvailability>("unsupported");
  const [deviceOn, setDeviceOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const callTest = useServerFn(sendTestPush);
  useEffect(() => {
    setAvailability(pushAvailability());
    void currentSubscription().then((s) => setDeviceOn(!!s)).catch(() => setDeviceOn(false));
  }, []);
  const morningOn = prefs.morning_look === true;
  const morningTime = morningTimeOf(prefs);

  const turnOnHere = async (): Promise<boolean> => {
    setBusy(true);
    const r = await enablePush();
    setBusy(false);
    setAvailability(pushAvailability());
    if (r === "ok") { setDeviceOn(true); return true; }
    toast.error(t(r === "denied" ? "morningLook.permissionDenied" : "morningLook.enableFailed"));
    return false;
  };
  const toggleMorning = async () => {
    if (morningOn) {
      await save({ ...prefs, morning_look: false });
      await disablePush();
      setDeviceOn(false);
      track("flow_step", { feature: "morning_look", step: "off" });
      return;
    }
    if (availability === "needs-install") { toast.message(t("morningLook.installTitle")); return; }
    if (availability !== "ready") return;
    if (!(await turnOnHere())) return;
    if (await save({ ...prefs, morning_look: true, morning_look_time: morningTime })) {
      track("flow_step", { feature: "morning_look", step: "on" });
      toast.success(t("morningLook.enabled", { time: morningTime }));
    }
  };
  const sendTest = async () => {
    setBusy(true);
    try {
      const r = await callTest({ data: { language: profile?.language ?? null } });
      if (r.sent > 0) toast.success(t("morningLook.testSent"));
      else toast.error(t("morningLook.enableFailed"));
    } catch {
      toast.error(t("morningLook.enableFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28 bg-background">
      <header className="px-6 pt-14 pb-2 flex items-center justify-between">
        <button onClick={() => go("settings")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={15} />
        </button>
        <p className="font-serif text-lg italic">{t("settings.notifications")}</p>
        <span className="w-10" />
      </header>

      <p className="mx-6 mt-4 text-[11px] text-muted-foreground leading-relaxed">{t("settings.notificationsIntro")}</p>

      <div className="mx-6 mt-4 rounded-[20px] bg-card border border-border overflow-hidden divide-y divide-border">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="min-w-0 pr-3">
            <p className="text-sm flex items-center gap-1.5"><BellRing size={14} /> {t("morningLook.title")}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t("morningLook.sub")}</p>
          </div>
          {busy ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : (
            <Toggle on={morningOn} onClick={() => void toggleMorning()} />
          )}
        </div>
        {(morningOn || availability === "ready") && (
          <label className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{t("morningLook.time")}</span>
            <select
              value={morningTime}
              onChange={(e) => void save({ ...prefs, morning_look_time: e.target.value })}
              className="bg-secondary/60 rounded-full px-3 py-1.5 text-sm outline-none"
            >
              {MORNING_TIMES.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
            </select>
          </label>
        )}
        {availability === "needs-install" && (
          <div className="px-4 py-3.5 text-[12px] leading-relaxed">
            <p className="font-medium">{t("morningLook.installTitle")}</p>
            <ol className="mt-1.5 space-y-1 text-muted-foreground">
              <li className="flex items-center gap-1.5">1. {t("morningLook.installStep1")} <Share size={13} className="shrink-0" /></li>
              <li className="flex items-center gap-1.5">2. {t("morningLook.installStep2")} <SquarePlus size={13} className="shrink-0" /></li>
              <li>3. {t("morningLook.installStep3")}</li>
            </ol>
          </div>
        )}
        {availability === "denied" && <p className="px-4 py-3 text-[12px] text-muted-foreground leading-relaxed">{t("morningLook.deniedHelp")}</p>}
        {availability === "unsupported" && <p className="px-4 py-3 text-[12px] text-muted-foreground leading-relaxed">{t("morningLook.unsupported")}</p>}
        {morningOn && availability === "ready" && !deviceOn && (
          <button onClick={() => void turnOnHere()} disabled={busy} className="w-full px-4 py-3 text-left text-sm underline underline-offset-2 disabled:opacity-60">
            {t("morningLook.enableThisDevice")}
          </button>
        )}
        {morningOn && deviceOn && (
          <button onClick={() => void sendTest()} disabled={busy} className="w-full px-4 py-3 text-left text-sm text-muted-foreground active:bg-secondary/40 disabled:opacity-60">
            {t("morningLook.sendTest")}
          </button>
        )}
      </div>

      <div className="mx-6 mt-4 rounded-[20px] bg-card border border-border overflow-hidden divide-y divide-border">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="min-w-0 pr-3">
            <p className="text-sm">{t("settings.notifOutfitShare")}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t("settings.notifOutfitShareSub")}</p>
          </div>
          <Toggle on={prefs.outfit_share} onClick={() => void setPref("outfit_share", !prefs.outfit_share)} />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="min-w-0 pr-3">
            <p className="text-sm">{t("settings.notifWeatherChange")}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t("settings.notifWeatherChangeSub")}</p>
          </div>
          <Toggle on={prefs.weather_change} onClick={() => void setPref("weather_change", !prefs.weather_change)} />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="min-w-0 pr-3">
            <p className="text-sm">{t("settings.notifSystem")}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t("settings.notifSystemSub")}</p>
          </div>
          <Toggle on={prefs.system} onClick={() => void setPref("system", !prefs.system)} />
        </div>
      </div>
    </div>
  );
}
