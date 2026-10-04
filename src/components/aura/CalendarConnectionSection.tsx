import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Check, Loader2, RefreshCcw, X, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { startCalendarConnect, getCalendarStatus, disconnectCalendar, syncCalendarNow } from "@/lib/calendar-connections.functions";
import { connectAppleCalendar, getAppleCalendarStatus, disconnectAppleCalendar, syncAppleCalendarNow } from "@/lib/calendar-connections.functions";
import { startOutlookCalendarConnect, getOutlookCalendarStatus, disconnectOutlookCalendar, syncOutlookCalendarNow } from "@/lib/calendar-connections.functions";

export function CalendarConnectionSection() {
  const { t, i18n } = useTranslation();
  const start = useServerFn(startCalendarConnect);
  const status = useServerFn(getCalendarStatus);
  const disconnect = useServerFn(disconnectCalendar);
  const sync = useServerFn(syncCalendarNow);

  const [connected, setConnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const RECONNECT_MARKER = "RECONNECT_REQUIRED:";
  const needsReconnect = !!lastSyncError?.startsWith(RECONNECT_MARKER);
  const displayedSyncError = lastSyncError?.startsWith(RECONNECT_MARKER)
    ? lastSyncError.slice(RECONNECT_MARKER.length).trim()
    : lastSyncError;

  const load = async () => {
    try {
      const res = await status();
      setConnected(res.connected);
      if (res.connected) {
        setLastSyncedAt(res.lastSyncedAt ?? null);
        setLastSyncError(res.lastSyncError ?? null);
      }
    } catch (e) {
      console.error("[AURA calendar] status failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("calendar");
    if (!result) return;
    if (result === "connected") { toast.success(t("calendarConnect.connected", { name: "Google Calendar" })); void load(); }
    else if (result === "denied") toast.message(t("calendarConnect.cancelled"));
    else if (result === "error") toast.error(t("calendarConnect.connectFailed", { name: "Google Calendar" }));
    params.delete("calendar");
    const clean = params.toString();
    window.history.replaceState({}, "", clean ? `${window.location.pathname}?${clean}` : window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const res = await start();
      window.location.href = res.url;
    } catch (e) {
      console.error("[AURA calendar] connect failed", e);
      toast.error(t("calendarConnect.startFailed"));
      setConnecting(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await sync();
      if (res.ok) toast.success(t("calendarConnect.synced", { count: res.imported ?? 0 }));
      else toast.error(res.error ?? t("calendarConnect.syncFailed"));
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const runDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnect();
      setConnected(false);
      toast.success(t("calendarConnect.disconnected"));
    } catch (e) {
      console.error("[AURA calendar] disconnect failed", e);
      toast.error(t("calendarConnect.disconnectFailed"));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="mx-6 mt-4 rounded-3xl gradient-warm border border-border/60 p-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("calendarConnect.eyebrow")}</p>
          <p className="font-serif text-lg mt-0.5">Google Calendar</p>
        </div>
        <Calendar size={18} className="text-muted-foreground" />
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
        </div>
      ) : connected ? (
        <>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Check size={12} className="text-foreground" />
            {t("calendarConnect.connectedState")}
            {lastSyncedAt ? ` · ${t("calendarConnect.syncedAt", { when: new Date(lastSyncedAt).toLocaleString(i18n.language) })}` : ""}
          </div>
          {displayedSyncError && (
            <p className="mt-1 text-[11px] text-red-700">{displayedSyncError}</p>
          )}
          <div className="mt-3 flex gap-2">
            {needsReconnect ? (
              <button
                onClick={() => void connect()}
                disabled={connecting}
                className="flex-1 h-10 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {connecting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />} {t("calendarConnect.reconnect")}
              </button>
            ) : (
              <button
                onClick={() => void runSync()}
                disabled={syncing}
                className="flex-1 h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />} {t("calendarConnect.syncNow")}
              </button>
            )}
            <button
              onClick={() => void runDisconnect()}
              disabled={disconnecting}
              className="h-10 w-10 rounded-full border border-border flex items-center justify-center disabled:opacity-50"
              aria-label={t("calendarConnect.disconnectAria", { name: "Google Calendar" })}
            ><X size={14} /></button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {t("calendarConnect.googleIntro")}
          </p>
          <button
            onClick={() => void connect()}
            disabled={connecting}
            className="mt-3 w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {connecting ? <Loader2 size={12} className="animate-spin" /> : null}
            {t("calendarConnect.connectButton", { name: "Google Calendar" })}
          </button>
        </>
      )}
    </section>
  );
}

export function AppleCalendarConnectionSection() {
  const { t, i18n } = useTranslation();
  const connectFn = useServerFn(connectAppleCalendar);
  const status = useServerFn(getAppleCalendarStatus);
  const disconnect = useServerFn(disconnectAppleCalendar);
  const sync = useServerFn(syncAppleCalendarNow);

  const [connected, setConnected] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const load = async () => {
    try {
      const res = await status();
      setConnected(res.connected);
      if (res.connected) {
        setAccountEmail(res.accountEmail ?? null);
        setLastSyncedAt(res.lastSyncedAt ?? null);
        setLastSyncError(res.lastSyncError ?? null);
      }
    } catch (e) {
      console.error("[AURA apple-calendar] status failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const connect = async () => {
    if (!email.trim() || !appPassword.trim()) { toast.error(t("calendarConnect.appleMissing")); return; }
    setConnecting(true);
    try {
      const res = await connectFn({ data: { email, appPassword } });
      if (res.ok) {
        toast.success(t("calendarConnect.connected", { name: "Apple Calendar" }));
        setEmail(""); setAppPassword("");
        await load();
      } else {
        toast.error(res.error ?? t("calendarConnect.connectFailedShort"));
      }
    } catch (e) {
      console.error("[AURA apple-calendar] connect failed", e);
      toast.error(t("calendarConnect.connectFailed", { name: "Apple Calendar" }));
    } finally {
      setConnecting(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await sync();
      if (res.ok) toast.success(t("calendarConnect.synced", { count: res.imported ?? 0 }));
      else toast.error(res.error ?? t("calendarConnect.syncFailed"));
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const runDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnect();
      setConnected(false);
      toast.success(t("calendarConnect.disconnected"));
    } catch (e) {
      console.error("[AURA apple-calendar] disconnect failed", e);
      toast.error(t("calendarConnect.disconnectFailed"));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="mx-6 mt-4 rounded-3xl gradient-warm border border-border/60 p-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("calendarConnect.eyebrow")}</p>
          <p className="font-serif text-lg mt-0.5">Apple Calendar</p>
        </div>
        <Calendar size={18} className="text-muted-foreground" />
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
        </div>
      ) : connected ? (
        <>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Check size={12} className="text-foreground" />
            {accountEmail ? t("calendarConnect.connectedAs", { email: accountEmail }) : t("calendarConnect.connectedState")}
            {lastSyncedAt ? ` · ${t("calendarConnect.syncedAt", { when: new Date(lastSyncedAt).toLocaleString(i18n.language) })}` : ""}
          </div>
          {lastSyncError && (
            <p className="mt-1 text-[11px] text-red-700">{lastSyncError}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void runSync()}
              disabled={syncing}
              className="flex-1 h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />} {t("calendarConnect.syncNow")}
            </button>
            <button
              onClick={() => void runDisconnect()}
              disabled={disconnecting}
              className="h-10 w-10 rounded-full border border-border flex items-center justify-center disabled:opacity-50"
              aria-label={t("calendarConnect.disconnectAria", { name: "Apple Calendar" })}
            ><X size={14} /></button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {t("calendarConnect.appleIntroBefore")}{" "}
            <a href="https://appleid.apple.com" target="_blank" rel="noreferrer" className="underline">{t("calendarConnect.appleIntroLink")}</a>{" "}
            {t("calendarConnect.appleIntroAfter")}
          </p>
          <div className="mt-3 space-y-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("calendarConnect.appleEmailPlaceholder")}
              type="email"
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full h-11 rounded-full border border-border bg-background px-4 text-sm outline-none"
            />
            <div className="relative">
              <input
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx"
                type={showPassword ? "text" : "password"}
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full h-11 rounded-full border border-border bg-background pl-4 pr-11 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("calendarConnect.hidePassword") : t("calendarConnect.showPassword")}
                className="absolute right-1 top-1 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <button
            onClick={() => void connect()}
            disabled={connecting}
            className="mt-3 w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {connecting ? <Loader2 size={12} className="animate-spin" /> : null}
            {t("calendarConnect.connectButton", { name: "Apple Calendar" })}
          </button>
        </>
      )}
    </section>
  );
}

/** Outlook/Microsoft calendar — OAuth redirect, same pattern as Google. */
export function OutlookCalendarConnectionSection() {
  const { t, i18n } = useTranslation();
  const start = useServerFn(startOutlookCalendarConnect);
  const status = useServerFn(getOutlookCalendarStatus);
  const disconnect = useServerFn(disconnectOutlookCalendar);
  const sync = useServerFn(syncOutlookCalendarNow);

  const [connected, setConnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = async () => {
    try {
      const res = await status();
      setConnected(res.connected);
      if (res.connected) {
        setLastSyncedAt(res.lastSyncedAt ?? null);
        setLastSyncError(res.lastSyncError ?? null);
      }
    } catch (e) {
      console.error("[AURA outlook-calendar] status failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const res = await start();
      window.location.href = res.url;
    } catch (e) {
      console.error("[AURA outlook-calendar] connect failed", e);
      toast.error(t("calendarConnect.startFailed"));
      setConnecting(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await sync();
      if (res.ok) toast.success(t("calendarConnect.synced", { count: res.imported ?? 0 }));
      else toast.error(res.error ?? t("calendarConnect.syncFailed"));
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const runDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnect();
      setConnected(false);
      toast.success(t("calendarConnect.disconnected"));
    } catch (e) {
      console.error("[AURA outlook-calendar] disconnect failed", e);
      toast.error(t("calendarConnect.disconnectFailed"));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="mx-6 mt-4 rounded-3xl gradient-warm border border-border/60 p-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("calendarConnect.eyebrow")}</p>
          <p className="font-serif text-lg mt-0.5">Outlook Calendar</p>
        </div>
        <Calendar size={18} className="text-muted-foreground" />
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
        </div>
      ) : connected ? (
        <>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Check size={12} className="text-foreground" />
            {t("calendarConnect.connectedState")}
            {lastSyncedAt ? ` · ${t("calendarConnect.syncedAt", { when: new Date(lastSyncedAt).toLocaleString(i18n.language) })}` : ""}
          </div>
          {lastSyncError && (
            <p className="mt-1 text-[11px] text-red-700">{lastSyncError}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void runSync()}
              disabled={syncing}
              className="flex-1 h-10 rounded-full border border-border text-[10px] uppercase tracking-[0.25em] flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />} {t("calendarConnect.syncNow")}
            </button>
            <button
              onClick={() => void runDisconnect()}
              disabled={disconnecting}
              className="h-10 w-10 rounded-full border border-border flex items-center justify-center disabled:opacity-50"
              aria-label={t("calendarConnect.disconnectAria", { name: "Outlook Calendar" })}
            ><X size={14} /></button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {t("calendarConnect.outlookIntro")}
          </p>
          <button
            onClick={() => void connect()}
            disabled={connecting}
            className="mt-3 w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {connecting ? <Loader2 size={12} className="animate-spin" /> : null}
            {t("calendarConnect.connectButton", { name: "Outlook Calendar" })}
          </button>
        </>
      )}
    </section>
  );
}
