import { type z } from "zod";

import { emptyOperationInputSchema } from "../shared-schema";

export const listDefaultAccessDomainPoliciesQueryInputSchema = emptyOperationInputSchema;

export type ListDefaultAccessDomainPoliciesQueryInput = z.input<
  typeof listDefaultAccessDomainPoliciesQueryInputSchema
>;
