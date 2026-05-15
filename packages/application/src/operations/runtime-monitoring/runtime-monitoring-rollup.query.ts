import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type RuntimeMonitoringRollup } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ParsedRuntimeMonitoringRollupQueryInput,
  type RuntimeMonitoringRollupQueryInput,
  runtimeMonitoringRollupQueryInputSchema,
} from "./runtime-monitoring.schema";

export {
  type ParsedRuntimeMonitoringRollupQueryInput,
  type RuntimeMonitoringRollupQueryInput,
  runtimeMonitoringRollupQueryInputSchema,
} from "./runtime-monitoring.schema";

export class RuntimeMonitoringRollupQuery extends Query<RuntimeMonitoringRollup> {
  constructor(public readonly input: ParsedRuntimeMonitoringRollupQueryInput) {
    super();
  }

  static create(input: RuntimeMonitoringRollupQueryInput): Result<RuntimeMonitoringRollupQuery> {
    return parseOperationInput(runtimeMonitoringRollupQueryInputSchema, input).map(
      (parsed) => new RuntimeMonitoringRollupQuery(parsed),
    );
  }
}
