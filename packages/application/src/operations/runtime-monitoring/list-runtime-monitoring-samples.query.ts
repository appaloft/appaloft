import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type RuntimeMonitoringSamplesWindow } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListRuntimeMonitoringSamplesQueryInput,
  listRuntimeMonitoringSamplesQueryInputSchema,
  type ParsedListRuntimeMonitoringSamplesQueryInput,
} from "./runtime-monitoring.schema";

export {
  type ListRuntimeMonitoringSamplesQueryInput,
  listRuntimeMonitoringSamplesQueryInputSchema,
  type ParsedListRuntimeMonitoringSamplesQueryInput,
} from "./runtime-monitoring.schema";

export class ListRuntimeMonitoringSamplesQuery extends Query<RuntimeMonitoringSamplesWindow> {
  constructor(public readonly input: ParsedListRuntimeMonitoringSamplesQueryInput) {
    super();
  }

  static create(
    input: ListRuntimeMonitoringSamplesQueryInput,
  ): Result<ListRuntimeMonitoringSamplesQuery> {
    return parseOperationInput(listRuntimeMonitoringSamplesQueryInputSchema, input).map(
      (parsed) => new ListRuntimeMonitoringSamplesQuery(parsed),
    );
  }
}
