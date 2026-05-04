import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ShowDependencyResourceResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowDependencyResourceQueryInput,
  showDependencyResourceQueryInputSchema,
} from "./show-dependency-resource.schema";

export { type ShowDependencyResourceQueryInput, showDependencyResourceQueryInputSchema };

export class ShowDependencyResourceQuery extends Query<ShowDependencyResourceResult> {
  constructor(public readonly dependencyResourceId: string) {
    super();
  }

  static create(input: ShowDependencyResourceQueryInput): Result<ShowDependencyResourceQuery> {
    return parseOperationInput(showDependencyResourceQueryInputSchema, input).map(
      (parsed) => new ShowDependencyResourceQuery(parsed.dependencyResourceId),
    );
  }
}
