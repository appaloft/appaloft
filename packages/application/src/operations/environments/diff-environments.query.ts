import { type Result } from "@appaloft/core";
import { Query } from "../../cqrs";
import { type EnvironmentDiffSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type DiffEnvironmentsQueryInput,
  diffEnvironmentsQueryInputSchema,
} from "./diff-environments.schema";

export {
  type DiffEnvironmentsQueryInput,
  diffEnvironmentsQueryInputSchema,
} from "./diff-environments.schema";

export class DiffEnvironmentsQuery extends Query<EnvironmentDiffSummary[]> {
  constructor(
    public readonly environmentId: string,
    public readonly otherEnvironmentId: string,
  ) {
    super();
  }

  static create(input: DiffEnvironmentsQueryInput): Result<DiffEnvironmentsQuery> {
    return parseOperationInput(diffEnvironmentsQueryInputSchema, input).map(
      (parsed) => new DiffEnvironmentsQuery(parsed.environmentId, parsed.otherEnvironmentId),
    );
  }
}
