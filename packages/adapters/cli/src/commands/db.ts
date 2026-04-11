import { Command as EffectCommand } from "@effect/cli";
import { DbMigrateCommand, DbStatusQuery } from "@yundu/application";

import { runCommand, runQuery } from "../runtime.js";

const migrateCommand = EffectCommand.make("migrate", {}, () =>
  runCommand(DbMigrateCommand.create()),
).pipe(EffectCommand.withDescription("Apply pending migrations"));

const statusCommand = EffectCommand.make("status", {}, () => runQuery(DbStatusQuery.create())).pipe(
  EffectCommand.withDescription("Show migration status"),
);

export const dbCommand = EffectCommand.make("db").pipe(
  EffectCommand.withDescription("Database operations"),
  EffectCommand.withSubcommands([migrateCommand, statusCommand]),
);
