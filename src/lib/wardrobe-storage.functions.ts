import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SetStoredSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(1000),
  stored: z.boolean(),
});

/** Puts pieces away in the cambio armadio (stored: true) or brings them back to the wardrobe. */
export const setItemsStored = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetStoredSchema.parse(input))
  .handler(async ({ data, context }) => {
    const storedAt = data.stored ? new Date().toISOString() : null;
    const { error } = await (context.supabase.from("wardrobe_items" as never) as any)
      .update({ stored_at: storedAt }).in("id", data.itemIds).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const, storedAt };
  });
