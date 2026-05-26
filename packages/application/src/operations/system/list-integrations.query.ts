import { ok, type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type IntegrationDescriptor } from "../../ports";

export type ListIntegrationsQueryInput = Record<string, never>;

export class ListIntegrationsQuery extends Query<{ items: IntegrationDescriptor[] }> {
  static create(): Result<ListIntegrationsQuery> {
    return ok(new ListIntegrationsQuery());
  }
}
