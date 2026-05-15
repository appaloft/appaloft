import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type RuntimeMonitoringThresholdsReadback } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ParsedShowRuntimeMonitoringThresholdsQueryInput,
  type ShowRuntimeMonitoringThresholdsQueryInput,
  showRuntimeMonitoringThresholdsQueryInputSchema,
} from "./runtime-monitoring.schema";

export {
  type ParsedShowRuntimeMonitoringThresholdsQueryInput,
  type ShowRuntimeMonitoringThresholdsQueryInput,
  showRuntimeMonitoringThresholdsQueryInputSchema,
} from "./runtime-monitoring.schema";

export class ShowRuntimeMonitoringThresholdsQuery extends Query<RuntimeMonitoringThresholdsReadback> {
  constructor(public readonly input: ParsedShowRuntimeMonitoringThresholdsQueryInput) {
    super();
  }

  static create(
    input: ShowRuntimeMonitoringThresholdsQueryInput,
  ): Result<ShowRuntimeMonitoringThresholdsQuery> {
    return parseOperationInput(showRuntimeMonitoringThresholdsQueryInputSchema, input).map(
      (parsed) => new ShowRuntimeMonitoringThresholdsQuery(parsed),
    );
  }
}
