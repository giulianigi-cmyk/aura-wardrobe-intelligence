// Manual JSON extraction + validation for AI text responses.
// Some model/gateway combinations don't reliably honor strict
// "structured output" / function-calling schema modes — they still
// return prose-wrapped or fenced JSON. Instead of depending on that
// provider feature, we ask for plain JSON in the prompt and parse it
// ourselves, with one automatic repair retry.
import type { z } from "zod";

export function extractJsonObject(text: string): unknown {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    // fall through to balanced-brace extraction below
  }
  const start = t.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in AI response");
  // Balanced-brace scan from the first "{", not lastIndexOf("}") — a
  // model that appends any prose after the real JSON (a trailing note,
  // an extra sentence, even just "}" appearing inside that prose) makes
  // lastIndexOf("}") grab the wrong closing brace, producing a slice
  // that still fails to parse ("Unexpected non-whitespace character
  // after JSON"). Counting braces (respecting quoted strings, so a "}"
  // inside a string value doesn't miscount) finds the ONE closing brace
  // that actually matches the opening one, ignoring everything after it.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(t.slice(start, i + 1));
    }
  }
  throw new Error("No balanced JSON object found in AI response");
}

export function parseAiJson<T>(text: string, schema: z.ZodType<T>): T {
  const raw = extractJsonObject(text);
  return schema.parse(raw);
}
