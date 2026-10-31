// Outfits for a workout (pilates, gym, running…): sport clothes only. In the Stylist chat a pilates
// request got first an everyday outfit, then, asked to change one piece and keep the tracksuit, an
// elegant velvet one (reported). A rule in the prompt was not enough: the chat checks the pieces too.
// Pure, no DB.
import { detectActivityKind } from "./activity-kind";

type Piece = {
  category?: string | null; subcategory?: string | null; occasion?: string | null;
  material?: string[] | null; formality?: number | null;
};

/** The conversation (recent user messages, the event's title) is about a workout. */
export function isSportContext(recentUserText: string, modelKind?: string | null): boolean {
  return modelKind === "sport" || detectActivityKind({ label: recentUserText, dressCode: null, minFormality: null }) === "sport";
}

const SPORTY_CLOTHES = new Set(["Joggers", "Leggings", "Sweatshirt", "Hoodie", "T-Shirt", "Tank Top", "Crop Top", "Shorts", "Bike Shorts"]);
const DRESSY_FABRICS = /velvet|velluto|silk|seta|satin|raso|sequin|paillettes|lace|pizzo|leather|pelle|cashmere|wool|lana|tweed/i;
export const SPORT_SHOES = new Set(["Sneakers", "Running Shoes", "Trainers"]);

const tagsOf = (p: Piece) => (p.occasion ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** A piece that can be worn to work out. Activewear always; a piece the person tagged Sport; or a
 *  plain, casual piece of a sporty type (joggers, leggings, T-shirt, sneakers) — never velvet, silk,
 *  leather, wool or anything dressy (formality 3 or more). */
export function isSportWearable(p: Piece): boolean {
  if (p.category === "Activewear") return true;
  if (tagsOf(p).some((t) => /sport|gym|training|running|yoga|pilates/.test(t))) return true;
  if (p.category === "Shoes") return SPORT_SHOES.has(p.subcategory ?? "");
  if (p.category === "Bags" || p.category === "Accessories") return true; // judged by the model
  if (p.formality != null && p.formality >= 3) return false;
  if ((p.material ?? []).some((m) => DRESSY_FABRICS.test(m))) return false;
  return SPORTY_CLOTHES.has(p.subcategory ?? "");
}

/** What an Activewear piece covers, so a sport outfit counts as complete without Tops/Bottoms. */
export function sportCoreRole(p: Piece): "top" | "bottom" | "full" | null {
  if (p.category !== "Activewear") return null;
  const s = p.subcategory ?? "";
  if (/tracksuit|jumpsuit|unitard|bodysuit/i.test(s)) return "full";
  if (/legging|short|pant|jogger|skirt/i.test(s)) return "bottom";
  return "top";
}

export const SPORT_PROMPT_RULE =
  "WORKOUT OUTFITS: when the occasion is a workout or sport (pilates, yoga, gym, running, tennis, padel, cycling…), every clothing piece and the shoes must be sport pieces: Activewear, pieces tagged Sport, or plain sporty basics (leggings, joggers, T-shirt, tank, sweatshirt, sneakers). Never a dressy fabric (velvet, silk, satin, leather, wool) and never a piece of formality 3 or more, even if its type sounds sporty (a velvet tracksuit is loungewear, not gym wear). When the person asks to change ONE piece and keep the rest, the replacement must stay in the same context: in a workout outfit, another sport piece. For pilates and yoga prefer close-fitting pieces and grip socks or bare feet over running shoes when the wardrobe offers them.";

export const EARLY_WORKOUT_PROMPT_RULE =
  "EARLY WORKOUT ON A WORKING DAY: when the workout is early in the morning (before about 9:00) on a weekday and the person usually works, and the conversation doesn't already say what comes after, ask in ONE short sentence whether they go straight to work afterwards, with 'choices' like [\"Sì, poi lavoro\", \"No, torno a casa\"] translated into the user's language. If they go to work: propose the workout outfit plus a warm outer layer for the trip if it is cold, and remind them in one clause to pack the work outfit (or offer to put one together). If they go home: no outerwear beyond what the temperature needs for the short trip. Never add an elegant coat or blazer to a workout outfit.";
