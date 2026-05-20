import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DeploymentOverlayDecisionRecord } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListDeploymentOverlayDecisionsQueryInput,
  listDeploymentOverlayDecisionsInputSchema,
} from "./deployment-overlay.schema";

export type ListDeploymentOverlayDecisionsResponse = {
  records: DeploymentOverlayDecisionRecord[];
};

export class ListDeploymentOverlayDecisionsQuery extends Query<ListDeploymentOverlayDecisionsResponse> {
  constructor(readonly input: ListDeploymentOverlayDecisionsQueryInput) {
    super();
  }

  static create(
    input: ListDeploymentOverlayDecisionsQueryInput = {},
  ): Result<ListDeploymentOverlayDecisionsQuery> {
    return parseOperationInput(listDeploymentOverlayDecisionsInputSchema, input).map(
      (parsed) => new ListDeploymentOverlayDecisionsQuery(parsed),
    );
  }
}

export {
  type ListDeploymentOverlayDecisionsQueryInput,
  listDeploymentOverlayDecisionsInputSchema,
} from "./deployment-overlay.schema";
