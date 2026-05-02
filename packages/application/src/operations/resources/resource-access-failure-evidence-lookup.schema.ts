import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const optionalNonEmptyTrimmedString = (label: string) => nonEmptyTrimmedString(label).optional();

export const resourceAccessFailureEvidenceLookupQueryInputSchema = z.object({
  requestId: nonEmptyTrimmedString("Request id"),
  resourceId: optionalNonEmptyTrimmedString("Resource id"),
  hostname: optionalNonEmptyTrimmedString("Hostname"),
  path: optionalNonEmptyTrimmedString("Path"),
});

export type ResourceAccessFailureEvidenceLookupQueryInput = z.input<
  typeof resourceAccessFailureEvidenceLookupQueryInputSchema
>;
export type ResourceAccessFailureEvidenceLookupQueryParsedInput = z.output<
  typeof resourceAccessFailureEvidenceLookupQueryInputSchema
>;
