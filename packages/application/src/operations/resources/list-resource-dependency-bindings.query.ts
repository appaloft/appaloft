import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ListResourceDependencyBindingsResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListResourceDependencyBindingsQueryInput,
  listResourceDependencyBindingsQueryInputSchema,
} from "./list-resource-dependency-bindings.schema";

export {
  type ListResourceDependencyBindingsQueryInput,
  listResourceDependencyBindingsQueryInputSchema,
};

export class ListResourceDependencyBindingsQuery extends Query<ListResourceDependencyBindingsResult> {
  constructor(public readonly resourceId: string) {
    super();
  }

  static create(
    input: ListResourceDependencyBindingsQueryInput,
  ): Result<ListResourceDependencyBindingsQuery> {
    return parseOperationInput(listResourceDependencyBindingsQueryInputSchema, input).map(
      (parsed) => new ListResourceDependencyBindingsQuery(parsed.resourceId),
    );
  }
}
