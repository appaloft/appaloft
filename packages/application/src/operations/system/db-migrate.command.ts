import { ok, type Result } from "@appaloft/core";

import { Command } from "../../cqrs";

export type DbMigrateCommandInput = Record<string, never>;

export class DbMigrateCommand extends Command<{
  executed: string[];
}> {
  static create(): Result<DbMigrateCommand> {
    return ok(new DbMigrateCommand());
  }
}
