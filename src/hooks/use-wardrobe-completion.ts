import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { reanalyzeWardrobeBatch } from "@/lib/reanalyze-wardrobe.functions";
import { useWardrobeCacheActions } from "@/lib/wardrobe-query";

/** Completes the signed-in person's wardrobe data in the background (reanalyze-wardrobe.functions.ts):
 *  missing type, attributes and details are filled from each piece's photo, a few at a time, without
 *  touching anything set by hand. Runs for every user as they use the app — no button to press —
 *  at most once every 12 hours per device, a few seconds after start-up, and stops quietly on any
 *  error (it simply resumes next time). */
const START_DELAY_MS = 8_000;
const PAUSE_MS = 1_500;
const MAX_ROUNDS = 40; // ≤ 200 pieces per session
const EVERY_MS = 12 * 60 * 60 * 1000;

export function useWardrobeCompletion(userId: string | null | undefined) {
  const runBatch = useServerFn(reanalyzeWardrobeBatch);
  const cache = useWardrobeCacheActions();
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const key = `aura.wardrobeCompletion.${userId}`;
    try {
      const last = Number(localStorage.getItem(key) ?? 0);
      if (Date.now() - last < EVERY_MS) return;
    } catch {
      /* storage unavailable: run anyway, it's cheap when nothing is left */
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      let changed = 0;
      try {
        for (let round = 0; round < MAX_ROUNDS && !cancelled; round++) {
          const res = await runBatch({ data: undefined });
          changed += res.updated;
          if (res.processed === 0 || res.remaining === 0) break;
          await new Promise((r) => setTimeout(r, PAUSE_MS));
        }
        try { localStorage.setItem(key, String(Date.now())); } catch { /* ignore */ }
      } catch (e) {
        console.warn("[AURA wardrobe completion] stopped, will resume next time", e instanceof Error ? e.message : e);
      }
      if (changed > 0 && !cancelled) cache.invalidate();
    }, START_DELAY_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}
