import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ConnectionSnapshot } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListConnectionsQueryInput,
  listConnectionsQueryInputSchema,
} from "./connections.schema";

export {
  type ListConnectionsQueryInput,
  listConnectionsQueryInputSchema,
} from "./connections.schema";

export class ListConnectionsQuery extends Query<{ items: ConnectionSnapshot[] }> {
  constructor(readonly input: ListConnectionsQueryInput = {}) {
    super();
  }

  static create(input: ListConnectionsQueryInput = {}): Result<ListConnectionsQuery> {
    return parseOperationInput(listConnectionsQueryInputSchema, input).map(
      (parsed) => new ListConnectionsQuery(parsed),
    );
  }
}
