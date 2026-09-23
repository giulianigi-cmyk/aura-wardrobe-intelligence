import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type Profile = {
  id: string;
  full_name: string | null;
  birth_date: string | null;
  gender: string | null;
  style_preferences: string[] | null;
  favorite_brands: string[] | null;
  owned_brands: string[];
  avatar_url: string | null;
  profile_image: string | null;
  bio: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  season: string | null;
  undertone: string | null;
  value: string | null;
  clarity: string | null;
    industry: string | null;
  work_dress_code: string | null;
  personal_formality: string | null;
  style_boldness: string | null;
  work_days: string[] | null;
  work_start_time: string | null;
  work_end_time: string | null;
  share_wardrobe_to_library: boolean | null;
  profession: string | null;

    setup_complete: boolean;
  created_at: string;
  updated_at: string;
  // ISO 639-1 code ("it" | "en" | "es" | "fr") the user picked for the UI
  // language, or null if never set (falls back to the app default).
    language: string | null;
  // In-app notification toggles by type. Defaulted in the DB (see
  // migration), always present once the column exists.
  notification_preferences: { outfit_share: boolean; weather_change: boolean; system: boolean } | null;
};



export function calcAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

async function resolveAvatarUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(value, 60 * 60);
  if (error) {
    console.error("avatar signed url", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

// Shared across every screen: 13 different screens each called this hook, and until now each got
// its OWN independent copy of `profile` — a plain useState fetched once on that component's own
// mount. Since the main tabs (Home, Stylist, Planner, Profile, Wardrobe) stay mounted forever in
// the background (see AuraApp.tsx), a change saved from one screen — PersonalInfo setting gender,
// Settings changing the language — updated only THAT screen's own copy. Every other already-mounted
// screen kept showing what it had loaded at its very first mount, until a full app relaunch made it
// mount for the first time again and finally pick up the real value. Backed by the same shared
// React Query cache pattern already used for wardrobe items, outfits and outfit plans elsewhere in
// this app: one cached row per user, and a write from ANY screen updates it for ALL of them at once.
export const profileQueryKey = (userId: string | undefined) => ["profile", userId] as const;

async function fetchOrCreateProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) console.error("profile load", error);
  if (data) return data as unknown as Profile;
  // First-ever load for this user: no row yet, create one.
  const { data: created } = await supabase.from("profiles").insert({ id: userId }).select("*").maybeSingle();
  return created as unknown as Profile | null;
}

export function useProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: profileQueryKey(user?.id),
    queryFn: () => fetchOrCreateProfile(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });
  const profile = profileQuery.data ?? null;

  const avatarQuery = useQuery({
    queryKey: [...profileQueryKey(user?.id), "avatar", profile?.profile_image ?? null],
    queryFn: () => resolveAvatarUrl(profile?.profile_image),
    enabled: !!user,
  });
  const avatarUrl = avatarQuery.data ?? null;

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: profileQueryKey(user?.id) });
  }, [queryClient, user?.id]);

    const update = useCallback(async (patch: Partial<Profile>) => {
    if (!user) return { error: "Not authenticated" };
    const { data, error } = await supabase
      .from("profiles")
      // Cast needed until the `language` column migration is applied and
      // supabase types.ts is regenerated — the generated Update type
      // doesn't know about it yet, even though the column exists at
      // runtime once the migration below has run. Safe to drop this cast
      // once types.ts is regenerated post-migration.
      .update({ ...patch, updated_at: new Date().toISOString() } as never)

      .eq("id", user.id)
      .select("*")
      .maybeSingle();
    if (error) return { error: error.message };
        const next = data as unknown as Profile;
    // Written straight into the shared cache: every mounted screen using useProfile() sees this
    // change immediately, not just the screen that made the edit.
    queryClient.setQueryData(profileQueryKey(user.id), next);
    if ("profile_image" in patch) void queryClient.invalidateQueries({ queryKey: [...profileQueryKey(user.id), "avatar"] });
    return { error: null };
  }, [user, queryClient]);

  const uploadAvatar = useCallback(async (file: File) => {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      const msg = authErr?.message ?? "Not authenticated";
      console.error("avatar upload auth", authErr);
      return { error: msg, url: null };
    }
    const uid = auth.user.id;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${uid}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (upErr) {
      console.error("avatar upload", upErr);
      return { error: upErr.message, url: null };
    }
    const { error } = await update({ profile_image: path });
    if (error) console.error("avatar profile update", error);
    return { error, url: path };
  }, [update]);

  return { profile, avatarUrl, loading: profileQuery.isLoading, reload, update, uploadAvatar };
}
