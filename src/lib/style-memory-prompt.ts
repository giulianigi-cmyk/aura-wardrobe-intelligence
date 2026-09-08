// Turns rows from user_style_memory_active into a short block of prompt
// text — the same "inject as plain instructions" pattern already used
// for dress preferences (applyDressPreferences) elsewhere in AURA,
// rather than a separate deterministic scoring pass. The engines that
// consume this (suggest-daily-looks.functions.ts today, others to
// follow) already delegate final outfit assembly to Gemini with a list
// of hard rules in the system prompt; learned preferences slot into
// that same mechanism as soft, non-overriding guidance.
//
// Deliberately soft: this never suggests overriding a hard constraint
// (formality, weather, the person's own YOU rules) — only nudging which
// otherwise-valid options to prefer. The calling engine's prompt is
// responsible for stating that priority explicitly (see
// suggest-daily-looks.functions.ts for the exact wording used).

export type StyleMemoryRow = {
  memory_type: string | null;
  value: string | null;
  context_axis: string | null;
  context_value: string | null;
  effective_confidence: number | null;
  evidence_count: number | null;
};

// Below this many observations, a "preference" is really just one or
// two data points — not worth surfacing to the model as if it were a
// settled pattern. Matches the aggregator's own asymptotic-confidence
// framing: confidence keeps growing with evidence, so a low count means
// it hasn't grown much yet, not that it's necessarily wrong.
const MIN_EVIDENCE = 2;
// Below this |confidence|, the signal is too weak/mixed (near net-zero
// between positive and negative feedback) to act on either direction.
const MIN_CONFIDENCE = 0.15;

const MEMORY_TYPE_LABEL: Record<string, string> = {
  category: "category",
  subcategory: "specific piece type",
  brand: "brand",
  material: "material",
  style_archetype: "style",
  color_preferred: "color",
  color_avoided: "color",
};

function isUsable(row: StyleMemoryRow): boolean {
  return (
    !!row.memory_type && !!row.value &&
    (row.evidence_count ?? 0) >= MIN_EVIDENCE &&
    Math.abs(row.effective_confidence ?? 0) >= MIN_CONFIDENCE
  );
}

function describeRow(row: StyleMemoryRow): string {
  const label = MEMORY_TYPE_LABEL[row.memory_type ?? ""] ?? row.memory_type ?? "";
  const positive = (row.effective_confidence ?? 0) > 0;
  const verb = row.memory_type === "color_avoided" || !positive ? "tends to avoid" : "tends to like";
  return `${verb} the ${label} "${row.value}"`;
}

/** occasionLabels: the specific occasions this batch of outfits is being
 *  built for (e.g. ["Work","Weekend","Evening"]) — surfaces occasion-
 *  scoped memories for each one ahead of general tendencies, since the
 *  same person can have opposite tendencies in different contexts (the
 *  ankle-boots-at-a-concert case this was built for: a general "avoids
 *  ankle boots in hot weather" tendency shouldn't suppress a specific,
 *  repeated choice of them for concerts). */
export function buildStyleMemoryPromptSection(rows: StyleMemoryRow[], occasionLabels: string[] = []): string[] {
  const usable = rows.filter(isUsable);
  if (usable.length === 0) return [];

  const general = usable.filter((r) => !r.context_axis);
  const lines: string[] = [];

  for (const occasionLabel of occasionLabels) {
    const occasionLower = occasionLabel.toLowerCase();
    const scoped = usable.filter((r) => r.context_axis === "occasion" && r.context_value?.toLowerCase() === occasionLower);
    if (scoped.length > 0) {
      lines.push(`For ${occasionLabel} specifically, this person ${scoped.slice(0, 4).map(describeRow).join("; ")}.`);
    }
  }
  if (general.length > 0) {
    lines.push(`Generally, this person ${general.slice(0, 4).map(describeRow).join("; ")}.`);
  }
  if (lines.length === 0) return [];

  return [
    "PERSONAL PREFERENCES LEARNED FROM PAST CHOICES (soft guidance — never",
    "overrides formality, weather, or the person's own stated rules above;",
    "use it only to choose between options that are already otherwise valid):",
    ...lines,
    "",
  ];
}
