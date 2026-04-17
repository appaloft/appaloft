import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DeploymentSummary } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListDeploymentsQueryInput,
  listDeploymentsQueryInputSchema,
} from "./list-deployments.schema";

export {
  type ListDeploymentsQueryInput,
  listDeploymentsQueryInputSchema,
} from "./list-deployments.schema";

export class ListDeploymentsQuery extends Query<{ items: DeploymentSummary[] }> {
  constructor(
    public readonly projectId?: string,
    public readonly resourceId?: string,
  ) {
    super();
  }

  static create(input?: ListDeploymentsQueryInput): Result<ListDeploymentsQuery> {
    return parseOperationInput(listDeploymentsQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new ListDeploymentsQuery(
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.resourceId),
        ),
    );
  }
}
