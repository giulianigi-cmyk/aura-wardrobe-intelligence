import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Camera, Check, Loader2, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getAvatarStatus, saveAvatarPhoto, deleteAvatar } from "@/lib/avatar.functions";
import { checkFacePhoto } from "@/lib/face-analyze";
import { checkFullBodyPhoto } from "@/lib/avatar-body-check";
import type { Screen } from "../AuraApp";

type CheckStage = "idle" | "checking" | "ready" | "no_face" | "no_body";

function readFileAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = url;
  });
}

export function Avatar({ go }: { go: (s: Screen) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const getStatus = useServerFn(getAvatarStatus);
  const savePhoto = useServerFn(saveAvatarPhoto);
  const removeAvatar = useServerFn(deleteAvatar);
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [signedPhotoUrl, setSignedPhotoUrl] = useState<string | null>(null);

  // Setup flow state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [checkStage, setCheckStage] = useState<CheckStage>("idle");
  const [consentChecked, setConsentChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getStatus();
      if (res.exists && res.generationStatus === "completed") {
        setExists(true);
        setSignedPhotoUrl(res.signedPhotoUrl);
      } else {
        setExists(false);
      }
    } catch (e) {
      console.error("[AURA avatar] status failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const onPick = async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setConsentChecked(false);
    setCheckStage("checking");
    try {
      const img = await readFileAsImage(f);
      const [hasFace, bodyResult] = await Promise.all([
        checkFacePhoto(img),
        checkFullBodyPhoto(img),
      ]);
      if (!hasFace) { setCheckStage("no_face"); return; }
      if (!bodyResult.ok) { setCheckStage("no_body"); return; }
      setCheckStage("ready");
    } catch (e) {
      console.error("[AURA avatar] photo check failed", e);
      // A failed check (e.g. the WASM model didn't load on a flaky
      // connection) shouldn't permanently block setup — let the person
      // continue; FASHN itself will fail clearly later if the photo is
      // genuinely unusable, same as the fallback principle used
      // elsewhere in AURA for a failed AI step.
      setCheckStage("ready");
    }
  };

  const continueSetup = async () => {
    if (!file || !user?.id || checkStage !== "ready" || !consentChecked) return;
    setSaving(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/photo-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatar-private").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg",
      });
      if (upErr) throw upErr;

      const result = await savePhoto({ data: { photoPath: path, consentAccepted: true } });
      if (!result.ok) throw new Error("save failed");

      toast.success(t("avatar.avatarReady"));
      setFile(null); setPreview(null); setCheckStage("idle"); setConsentChecked(false);
      await load();
    } catch (e) {
      console.error("[AURA avatar] save failed", e);
      toast.error(t("avatar.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await removeAvatar();
      setConfirmingDelete(false);
      await load();
    } catch (e) {
      console.error("[AURA avatar] delete failed", e);
      toast.error(t("avatar.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const checkMessage =
    checkStage === "checking" ? t("avatar.checkingPhoto") :
    checkStage === "no_face" ? t("avatar.noFaceDetected") :
    checkStage === "no_body" ? t("avatar.noBodyDetected") :
    null;

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      <header className="px-6 pt-14 pb-3 flex items-center gap-3">
        <button onClick={() => go("profile")} aria-label={t("avatar.backAria")} className="h-10 w-10 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90">
          <ArrowLeft size={16} />
        </button>
        <h1 className="font-serif text-2xl italic">{t("avatar.title")}</h1>
      </header>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPick(e.target.files?.[0] ?? null)} />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
      ) : exists && !file ? (
        <div className="px-6 mt-2 animate-fade-up">
          <div className="rounded-3xl overflow-hidden bg-secondary/40 aspect-[4/5]">
            {signedPhotoUrl && <img src={signedPhotoUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <button
            onClick={() => go("avatar-tryon")}
            className="mt-4 w-full h-14 rounded-full bg-foreground text-background flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-luxe"
          >
            <Sparkles size={16} />
            <span className="text-xs uppercase tracking-[0.3em]">{t("avatar.tryOnCta")}</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-3 w-full h-12 rounded-full border border-border text-xs uppercase tracking-[0.3em] active:scale-[0.98] transition"
          >
            {t("avatar.changePhoto")}
          </button>
          <button
            onClick={() => setConfirmingDelete(true)}
            className="mt-2 w-full h-12 rounded-full text-xs uppercase tracking-[0.3em] text-red-700 flex items-center justify-center gap-1.5"
          >
            <Trash2 size={13} /> {t("avatar.deleteAvatar")}
          </button>

          {confirmingDelete && (
            <div className="fixed inset-0 z-[70] bg-background/95 backdrop-blur flex items-end">
              <div className="w-full bg-card rounded-t-3xl border-t border-border p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-3">
                <p className="font-serif italic text-2xl">{t("avatar.deleteConfirmTitle")}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{t("avatar.deleteConfirmBody")}</p>
                <button
                  onClick={() => void confirmDelete()}
                  disabled={deleting}
                  className="w-full h-11 rounded-full bg-red-700 text-white text-[10px] uppercase tracking-[0.3em] active:scale-[0.98] disabled:opacity-50"
                >{deleting ? <Loader2 size={14} className="animate-spin mx-auto" /> : t("avatar.delete")}</button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="w-full h-11 rounded-full border border-border text-[10px] uppercase tracking-[0.3em]"
                >{t("avatar.cancel")}</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="px-6 mt-2 animate-fade-up">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("avatar.setupEyebrow")}</p>
          <h2 className="font-serif text-3xl italic mt-2">{t("avatar.setupTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t("avatar.setupSubtitle")}</p>

          <button
            onClick={() => fileRef.current?.click()}
            className="mt-6 w-full rounded-3xl overflow-hidden bg-secondary/40 aspect-[4/5] flex items-center justify-center relative"
          >
            {preview ? (
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="text-center text-muted-foreground">
                <Camera size={28} className="mx-auto" />
                <p className="mt-3 text-[10px] uppercase tracking-[0.3em]">{t("avatar.addPhoto")}</p>
              </div>
            )}
            {checkStage === "checking" && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}
          </button>

          {preview && checkStage !== "checking" && (
            <button onClick={() => fileRef.current?.click()} className="mt-2 w-full text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {t("avatar.retakePhoto")}
            </button>
          )}

          {checkMessage && (
            <p className="mt-3 text-xs text-red-700 text-center leading-relaxed">{checkMessage}</p>
          )}

          {checkStage === "ready" && (
            <div className="mt-6 rounded-2xl bg-secondary/40 p-4 animate-fade-up">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("avatar.consentTitle")}</p>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{t("avatar.consentBody")}</p>
              <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
                />
                <span className="text-xs leading-relaxed">{t("avatar.consentCheckbox")}</span>
              </label>
            </div>
          )}

          {checkStage === "ready" && (
            <button
              onClick={() => void continueSetup()}
              disabled={!consentChecked || saving}
              className="mt-4 w-full h-14 rounded-full bg-foreground text-background flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-luxe disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              <span className="text-xs uppercase tracking-[0.3em]">{t("avatar.continueButton")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
