import { z } from "zod";

export const resetResourceHealthCommandInputSchema = z.object({
  resourceId: z.string().min(1),
});

export type ResetResourceHealthCommandInput = z.input<typeof resetResourceHealthCommandInputSchema>;
