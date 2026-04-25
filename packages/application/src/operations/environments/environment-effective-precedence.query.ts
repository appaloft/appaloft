import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type EnvironmentEffectivePrecedenceView } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type EnvironmentEffectivePrecedenceQueryInput,
  environmentEffectivePrecedenceQueryInputSchema,
} from "./environment-effective-precedence.schema";

export {
  type EnvironmentEffectivePrecedenceQueryInput,
  environmentEffectivePrecedenceQueryInputSchema,
} from "./environment-effective-precedence.schema";

export class EnvironmentEffectivePrecedenceQuery extends Query<EnvironmentEffectivePrecedenceView> {
  constructor(public readonly environmentId: string) {
    super();
  }

  static create(
    input: EnvironmentEffectivePrecedenceQueryInput,
  ): Result<EnvironmentEffectivePrecedenceQuery> {
    return parseOperationInput(environmentEffectivePrecedenceQueryInputSchema, input).map(
      (parsed) => new EnvironmentEffectivePrecedenceQuery(parsed.environmentId),
    );
  }
}
