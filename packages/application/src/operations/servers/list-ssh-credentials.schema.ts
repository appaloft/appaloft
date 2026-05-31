import { z } from "zod";

import { listLimitSchema } from "../shared-schema";

export const listSshCredentialsQueryInputSchema = z.object({
  limit: listLimitSchema,
});

export type ListSshCredentialsQueryInput = z.input<typeof listSshCredentialsQueryInputSchema>;
