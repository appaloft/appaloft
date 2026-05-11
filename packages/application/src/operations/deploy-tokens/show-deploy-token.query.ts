import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DeployTokenSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowDeployTokenQueryInput,
  showDeployTokenQueryInputSchema,
} from "./show-deploy-token.schema";

export class ShowDeployTokenQuery extends Query<DeployTokenSummary> {
  constructor(
    public readonly organizationId: string,
    public readonly tokenId: string,
  ) {
    super();
  }

  static create(input: ShowDeployTokenQueryInput): Result<ShowDeployTokenQuery> {
    return parseOperationInput(showDeployTokenQueryInputSchema, input).map(
      (parsed) => new ShowDeployTokenQuery(parsed.organizationId, parsed.tokenId),
    );
  }
}

export {
  type ShowDeployTokenQueryInput,
  showDeployTokenQueryInputSchema,
} from "./show-deploy-token.schema";
