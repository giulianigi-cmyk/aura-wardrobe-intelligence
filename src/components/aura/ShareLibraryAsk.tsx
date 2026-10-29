import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { syncMySharedLibrary } from "@/lib/shared-library.functions";
import { track } from "@/lib/telemetry-client";
import { SHARE_ASK_EVENT, snoozeShareAsk, snoozedRecently, type ShareAskKind } from "@/lib/share-library-ask";

/** The question «Vuoi condividere anche i tuoi capi?» (share-library-ask.ts), mounted once in the app. */
export function ShareLibraryAsk({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { profile, update } = useProfile();
  const [open, setOpen] = useState<ShareAskKind | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onAsk = (e: Event) => {
      if (!profile || profile.share_wardrobe_to_library || snoozedRecently(userId)) return;
      setOpen((e as CustomEvent<ShareAskKind>).detail === "found" ? "found" : "added");
    };
    window.addEventListener(SHARE_ASK_EVENT, onAsk);
    return () => window.removeEventListener(SHARE_ASK_EVENT, onAsk);
  }, [profile, userId]);

  if (!open) return null;

  const notNow = () => { track("flow_step", { feature: "share_library", step: "not_now", kind: open }); snoozeShareAsk(userId); setOpen(null); };
  const yes = async () => {
    setSaving(true);
    const { error } = await update({ share_wardrobe_to_library: true });
    setSaving(false);
    if (error) { toast.error(t("shareAsk.failed")); return; }
    void syncMySharedLibrary().catch(() => {});
    track("flow_step", { feature: "share_library", step: "yes", kind: open });
    toast.success(t("shareAsk.thanks"));
    setOpen(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-background/80 backdrop-blur flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-card rounded-t-3xl border-t sm:border-x border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center"><Users size={17} /></div>
        <p className="mt-3 font-serif italic text-xl leading-tight">{t(open === "found" ? "shareAsk.title" : "shareAsk.titleAdded")}</p>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t(open === "found" ? "shareAsk.body" : "shareAsk.bodyAdded")}</p>
        <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">{t("shareAsk.detail")}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button disabled={saving} onClick={notNow}
            className="h-12 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] disabled:opacity-60">{t("shareAsk.notNow")}</button>
          <button disabled={saving} onClick={() => void yes()}
            className="h-12 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] disabled:opacity-60">{t("shareAsk.yes")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
