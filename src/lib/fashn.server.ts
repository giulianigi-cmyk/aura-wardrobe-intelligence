// FASHN Try-On Max client — server-only.
//
// Uses the "tryon-max" model, the same pipeline behind app.fashn.ai that
// was hands-on validated against real AURA garments (double-breasted
// blazer with 6 gold buttons stayed buttoned closed; straight-leg jeans
// stayed straight) before this integration was written. The lighter
// "tryon-v1.6" model was considered and rejected: it has no prompt field
// and is tuned for e-commerce speed over the garment-construction
// fidelity AURA needs.
//
// Field names below (prompt, resolution, generation_mode) are taken
// verbatim from https://docs.fashn.ai/api-reference/tryon-max — this
// endpoint is in "Preview" lifecycle (released Jan 26, 2026), so it's
// worth re-checking that page if generations start failing unexpectedly.
//
// generation_mode "balanced" + resolution "2k" is the default here —
// FASHN's own docs put this at ~25s, matching what was seen testing the
// app directly. "quality" + "4k" (~55s) exists as an escape hatch (see
// QUALITY_OVERRIDE) for a future "this garment keeps failing" retry path,
// not as the default.
//
// Privacy: return_base64 is on by default. These are biometric photos
// (face + body), so images live on FASHN's CDN for 60 minutes instead of
// the standard 3 days. We persist the result into AURA's own private
// storage immediately after — see avatar-tryon.functions.ts — so the
// shorter window costs nothing functionally.
//
// FASHN's own /v1/run + /v1/status/:id is a submit-then-poll pattern.
// This client exposes that same shape directly (submit once, check once
// per call) instead of blocking inside one function until done — a
// single HTTP request that stays open for up to 90s of internal polling
// is exactly what caused "Load failed" in production: something in the
// path (Cloudflare's edge, the mobile connection, an intermediate proxy)
// closes long-idle connections before FASHN finishes. Many short
// round-trips are far more reliable than one long one. The polling loop
// now lives in the client (AvatarTryOn.tsx), calling checkFashnStatus
// every ~2s — see avatar-tryon.functions.ts for how each step is wired.

const FASHN_BASE_URL = "https://api.fashn.ai/v1";

/** Escape hatch for a future "this garment keeps failing" retry path — not used by default. */
export const QUALITY_OVERRIDE = { generation_mode: "quality", resolution: "4k" } as const;

type FashnRunResponse = { id: string; error: string | null };

type FashnStatus =
  | { id: string; status: "starting" | "in_queue" | "processing"; output: null; error: null }
  | { id: string; status: "completed"; output: string[]; error: null }
  | { id: string; status: "failed"; output: null; error: { name: string; message: string } };

export type FashnSubmitResult =
  | { ok: true; predictionId: string }
  | { ok: false; error: string };

export type FashnCheckResult =
  | { ok: true; done: false }
  | { ok: true; done: true; imageDataUrl: string }
  | { ok: false; error: string };

/** Submits one garment onto one person image and returns immediately with
 *  a prediction id — does not wait for the result. Callers chain this for
 *  multi-item outfits (see avatar-tryon.functions.ts), feeding each
 *  finished result back in as the next modelImage. */
export async function submitFashnRun(
  modelImage: string,
  garmentImage: string,
  options?: { prompt?: string; qualityOverride?: boolean },
): Promise<FashnSubmitResult> {
  const key = process.env.FASHN_API_KEY;
  if (!key) return { ok: false, error: "Missing FASHN_API_KEY" };

  const generationSettings = options?.qualityOverride
    ? QUALITY_OVERRIDE
    : { generation_mode: "balanced" as const, resolution: "2k" as const };

  try {
    const runRes = await fetch(`${FASHN_BASE_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model_name: "tryon-max",
        inputs: {
          model_image: modelImage,
          product_image: garmentImage,
          ...generationSettings,
          // e.g. "keep jacket open" — empty by default, FASHN's own
          // intelligent defaults handle plain garment placement fine.
          prompt: options?.prompt ?? "",
          return_base64: true,
        },
      }),
    });

    if (!runRes.ok) {
      const text = await runRes.text();
      return { ok: false, error: `FASHN /run failed (HTTP ${runRes.status}): ${text.slice(0, 300)}` };
    }

    const runData = (await runRes.json()) as FashnRunResponse;
    if (runData.error || !runData.id) {
      return { ok: false, error: runData.error ?? "FASHN did not return a prediction id" };
    }
    return { ok: true, predictionId: runData.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FASHN request failed" };
  }
}

/** A single status check — no internal waiting or looping. The caller
 *  (avatar-tryon.functions.ts, driven by the client's poll loop) calls
 *  this once every ~2s until done is true or ok is false. */
export async function checkFashnStatus(predictionId: string): Promise<FashnCheckResult> {
  const key = process.env.FASHN_API_KEY;
  if (!key) return { ok: false, error: "Missing FASHN_API_KEY" };

  try {
    const statusRes = await fetch(`${FASHN_BASE_URL}/status/${predictionId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!statusRes.ok) return { ok: true, done: false }; // transient — client keeps polling

    const status = (await statusRes.json()) as FashnStatus;

    if (status.status === "completed") {
      const imageDataUrl = status.output?.[0];
      if (!imageDataUrl) return { ok: false, error: "FASHN completed but returned no image" };
      return { ok: true, done: true, imageDataUrl };
    }
    if (status.status === "failed") {
      return { ok: false, error: status.error?.message ?? "FASHN generation failed" };
    }
    return { ok: true, done: false }; // starting / in_queue / processing
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FASHN status check failed" };
  }
}
