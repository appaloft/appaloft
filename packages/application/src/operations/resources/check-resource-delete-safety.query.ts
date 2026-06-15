import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ResourceDeleteSafety } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CheckResourceDeleteSafetyQueryInput,
  checkResourceDeleteSafetyQueryInputSchema,
} from "./check-resource-delete-safety.schema";

export {
  type CheckResourceDeleteSafetyQueryInput,
  checkResourceDeleteSafetyQueryInputSchema,
} from "./check-resource-delete-safety.schema";

export class CheckResourceDeleteSafetyQuery extends Query<ResourceDeleteSafety> {
  constructor(public readonly resourceId: string) {
    super();
  }

  static create(
    input: CheckResourceDeleteSafetyQueryInput,
  ): Result<CheckResourceDeleteSafetyQuery> {
    return parseOperationInput(checkResourceDeleteSafetyQueryInputSchema, input).map(
      (parsed) => new CheckResourceDeleteSafetyQuery(parsed.resourceId),
    );
  }
}
