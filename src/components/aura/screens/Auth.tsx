import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { Sparkles, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { LanguagePicker } from "../LanguagePicker";

type Mode = "signin" | "signup" | "forgot";

export function Auth() {
  const { t } = useTranslation();
  const { signIn, signUp, resetPassword, signInWithProvider } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  // The language picker is shown exactly once, the moment someone taps
  // "New to AURA? Create account" for the first time — not on every app
  // open (that was the earlier, buggy placement: a standalone pre-splash
  // screen re-triggered on every launch whenever the persisted flag
  // didn't stick). Tied directly to account creation instead, and
  // skipped entirely if the flag is already set (e.g. reinstalling the
  // app after already picking a language once).
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const languageAlreadyChosen = typeof window !== "undefined" && localStorage.getItem("aura.language_chosen") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const reset = () => { setError(null); setInfo(null); };

  const withProvider = async (provider: "google" | "apple") => {
    reset(); setLoading(true);
    const { error } = await signInWithProvider(provider);
    setLoading(false);
    if (error) setError(t("auth.providerFailed"));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    reset(); setLoading(true);
    if (mode === "forgot") {
      const { error } = await resetPassword(email);
      setLoading(false);
      if (error) setError(error);
      else setInfo(t("auth.checkInboxReset"));
      return;
    }
    const fn = mode === "signin" ? signIn : signUp;
    const { error } = await fn(email, password);
    setLoading(false);
    if (error) setError(error);
    else if (mode === "signup") setInfo(t("auth.checkEmailConfirm"));
  };

  const title =
    mode === "signin" ? t("auth.welcomeBack") :
    mode === "signup" ? t("auth.beginYourEdit") :
    t("auth.resetYourPassword");
  const subtitle =
    mode === "signin" ? t("auth.wardrobeIsWaiting") :
    mode === "signup" ? t("auth.createAccountSubtitle") :
    t("auth.emailRecoveryLink");

  return (
    <div className="h-full w-full flex flex-col px-8 pt-20 pb-10 bg-background">
      <div className="flex-1 flex flex-col justify-center animate-fade-up">
        <div className="flex items-center gap-2 mb-6">
          {mode === "forgot" ? (
            <button onClick={() => { setMode("signin"); reset(); }} className="flex items-center gap-2 text-muted-foreground">
              <ArrowLeft size={14} />
              <span className="text-[10px] uppercase tracking-[0.4em]">{t("auth.back")}</span>
            </button>
          ) : (
            <>
              <Sparkles size={14} />
              <span className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">AURA</span>
            </>
          )}
        </div>
        <h1 className="font-serif text-4xl italic leading-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

        {mode !== "forgot" && (
          <div className="mt-8 space-y-2.5">
            {/* Apple first and as prominent as Google (App Store guideline 4.8). */}
            <button
              type="button" disabled={loading} onClick={() => void withProvider("apple")}
              className="w-full h-12 rounded-full bg-black text-white flex items-center justify-center gap-2 text-sm disabled:opacity-50 active:scale-[0.98] transition"
            >
              <svg aria-hidden="true" viewBox="0 0 384 512" className="h-4 w-4" fill="currentColor"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
              {t("auth.continueWithApple")}
            </button>
            <button
              type="button" disabled={loading} onClick={() => void withProvider("google")}
              className="w-full h-12 rounded-full border border-border bg-background flex items-center justify-center gap-2 text-sm disabled:opacity-50 active:scale-[0.98] transition"
            >
              <svg aria-hidden="true" viewBox="0 0 48 48" className="h-4 w-4"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              {t("auth.continueWithGoogle")}
            </button>
            <div className="flex items-center gap-3 pt-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("auth.orWithEmail")}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        <form onSubmit={submit} className={mode === "forgot" ? "mt-8 space-y-4" : "mt-4 space-y-4"}>
          <div>
            <label className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("auth.email")}</label>
            <input
              type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full bg-transparent border-b border-border py-2 outline-none focus:border-foreground transition"
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("auth.password")}</label>
                {mode === "signin" && (
                  <button type="button" onClick={() => { setMode("forgot"); reset(); }}
                    className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition">
                    {t("auth.forgot")}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
                  className="mt-1 w-full bg-transparent border-b border-border py-2 pr-12 outline-none focus:border-foreground transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? t("auth.hidePasswordAria") : t("auth.showPasswordAria")}
                  className="absolute right-0 top-[calc(50%+0.125rem)] -translate-y-1/2 h-11 w-11 -mr-2.5 flex items-center justify-center text-muted-foreground active:scale-90"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-700">{error}</p>}
          {info && <p className="text-xs text-muted-foreground">{info}</p>}

          <button
            type="submit" disabled={loading}
            className="mt-4 w-full h-14 rounded-full bg-foreground text-background uppercase tracking-[0.3em] text-xs disabled:opacity-50 active:scale-[0.98] transition shadow-luxe"
          >
            {loading ? "…" :
              mode === "signin" ? t("auth.signIn") :
              mode === "signup" ? t("auth.createAccount") :
              t("auth.sendResetLink")}
          </button>
        </form>

        {mode !== "forgot" && (
          <button
            onClick={() => {
              const goingToSignup = mode === "signin";
              setMode(goingToSignup ? "signup" : "signin");
              reset();
              if (goingToSignup && !languageAlreadyChosen) setShowLanguagePicker(true);
            }}
            className="mt-6 text-xs text-muted-foreground tracking-wide"
          >
            {mode === "signin" ? t("auth.newToAura") : t("auth.alreadyMember")}
          </button>
        )}
      </div>
      {showLanguagePicker && (
        <div className="fixed inset-0 z-[100]">
          <LanguagePicker onDone={() => setShowLanguagePicker(false)} />
        </div>
      )}
    </div>
  );
}
