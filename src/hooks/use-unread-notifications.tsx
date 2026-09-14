import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Live count of the current user's unread notifications (`read_at is null`).
 * Uses the same realtime channel pattern as the chat notification stream, and
 * also listens for the local `aura:notifications-read` event so the badge
 * clears immediately when the Notifications screen marks rows as read.
 *
 * SINGLETON SUBSCRIPTION: this hook is called from both Home.tsx and
 * Profile.tsx — two of the five tabs that now stay mounted for the
 * whole session (see AuraApp.tsx) instead of unmounting when you
 * navigate away. Before that change, only one of them was ever mounted
 * at a time, so only one subscription ever existed. Once both stay
 * mounted together, both effects fire and both try to open a channel
 * with the SAME name (`notifications-unread:${user.id}`) — Supabase
 * rejects the second attempt to add a postgres_changes callback to a
 * channel of that name once the first is already subscribed, which is
 * exactly the "cannot add postgres_changes callbacks... after
 * subscribe" error this was producing.
 *
 * The fix is a module-level shared subscription with a simple
 * reference count: the first component to call this hook opens the
 * one real channel; every later caller (any number of them, on any
 * screen) just registers to be notified of count changes; the channel
 * is only actually torn down once the LAST caller unmounts. Each
 * caller still gets its own reactive `count` value via local state, so
 * nothing about the hook's return value changes for consumers.
 */
type Listener = (count: number) => void;
let sharedChannel: RealtimeChannel | null = null;
let sharedUserId: string | null = null;
let sharedCount = 0;
let refCount = 0;
const listeners = new Set<Listener>();

async function refreshShared(userId: string) {
  const { count: c, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) return;
  sharedCount = c ?? 0;
  listeners.forEach((l) => l(sharedCount));
}

function acquireSharedChannel(userId: string) {
  // A different user (or the same user reconnecting) tears down and
  // reopens rather than reusing a channel scoped to a stale id.
  if (sharedChannel && sharedUserId !== userId) {
    void supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }
  sharedUserId = userId;
  refCount += 1;
  if (!sharedChannel) {
    sharedChannel = supabase
      .channel(`notifications-unread:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => { void refreshShared(userId); },
      )
      .subscribe();
  }
  return () => {
    refCount -= 1;
    if (refCount <= 0 && sharedChannel) {
      void supabase.removeChannel(sharedChannel);
      sharedChannel = null;
      sharedUserId = null;
    }
  };
}

export function useUnreadNotifications() {
  const { user } = useAuth();
  const [count, setCount] = useState(sharedCount);

  const refresh = useCallback(async () => {
    if (!user) { setCount(0); return; }
    await refreshShared(user.id);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const listener: Listener = (c) => setCount(c);
    listeners.add(listener);
    const release = acquireSharedChannel(user.id);
    return () => {
      listeners.delete(listener);
      release();
    };
  }, [user]);

  useEffect(() => {
    const handler = () => { void refresh(); };
    window.addEventListener("aura:notifications-read", handler);
    return () => window.removeEventListener("aura:notifications-read", handler);
  }, [refresh]);

  return count;
}
