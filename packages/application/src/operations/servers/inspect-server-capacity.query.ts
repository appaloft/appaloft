import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import {
  type RuntimeTargetCapacityInspection,
  type RuntimeTargetCapacityInspectionProfile,
} from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type InspectServerCapacityQueryInput,
  inspectServerCapacityQueryInputSchema,
} from "./inspect-server-capacity.schema";

export {
  type InspectServerCapacityQueryInput,
  inspectServerCapacityQueryInputSchema,
} from "./inspect-server-capacity.schema";

export class InspectServerCapacityQuery extends Query<RuntimeTargetCapacityInspection> {
  constructor(
    public readonly serverId: string,
    public readonly profile: RuntimeTargetCapacityInspectionProfile,
  ) {
    super();
  }

  static create(input: InspectServerCapacityQueryInput): Result<InspectServerCapacityQuery> {
    return parseOperationInput(inspectServerCapacityQueryInputSchema, input).map(
      (parsed) => new InspectServerCapacityQuery(parsed.serverId, parsed.profile),
    );
  }
}
