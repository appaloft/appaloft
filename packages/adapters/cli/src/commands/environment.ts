import {
  CreateEnvironmentCommand,
  DiffEnvironmentsQuery,
  EnvironmentEffectivePrecedenceQuery,
  ListEnvironmentsQuery,
  PromoteEnvironmentCommand,
  SetEnvironmentVariableCommand,
  ShowEnvironmentQuery,
  UnsetEnvironmentVariableCommand,
} from "@appaloft/application";
import { configScopes, environmentKinds, variableExposures, variableKinds } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const environmentIdArg = Args.text({ name: "environmentId" });
const otherEnvironmentIdArg = Args.text({ name: "otherEnvironmentId" });
const keyArg = Args.text({ name: "key" });
const valueArg = Args.text({ name: "value" });
const targetNameArg = Args.text({ name: "targetName" });

const projectOption = Options.text("project").pipe(Options.optional);
const nameOption = Options.text("name");
const kindOption = Options.choice("kind", environmentKinds);
const parentOption = Options.text("parent").pipe(Options.optional);
const exposureOption = Options.choice("exposure", variableExposures);
const scopeOption = Options.choice("scope", configScopes).pipe(Options.optional);
const secretOption = Options.boolean("secret").pipe(Options.withDefault(false));
const variableKindOption = Options.choice("kind", variableKinds);

const listCommand = EffectCommand.make(
  "list",
  {
    project: projectOption,
  },
  ({ project }) =>
    runQuery(
      ListEnvironmentsQuery.create({
        projectId: optionalValue(project),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentList));

const createCommand = EffectCommand.make(
  "create",
  {
    project: Options.text("project"),
    name: nameOption,
    kind: kindOption,
    parent: parentOption,
  },
  ({ kind, name, parent, project }) =>
    runCommand(
      CreateEnvironmentCommand.create({
        projectId: project,
        name,
        kind,
        parentEnvironmentId: optionalValue(parent),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentCreate));

const showCommand = EffectCommand.make(
  "show",
  {
    environmentId: environmentIdArg,
  },
  ({ environmentId }) => runQuery(ShowEnvironmentQuery.create({ environmentId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentShow));

const setCommand = EffectCommand.make(
  "set",
  {
    environmentId: environmentIdArg,
    key: keyArg,
    value: valueArg,
    kind: variableKindOption,
    exposure: exposureOption,
    scope: scopeOption,
    secret: secretOption,
  },
  ({ environmentId, exposure, key, kind, scope, secret, value }) =>
    runCommand(
      SetEnvironmentVariableCommand.create({
        environmentId,
        key,
        value,
        kind,
        exposure,
        scope: optionalValue(scope),
        isSecret: secret,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentSet));

const unsetCommand = EffectCommand.make(
  "unset",
  {
    environmentId: environmentIdArg,
    key: keyArg,
    exposure: exposureOption,
    scope: scopeOption,
  },
  ({ environmentId, exposure, key, scope }) =>
    runCommand(
      UnsetEnvironmentVariableCommand.create({
        environmentId,
        key,
        exposure,
        scope: optionalValue(scope),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentUnset));

const diffCommand = EffectCommand.make(
  "diff",
  {
    environmentId: environmentIdArg,
    otherEnvironmentId: otherEnvironmentIdArg,
  },
  ({ environmentId, otherEnvironmentId }) =>
    runQuery(
      DiffEnvironmentsQuery.create({
        environmentId,
        otherEnvironmentId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentDiff));

const effectivePrecedenceCommand = EffectCommand.make(
  "effective-precedence",
  {
    environmentId: environmentIdArg,
  },
  ({ environmentId }) => runQuery(EnvironmentEffectivePrecedenceQuery.create({ environmentId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentEffectivePrecedence));

const promoteCommand = EffectCommand.make(
  "promote",
  {
    environmentId: environmentIdArg,
    targetName: targetNameArg,
    kind: kindOption,
  },
  ({ environmentId, kind, targetName }) =>
    runCommand(
      PromoteEnvironmentCommand.create({
        environmentId,
        targetName,
        targetKind: kind,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentPromote));

export const envCommand = EffectCommand.make("env").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.environment),
  EffectCommand.withSubcommands([
    listCommand,
    createCommand,
    showCommand,
    setCommand,
    unsetCommand,
    effectivePrecedenceCommand,
    diffCommand,
    promoteCommand,
  ]),
);
