import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type ResourceOverview } from "../../ports";
import { parseOperationInput } from "../shared-schema";

export const resourceOverviewQueryInputSchema = z.object({
  projectId: z.string().trim().min(1).max(160),
  environmentId: z.string().trim().min(1).max(160),
  resourceId: z.string().trim().min(1).max(160),
});

export type ResourceOverviewQueryInput = z.input<typeof resourceOverviewQueryInputSchema>;

export class ResourceOverviewQuery extends Query<ResourceOverview> {
  constructor(
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly resourceId: string,
  ) {
    super();
  }

  static create(input: ResourceOverviewQueryInput): Result<ResourceOverviewQuery> {
    return parseOperationInput(resourceOverviewQueryInputSchema, input).map(
      (parsed) =>
        new ResourceOverviewQuery(parsed.projectId, parsed.environmentId, parsed.resourceId),
    );
  }
}
