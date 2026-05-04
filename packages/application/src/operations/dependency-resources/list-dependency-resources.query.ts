import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ListDependencyResourcesResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListDependencyResourcesQueryInput,
  listDependencyResourcesQueryInputSchema,
} from "./list-dependency-resources.schema";

export { type ListDependencyResourcesQueryInput, listDependencyResourcesQueryInputSchema };

export class ListDependencyResourcesQuery extends Query<ListDependencyResourcesResult> {
  constructor(
    public readonly projectId?: string,
    public readonly environmentId?: string,
    public readonly kind?: ListDependencyResourcesQueryInput["kind"],
  ) {
    super();
  }

  static create(
    input: ListDependencyResourcesQueryInput = {},
  ): Result<ListDependencyResourcesQuery> {
    return parseOperationInput(listDependencyResourcesQueryInputSchema, input).map(
      (parsed) =>
        new ListDependencyResourcesQuery(parsed.projectId, parsed.environmentId, parsed.kind),
    );
  }
}
