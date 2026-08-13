import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type RuntimeTargetReadinessInspection } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type InspectServerRuntimeReadinessQueryInput,
  inspectServerRuntimeReadinessQueryInputSchema,
} from "./inspect-server-runtime-readiness.schema";

export {
  type InspectServerRuntimeReadinessQueryInput,
  inspectServerRuntimeReadinessQueryInputSchema,
  inspectServerRuntimeReadinessResultSchema,
  runtimeTargetReadinessCheckSchema,
} from "./inspect-server-runtime-readiness.schema";

export class InspectServerRuntimeReadinessQuery extends Query<RuntimeTargetReadinessInspection> {
  constructor(public readonly serverId: string) {
    super();
  }

  static create(
    input: InspectServerRuntimeReadinessQueryInput,
  ): Result<InspectServerRuntimeReadinessQuery> {
    return parseOperationInput(inspectServerRuntimeReadinessQueryInputSchema, input, {
      validationPhase: "query-validation",
    }).map((parsed) => new InspectServerRuntimeReadinessQuery(parsed.serverId));
  }
}
