import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ResourceAccessFailureEvidenceLookup } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ResourceAccessFailureEvidenceLookupQueryInput,
  resourceAccessFailureEvidenceLookupQueryInputSchema,
} from "./resource-access-failure-evidence-lookup.schema";

export {
  type ResourceAccessFailureEvidenceLookupQueryInput,
  resourceAccessFailureEvidenceLookupQueryInputSchema,
} from "./resource-access-failure-evidence-lookup.schema";

export class ResourceAccessFailureEvidenceLookupQuery extends Query<ResourceAccessFailureEvidenceLookup> {
  constructor(
    public readonly requestId: string,
    public readonly resourceId?: string,
    public readonly hostname?: string,
    public readonly path?: string,
  ) {
    super();
  }

  static create(
    input: ResourceAccessFailureEvidenceLookupQueryInput,
  ): Result<ResourceAccessFailureEvidenceLookupQuery> {
    return parseOperationInput(resourceAccessFailureEvidenceLookupQueryInputSchema, input).map(
      (parsed) =>
        new ResourceAccessFailureEvidenceLookupQuery(
          parsed.requestId,
          trimToUndefined(parsed.resourceId),
          trimToUndefined(parsed.hostname),
          trimToUndefined(parsed.path),
        ),
    );
  }
}
