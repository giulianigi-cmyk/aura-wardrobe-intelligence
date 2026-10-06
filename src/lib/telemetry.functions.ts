// Usage events, app errors and "Segnala un problema" — written by the server only (the tables have
// no insert policy), after checking every field. A failure here is logged without content and
// never reaches the person.
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ERROR_KINDS, EVENT_NAMES, MAX_MESSAGE, MAX_STACK, SCREEN_RE, errorFingerprint, scrubText } from "./telemetry";

const Screen = z.string().regex(SCREEN_RE).nullable().optional();
const Common = {
  sessionId: z.string().uuid(),
  platform: z.string().max(20).regex(/^[a-z-]+$/).nullable().optional(),
};
// Event fields: a short, fixed set — never free text.
const Props = z.object({
  source: z.string().max(30).regex(/^[a-z0-9_-]+$/).optional(),
  feature: z.string().max(30).regex(/^[a-z0-9_-]+$/).optional(),
  outcome: z.enum(["ok", "error", "cancelled"]).optional(),
  count: z.number().int().min(0).max(100_000).optional(),
  step: z.string().max(30).regex(/^[a-z0-9_-]+$/).optional(),
  ms: z.number().int().min(0).max(3_600_000).optional(),
}).strict();

const EventsInput = z.object({
  ...Common,
  events: z.array(z.object({ name: z.enum(EVENT_NAMES), screen: Screen, props: Props.optional() })).min(1).max(25),
});

const ErrorsInput = z.object({
  ...Common,
  errors: z.array(z.object({
    kind: z.enum(ERROR_KINDS),
    message: z.string().min(1).max(2000),
    stack: z.string().max(8000).nullable().optional(),
    screen: Screen,
  })).min(1).max(10),
});

async function insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin.from(table as never) as any).insert(rows);
  if (error) console.warn(`[AURA telemetry] ${table} insert failed`, error.code ?? "error");
}

export const recordAppEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EventsInput.parse(input))
  .handler(async ({ data, context }) => {
    await insert("app_events", data.events.map((e) => ({
      user_id: context.userId, session_id: data.sessionId, name: e.name, screen: e.screen ?? null,
      props: e.props ?? {}, platform: data.platform ?? null,
    })));
    return { ok: true as const };
  });

export const recordAppErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ErrorsInput.parse(input))
  .handler(async ({ data, context }) => {
    await insert("app_errors", data.errors.map((e) => {
      // Scrubbed again here: the server never trusts the app to have done it.
      const message = scrubText(e.message, MAX_MESSAGE);
      const stack = e.stack ? scrubText(e.stack, MAX_STACK) : null;
      return {
        user_id: context.userId, session_id: data.sessionId, kind: e.kind, message, stack,
        screen: e.screen ?? null, fingerprint: errorFingerprint(e.kind, message, stack), platform: data.platform ?? null,
      };
    }));
    return { ok: true as const };
  });

export const reportProblem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    message: z.string().trim().min(1).max(1000),
    screen: Screen,
    platform: Common.platform,
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("app_problem_reports" as never) as any).insert({
      user_id: context.userId, message: data.message, screen: data.screen ?? null, platform: data.platform ?? null,
    });
    if (error) {
      console.warn("[AURA telemetry] problem report insert failed", error.code ?? "error");
      return { ok: false as const };
    }
    return { ok: true as const };
  });
