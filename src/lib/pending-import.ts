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

// The add-a-piece screen opened straight on the shared library ("Primi passi").
const STEP_KEY = "aura.pendingAddStep";

export function setPendingAddLibrary(): void {
  try { sessionStorage.setItem(STEP_KEY, "library"); } catch { /* the screen just opens on the camera */ }
}

/** Reads and clears the request to open on the library. */
export function takePendingAddLibrary(): boolean {
  try {
    const v = sessionStorage.getItem(STEP_KEY);
    if (v) sessionStorage.removeItem(STEP_KEY);
    return v === "library";
  } catch {
    return false;
  }
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
