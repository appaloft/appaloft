import { z } from "zod";

export const restoreResourceCommandInputSchema = z.object({
  resourceId: z.string().min(1),
});

export type RestoreResourceCommandInput = z.input<typeof restoreResourceCommandInputSchema>;
