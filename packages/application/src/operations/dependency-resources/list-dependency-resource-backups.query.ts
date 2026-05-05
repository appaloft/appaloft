import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ListDependencyResourceBackupsResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListDependencyResourceBackupsQueryInput,
  listDependencyResourceBackupsQueryInputSchema,
} from "./list-dependency-resource-backups.schema";

export {
  type ListDependencyResourceBackupsQueryInput,
  listDependencyResourceBackupsQueryInputSchema,
};

export class ListDependencyResourceBackupsQuery extends Query<ListDependencyResourceBackupsResult> {
  constructor(
    public readonly dependencyResourceId: string,
    public readonly status?: ListDependencyResourceBackupsQueryInput["status"],
  ) {
    super();
  }

  static create(
    input: ListDependencyResourceBackupsQueryInput,
  ): Result<ListDependencyResourceBackupsQuery> {
    return parseOperationInput(listDependencyResourceBackupsQueryInputSchema, input).map(
      (parsed) =>
        new ListDependencyResourceBackupsQuery(parsed.dependencyResourceId, parsed.status),
    );
  }
}
