import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ListDependencyResourcesQueryInput,
  listDependencyResourcesQueryInputSchema,
} from "./list-dependency-resources.schema";

export const countDependencyResourcesQueryInputSchema =
  listDependencyResourcesQueryInputSchema.omit({ limit: true });

export type CountDependencyResourcesQueryInput = Omit<ListDependencyResourcesQueryInput, "limit">;

export class CountDependencyResourcesQuery extends Query<{ count: number }> {
  constructor(
    public readonly projectId?: string,
    public readonly environmentId?: string,
    public readonly kind?: CountDependencyResourcesQueryInput["kind"],
  ) {
    super();
  }

  static create(
    input: CountDependencyResourcesQueryInput = {},
  ): Result<CountDependencyResourcesQuery> {
    return parseOperationInput(countDependencyResourcesQueryInputSchema, input).map(
      (parsed) =>
        new CountDependencyResourcesQuery(parsed.projectId, parsed.environmentId, parsed.kind),
    );
  }
}
