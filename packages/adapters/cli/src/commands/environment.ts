import { Args, Command as EffectCommand, Options } from "@effect/cli";
import {
  CreateEnvironmentCommand,
  DiffEnvironmentsQuery,
  ListEnvironmentsQuery,
  PromoteEnvironmentCommand,
  SetEnvironmentVariableCommand,
  ShowEnvironmentQuery,
  UnsetEnvironmentVariableCommand,
} from "@yundu/application";
import { configScopes, environmentKinds, variableExposures, variableKinds } from "@yundu/core";

import { optionalValue, runCommand, runQuery } from "../runtime.js";

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
).pipe(EffectCommand.withDescription("List environments"));

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
).pipe(EffectCommand.withDescription("Create an environment"));

const showCommand = EffectCommand.make(
  "show",
  {
    environmentId: environmentIdArg,
  },
  ({ environmentId }) => runQuery(ShowEnvironmentQuery.create({ environmentId })),
).pipe(EffectCommand.withDescription("Show an environment"));

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
).pipe(EffectCommand.withDescription("Set an environment variable"));

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
).pipe(EffectCommand.withDescription("Unset an environment variable"));

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
).pipe(EffectCommand.withDescription("Diff two environments"));

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
).pipe(EffectCommand.withDescription("Promote an environment"));

export const envCommand = EffectCommand.make("env").pipe(
  EffectCommand.withDescription("Environment operations"),
  EffectCommand.withSubcommands([
    listCommand,
    createCommand,
    showCommand,
    setCommand,
    unsetCommand,
    diffCommand,
    promoteCommand,
  ]),
);
