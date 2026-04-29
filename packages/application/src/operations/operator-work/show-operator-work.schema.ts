import { z } from "zod";

export const showOperatorWorkQueryInputSchema = z.object({
  workId: z.string().min(1),
});

export type ShowOperatorWorkQueryInput = z.input<typeof showOperatorWorkQueryInputSchema>;
