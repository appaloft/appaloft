import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DependencyResourceSafeQueryResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type QueryDependencyResourceQueryInput,
  queryDependencyResourceQueryInputSchema,
} from "./query-dependency-resource.schema";

export { type QueryDependencyResourceQueryInput, queryDependencyResourceQueryInputSchema };

export class QueryDependencyResourceQuery extends Query<DependencyResourceSafeQueryResult> {
  constructor(
    public readonly dependencyResourceId: string,
    public readonly statement: string,
    public readonly maxRows: number,
    public readonly timeoutMs: number,
  ) {
    super();
  }

  static create(input: QueryDependencyResourceQueryInput): Result<QueryDependencyResourceQuery> {
    return parseOperationInput(queryDependencyResourceQueryInputSchema, input).map(
      (parsed) =>
        new QueryDependencyResourceQuery(
          parsed.dependencyResourceId,
          parsed.statement,
          parsed.maxRows,
          parsed.timeoutMs,
        ),
    );
  }
}
