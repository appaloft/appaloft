import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";

export const countServersQueryInputSchema = z.object({});

export type CountServersQueryInput = z.input<typeof countServersQueryInputSchema>;

export class CountServersQuery extends Query<{ count: number }> {
  static create(input?: CountServersQueryInput): Result<CountServersQuery> {
    return parseOperationInput(countServersQueryInputSchema, input ?? {}).map(
      () => new CountServersQuery(),
    );
  }
}
