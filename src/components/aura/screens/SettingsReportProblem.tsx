import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";
import type { Screen } from "../AuraApp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { deleteProblemReport, reportProblem, updateProblemReport } from "@/lib/telemetry.functions";
import { lastScreenOutsideSettings, telemetryPlatform, track } from "@/lib/telemetry-client";

type Report = { id: number; created_at: string; message: string; status: "open" | "fixed" | "wontfix" };
const MAX = 1000;

/** "Segnala un problema": the person describes what went wrong, in their own words. Their past
 *  reports are listed with their status. */
export function SettingsReportProblem({ go }: { go: (s: Screen) => void }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const send = useServerFn(reportProblem);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const updateFn = useServerFn(updateProblemReport);
  const deleteFn = useServerFn(deleteProblemReport);
  // The report being edited (only an open one can be) and its draft text.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const saveEdit = async (id: number) => {
    const text = draft.trim();
    if (!text) return;
    setBusyId(id);
    try {
      const res = await updateFn({ data: { id, message: text } });
      if (!res.ok) throw new Error("not saved");
      setEditingId(null);
      toast.success(t("reportProblem.updated"));
      await load();
    } catch {
      toast.error(t("reportProblem.failed"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm(t("reportProblem.deleteConfirm"))) return;
    setBusyId(id);
    try {
      const res = await deleteFn({ data: { id } });
      if (!res.ok) throw new Error("not deleted");
      setReports((cur) => cur.filter((r) => r.id !== id));
      toast.success(t("reportProblem.deleted"));
    } catch {
      toast.error(t("reportProblem.failed"));
    } finally {
      setBusyId(null);
    }
  };

  const load = async () => {
    if (!user) return;
    const { data } = await (supabase.from("app_problem_reports" as never) as any)
      .select("id, created_at, message, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setReports((data ?? []) as Report[]);
  };
  useEffect(() => { void load(); }, [user?.id]);

  const submit = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await send({ data: { message: text, screen: lastScreenOutsideSettings(), platform: telemetryPlatform() } });
      if (!res.ok) throw new Error("not saved");
      track("problem_reported");
      setMessage("");
      toast.success(t("reportProblem.thanks"));
      await load();
    } catch (e) {
      console.warn("report problem failed", e instanceof Error ? e.message : "error");
      toast.error(t("reportProblem.failed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-28 bg-background">
      <header className="px-6 pt-14 pb-2 flex items-center justify-between">
        <button onClick={() => go("settings")} className="h-10 w-10 rounded-full border border-border flex items-center justify-center active:scale-90">
          <ArrowLeft size={15} />
        </button>
        <p className="font-serif text-lg italic">{t("reportProblem.title")}</p>
        <span className="w-10" />
      </header>

      <div className="px-6 mt-4 space-y-4 animate-fade-up">
        <p className="text-sm text-muted-foreground leading-relaxed">{t("reportProblem.intro")}</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
          rows={6}
          placeholder={t("reportProblem.placeholder")}
          className="w-full rounded-2xl border border-border bg-transparent p-4 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-foreground/30"
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{t("reportProblem.privacy")}</span>
          <span>{message.length}/{MAX}</span>
        </div>
        <button
          onClick={() => void submit()}
          disabled={!message.trim() || sending}
          className="w-full h-12 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.3em] disabled:opacity-50 active:scale-[0.98]"
        >{sending ? <Loader2 size={14} className="animate-spin mx-auto" /> : t("reportProblem.send")}</button>

        {reports.length > 0 && (
          <div className="pt-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t("reportProblem.yourReports")}</p>
            <div className="mt-2 rounded-3xl border border-border divide-y divide-border">
              {reports.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                    <span>{new Date(r.created_at).toLocaleDateString(i18n.language, { day: "numeric", month: "short" })}</span>
                    <span className="uppercase tracking-[0.2em]">{t(`reportProblem.status.${r.status}`)}</span>
                  </div>
                  {editingId === r.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
                        rows={4}
                        className="w-full rounded-2xl border border-border bg-transparent p-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-foreground/30"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => void saveEdit(r.id)}
                          disabled={!draft.trim() || busyId === r.id}
                          className="flex-1 h-9 rounded-full bg-foreground text-background text-[10px] uppercase tracking-[0.25em] disabled:opacity-50"
                        >{busyId === r.id ? <Loader2 size={12} className="animate-spin mx-auto" /> : t("reportProblem.save")}</button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 h-9 rounded-full border border-border text-[10px] uppercase tracking-[0.25em] text-muted-foreground"
                        >{t("reportProblem.cancel")}</button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm whitespace-pre-wrap">{r.message}</p>
                  )}
                  {editingId !== r.id && (
                    <div className="mt-2 flex justify-end gap-2">
                      {r.status === "open" && (
                        <button
                          onClick={() => { setEditingId(r.id); setDraft(r.message); }}
                          aria-label={t("reportProblem.edit")}
                          className="h-8 px-3 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5"
                        ><Pencil size={11} /> {t("reportProblem.edit")}</button>
                      )}
                      <button
                        onClick={() => void remove(r.id)}
                        disabled={busyId === r.id}
                        aria-label={t("reportProblem.delete")}
                        className="h-8 px-3 rounded-full border border-border text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5 disabled:opacity-50"
                      ><Trash2 size={11} /> {t("reportProblem.delete")}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
