import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type OperatorWorkKind, type OperatorWorkList, type OperatorWorkStatus } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListOperatorWorkQueryInput,
  listOperatorWorkQueryInputSchema,
} from "./list-operator-work.schema";

export {
  type ListOperatorWorkQueryInput,
  listOperatorWorkQueryInputSchema,
} from "./list-operator-work.schema";

export class ListOperatorWorkQuery extends Query<OperatorWorkList> {
  constructor(
    public readonly kind?: OperatorWorkKind,
    public readonly status?: OperatorWorkStatus,
    public readonly resourceId?: string,
    public readonly serverId?: string,
    public readonly deploymentId?: string,
    public readonly limit?: number,
  ) {
    super();
  }

  static create(input?: ListOperatorWorkQueryInput): Result<ListOperatorWorkQuery> {
    return parseOperationInput(listOperatorWorkQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new ListOperatorWorkQuery(
          parsed.kind,
          parsed.status,
          trimToUndefined(parsed.resourceId),
          trimToUndefined(parsed.serverId),
          trimToUndefined(parsed.deploymentId),
          parsed.limit,
        ),
    );
  }
}
