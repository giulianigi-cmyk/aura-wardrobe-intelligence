import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { usageFeature } from "@/lib/ai-usage";
import { z } from "zod";

const InputSchema = z.object({
  audioDataUrl: z.string().min(20), // data:audio/webm;base64,...
});

/**
 * Trascrizione vocale via Whisper (OpenAI).
 * Nessun parametro 'language': lo lasciamo auto-rilevare, così AURA
 * capisce italiano/inglese/tedesco/cinese ecc. senza doverlo specificare.
 */
export const transcribeVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, usageFeature("voice_transcribe")])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    // Parsing robusto: prendiamo tutto dopo l'ULTIMA virgola come base64,
    // e solo il tipo base (prima del primo ';') come mime — non assumiamo
    // che non ci siano parametri extra come ";codecs=..." nel mezzo, che
    // Safari iOS aggiunge spesso e la vecchia regex rigida non gestiva.
    const commaIdx = data.audioDataUrl.indexOf(",");
    if (commaIdx === -1 || !data.audioDataUrl.startsWith("data:")) {
      throw new Error("Invalid audio data");
    }
    const header = data.audioDataUrl.slice(5, commaIdx);
    const base64 = data.audioDataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/^audio\/[a-zA-Z0-9.+-]+/);
    const mime = mimeMatch ? mimeMatch[0] : "audio/webm";
    const buffer = Buffer.from(base64, "base64");
    const ext = mime.includes("webm") ? "webm" : mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "wav";

    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mime }), `audio.${ext}`);
    form.append("model", "whisper-1");
    // verbose_json: same "text", plus the audio duration Whisper bills by (consumption ledger).
    form.append("response_format", "verbose_json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    const { recordUsage, unitCost } = await import("./ai-usage.server");
    if (!res.ok) {
      await recordUsage({ provider: "openai", model: "whisper-1", operation: "transcribe", units: 0, unitType: "second", costUsd: 0, success: false });
      const errText = await res.text().catch(() => "");
      console.error("[AURA voice-transcribe] OpenAI error", res.status, errText);
      throw new Error(`Transcription failed (${res.status}): ${errText.slice(0, 300) || "no detail"}`);
    }

    const json = (await res.json()) as { text?: string; duration?: number };
    const seconds = typeof json.duration === "number" ? json.duration : null;
    await recordUsage({ provider: "openai", model: "whisper-1", operation: "transcribe", units: seconds, unitType: "second", costUsd: seconds == null ? null : unitCost.whisper(seconds), success: true });
    return { text: (json.text ?? "").trim() };
  });
