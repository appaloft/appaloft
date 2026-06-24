import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type InspectDependencyResourceResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type InspectDependencyResourceQueryInput,
  inspectDependencyResourceQueryInputSchema,
} from "./inspect-dependency-resource.schema";

export { type InspectDependencyResourceQueryInput, inspectDependencyResourceQueryInputSchema };

export class InspectDependencyResourceQuery extends Query<InspectDependencyResourceResult> {
  constructor(public readonly dependencyResourceId: string) {
    super();
  }

  static create(
    input: InspectDependencyResourceQueryInput,
  ): Result<InspectDependencyResourceQuery> {
    return parseOperationInput(inspectDependencyResourceQueryInputSchema, input).map(
      (parsed) => new InspectDependencyResourceQuery(parsed.dependencyResourceId),
    );
  }
}
