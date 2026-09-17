import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Check, Share2, Download, Copy, Mail, Instagram, Facebook, Music2, MessageCircle, Calendar as CalendarIcon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { acceptedFriends, initials, signPaths, type Friendship } from "@/lib/community";
import { getOrCreateDirect, sendOutfitShare } from "@/lib/chat";
import { createWatermarkedChatSnapshot } from "@/lib/chat-watermark";
import {
  AURA_APP_URL, AURA_SHARE_CAPTION, downloadBlob, nativeShareFile, shareLinks,
} from "@/lib/aura-share";
import { saveOutfitPlan } from "@/lib/outfit-plan.functions";
import { useOutfitPlansCacheActions } from "@/lib/outfit-plans-query";

type ShareMode = "friend" | "feed" | "external";

/** Bottom sheet to share one of the user's own outfits — reachable from
 *  AIStylist's "My Outfits" list, i.e. for an outfit already saved,
 *  distinct from the richer share sheet OutfitBuilder shows right after
 *  building/saving one. Three genuinely different destinations:
 * - "friend": sends the outfit as a real message inside a private 1:1
 *   conversation (reuses the same chat pipeline ChatThread's outfit
 *   attach uses) — visible only to that person, ever.
 * - "feed": posts to `outfit_shares` with shared_with = NULL, visible to
 *   every accepted friend (see get_shared_feed RPC). This is the only
 *   path that is actually a feed; it used to be faked by picking friends
 *   one by one, which created a private post per person while looking
 *   like a public feed post — confusing, and fixed here.
 * - "external": outside AURA entirely (WhatsApp, Instagram, TikTok,
 *   email, copy link, the OS share sheet) — previously only available
 *   from OutfitBuilder's own post-save flow, never from here, so
 *   revisiting a saved outfit later to share it outside the app had no
 *   path to do that at all. Also offers adding the outfit to the
 *   calendar, same gap: OutfitBuilder has this once, right after
 *   saving, but there was no way back to it afterward. */
export function ShareOutfitSheet({ outfitId, onClose }: { outfitId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ShareMode>("friend");
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Loaded once for the "external" tab and the calendar action — the
  // outfit's real image (as a shareable blob, not just a link) and its
  // item_ids (needed to add it to a calendar plan).
  const [outfitData, setOutfitData] = useState<{ itemIds: string[]; canvasPath: string | null } | null>(null);
  const [shareAsset, setShareAsset] = useState<{ blob: Blob; signedUrl: string | null } | null>(null);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [savingCalendar, setSavingCalendar] = useState(false);
  const savePlan = useServerFn(saveOutfitPlan);
  const outfitPlansCache = useOutfitPlansCacheActions();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await acceptedFriends();
        if (!alive) return;
        setFriends(list);
        const map = await signPaths("avatars", list.map((f) => f.profile_image));
        if (alive) setAvatars(map);
      } catch (e) {
        if (alive) toast.error(e instanceof Error ? e.message : t("shareOutfitSheet.couldNotLoadFriends"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Fetches the outfit's own data (item_ids + canvas path) once, the
  // first time either the "external" tab or the calendar picker is
  // opened — not on mount, since a person who only ever shares to a
  // friend never needs this at all.
  const ensureOutfitData = async (): Promise<{ itemIds: string[]; canvasPath: string | null } | null> => {
    if (outfitData) return outfitData;
    const { data, error } = await supabase
      .from("outfits").select("item_ids, canvas_image_url").eq("id", outfitId).maybeSingle();
    if (error || !data) return null;
    const next = { itemIds: (data.item_ids ?? []) as string[], canvasPath: (data.canvas_image_url as string | null) ?? null };
    setOutfitData(next);
    return next;
  };

  const openExternal = async () => {
    setMode("external");
    if (shareAsset) return;
    setLoadingExternal(true);
    try {
      const info = await ensureOutfitData();
      if (!info?.canvasPath) { toast.error(t("shareOutfitSheet.noImageToShare")); return; }
      const { data: signedData } = await supabase.storage.from("outfits")
        .createSignedUrl(info.canvasPath, 60 * 60 * 24 * 7);
      const { data: imgData } = await supabase.storage.from("outfits").createSignedUrl(info.canvasPath, 300);
      if (!imgData?.signedUrl) { toast.error(t("shareOutfitSheet.noImageToShare")); return; }
      const resp = await fetch(imgData.signedUrl);
      const blob = await resp.blob();
      setShareAsset({ blob, signedUrl: signedData?.signedUrl ?? null });
    } catch (e) {
      console.error("[AURA share-outfit] loading image for external share failed", e);
      toast.error(t("shareOutfitSheet.noImageToShare"));
    } finally {
      setLoadingExternal(false);
    }
  };

  const openCalendarPicker = async () => {
    await ensureOutfitData();
    setShowCalendarPicker(true);
  };

  const saveToCalendar = async () => {
    const info = await ensureOutfitData();
    if (!info?.itemIds.length) { toast.error(t("shareOutfitSheet.couldNotAddToCalendar")); return; }
    setSavingCalendar(true);
    try {
      await savePlan({ data: { itemIds: info.itemIds, date: calendarDate } });
      outfitPlansCache.invalidate();
      toast.success(t("shareOutfitSheet.addedToCalendar"));
      setShowCalendarPicker(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("shareOutfitSheet.couldNotAddToCalendar"));
    } finally {
      setSavingCalendar(false);
    }
  };

  const doNativeShare = async () => {
    if (!shareAsset) return;
    const file = new File([shareAsset.blob], "aura-outfit.png", { type: "image/png" });
    const ok = await nativeShareFile(file, AURA_SHARE_CAPTION);
    if (!ok) toast.message(t("shareOutfitSheet.nativeShareNotAvailable"));
  };

  const shareToWhatsApp = async () => {
    if (!shareAsset) return;
    const file = new File([shareAsset.blob], "aura-outfit.png", { type: "image/png" });
    const ok = await nativeShareFile(file, AURA_SHARE_CAPTION);
    if (!ok) window.open(shareLinks(shareAsset.signedUrl ?? AURA_APP_URL, AURA_SHARE_CAPTION).whatsapp, "_blank");
  };

  const copyLink = async () => {
    if (!shareAsset?.signedUrl) { toast.error(t("shareOutfitSheet.noShareableLinkYet")); return; }
    try {
      await navigator.clipboard.writeText(`${AURA_SHARE_CAPTION}\n${shareAsset.signedUrl}`);
      toast.success(t("shareOutfitSheet.linkCopied"));
    } catch {
      toast.error(t("shareOutfitSheet.copyFailed"));
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const shareToFriends = async () => {
    if (!selected.length) return;
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const me = userData.user?.id;
    if (!me) { setBusy(false); toast.error(t("shareOutfitSheet.youAreSignedOut")); return; }

    const { data: outfit, error: outfitErr } = await supabase
      .from("outfits").select("canvas_image_url").eq("id", outfitId).maybeSingle();
    if (outfitErr || !outfit?.canvas_image_url) {
      setBusy(false);
      toast.error(t("shareOutfitSheet.couldNotShareWithCount", { count: selected.length }));
      return;
    }
    const { data: myProfile } = await supabase.from("profiles").select("username").eq("id", me).maybeSingle();
    const senderUsername = (myProfile as { username?: string | null } | null)?.username ?? null;

    let ok = 0;
    let failed = 0;
    for (const friendId of selected) {
      try {
        const conversationId = await getOrCreateDirect(friendId);
        const snapshotImageUrl = await createWatermarkedChatSnapshot({
          sourcePath: outfit.canvas_image_url as string,
          senderId: me,
          senderUsername,
        });
        await sendOutfitShare({ conversationId, senderId: me, outfitId, snapshotImageUrl, body: null });
        ok++;
      } catch {
        failed++;
      }
    }
    setBusy(false);
    if (ok) toast.success(t("shareOutfitSheet.sentInChatCount", { count: ok }));
    if (failed) toast.error(t("shareOutfitSheet.couldNotShareWithCount", { count: failed }));
    if (!failed) onClose();
  };

  const shareToFeed = async () => {
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const me = userData.user?.id;
    if (!me) { setBusy(false); toast.error(t("shareOutfitSheet.youAreSignedOut")); return; }

    const { error } = await supabase
      .from("outfit_shares")
      .insert({ outfit_id: outfitId, shared_by: me, shared_with: null });
    setBusy(false);
    if (error && error.code === "23505") {
      toast(t("shareOutfitSheet.alreadyOnFeed"));
      onClose();
      return;
    }
    if (error) { toast.error(error.message); return; }
    toast.success(t("shareOutfitSheet.sharedToFeed"));
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur flex items-end" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-card rounded-t-3xl border-t border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3 max-h-[82vh] overflow-y-auto overscroll-contain"
      >
        <p className="font-serif italic text-lg">{t("shareOutfitSheet.shareOutfit")}</p>

        <div className="flex rounded-full bg-secondary/60 p-1">
          <button
            onClick={() => setMode("friend")}
            className={`flex-1 h-9 rounded-full text-[11px] uppercase tracking-[0.2em] transition ${mode === "friend" ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >{t("shareOutfitSheet.modeFriend")}</button>
          <button
            onClick={() => setMode("feed")}
            className={`flex-1 h-9 rounded-full text-[11px] uppercase tracking-[0.2em] transition ${mode === "feed" ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >{t("shareOutfitSheet.modeFeed")}</button>
          <button
            onClick={() => void openExternal()}
            className={`flex-1 h-9 rounded-full text-[11px] uppercase tracking-[0.2em] transition ${mode === "external" ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >{t("shareOutfitSheet.modeExternal")}</button>
        </div>

        {mode === "friend" ? (
          loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={18} /></div>
          ) : friends.length === 0 ? (
            <p className="text-sm text-muted-foreground leading-relaxed">{t("shareOutfitSheet.noFriendsYetHint")}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground px-1">{t("shareOutfitSheet.modeFriendHint")}</p>
              <div className="space-y-1">
                {friends.map((f) => {
                  const on = selected.includes(f.other_id);
                  const url = f.profile_image ? avatars[f.profile_image] : null;
                  return (
                    <button
                      key={f.other_id}
                      onClick={() => toggle(f.other_id)}
                      className="w-full flex items-center gap-3 py-2.5 px-1 text-left active:scale-[0.99]"
                    >
                      {url ? (
                        <img src={url} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-secondary/60 flex items-center justify-center text-[10px] tracking-widest">
                          {initials(f.username)}
                        </div>
                      )}
                      <span className="text-sm flex-1">{f.username ?? "—"}</span>
                      <span className={`h-6 w-6 rounded-full border flex items-center justify-center ${on ? "bg-foreground text-background border-foreground" : "border-border"}`}>
                        {on && <Check size={12} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => void shareToFriends()}
                disabled={!selected.length || busy}
                className="w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98] disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >{busy && <Loader2 size={12} className="animate-spin" />} {t("shareOutfitSheet.sendInChat")}</button>
            </>
          )
        ) : mode === "feed" ? (
          <>
            <p className="text-xs text-muted-foreground px-1 leading-relaxed">{t("shareOutfitSheet.modeFeedHint")}</p>
            <button
              onClick={() => void shareToFeed()}
              disabled={busy}
              className="w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98] disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >{busy && <Loader2 size={12} className="animate-spin" />} {t("shareOutfitSheet.shareToFeedButton")}</button>
          </>
        ) : loadingExternal ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={18} /></div>
        ) : !shareAsset ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{t("shareOutfitSheet.noImageToShare")}</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              <ShareBtn icon={<Share2 size={16} />} label={t("shareOutfitSheet.share")} onClick={doNativeShare} />
              <ShareBtn icon={<Download size={16} />} label={t("shareOutfitSheet.saveButton")} onClick={async () => {
                const file = new File([shareAsset.blob], "aura-outfit.png", { type: "image/png" });
                const ok = await nativeShareFile(file, AURA_SHARE_CAPTION);
                if (!ok) downloadBlob(shareAsset.blob, "aura-outfit.png");
              }} />
              <ShareBtn icon={<Copy size={16} />} label={t("shareOutfitSheet.copyLink")} onClick={copyLink} />
              <ShareBtn icon={<MessageCircle size={16} />} label={t("shareOutfitSheet.whatsapp")} onClick={shareToWhatsApp} />
              <ShareBtn icon={<Instagram size={16} />} label={t("shareOutfitSheet.instagram")} onClick={async () => {
                const file = new File([shareAsset.blob], "aura-outfit.png", { type: "image/png" });
                const ok = await nativeShareFile(file, AURA_SHARE_CAPTION);
                if (!ok) downloadBlob(shareAsset.blob, "aura-outfit.png");
                window.location.href = shareLinks("", "").instagram;
              }} />
              <ShareBtn icon={<Music2 size={16} />} label={t("shareOutfitSheet.tiktok")} onClick={async () => {
                const file = new File([shareAsset.blob], "aura-outfit.png", { type: "image/png" });
                const ok = await nativeShareFile(file, AURA_SHARE_CAPTION);
                if (!ok) downloadBlob(shareAsset.blob, "aura-outfit.png");
                window.location.href = shareLinks("", "").tiktok;
              }} />
              <ShareBtn icon={<Facebook size={16} />} label={t("shareOutfitSheet.facebook")} onClick={() => window.open(shareLinks(shareAsset.signedUrl ?? AURA_APP_URL, AURA_SHARE_CAPTION).facebook, "_blank")} />
              <ShareBtn icon={<Mail size={16} />} label={t("shareOutfitSheet.email")} onClick={() => window.location.href = shareLinks(shareAsset.signedUrl ?? AURA_APP_URL, AURA_SHARE_CAPTION).email} />
            </div>
            <button
              onClick={() => void openCalendarPicker()}
              className="w-full h-11 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] active:scale-[0.98] inline-flex items-center justify-center gap-2"
            ><CalendarIcon size={13} /> {t("shareOutfitSheet.addToCalendar")}</button>
          </>
        )}

        {showCalendarPicker && (
          <div className="fixed inset-0 z-[70] bg-background/95 backdrop-blur flex items-end" onClick={() => setShowCalendarPicker(false)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full bg-card rounded-t-3xl border-t border-border p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-3">
              <p className="font-serif italic text-2xl">{t("shareOutfitSheet.selectDate")}</p>
              <input
                type="date"
                value={calendarDate}
                onChange={(e) => setCalendarDate(e.target.value)}
                className="w-full bg-secondary/60 rounded-full px-4 py-3 text-sm outline-none"
              />
              <button
                onClick={() => void saveToCalendar()}
                disabled={savingCalendar}
                className="w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98] disabled:opacity-50"
              >{savingCalendar ? <Loader2 size={14} className="animate-spin mx-auto" /> : t("shareOutfitSheet.saveButton")}</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ShareBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 active:scale-95">
      <span className="h-12 w-12 rounded-full bg-secondary/60 flex items-center justify-center">{icon}</span>
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
    </button>
  );
}

