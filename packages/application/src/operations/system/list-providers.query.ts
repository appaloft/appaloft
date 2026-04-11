import { ok, type Result } from "@yundu/core";

import { Query } from "../../cqrs";
import { type ProviderDescriptor } from "../../ports";

export type ListProvidersQueryInput = Record<string, never>;

export class ListProvidersQuery extends Query<{ items: ProviderDescriptor[] }> {
  static create(): Result<ListProvidersQuery> {
    return ok(new ListProvidersQuery());
  }
}
