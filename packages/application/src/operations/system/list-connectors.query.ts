import {
  type ConnectionCategoryKey,
  ConnectionCategoryValue,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type ConnectorDescriptor } from "../../ports";

export const listConnectorsQueryInputSchema = z.object({
  category: z
    .enum([
      "source",
      "dns",
      "infrastructure",
      "notification",
      "billing",
      "identity",
      "observability",
      "storage",
    ])
    .optional(),
  includeUnavailable: z.boolean().optional(),
});

export type ListConnectorsQueryInput = z.infer<typeof listConnectorsQueryInputSchema>;

export class ListConnectorsQuery extends Query<{ items: ConnectorDescriptor[] }> {
  constructor(readonly input: ListConnectorsQueryInput = {}) {
    super();
  }

  static create(input: ListConnectorsQueryInput = {}): Result<ListConnectorsQuery> {
    if (input.category) {
      const category = ConnectionCategoryValue.create(input.category);
      if (category.isErr()) {
        return err(category.error);
      }
    }
    return ok(new ListConnectorsQuery(input));
  }

  category(): ConnectionCategoryKey | undefined {
    return this.input.category;
  }

  includeUnavailable(): boolean {
    return this.input.includeUnavailable ?? false;
  }
}
