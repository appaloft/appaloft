import { ApplyInstanceUpgradeCommand, CheckInstanceUpgradeQuery } from "@appaloft/application";
import { Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";

const versionOption = Options.text("version").pipe(Options.optional);
const confirmOption = Options.boolean("confirm").pipe(Options.withDefault(false));

const checkUpgradeCommand = EffectCommand.make("check", { version: versionOption }, ({ version }) =>
  runQuery(
    CheckInstanceUpgradeQuery.create({
      ...(optionalValue(version) ? { targetVersion: optionalValue(version) } : {}),
    }),
  ),
).pipe(EffectCommand.withDescription("Check for an Appaloft instance upgrade"));

const applyUpgradeCommand = EffectCommand.make(
  "apply",
  {
    version: versionOption,
    confirm: confirmOption,
  },
  ({ confirm, version }) =>
    runCommand(
      ApplyInstanceUpgradeCommand.create({
        confirm,
        ...(optionalValue(version) ? { targetVersion: optionalValue(version) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription("Apply an Appaloft instance upgrade"));

export const upgradeCommand = EffectCommand.make("upgrade").pipe(
  EffectCommand.withDescription("Appaloft instance upgrade operations"),
  EffectCommand.withSubcommands([checkUpgradeCommand, applyUpgradeCommand]),
);
