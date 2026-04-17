import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type EnvironmentSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowEnvironmentQueryInput,
  showEnvironmentQueryInputSchema,
} from "./show-environment.schema";

export {
  type ShowEnvironmentQueryInput,
  showEnvironmentQueryInputSchema,
} from "./show-environment.schema";

export class ShowEnvironmentQuery extends Query<EnvironmentSummary> {
  constructor(public readonly environmentId: string) {
    super();
  }

  static create(input: ShowEnvironmentQueryInput): Result<ShowEnvironmentQuery> {
    return parseOperationInput(showEnvironmentQueryInputSchema, input).map(
      (parsed) => new ShowEnvironmentQuery(parsed.environmentId),
    );
  }
}
