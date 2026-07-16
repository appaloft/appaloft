import {
  ControlPlaneSecretRotationApplyCommand,
  ControlPlaneSecretRotationPlanQuery,
  DbMigrateCommand,
  DbStatusQuery,
} from "@appaloft/application";
import { Command as EffectCommand, Options } from "@effect/cli";

import { runCommand, runQuery } from "../runtime.js";

const migrateCommand = EffectCommand.make("migrate", {}, () =>
  runCommand(DbMigrateCommand.create()),
).pipe(EffectCommand.withDescription("Apply pending migrations"));

const statusCommand = EffectCommand.make("status", {}, () => runQuery(DbStatusQuery.create())).pipe(
  EffectCommand.withDescription("Show migration status"),
);

const secretRotationPlanCommand = EffectCommand.make("plan", {}, () =>
  runQuery(ControlPlaneSecretRotationPlanQuery.create()),
).pipe(
  EffectCommand.withDescription(
    "Dry-run control-plane secret rotation using counts, states, and a safe plan digest",
  ),
);

const secretRotationApplyCommand = EffectCommand.make(
  "apply",
  {
    planDigest: Options.text("plan-digest"),
    backupReference: Options.text("backup-reference"),
    allowLegacyPlaintext: Options.boolean("allow-legacy-plaintext").pipe(
      Options.withDefault(false),
    ),
  },
  ({ allowLegacyPlaintext, backupReference, planDigest }) =>
    runCommand(
      ControlPlaneSecretRotationApplyCommand.create({
        planDigest,
        backupReference,
        allowLegacyPlaintext,
      }),
    ),
).pipe(
  EffectCommand.withDescription(
    "Atomically apply a matching rotation plan after an external backup",
  ),
);

const secretRotationCommand = EffectCommand.make("secret-rotation").pipe(
  EffectCommand.withDescription("Plan and apply control-plane secret key rotation"),
  EffectCommand.withSubcommands([secretRotationPlanCommand, secretRotationApplyCommand]),
);

export const dbCommand = EffectCommand.make("db").pipe(
  EffectCommand.withDescription("Database operations"),
  EffectCommand.withSubcommands([migrateCommand, statusCommand, secretRotationCommand]),
);
