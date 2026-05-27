import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";

export const countResourcesQueryInputSchema = z.object({
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
  includePreviewResources: z.boolean().optional(),
});

export type CountResourcesQueryInput = z.input<typeof countResourcesQueryInputSchema>;

export class CountResourcesQuery extends Query<{ count: number }> {
  constructor(
    public readonly projectId?: string,
    public readonly environmentId?: string,
    public readonly includePreviewResources?: boolean,
  ) {
    super();
  }

  static create(input?: CountResourcesQueryInput): Result<CountResourcesQuery> {
    return parseOperationInput(countResourcesQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new CountResourcesQuery(
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.environmentId),
          parsed.includePreviewResources,
        ),
    );
  }
}
