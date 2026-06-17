import {
  type ConnectionCategoryDefinitionSnapshot,
  connectionCategoryDefinitions,
  ok,
  type Result,
} from "@appaloft/core";

import { Query } from "../../cqrs";

export type ListConnectorCategoriesQueryInput = Record<string, never>;

export class ListConnectorCategoriesQuery extends Query<{
  items: ConnectionCategoryDefinitionSnapshot[];
}> {
  static create(): Result<ListConnectorCategoriesQuery> {
    return ok(new ListConnectorCategoriesQuery());
  }

  static defaultItems(): ConnectionCategoryDefinitionSnapshot[] {
    return [...connectionCategoryDefinitions];
  }
}
