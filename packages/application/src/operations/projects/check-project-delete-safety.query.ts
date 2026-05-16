import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ProjectDeleteSafety } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CheckProjectDeleteSafetyQueryInput,
  checkProjectDeleteSafetyQueryInputSchema,
} from "./check-project-delete-safety.schema";

export {
  type CheckProjectDeleteSafetyQueryInput,
  checkProjectDeleteSafetyQueryInputSchema,
} from "./check-project-delete-safety.schema";

export class CheckProjectDeleteSafetyQuery extends Query<ProjectDeleteSafety> {
  constructor(public readonly projectId: string) {
    super();
  }

  static create(input: CheckProjectDeleteSafetyQueryInput): Result<CheckProjectDeleteSafetyQuery> {
    return parseOperationInput(checkProjectDeleteSafetyQueryInputSchema, input).map(
      (parsed) => new CheckProjectDeleteSafetyQuery(parsed.projectId),
    );
  }
}
