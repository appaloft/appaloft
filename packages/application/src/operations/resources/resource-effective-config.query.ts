import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ResourceEffectiveConfigView } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ResourceEffectiveConfigQueryInput,
  resourceEffectiveConfigQueryInputSchema,
} from "./resource-effective-config.schema";

export { type ResourceEffectiveConfigQueryInput, resourceEffectiveConfigQueryInputSchema };

export class ResourceEffectiveConfigQuery extends Query<ResourceEffectiveConfigView> {
  constructor(public readonly resourceId: string) {
    super();
  }

  static create(input: ResourceEffectiveConfigQueryInput): Result<ResourceEffectiveConfigQuery> {
    return parseOperationInput(resourceEffectiveConfigQueryInputSchema, input).map(
      (parsed) => new ResourceEffectiveConfigQuery(parsed.resourceId),
    );
  }
}
