import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ConnectionSnapshot } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowConnectionQueryInput,
  showConnectionQueryInputSchema,
} from "./connections.schema";

export {
  type ShowConnectionQueryInput,
  showConnectionQueryInputSchema,
} from "./connections.schema";

export class ShowConnectionQuery extends Query<ConnectionSnapshot> {
  constructor(readonly connectionId: string) {
    super();
  }

  static create(input: ShowConnectionQueryInput): Result<ShowConnectionQuery> {
    return parseOperationInput(showConnectionQueryInputSchema, input).map(
      (parsed) => new ShowConnectionQuery(parsed.connectionId),
    );
  }
}
