import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";

export const countProjectsQueryInputSchema = z.object({});

export type CountProjectsQueryInput = z.input<typeof countProjectsQueryInputSchema>;

export class CountProjectsQuery extends Query<{ count: number }> {
  static create(input?: CountProjectsQueryInput): Result<CountProjectsQuery> {
    return parseOperationInput(countProjectsQueryInputSchema, input ?? {}).map(
      () => new CountProjectsQuery(),
    );
  }
}
