import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Screen } from "../AuraApp";
import { listReportsForAdmin, updateReportAsAdmin, type AdminReport } from "@/lib/problem-reports.functions";
import { REPORT_STATUSES, type ReportStatus } from "@/lib/problem-reports";

type Filter = "all" | ReportStatus;

/** Settings › Manage reports (only for the accounts in AURA_ADMIN_USER_IDS — the server checks).
 *  Every report from every person: change its status, reply; the person is notified. */
export function SettingsAdminReports({ go }: { go: (s: Screen) => void }) {
  const { t, i18n } = useTranslation();
  const list = useServerFn(listReportsForAdmin);
  const update = useServerFn(updateReportAsAdmin);
  const [filter, setFilter] = useState<Filter>("open");
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState(false);
  // Per-report draft: status and reply being edited.
  const [drafts, setDrafts] = useState<Record<number, { status: ReportStatus; reply: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = async (f: Filter) => {
    setReports(null);
    setError(false);
    try {
      const res = await list({ data: { status: f } });
      setReports(res.reports);
      setDrafts(Object.fromEntries(res.reports.map((r: AdminReport) => [r.id, { status: r.status, reply: r.admin_reply ?? "" }])));
    } catch {
      setError(true);
      setReports([]);
    }
  };
  useEffect(() => { void load(filter); }, [filter]);

  const save = async (r: AdminReport) => {
    const d = drafts[r.id];
    if (!d) return;
    setSavingId(r.id);
    try {
      const res = await update({ data: { id: r.id, status: d.status, reply: d.reply.trim() || null, notify: true } });
      if (!res.ok) throw new Error("not saved");
      toast.success(t("adminReports.saved"));
      await load(filter);
    } catch {
      toast.error(t("adminReports.failed"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28 bg-background">
      <header className="px-6 pt-14 pb-2 flex items-center justify-between">
        <button onClick={() => go("settings")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={15} />
        </button>
        <p className="font-serif text-lg italic">{t("adminReports.title")}</p>
        <span className="w-10" />
      </header>

      <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar px-6">
        {(["all", ...REPORT_STATUSES] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs ${filter === f ? "bg-foreground text-background" : "bg-secondary/60 text-foreground/70"}`}
          >{f === "all" ? t("adminReports.all") : t(`reportProblem.status.${f}`)}</button>
        ))}
      </div>

      <div className="px-6 mt-4 space-y-3">
        {reports === null && <Loader2 size={18} className="mx-auto mt-10 animate-spin text-muted-foreground" />}
        {error && <p className="text-sm text-muted-foreground text-center mt-10">{t("adminReports.notAllowed")}</p>}
        {reports?.length === 0 && !error && <p className="text-sm text-muted-foreground text-center mt-10">{t("adminReports.empty")}</p>}
        {reports?.map((r) => {
          const d = drafts[r.id] ?? { status: r.status, reply: r.admin_reply ?? "" };
          const set = (patch: Partial<typeof d>) => setDrafts((cur) => ({ ...cur, [r.id]: { ...d, ...patch } }));
          return (
            <div key={r.id} className="rounded-3xl border border-border p-4">
              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>#{r.id} · {r.username ? `@${r.username}` : t("adminReports.noUsername")}</span>
                <span>{new Date(r.created_at).toLocaleString(i18n.language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{[r.screen, r.platform].filter(Boolean).join(" · ")}</p>
              <p className="mt-2 text-sm whitespace-pre-wrap">{r.message}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {REPORT_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => set({ status: s })}
                    className={`h-8 px-3 rounded-full text-[11px] border ${d.status === s ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground"}`}
                  >{t(`reportProblem.status.${s}`)}</button>
                ))}
              </div>
              <textarea
                value={d.reply}
                onChange={(e) => set({ reply: e.target.value.slice(0, 2000) })}
                rows={3}
                placeholder={t("adminReports.replyPlaceholder")}
                className="mt-3 w-full rounded-2xl border border-border bg-transparent p-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-foreground/30"
              />
              <button
                onClick={() => void save(r)}
                disabled={savingId === r.id || (d.status === r.status && d.reply.trim() === (r.admin_reply ?? ""))}
                className="mt-2 w-full h-10 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] disabled:opacity-40"
              >{savingId === r.id ? <Loader2 size={13} className="animate-spin mx-auto" /> : t("adminReports.saveAndNotify")}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
