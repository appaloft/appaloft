import { ok, type Result } from "@appaloft/core";

import { Query } from "../../cqrs";

export type DbStatusQueryInput = Record<string, never>;

export class DbStatusQuery extends Query<{
  pending: string[];
  executed: string[];
}> {
  static create(): Result<DbStatusQuery> {
    return ok(new DbStatusQuery());
  }
}
