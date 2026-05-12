import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ListRetentionDefaultsQueryInput,
  type ListRetentionDefaultsQueryPayload,
  listRetentionDefaultsQueryInputSchema,
} from "./retention-defaults.schema";
import { type ListRetentionDefaultsResult } from "./retention-defaults.service";

export {
  type ListRetentionDefaultsQueryInput,
  type ListRetentionDefaultsQueryPayload,
  listRetentionDefaultsQueryInputSchema,
} from "./retention-defaults.schema";

export class ListRetentionDefaultsQuery extends Query<ListRetentionDefaultsResult> {
  constructor(public readonly input: ListRetentionDefaultsQueryPayload) {
    super();
  }

  static create(input?: ListRetentionDefaultsQueryInput): Result<ListRetentionDefaultsQuery> {
    return parseOperationInput(listRetentionDefaultsQueryInputSchema, input ?? {}).map(
      (parsed) => new ListRetentionDefaultsQuery(parsed),
    );
  }
}
