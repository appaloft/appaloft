import { ok, type Result } from "@yundu/core";

import { Query } from "../../cqrs";
import { type PluginSummary } from "../../ports";

export type ListPluginsQueryInput = Record<string, never>;

export class ListPluginsQuery extends Query<{ items: PluginSummary[] }> {
  static create(): Result<ListPluginsQuery> {
    return ok(new ListPluginsQuery());
  }
}
