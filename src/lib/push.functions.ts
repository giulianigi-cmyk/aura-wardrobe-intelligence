// The app's side of push notifications: AURA's public key for subscribing, saving and removing this
// device's subscription, and a test notification. Subscriptions are written by the server only.
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isAllowedPushEndpoint } from "./web-push";

export const getPushPublicKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { vapidKeys } = await import("./push.server");
    return { publicKey: (await vapidKeys()).publicKey };
  });

const Subscription = z.object({
  endpoint: z.string().max(2000).refine(isAllowedPushEndpoint, "unsupported push service"),
  p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/),
  auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/),
  platform: z.string().max(20).regex(/^[a-z-]+$/).nullable().optional(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Subscription.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The endpoint is unique per browser: subscribing again (or on a shared device, with another
    // account) moves it to this account.
    const { error } = await (supabaseAdmin.from("push_subscriptions" as never) as any).upsert(
      { user_id: context.userId, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth, platform: data.platform ?? null, failure_count: 0 },
      { onConflict: "endpoint" },
    );
    if (error) {
      console.warn("[AURA push] subscription not saved", error.code ?? "error");
      return { ok: false as const };
    }
    return { ok: true as const };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ endpoint: z.string().max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin.from("push_subscriptions" as never) as any).delete().eq("user_id", context.userId).eq("endpoint", data.endpoint);
    return { ok: true as const };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ language: z.string().max(5).nullable().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { sendPushToUser } = await import("./push.server");
    const { morningMessage } = await import("./morning-look");
    const r = await sendPushToUser(context.userId, { ...morningMessage(data.language, null), url: "/", tag: "morning-look-test" });
    return { sent: r.sent };
  });
