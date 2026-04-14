import { type z } from "zod";

import { emptyOperationInputSchema } from "../shared-schema";

export const listSshCredentialsQueryInputSchema = emptyOperationInputSchema;

export type ListSshCredentialsQueryInput = z.input<typeof listSshCredentialsQueryInputSchema>;
