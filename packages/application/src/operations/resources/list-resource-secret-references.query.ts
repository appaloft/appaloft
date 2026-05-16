import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ListResourceSecretReferencesResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListResourceSecretReferencesQueryInput,
  listResourceSecretReferencesQueryInputSchema,
} from "./resource-secret-reference.schema";

export {
  type ListResourceSecretReferencesQueryInput,
  listResourceSecretReferencesQueryInputSchema,
};

export class ListResourceSecretReferencesQuery extends Query<ListResourceSecretReferencesResult> {
  constructor(
    public readonly resourceId: string,
    public readonly exposure?: "build-time" | "runtime",
  ) {
    super();
  }

  static create(
    input: ListResourceSecretReferencesQueryInput,
  ): Result<ListResourceSecretReferencesQuery> {
    return parseOperationInput(listResourceSecretReferencesQueryInputSchema, input).map(
      (parsed) => new ListResourceSecretReferencesQuery(parsed.resourceId, parsed.exposure),
    );
  }
}
