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
// FASHN's own /v1/run + /v1/status/:id is a submit-then-poll pattern,
// not a single blocking call — see pollPrediction() below.

const FASHN_BASE_URL = "https://api.fashn.ai/v1";

/** Escape hatch for a future "this garment keeps failing" retry path — not used by default. */
export const QUALITY_OVERRIDE = { generation_mode: "quality", resolution: "4k" } as const;

type FashnRunResponse = { id: string; error: string | null };

type FashnStatus =
  | { id: string; status: "starting" | "in_queue" | "processing"; output: null; error: null }
  | { id: string; status: "completed"; output: string[]; error: null }
  | { id: string; status: "failed"; output: null; error: { name: string; message: string } };

export type FashnTryOnResult =
  | { ok: true; imageDataUrl: string }
  | { ok: false; error: string };

/** One garment onto one person image. Callers chain this for multi-item outfits
 *  (see avatar-tryon.functions.ts), feeding each result back in as the next modelImage. */
export async function runFashnTryOn(
  modelImage: string,
  garmentImage: string,
  options?: { prompt?: string; qualityOverride?: boolean },
): Promise<FashnTryOnResult> {
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

    return await pollPrediction(runData.id, key);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FASHN request failed" };
  }
}

/** Polls every 2s. tryon-max is documented at ~10-55s depending on mode/resolution,
 *  so 45 attempts (~90s) leaves headroom before giving up as a genuine failure. */
async function pollPrediction(id: string, apiKey: string): Promise<FashnTryOnResult> {
  const MAX_ATTEMPTS = 45;
  const POLL_INTERVAL_MS = 2000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${FASHN_BASE_URL}/status/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!statusRes.ok) continue; // transient — keep polling until MAX_ATTEMPTS

    const status = (await statusRes.json()) as FashnStatus;

    if (status.status === "completed") {
      const imageDataUrl = status.output?.[0];
      if (!imageDataUrl) return { ok: false, error: "FASHN completed but returned no image" };
      return { ok: true, imageDataUrl };
    }
    if (status.status === "failed") {
      return { ok: false, error: status.error?.message ?? "FASHN generation failed" };
    }
    // starting / in_queue / processing — loop again
  }

  return { ok: false, error: "FASHN generation timed out" };
}
