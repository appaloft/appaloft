import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import { listDeploymentsQueryInputSchema } from "./list-deployments.schema";

const deploymentStatusSchema = z.enum([
  "created",
  "planning",
  "planned",
  "running",
  "cancel-requested",
  "succeeded",
  "failed",
  "canceled",
  "interrupted",
  "rolled-back",
]);

export const countDeploymentsQueryInputSchema = listDeploymentsQueryInputSchema
  .omit({ limit: true })
  .extend({
    status: deploymentStatusSchema.optional(),
    statuses: z.array(deploymentStatusSchema).optional(),
  });

export type CountDeploymentsQueryInput = z.input<typeof countDeploymentsQueryInputSchema>;

export class CountDeploymentsQuery extends Query<{ count: number }> {
  constructor(
    public readonly projectId?: string,
    public readonly resourceId?: string,
    public readonly includeArchived = false,
    public readonly activeResourcesOnly = false,
    public readonly status?: CountDeploymentsQueryInput["status"],
    public readonly statuses?: readonly NonNullable<CountDeploymentsQueryInput["status"]>[],
  ) {
    super();
  }

  static create(input?: CountDeploymentsQueryInput): Result<CountDeploymentsQuery> {
    return parseOperationInput(countDeploymentsQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new CountDeploymentsQuery(
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.resourceId),
          parsed.includeArchived,
          parsed.activeResourcesOnly,
          parsed.status,
          parsed.statuses,
        ),
    );
  }
}
