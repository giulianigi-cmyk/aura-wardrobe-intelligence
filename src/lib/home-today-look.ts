// «Metti come look di oggi in Home» (admins only, to film the app): a look of one's own becomes Home's
// "today" look. Only the today_* fields of the person's home_suggestions row change, with today's
// date; the curated looks stay. False when there is no row yet (Home has not been opened today).
import { supabase } from "@/integrations/supabase/client";

export async function setHomeTodayLook(
  userId: string,
  look: { itemIds: string[]; occasion?: string | null; explanation?: string | null; imagePath?: string | null },
): Promise<boolean> {
  const { data, error } = await (supabase.from("home_suggestions" as never) as any)
    .update({
      date: new Date().toISOString().slice(0, 10),
      today_item_ids: look.itemIds,
      today_occasion: look.occasion ?? "",
      today_explanation: look.explanation ?? "",
      today_image_path: look.imagePath ?? null,
    })
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  return !!data?.length;
}
