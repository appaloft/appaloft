import {
  ArchiveEnvironmentCommand,
  CloneEnvironmentCommand,
  CreateEnvironmentCommand,
  DiffEnvironmentProfileQuery,
  DiffEnvironmentsQuery,
  DuplicateEnvironmentProfileCommand,
  type DuplicateEnvironmentProfileCommandInput,
  EnvironmentEffectivePrecedenceQuery,
  ListEnvironmentsQuery,
  LockEnvironmentCommand,
  PlanDuplicateEnvironmentQuery,
  PromoteEnvironmentCommand,
  RenameEnvironmentCommand,
  SetEnvironmentVariableCommand,
  ShowEnvironmentQuery,
  UnlockEnvironmentCommand,
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
const archiveReasonOption = Options.text("reason").pipe(Options.optional);
const cloneKindOption = Options.choice("kind", environmentKinds).pipe(Options.optional);
const dependencyDecisionsOption = Options.text("dependency-decisions").pipe(Options.optional);
const resourceDecisionsOption = Options.text("resource-decisions").pipe(Options.optional);
const lockReasonOption = Options.text("reason").pipe(Options.optional);
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

const archiveCommand = EffectCommand.make(
  "archive",
  {
    environmentId: environmentIdArg,
    reason: archiveReasonOption,
  },
  ({ environmentId, reason }) =>
    runCommand(
      ArchiveEnvironmentCommand.create({
        environmentId,
        reason: optionalValue(reason),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentArchive));

const cloneCommand = EffectCommand.make(
  "clone",
  {
    environmentId: environmentIdArg,
    name: nameOption,
    kind: cloneKindOption,
  },
  ({ environmentId, kind, name }) =>
    runCommand(
      CloneEnvironmentCommand.create({
        environmentId,
        targetName: name,
        targetKind: optionalValue(kind),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentClone));

const renameCommand = EffectCommand.make(
  "rename",
  {
    environmentId: environmentIdArg,
    name: nameOption,
  },
  ({ environmentId, name }) =>
    runCommand(
      RenameEnvironmentCommand.create({
        environmentId,
        name,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentRename));

const lockCommand = EffectCommand.make(
  "lock",
  {
    environmentId: environmentIdArg,
    reason: lockReasonOption,
  },
  ({ environmentId, reason }) =>
    runCommand(
      LockEnvironmentCommand.create({
        environmentId,
        reason: optionalValue(reason),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentLock));

const unlockCommand = EffectCommand.make(
  "unlock",
  {
    environmentId: environmentIdArg,
  },
  ({ environmentId }) =>
    runCommand(
      UnlockEnvironmentCommand.create({
        environmentId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentUnlock));

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

const diffProfileCommand = EffectCommand.make(
  "diff-profile",
  {
    environmentId: environmentIdArg,
    targetEnvironmentId: Args.text({ name: "targetEnvironmentId" }),
    includeUnchanged: Options.boolean("include-unchanged").pipe(Options.optional),
  },
  ({ environmentId, includeUnchanged, targetEnvironmentId }) =>
    runQuery(
      DiffEnvironmentProfileQuery.create({
        environmentId,
        targetEnvironmentId,
        includeUnchanged: optionalValue(includeUnchanged),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentDiffProfile));

const duplicatePlanCommand = EffectCommand.make(
  "plan",
  {
    environmentId: environmentIdArg,
    name: nameOption,
    project: projectOption,
    target: Options.text("target").pipe(Options.optional),
  },
  ({ environmentId, name, project, target }) =>
    runQuery(
      PlanDuplicateEnvironmentQuery.create({
        environmentId,
        targetName: name,
        targetProjectId: optionalValue(project),
        targetEnvironmentId: optionalValue(target),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentDuplicatePlan));

const duplicateApplyCommand = EffectCommand.make(
  "apply",
  {
    environmentId: environmentIdArg,
    name: nameOption,
    kind: cloneKindOption,
    dependencyDecisions: dependencyDecisionsOption,
    resourceDecisions: resourceDecisionsOption,
  },
  ({ dependencyDecisions, environmentId, kind, name, resourceDecisions }) =>
    runCommand(
      DuplicateEnvironmentProfileCommand.create({
        environmentId,
        targetName: name,
        targetKind: optionalValue(kind),
        dependencyDecisions: parseJsonArrayOption(
          optionalValue(dependencyDecisions),
          "dependency-decisions",
        ) as DuplicateEnvironmentProfileCommandInput["dependencyDecisions"],
        resourceDecisions: parseJsonArrayOption(
          optionalValue(resourceDecisions),
          "resource-decisions",
        ) as DuplicateEnvironmentProfileCommandInput["resourceDecisions"],
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentDuplicateApply));

const duplicateCommand = EffectCommand.make("duplicate").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.environmentDuplicate),
  EffectCommand.withSubcommands([duplicatePlanCommand, duplicateApplyCommand]),
);

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
    renameCommand,
    lockCommand,
    unlockCommand,
    archiveCommand,
    cloneCommand,
    setCommand,
    unsetCommand,
    effectivePrecedenceCommand,
    diffCommand,
    diffProfileCommand,
    duplicateCommand,
    promoteCommand,
  ]),
);

function parseJsonArrayOption(text: string | undefined, optionName: string): unknown[] {
  if (!text?.trim()) {
    return [];
  }

  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`--${optionName} must be a JSON array`);
  }
  return parsed;
}
