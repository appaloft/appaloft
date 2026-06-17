import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type EnvironmentProfileDiffSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type DiffEnvironmentProfileQueryInput,
  diffEnvironmentProfileQueryInputSchema,
} from "./diff-environment-profile.schema";

export {
  type DiffEnvironmentProfileQueryInput,
  diffEnvironmentProfileQueryInputSchema,
} from "./diff-environment-profile.schema";

export class DiffEnvironmentProfileQuery extends Query<EnvironmentProfileDiffSummary> {
  constructor(
    public readonly environmentId: string,
    public readonly targetEnvironmentId: string,
    public readonly includeUnchanged?: boolean,
  ) {
    super();
  }

  static create(input: DiffEnvironmentProfileQueryInput): Result<DiffEnvironmentProfileQuery> {
    return parseOperationInput(diffEnvironmentProfileQueryInputSchema, input).map(
      (parsed) =>
        new DiffEnvironmentProfileQuery(
          parsed.environmentId,
          parsed.targetEnvironmentId,
          parsed.includeUnchanged,
        ),
    );
  }
}
