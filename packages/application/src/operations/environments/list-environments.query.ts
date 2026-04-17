import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type EnvironmentSummary } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListEnvironmentsQueryInput,
  listEnvironmentsQueryInputSchema,
} from "./list-environments.schema";

export {
  type ListEnvironmentsQueryInput,
  listEnvironmentsQueryInputSchema,
} from "./list-environments.schema";

export class ListEnvironmentsQuery extends Query<{ items: EnvironmentSummary[] }> {
  constructor(public readonly projectId?: string) {
    super();
  }

  static create(input?: ListEnvironmentsQueryInput): Result<ListEnvironmentsQuery> {
    return parseOperationInput(listEnvironmentsQueryInputSchema, input ?? {}).map(
      (parsed) => new ListEnvironmentsQuery(trimToUndefined(parsed.projectId)),
    );
  }
}
