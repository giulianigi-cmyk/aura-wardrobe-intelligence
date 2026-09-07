// AURA Avatar — profile-level CRUD. Everything about actually generating
// a try-on image lives in avatar-tryon.functions.ts; this file only
// manages the person's stored photo, consent record, and lifecycle.
//
// Upload itself happens client-side straight to the "avatar-private"
// bucket (same direct-upload pattern as wardrobe items in AddItem.tsx —
// RLS keys off the auth.uid()/ prefix in the path). This file just
// records the resulting path once the client confirms both the face
// check (face-analyze.ts, already existed) and the body check
// (avatar-body-check.ts, new) passed, and biometric consent was given.
//
// No separate "Model Creation" pre-processing step: the hands-on test
// that validated FASHN Try-On Max used the raw uploaded selfie directly
// as model_image and produced a faithful result, so avatar_image_path is
// simply set equal to photo_path — a placeholder for a future cleanup
// step (e.g. background normalization) if that ever proves necessary,
// not evidence one is needed today.

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const CURRENT_CONSENT_VERSION = "2026-09-avatar-v1";

export const getAvatarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin.from("user_avatar" as never) as any)
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { exists: false as const };

    let signedPhotoUrl: string | null = null;
    if (data.photo_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from("avatar-private")
        .createSignedUrl(data.photo_path, 60 * 60);
      signedPhotoUrl = signed?.signedUrl ?? null;
    }

    return {
      exists: true as const,
      photoPath: data.photo_path as string | null,
      signedPhotoUrl,
      generationStatus: data.generation_status as string,
      generationError: data.generation_error as string | null,
      consentGivenAt: data.biometric_consent_given_at as string | null,
    };
  });

const SavePhotoInput = z.object({
  photoPath: z.string().min(1),
  // Defense in depth: the client already gates the whole upload flow
  // behind the consent checkbox and never calls this without it checked.
  // This just refuses to persist a photo if that ever isn't true, rather
  // than depending on a custom error message that would need re-checking
  // against Zod's version (this repo is on v4, whose error-customization
  // API differs from v3's errorMap).
  consentAccepted: z.literal(true),
});

export const saveAvatarPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SavePhotoInput.parse(input))
  .handler(async ({ data, context }) => {
    // Defence in depth: the path must live under this user's own folder.
    // The bucket's RLS policy already enforces this for the upload itself,
    // but a stale/forged path here would otherwise silently point the
    // record at someone else's file.
    if (!data.photoPath.startsWith(`${context.userId}/`)) {
      throw new Error("Photo path does not belong to the current user.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Clean up whatever photo/avatar files this replaces, so storage
    // doesn't accumulate an orphaned file per "change photo" action.
    const { data: existing } = await (supabaseAdmin.from("user_avatar" as never) as any)
      .select("photo_path")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing?.photo_path && existing.photo_path !== data.photoPath) {
      await supabaseAdmin.storage.from("avatar-private").remove([existing.photo_path]);
    }

    const { error } = await (supabaseAdmin.from("user_avatar" as never) as any).upsert(
      {
        user_id: context.userId,
        photo_path: data.photoPath,
        avatar_image_path: data.photoPath,
        generation_status: "completed",
        generation_error: null,
        biometric_consent_given_at: new Date().toISOString(),
        biometric_consent_version: CURRENT_CONSENT_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    // A photo change invalidates every cached try-on for this person —
    // they'd otherwise show the old face/body under the new selection.
    await (supabaseAdmin.from("avatar_tryon_cache" as never) as any)
      .delete()
      .eq("user_id", context.userId);

    return { ok: true as const };
  });

/** Shared by "Elimina avatar" and "Revoca consenso" — the spec ties them
 *  together (revoking consent must delete the avatar and original
 *  photos, not just flip a flag). */
export const deleteAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await (supabaseAdmin.from("user_avatar" as never) as any)
      .select("photo_path")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing?.photo_path) {
      await supabaseAdmin.storage.from("avatar-private").remove([existing.photo_path]);
    }

    await (supabaseAdmin.from("avatar_tryon_cache" as never) as any)
      .delete()
      .eq("user_id", context.userId);

    const { error } = await (supabaseAdmin.from("user_avatar" as never) as any)
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });
