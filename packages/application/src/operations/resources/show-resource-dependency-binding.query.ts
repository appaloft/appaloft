import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ShowResourceDependencyBindingResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowResourceDependencyBindingQueryInput,
  showResourceDependencyBindingQueryInputSchema,
} from "./show-resource-dependency-binding.schema";

export {
  type ShowResourceDependencyBindingQueryInput,
  showResourceDependencyBindingQueryInputSchema,
};

export class ShowResourceDependencyBindingQuery extends Query<ShowResourceDependencyBindingResult> {
  constructor(
    public readonly resourceId: string,
    public readonly bindingId: string,
  ) {
    super();
  }

  static create(
    input: ShowResourceDependencyBindingQueryInput,
  ): Result<ShowResourceDependencyBindingQuery> {
    return parseOperationInput(showResourceDependencyBindingQueryInputSchema, input).map(
      (parsed) => new ShowResourceDependencyBindingQuery(parsed.resourceId, parsed.bindingId),
    );
  }
}
