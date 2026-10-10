// "Segnala un problema": statuses, who manages the reports, and the texts sent to the owner (email)
// and to the person (in-app + push) when their report is updated. Pure, so it is unit-tested.

export const REPORT_STATUSES = ["open", "in_progress", "fixed", "wontfix"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** The accounts that manage the reports: AURA_ADMIN_USER_IDS, comma-separated user ids. */
export function parseAdminIds(raw: string | null | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s)));
}

/** The email to the owner for a new report. Only what the person wrote and where: no email
 *  address or other personal data of theirs. */
export function newReportEmail(r: { id: number; message: string; screen: string | null; platform: string | null; username: string | null; createdAt: string }): { subject: string; text: string } {
  const firstLine = r.message.split("\n")[0].slice(0, 60);
  return {
    subject: `AURA · nuova segnalazione #${r.id}: ${firstLine}`,
    text: [
      `Segnalazione #${r.id} — ${new Date(r.createdAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`,
      `Utente: ${r.username ? `@${r.username}` : "(senza username)"}`,
      `Schermata: ${r.screen ?? "—"} · Piattaforma: ${r.platform ?? "—"}`,
      "",
      r.message,
      "",
      "Gestiscila in AURA › Impostazioni › Gestione segnalazioni.",
    ].join("\n"),
  };
}

const UPDATE_TEXT = {
  it: { title: "Aggiornamento sulla tua segnalazione", status: { open: "Ricevuta", in_progress: "In lavorazione", fixed: "Risolta", wontfix: "Non risolta" }, reply: "Risposta" },
  en: { title: "Update on your report", status: { open: "Received", in_progress: "In progress", fixed: "Resolved", wontfix: "Not resolved" }, reply: "Reply" },
  es: { title: "Novedades sobre tu reporte", status: { open: "Recibido", in_progress: "En curso", fixed: "Resuelto", wontfix: "No resuelto" }, reply: "Respuesta" },
  fr: { title: "Mise à jour de votre signalement", status: { open: "Reçu", in_progress: "En cours", fixed: "Résolu", wontfix: "Non résolu" }, reply: "Réponse" },
} as const;

/** What the person reads when the owner changes the status or replies. */
export function reportUpdateMessage(language: string | null | undefined, status: ReportStatus, reply: string | null): { title: string; body: string } {
  const t = UPDATE_TEXT[(language ?? "").slice(0, 2) as keyof typeof UPDATE_TEXT] ?? UPDATE_TEXT.en;
  const lines = [`${t.status[status]}.`];
  if (reply?.trim()) lines.push(`${t.reply}: ${reply.trim().slice(0, 300)}`);
  return { title: t.title, body: lines.join("\n") };
}
