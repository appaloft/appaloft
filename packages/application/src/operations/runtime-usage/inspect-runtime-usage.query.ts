import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type RuntimeUsageInspection } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type InspectRuntimeUsageQueryInput,
  inspectRuntimeUsageQueryInputSchema,
  type ParsedInspectRuntimeUsageQueryInput,
} from "./inspect-runtime-usage.schema";

export {
  type InspectRuntimeUsageQueryInput,
  inspectRuntimeUsageQueryInputSchema,
  type ParsedInspectRuntimeUsageQueryInput,
} from "./inspect-runtime-usage.schema";

export class InspectRuntimeUsageQuery extends Query<RuntimeUsageInspection> {
  constructor(public readonly input: ParsedInspectRuntimeUsageQueryInput) {
    super();
  }

  static create(input: InspectRuntimeUsageQueryInput): Result<InspectRuntimeUsageQuery> {
    return parseOperationInput(inspectRuntimeUsageQueryInputSchema, input).map(
      (parsed) => new InspectRuntimeUsageQuery(parsed),
    );
  }
}
