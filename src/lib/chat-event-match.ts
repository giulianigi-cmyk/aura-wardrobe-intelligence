// An outfit saved to a day from the Stylist chat, when the chat wasn't opened from a calendar event:
// if the conversation names one of that day's events ("cosa metto per pilates?"), the outfit is
// linked to that event instead of taking the day's general slot (where a later outfit of the day
// replaced it — reported). Pure, no DB.
import { normalizeText } from "./wardrobe-search";

const STOP = new Set(["compleanno", "birthday", "riunione", "meeting", "evento", "event", "appuntamento", "della", "delle", "dello", "with", "con", "per", "the"]);

function words(s: string): string[] {
  return normalizeText(s).split(" ").filter((w) => w.length >= 4 && !STOP.has(w));
}

/** The one event of the day whose title the conversation mentions; null if none or several. */
export function mentionedEvent<T extends { id: string; title: string | null }>(events: T[], conversation: string): T | null {
  const said = new Set(words(conversation));
  const hits = events.filter((e) => {
    const w = words(e.title ?? "");
    return w.length > 0 && w.some((x) => said.has(x));
  });
  return hits.length === 1 ? hits[0] : null;
}
