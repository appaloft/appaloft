import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type RouteSurfaceDecisionRecord } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListRouteSurfaceDecisionsQueryInput,
  listRouteSurfaceDecisionsInputSchema,
} from "./route-surface.schema";

export type ListRouteSurfaceDecisionsResponse = {
  records: RouteSurfaceDecisionRecord[];
};

export class ListRouteSurfaceDecisionsQuery extends Query<ListRouteSurfaceDecisionsResponse> {
  constructor(readonly input: ListRouteSurfaceDecisionsQueryInput) {
    super();
  }

  static create(
    input: ListRouteSurfaceDecisionsQueryInput = {},
  ): Result<ListRouteSurfaceDecisionsQuery> {
    return parseOperationInput(listRouteSurfaceDecisionsInputSchema, input).map(
      (parsed) => new ListRouteSurfaceDecisionsQuery(parsed),
    );
  }
}

export {
  type ListRouteSurfaceDecisionsQueryInput,
  listRouteSurfaceDecisionsInputSchema,
} from "./route-surface.schema";
