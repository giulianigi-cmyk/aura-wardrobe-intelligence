import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Clock, Loader2, User, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import "@/i18n/config";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { PhoneFrame } from "@/components/aura/PhoneFrame";
import { initials } from "@/lib/community";

export const Route = createFileRoute("/add/$username")({
  head: () => ({
    meta: [
      { title: "Add a friend on AURA" },
      { name: "description", content: "Scan an AURA QR code to open a profile and send a friend request in one tap." },
      { name: "robots", content: "noindex" },
      { property: "og:type", content: "profile" },
      { property: "og:title", content: "Add a friend on AURA" },
      { property: "og:description", content: "Open this AURA profile and send a friend request." },
    ],
  }),
  component: AddFriendPage,
});

export const RETURN_KEY = "aura:add_friend_return";

type Found = { id: string; username: string | null; profile_image: string | null; relation: string };

function Inner({ username }: { username: string }) {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "missing" | "found" | "signedout">("loading");
  const [found, setFound] = useState<Found | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Profile lookup requires a session — anonymous visitors can't probe
  // usernames. They get a sign-in prompt and return here afterwards.
  const load = useCallback(async () => {
    setState("loading");
    const { data, error } = await supabase.rpc("profile_by_username", { _username: username.toLowerCase() });
    const row = (data as Found[] | null)?.[0] ?? null;
    if (error || !row) { setFound(null); setState("missing"); return; }
    setFound(row);
    setState("found");
    if (row.profile_image) {
      if (/^https?:\/\//i.test(row.profile_image)) setAvatar(row.profile_image);
      else {
        const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(row.profile_image, 3600);
        setAvatar(signed?.signedUrl ?? null);
      }
    } else setAvatar(null);
  }, [username]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setState("signedout"); return; }
    void load();
  }, [authLoading, user, load]);


  const signIn = () => {
    try { window.localStorage.setItem(RETURN_KEY, `/add/${username.toLowerCase()}`); } catch { /* ignore */ }
    void navigate({ to: "/" });
  };

  const sendRequest = async () => {
    if (!user || !found) return;
    setSending(true);
    const { error } = await supabase.from("friends").insert({ requester_id: user.id, addressee_id: found.id });
    setSending(false);
    if (error) {
      toast.error(error.code === "23505" ? t("addFriend.alreadySent") : error.message);
      await load();
      return;
    }
    toast.success(t("addFriend.sent"));
    setFound({ ...found, relation: "outgoing" });
  };

  const label = (() => {
    switch (found?.relation) {
      case "self": return t("addFriend.self");
      case "friends": return t("addFriend.friends");
      case "outgoing": return t("addFriend.outgoing");
      case "incoming": return t("addFriend.incoming");
      default: return null;
    }
  })();

  return (
    <div className="h-full w-full overflow-y-auto no-scrollbar bg-background flex flex-col items-center justify-center px-8 text-center">
      {state === "loading" || authLoading ? (
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      ) : state === "signedout" ? (
        <>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("addFriend.invite")}</p>
          <p className="mt-5 font-serif text-3xl italic">@{username}</p>
          <p className="mt-3 text-sm text-muted-foreground">{t("addFriend.signInToView")}</p>
          <button
            onClick={signIn}
            className="mt-8 w-full max-w-xs h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-95"
          >{t("addFriend.signInToAdd")}</button>
          <p className="mt-3 text-[11px] text-muted-foreground">{t("addFriend.comeBack")}</p>
        </>
      ) : state === "missing" ? (

        <>
          <p className="font-serif text-3xl italic">{t("addFriend.notFound")}</p>
          <p className="mt-3 text-sm text-muted-foreground">{t("addFriend.noMember", { username })}</p>
          <button
            onClick={() => void navigate({ to: "/" })}
            className="mt-8 h-11 px-7 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] active:scale-95"
          >{t("addFriend.openAura")}</button>
        </>
      ) : (
        <>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("addFriend.member")}</p>
          <div className="mt-6 h-24 w-24 rounded-full p-[3px] bg-gradient-to-br from-[var(--champagne)] to-[var(--taupe)] animate-scale-in">
            {avatar ? (
              <img src={avatar} alt={`@${found?.username}`} className="h-full w-full rounded-full object-cover border-2 border-background" />
            ) : (
              <div className="h-full w-full rounded-full bg-secondary/80 border-2 border-background flex items-center justify-center">
                {found?.username ? (
                  <span className="font-serif text-lg">{initials(found.username)}</span>
                ) : <User size={30} className="text-muted-foreground" strokeWidth={1.5} />}
              </div>
            )}
          </div>
          <p className="mt-5 font-serif text-3xl italic">@{found?.username}</p>

          <div className="mt-10 w-full max-w-xs">
            {!user ? (
              <>
                <button
                  onClick={signIn}
                  className="w-full h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-95"
                >{t("addFriend.signInToAdd")}</button>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {t("addFriend.comeBack")}
                </p>
              </>
            ) : label ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                {found?.relation === "friends" ? <Check size={14} /> : found?.relation === "outgoing" ? <Clock size={14} /> : null}
                <span>{label}</span>
              </div>
            ) : (
              <button
                onClick={() => void sendRequest()}
                disabled={sending}
                className="w-full h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} {t("addFriend.add")}
              </button>
            )}
            <button
              onClick={() => void navigate({ to: "/" })}
              className="w-full h-11 mt-3 rounded-full border border-border text-[10px] uppercase tracking-[0.3em] active:scale-95"
            >{t("addFriend.openAura")}</button>
          </div>
        </>
      )}
    </div>
  );
}

function AddFriendPage() {
  const { username } = Route.useParams();
  return (
    <AuthProvider>
      <PhoneFrame>
        <Inner username={username} />
      </PhoneFrame>
    </AuthProvider>
  );
}
