import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DeployTokenSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListDeployTokensQueryInput,
  listDeployTokensQueryInputSchema,
} from "./list-deploy-tokens.schema";

export class ListDeployTokensQuery extends Query<{ items: DeployTokenSummary[] }> {
  constructor(
    public readonly organizationId: string,
    public readonly status?: "active" | "revoked",
    public readonly resourceId?: string,
    public readonly repositoryFullName?: string,
    public readonly limit?: number,
  ) {
    super();
  }

  static create(input: ListDeployTokensQueryInput): Result<ListDeployTokensQuery> {
    return parseOperationInput(listDeployTokensQueryInputSchema, input).map(
      (parsed) =>
        new ListDeployTokensQuery(
          parsed.organizationId,
          parsed.status,
          parsed.resourceId,
          parsed.repositoryFullName,
          parsed.limit,
        ),
    );
  }
}

export {
  type ListDeployTokensQueryInput,
  listDeployTokensQueryInputSchema,
} from "./list-deploy-tokens.schema";
