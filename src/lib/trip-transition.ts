// AURA — Context & Transition Engine (V1, foundational piece).
//
// Sits BETWEEN the calendar/activity data and the existing outfit
// engines (buildCapsule, suggestOutfitCore in trip-capsule.server.ts) —
// never replaces them. Its only job: decide which same-day activities
// can share ONE outfit (with a small transition between them) instead
// of each getting an independent, disconnected look. suggestOutfitCore
// itself is untouched; it just gets called once per OutfitStateGroup
// instead of once per activity when a group covers more than one.
//
// Deliberately conservative for V1: an activity missing start/end time
// (every activity created before this feature existed, since those
// columns are new and nullable) is always treated as its own standalone
// group — exactly the behavior that already existed, so no existing
// trip's capsule changes just because this code now runs.

export type ActivityForTransition = {
  activityId: string;
  daySegment: "day" | "evening";
  dressCode: string | null;
  label: string | null;
  startTime: string | null; // "HH:MM", null when not known
  endTime: string | null;
  location: string | null;
};

export type TransitionKind = "no_change" | "minor" | "major" | "impossible";

export type OutfitStateGroup = {
  /** The activities this one outfit (with an optional small transition
   *  partway through) is meant to cover, in chronological order. */
  activityIds: string[];
  /** Present only when the group covers 2+ activities — a short,
   *  human-readable note for the prompt describing what changes and
   *  when, e.g. "remove the blazer and swap to the evening bag before
   *  the 20:30 dinner." Absent for a single-activity group, since
   *  there's nothing to transition between. */
  transitionNote: string | null;
};

// Ordered lowest to highest, per the spec's own worked example — used
// only to compare candidate groupings against each other, never as an
// absolute pass/fail threshold on their own.
export const TRANSITION_COST = {
  NO_CHANGE: 0,
  REMOVE_ADD_LAYER: 1,
  CHANGE_BAG: 1,
  CHANGE_ACCESSORY: 1,
  CHANGE_SHOES: 3,
  CHANGE_MAIN_GARMENT: 6,
  FULL_CHANGE: 10,
} as const;

const HIGH_FORMALITY_CODES = new Set(["Business Formal", "Cocktail", "Black Tie", "Formal"]);
const LOW_FORMALITY_CODES = new Set(["Casual", "Sport"]);

function formalityBand(dressCode: string | null): "high" | "low" | "mid" {
  if (!dressCode) return "mid";
  if (HIGH_FORMALITY_CODES.has(dressCode)) return "high";
  if (LOW_FORMALITY_CODES.has(dressCode)) return "low";
  return "mid";
}

function parseMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Estimates the transition between two consecutive activities using
 *  only what's actually known — formality band and the time gap between
 *  them. This is deliberately a coarse, honest estimate, not a claim of
 *  precision the underlying data doesn't support; it decides "does this
 *  pair even get a chance to share an outfit", not the exact pieces
 *  that would change (that's still suggestOutfitCore's job). */
function estimateTransition(a: ActivityForTransition, b: ActivityForTransition): { kind: TransitionKind; cost: number } {
  const gapMinutes = (() => {
    const aEnd = parseMinutes(a.endTime);
    const bStart = parseMinutes(b.startTime);
    if (aEnd == null || bStart == null) return null;
    return bStart - aEnd;
  })();

  // No timing data for this pair at all — the conservative, no-behavior
  // -change default: keep them standalone, same as before this engine
  // existed. This is what makes the feature safe to ship for trips that
  // predate it, and for any activity a person enters by hand without a
  // time (still fully supported, just not groupable yet).
  if (gapMinutes == null) return { kind: "impossible", cost: TRANSITION_COST.FULL_CHANGE };

  // A long enough gap (roughly 3+ hours) is treated as "back to base
  // first" territory — plausibly a hotel return, not a hallway
  // transition. Grouping is still possible if formality matches, but a
  // real gap this size is exactly the case the spec calls out for a
  // clarifying question (see requiresClarification below), not a
  // silent assumption either way.
  const longGap = gapMinutes >= 180;

  const fa = formalityBand(a.dressCode);
  const fb = formalityBand(b.dressCode);

  if (fa === fb) {
    return longGap
      ? { kind: "minor", cost: TRANSITION_COST.CHANGE_BAG }
      : { kind: "no_change", cost: TRANSITION_COST.NO_CHANGE };
  }

  const bandGap = Math.abs((fa === "high" ? 2 : fa === "mid" ? 1 : 0) - (fb === "high" ? 2 : fb === "mid" ? 1 : 0));
  if (bandGap === 1) {
    // Adjacent bands (mid<->high or mid<->low): a layer/bag/shoe swap
    // is plausible in principle. Whether it's actually a MINOR or MAJOR
    // change in practice depends on wardrobe pieces suggestOutfitCore
    // hasn't looked at yet — this only says the pair is *worth*
    // attempting as one transitionable state, not which exact pieces
    // will move.
    return { kind: "minor", cost: TRANSITION_COST.CHANGE_SHOES };
  }

  // Two full bands apart (low <-> high, e.g. sport -> black tie): no
  // plausible small transition exists between them.
  return { kind: "impossible", cost: TRANSITION_COST.FULL_CHANGE };
}

/** True only when the answer would genuinely change which grouping gets
 *  produced — a long, ambiguous gap between two same-formality
 *  activities. Matches the spec's "ask only when the answer changes the
 *  optimization result" principle: a clearly short gap or a clearly
 *  long one never reaches this, only the genuinely uncertain middle
 *  case does. */
export function requiresClarification(a: ActivityForTransition, b: ActivityForTransition): boolean {
  const aEnd = parseMinutes(a.endTime);
  const bStart = parseMinutes(b.startTime);
  if (aEnd == null || bStart == null) return false;
  const gapMinutes = bStart - aEnd;
  return gapMinutes >= 180 && gapMinutes <= 360 && formalityBand(a.dressCode) === formalityBand(b.dressCode);
}

/** Groups a single day's activities into OutfitStateGroups. Consecutive
 *  activities merge into one group only when their estimated transition
 *  is "no_change" or "minor" — a "major" or "impossible" transition
 *  always starts a new group, same as an activity with no timing data
 *  at all. */
export function groupIntoOutfitStates(dayActivities: ActivityForTransition[]): OutfitStateGroup[] {
  const sorted = [...dayActivities].sort((a, b) => {
    const am = parseMinutes(a.startTime);
    const bm = parseMinutes(b.startTime);
    if (am == null && bm == null) return 0;
    if (am == null) return 1; // unknown-time activities sort last, never merged into anyway
    if (bm == null) return -1;
    return am - bm;
  });

  const groups: OutfitStateGroup[] = [];
  for (const activity of sorted) {
    const last = groups[groups.length - 1];
    if (last) {
      const prevActivity = sorted.find((a) => a.activityId === last.activityIds[last.activityIds.length - 1])!;
      const { kind } = estimateTransition(prevActivity, activity);
      if (kind === "no_change" || kind === "minor") {
        last.activityIds.push(activity.activityId);
        if (kind === "minor") {
          last.transitionNote = `Adjust lightly before "${activity.label ?? "the next activity"}"${activity.startTime ? ` at ${activity.startTime}` : ""} — a small change (layer, bag, or shoes), not a full outfit change.`;
        }
        continue;
      }
    }
    groups.push({ activityIds: [activity.activityId], transitionNote: null });
  }
  return groups;
}
 