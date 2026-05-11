import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type AuthBootstrapStatus } from "../../ports";
import { emptyOperationInputSchema, parseOperationInput } from "../shared-schema";

export const getAuthBootstrapStatusQueryInputSchema = emptyOperationInputSchema;

export type GetAuthBootstrapStatusQueryInput = Record<string, never>;

export class GetAuthBootstrapStatusQuery extends Query<AuthBootstrapStatus> {
  static create(input: GetAuthBootstrapStatusQueryInput): Result<GetAuthBootstrapStatusQuery> {
    return parseOperationInput(getAuthBootstrapStatusQueryInputSchema, input).map(
      () => new GetAuthBootstrapStatusQuery(),
    );
  }
}
