// Managing "Segnala un problema" from inside the app. Only the accounts in AURA_ADMIN_USER_IDS can
// list every report and change its status or reply; every check is made here, on the server.
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { REPORT_STATUSES, reportUpdateMessage } from "./problem-reports";

async function adminOrThrow(userId: string) {
  const { reportAdminIds } = await import("./problem-reports.server");
  if (!reportAdminIds().has(userId)) throw new Error("Not allowed");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Whether the signed-in person manages the reports (shows the Settings row). */
export const amIReportAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { reportAdminIds } = await import("./problem-reports.server");
    return { admin: reportAdminIds().has(context.userId) };
  });

export type AdminReport = {
  id: number; created_at: string; message: string; screen: string | null; platform: string | null;
  status: (typeof REPORT_STATUSES)[number]; admin_reply: string | null; replied_at: string | null; username: string | null;
};

export const listReportsForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ status: z.enum(["all", ...REPORT_STATUSES]).default("all") }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const admin = await adminOrThrow(context.userId);
    let q = admin.from("app_problem_reports")
      .select("id, created_at, message, screen, platform, status, admin_reply, replied_at, user_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error("Could not load reports");
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const { data: profs } = userIds.length
      ? await admin.from("profiles").select("id, username").in("id", userIds)
      : { data: [] };
    const names = new Map((profs ?? []).map((p: any) => [p.id, p.username ?? null]));
    return {
      reports: ((rows ?? []) as any[]).map((r: any): AdminReport => ({
        id: r.id, created_at: r.created_at, message: r.message, screen: r.screen, platform: r.platform,
        status: r.status, admin_reply: r.admin_reply ?? null, replied_at: r.replied_at ?? null,
        username: (names.get(r.user_id) as string | null | undefined) ?? null,
      })),
    };
  });

/** New status and/or reply; the person gets an in-app notification and a push. */
export const updateReportAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.number().int().positive(),
    status: z.enum(REPORT_STATUSES),
    reply: z.string().trim().max(2000).nullable().optional(),
    notify: z.boolean().default(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await adminOrThrow(context.userId);
    const reply = data.reply?.trim() ? data.reply.trim() : null;
    const now = new Date().toISOString();
    const { data: rows, error } = await admin.from("app_problem_reports")
      .update({ status: data.status, admin_reply: reply, ...(reply ? { replied_at: now } : {}), updated_at: now })
      .eq("id", data.id)
      .select("id, user_id");
    if (error || !rows?.length) return { ok: false as const };
    if (data.notify) {
      const userId = rows[0].user_id as string;
      const { data: prof } = await admin.from("profiles").select("language").eq("id", userId).maybeSingle();
      const message = reportUpdateMessage((prof as { language?: string | null } | null)?.language, data.status, reply);
      await admin.from("notifications").insert({
        user_id: userId, type: "problem_report_update", title: message.title, body: message.body, status: "unread",
        data: { report_id: data.id },
      });
      try {
        const { sendPushToUser } = await import("./push.server");
        await sendPushToUser(userId, { ...message, url: "/?open=report-problem", tag: `report-${data.id}` });
      } catch {
        /* the in-app notification is enough */
      }
    }
    return { ok: true as const };
  });
