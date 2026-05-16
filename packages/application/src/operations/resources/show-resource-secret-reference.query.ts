import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ShowResourceSecretReferenceResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowResourceSecretReferenceQueryInput,
  showResourceSecretReferenceQueryInputSchema,
} from "./resource-secret-reference.schema";

export { type ShowResourceSecretReferenceQueryInput, showResourceSecretReferenceQueryInputSchema };

export class ShowResourceSecretReferenceQuery extends Query<ShowResourceSecretReferenceResult> {
  constructor(
    public readonly resourceId: string,
    public readonly key: string,
    public readonly exposure: "build-time" | "runtime",
  ) {
    super();
  }

  static create(
    input: ShowResourceSecretReferenceQueryInput,
  ): Result<ShowResourceSecretReferenceQuery> {
    return parseOperationInput(showResourceSecretReferenceQueryInputSchema, input).map(
      (parsed) =>
        new ShowResourceSecretReferenceQuery(parsed.resourceId, parsed.key, parsed.exposure),
    );
  }
}
