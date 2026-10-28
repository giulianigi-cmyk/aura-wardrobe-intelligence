// A product link handed to the add-a-piece screen from elsewhere — the "Incolla un link" choice of
// the + sheet, or a link shared to the installed app (manifest share_target, Android) — so the
// screen opens straight on the import instead of making the person tap through it again.
const KEY = "aura.pendingImportUrl";

/** The first http(s) link in a shared text ("Guarda questo: https://… "), or null. */
export function firstHttpUrl(text: string | null | undefined): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text ?? "");
  return m ? m[0].replace(/[).,;!?»”]+$/, "") : null;
}

export function setPendingImportUrl(url: string): void {
  try { sessionStorage.setItem(KEY, url); } catch { /* storage unavailable: the screen just opens empty */ }
}

/** Reads and clears the pending link. */
export function takePendingImportUrl(): string | null {
  try {
    const url = sessionStorage.getItem(KEY);
    if (url) sessionStorage.removeItem(KEY);
    return url;
  } catch {
    return null;
  }
}
