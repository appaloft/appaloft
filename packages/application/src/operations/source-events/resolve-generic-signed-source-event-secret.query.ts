import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ResolveGenericSignedSourceEventSecretQueryInput,
  type ResolveGenericSignedSourceEventSecretResponse,
  resolveGenericSignedSourceEventSecretQueryInputSchema,
} from "./resolve-generic-signed-source-event-secret.schema";

export {
  type ResolveGenericSignedSourceEventSecretQueryInput,
  type ResolveGenericSignedSourceEventSecretResponse,
  resolveGenericSignedSourceEventSecretQueryInputSchema,
  resolveGenericSignedSourceEventSecretResponseSchema,
} from "./resolve-generic-signed-source-event-secret.schema";

export class ResolveGenericSignedSourceEventSecretQuery extends Query<ResolveGenericSignedSourceEventSecretResponse> {
  constructor(public readonly resourceId: string) {
    super();
  }

  static create(
    input: ResolveGenericSignedSourceEventSecretQueryInput,
  ): Result<ResolveGenericSignedSourceEventSecretQuery> {
    return parseOperationInput(resolveGenericSignedSourceEventSecretQueryInputSchema, input).map(
      (parsed) => new ResolveGenericSignedSourceEventSecretQuery(parsed.resourceId),
    );
  }
}
