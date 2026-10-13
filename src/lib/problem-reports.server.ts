// Server-only. A new problem report reaches whoever manages them: an email (Resend) to
// REPORTS_NOTIFY_EMAIL and a push to the admin accounts (AURA_ADMIN_USER_IDS). Both are optional
// and best-effort: the report is saved whatever happens here. Nothing about the report or the
// person is logged.
import { newReportEmail, parseAdminIds } from "./problem-reports";
import { sendPushToUser } from "./push.server";
import { BRAND_NAME } from "./brand";

export function reportAdminIds(): Set<string> {
  return parseAdminIds(process.env.AURA_ADMIN_USER_IDS);
}

export async function notifyNewReport(admin: any, report: { id: number; user_id: string; message: string; screen: string | null; platform: string | null; created_at: string }): Promise<void> {
  const { data: prof } = await admin.from("profiles").select("username").eq("id", report.user_id).maybeSingle();
  const mail = newReportEmail({
    id: report.id, message: report.message, screen: report.screen, platform: report.platform,
    username: (prof as { username?: string | null } | null)?.username ?? null, createdAt: report.created_at,
  });

  await emailAdmins(mail.subject, mail.text);

  for (const adminId of reportAdminIds()) {
    try {
      await sendPushToUser(adminId, { title: `Nuova segnalazione #${report.id}`, body: mail.subject.replace(/^.* · nuova segnalazione #\d+: /, ""), url: "/?admin=reports", tag: "report" });
    } catch {
      /* push is a bonus; the email and the admin page are the record */
    }
  }
}

/** Email to REPORTS_NOTIFY_EMAIL through Resend. Optional and best-effort, never throws. */
export async function emailAdmins(subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.REPORTS_NOTIFY_EMAIL;
  if (key && to) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        // Without a verified domain Resend sends only from onboarding@resend.dev, and only to the
        // address the Resend account was created with.
        body: JSON.stringify({ from: process.env.REPORTS_FROM_EMAIL || `${BRAND_NAME} <onboarding@resend.dev>`, to: [to], subject, text }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) console.warn("[AURA reports] email not sent", res.status);
    } catch (e) {
      console.warn("[AURA reports] email failed", e instanceof Error ? e.name : "error");
    }
  }
}

/** A service alert (not a user report) to the admins: one email and a push. Best-effort. */
export async function alertAdmins(subject: string, text: string): Promise<void> {
  await emailAdmins(subject, text);
  for (const adminId of reportAdminIds()) {
    try {
      await sendPushToUser(adminId, { title: subject, body: text.split("\n")[0], url: "/", tag: "service-alert" });
    } catch {
      /* push is a bonus */
    }
  }
}
