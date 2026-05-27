import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";

export const countEnvironmentsQueryInputSchema = z.object({
  projectId: z.string().optional(),
});

export type CountEnvironmentsQueryInput = z.input<typeof countEnvironmentsQueryInputSchema>;

export class CountEnvironmentsQuery extends Query<{ count: number }> {
  constructor(public readonly projectId?: string) {
    super();
  }

  static create(input?: CountEnvironmentsQueryInput): Result<CountEnvironmentsQuery> {
    return parseOperationInput(countEnvironmentsQueryInputSchema, input ?? {}).map(
      (parsed) => new CountEnvironmentsQuery(trimToUndefined(parsed.projectId)),
    );
  }
}
