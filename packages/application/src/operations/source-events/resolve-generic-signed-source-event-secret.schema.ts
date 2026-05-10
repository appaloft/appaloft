import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const resolveGenericSignedSourceEventSecretQueryInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
});

export const resolveGenericSignedSourceEventSecretResponseSchema = z.object({
  secretValue: nonEmptyTrimmedString("Secret value"),
});

export type ResolveGenericSignedSourceEventSecretQueryInput = z.input<
  typeof resolveGenericSignedSourceEventSecretQueryInputSchema
>;
export type ResolveGenericSignedSourceEventSecretQueryParsedInput = z.output<
  typeof resolveGenericSignedSourceEventSecretQueryInputSchema
>;
export type ResolveGenericSignedSourceEventSecretResponse = z.output<
  typeof resolveGenericSignedSourceEventSecretResponseSchema
>;
