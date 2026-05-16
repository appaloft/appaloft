import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const deleteProjectCommandInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
  confirmation: z.object({
    projectId: nonEmptyTrimmedString("Confirmation project id"),
  }),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type DeleteProjectCommandInput = z.input<typeof deleteProjectCommandInputSchema>;
export type DeleteProjectCommandPayload = z.output<typeof deleteProjectCommandInputSchema>;
