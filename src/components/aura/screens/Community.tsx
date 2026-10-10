import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Search, UserPlus, Check, X } from "lucide-react";
import type { Screen } from "../AuraApp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ConversationList } from "../ConversationList";
import {
  USERNAME_RE, initials, signPaths, listFriendships, searchProfiles,
  type Friendship, type SearchResult,
} from "@/lib/community";

function Avatar({ url, username, size = 36 }: { url?: string | null; username?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ height: size, width: size }} className="rounded-full object-cover" />;
  return (
    <div
      style={{ height: size, width: size }}
      className="rounded-full bg-secondary/60 flex items-center justify-center text-[10px] tracking-widest"
    >{initials(username)}</div>
  );
}

/* ---------------------------------------------------------------- username */

function UsernameSheet({ onSaved }: { onSaved: (u: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const valid = USERNAME_RE.test(value);

  useEffect(() => {
    if (!valid) { setAvailable(null); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("username_available", { _username: value });
      setChecking(false);
      setAvailable(error ? null : Boolean(data));
    }, 400);
    return () => { clearTimeout(t); setChecking(false); };
  }, [value, valid]);

  const save = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const me = userData.user?.id;
    if (!me) { setSaving(false); toast.error(t("community.toastSignedOut")); return; }
    const { error } = await supabase.from("profiles").upsert({ id: me, username: value }, { onConflict: "id" });
    setSaving(false);
    if (error) {
      if (error.code === "23505") { setAvailable(false); toast.error(t("community.toastUsernameTaken")); }
      else toast.error(error.message);
      return;
    }
    toast.success(t("community.toastUsernameSaved"));
    onSaved(value);
  };

    return createPortal(
    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur flex items-end">
      <div className="w-full bg-card rounded-t-3xl border-t border-border p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-3">
        <p className="font-serif italic text-2xl">{t("community.chooseUsername")}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("community.usernameHint")}
        </p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase().replace(/\s+/g, ""))}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("community.usernamePlaceholder")}
          className="w-full bg-secondary/60 rounded-full px-4 py-3 text-sm outline-none"
        />
        <p className="text-[11px] h-4 text-muted-foreground">
          {value.length === 0 ? "" :
            !valid ? t("community.invalidFormat") :
            checking ? t("community.checking") :
            available === true ? t("community.available") :
            available === false ? t("community.alreadyTaken") : ""}
        </p>
        <button
          onClick={() => void save()}
          disabled={!valid || available !== true || saving}
          className="w-full h-11 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] active:scale-[0.98] disabled:opacity-50"
        >{saving ? t("community.saving") : t("community.save")}</button>
            </div>
    </div>,
        document.body,
  );
}

/* ------------------------------------------------------------------ main */

export function Community({ go, openConversation, openUserProfile, initialTab = "chat" }: {
  go: (s: Screen) => void; openConversation?: (id: string) => void; openUserProfile?: (id: string) => void;
  /** "friends" when opened from a friend-request notification: the requests are right there. */
  initialTab?: "chat" | "friends";
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // The shared-outfit feed was removed from Community (product decision): chats and friends
  // remain. Existing outfit_shares rows are left untouched.
  const [tab, setTab] = useState<"chat" | "friends">(initialTab);
  const [username, setUsername] = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);


  const [friends, setFriends] = useState<Friendship[]>([]);
  const [friendAvatars, setFriendAvatars] = useState<Record<string, string>>({});
  const [loadingFriends, setLoadingFriends] = useState(true);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // profile / username gate
  useEffect(() => {
    if (!user) return;
    let on = true;
    (async () => {
      const { data, error } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
      if (!on) return;
      if (error) toast.error(error.message);
      setUsername(data?.username ?? null);
      setProfileReady(true);
    })();
    return () => { on = false; };
  }, [user]);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    setLoadingFriends(true);
    try {
      const list = await listFriendships();
      setFriends(list);
      setFriendAvatars(await signPaths("avatars", list.filter((f) => f.status === "accepted").map((f) => f.profile_image)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("community.toastCouldNotLoadFriends"));
    } finally {
      setLoadingFriends(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !username) { setLoadingFriends(false); return; }
    void loadFriends();
  }, [user, username, loadFriends]);

  // debounced username search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try { setResults(await searchProfiles(q)); }
      catch (e) { toast.error(e instanceof Error ? e.message : t("community.searchFailed")); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, friends]);

  const sendRequest = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("friends").insert({ requester_id: user.id, addressee_id: id });
    if (error) { toast.error(error.code === "23505" ? t("community.toastRequestAlreadySent") : error.message); return; }
    toast.success(t("community.toastRequestSent"));
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, relation: "outgoing" } : r)));
    await loadFriends();
  };

  const accept = async (f: Friendship) => {
    const { error } = await supabase.from("friends").update({ status: "accepted" }).eq("id", f.friendship_id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("community.toastNowFriends", { name: f.username ?? t("community.someone") }));
    await loadFriends();
  };

  const removeFriendship = async (f: Friendship, label: string) => {
    const { error } = f.status === "accepted"
      ? await supabase.rpc("unfriend", { _other: f.other_id })
      : await supabase.from("friends").delete().eq("id", f.friendship_id);
    if (error) { toast.error(error.message); return; }
    toast.success(label);
    await loadFriends();
  };

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center px-10 text-center">
        <p className="text-sm text-muted-foreground">{t("community.signInToUse")}</p>
      </div>
    );
  }

  const incoming = friends.filter((f) => f.status === "pending" && f.direction === "incoming");
  const outgoing = friends.filter((f) => f.status === "pending" && f.direction === "outgoing");
  const accepted = friends.filter((f) => f.status === "accepted");

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28">
      <header className="px-6 pt-14 pb-3 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("community.atelier")}</p>
          <h1 className="font-serif text-4xl mt-1">{t("community.title")}</h1>
        </div>
        <div className="flex items-center gap-3">
          {username && <p className="text-xs text-muted-foreground">@{username}</p>}
        </div>
      </header>

      <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar px-6">
        {(["chat", "friends"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs transition ${tab === c ? "bg-foreground text-background" : "bg-secondary/60 text-foreground/70"}`}
          >{c === "chat" ? t("community.tabChat") : t("community.tabFriends")}</button>
        ))}
      </div>

      {tab === "chat" ? (
        <ConversationList
          openThread={(id) => (openConversation ? openConversation(id) : go("chats"))}
          onStartChat={() => go("chats")}
        />
      ) : (
        <div className="mt-6 px-6 space-y-8">
          <section>
            <div className="flex items-center gap-2 bg-secondary/60 rounded-full px-4 py-2.5">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value.toLowerCase())}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t("community.searchByUsername")}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {searching && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
            </div>
            <div className="mt-3 space-y-1">
              {results.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-2">
                  <button type="button" onClick={() => openUserProfile?.(r.id)} className="flex items-center gap-3 flex-1 text-left active:scale-[0.98] transition">
                    <Avatar username={r.username} />
                    <span className="text-sm flex-1">{r.username}</span>
                  </button>
                  {r.relation === "friends" ? (
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("community.friends")}</span>
                  ) : r.relation === "outgoing" ? (
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("community.pending")}</span>
                  ) : r.relation === "incoming" ? (
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("community.requestedYou")}</span>
                  ) : (
                    <button
                      onClick={() => void sendRequest(r.id)}
                      className="h-8 px-4 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.2em] active:scale-95 inline-flex items-center gap-1.5"
                    ><UserPlus size={11} /> {t("community.add")}</button>
                  )}
                </div>
              ))}
              {query.trim().length >= 2 && !searching && results.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">{t("community.noOneFound")}</p>
              )}
            </div>
          </section>

          {loadingFriends ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={18} /></div>
          ) : (
            <>
              {incoming.length > 0 && (
                <section>
                  <h2 className="font-serif text-2xl italic mb-2">{t("community.requests")}</h2>
                  {incoming.map((f) => (
                    <div key={f.friendship_id} className="flex items-center gap-3 py-2">
                      <button type="button" onClick={() => openUserProfile?.(f.other_id)} className="flex items-center gap-3 flex-1 text-left active:scale-[0.98] transition">
                        <Avatar username={f.username} />
                        <span className="text-sm flex-1">{f.username ?? "—"}</span>
                      </button>
                      <button onClick={() => void accept(f)} aria-label={t("community.acceptAria")} className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center active:scale-90"><Check size={13} /></button>
                      <button onClick={() => void removeFriendship(f, t("community.toastRequestDeclined"))} aria-label={t("community.declineAria")} className="h-8 w-8 rounded-full border border-border flex items-center justify-center active:scale-90"><X size={13} /></button>
                    </div>
                  ))}
                </section>
              )}

              {outgoing.length > 0 && (
                <section>
                  <h2 className="font-serif text-2xl italic mb-2">{t("community.sent")}</h2>
                  {outgoing.map((f) => (
                    <div key={f.friendship_id} className="flex items-center gap-3 py-2">
                      <button type="button" onClick={() => openUserProfile?.(f.other_id)} className="flex items-center gap-3 flex-1 text-left active:scale-[0.98] transition">
                        <Avatar username={f.username} />
                        <span className="text-sm flex-1">{f.username ?? "—"}</span>
                      </button>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("community.pending")}</span>
                      <button
                        onClick={() => void removeFriendship(f, t("community.toastRequestCancelled"))}
                        className="h-8 px-3 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] active:scale-95"
                      >{t("community.cancel")}</button>
                    </div>
                  ))}
                </section>
              )}

              <section>
                <h2 className="font-serif text-2xl italic mb-2">{t("community.myFriends")}</h2>
                {accepted.length === 0 ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("community.noFriendsYet")}
                  </p>
                ) : accepted.map((f) => (
                  <div key={f.friendship_id} className="flex items-center gap-3 py-2">
                    <button type="button" onClick={() => openUserProfile?.(f.other_id)} className="flex items-center gap-3 flex-1 text-left active:scale-[0.98] transition">
                      <Avatar url={f.profile_image ? friendAvatars[f.profile_image] : null} username={f.username} />
                      <span className="text-sm flex-1">{f.username ?? "—"}</span>
                    </button>
                    <button
                      onClick={() => void removeFriendship(f, t("community.toastFriendRemoved"))}
                      className="h-8 px-3 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] active:scale-95"
                    >{t("community.remove")}</button>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      )}

      {profileReady && !username && <UsernameSheet onSaved={(u) => setUsername(u)} />}
    </div>
  );
}

