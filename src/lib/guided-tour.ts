// Guided tour: a few highlighted stops (the five tabs, then "Primi passi" on Home) shown once to a
// new account, and again whenever the person asks for it from the Guide. Which stops exist and
// whether the tour starts on its own; GuidedTour.tsx draws it.
import { FIRST_STEPS_TARGET } from "./first-steps";

/** Each stop highlights the element carrying data-tour="<target>"; a stop whose element isn't on
 *  screen is shown as a centred card instead. */
export const TOUR_STEPS = [
  { id: "home", target: "tab-home" },
  { id: "wardrobe", target: "tab-wardrobe" },
  { id: "stylist", target: "tab-ai" },
  { id: "calendar", target: "tab-planner" },
  { id: "you", target: "tab-profile" },
  { id: "start", target: "first-steps" },
] as const;
export type TourStepId = (typeof TOUR_STEPS)[number]["id"];

/** Seen on this device by this account (localStorage). */
export function tourSeenKey(userId: string): string {
  return `aura.tour.v1.${userId}`;
}

/** Starts on its own only for a wardrobe still being built (the people Primi passi is for), and
 *  only once: someone with a full wardrobe already knows the app, and opens it from the Guide. */
export function shouldAutoStartTour(opts: { seen: boolean; pieces: number }): boolean {
  return !opts.seen && opts.pieces < FIRST_STEPS_TARGET;
}

/** Where the card goes: above a target in the lower half of the screen (the tab bar), below one in
 *  the upper half. */
export function cardPlacement(target: { top: number; height: number } | null, viewportHeight: number): "above" | "below" | "center" {
  if (!target) return "center";
  return target.top + target.height / 2 > viewportHeight / 2 ? "above" : "below";
}
