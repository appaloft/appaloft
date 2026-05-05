import {
  DeleteDependencyResourceCommand,
  ImportPostgresDependencyResourceCommand,
  ImportRedisDependencyResourceCommand,
  ListDependencyResourcesQuery,
  ProvisionPostgresDependencyResourceCommand,
  ProvisionRedisDependencyResourceCommand,
  RenameDependencyResourceCommand,
  ShowDependencyResourceQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const dependencyResourceIdArg = Args.text({ name: "dependencyResourceId" });
const projectOption = Options.text("project");
const environmentOption = Options.text("environment");
const optionalProjectOption = Options.text("project").pipe(Options.optional);
const optionalEnvironmentOption = Options.text("environment").pipe(Options.optional);
const nameOption = Options.text("name");
const providerKeyOption = Options.text("provider-key").pipe(Options.optional);
const descriptionOption = Options.text("description").pipe(Options.optional);
const connectionUrlOption = Options.text("connection-url");
const secretRefOption = Options.text("secret-ref").pipe(Options.optional);
const backupRetentionOption = Options.boolean("backup-retention-required").pipe(
  Options.withDefault(false),
);
const backupReasonOption = Options.text("backup-reason").pipe(Options.optional);

const provisionPostgresCommand = EffectCommand.make(
  "provision",
  {
    project: projectOption,
    environment: environmentOption,
    name: nameOption,
    providerKey: providerKeyOption,
    description: descriptionOption,
    backupRetentionRequired: backupRetentionOption,
    backupReason: backupReasonOption,
  },
  ({
    backupReason,
    backupRetentionRequired,
    description,
    environment,
    name,
    project,
    providerKey,
  }) => {
    const backupReasonValue = optionalValue(backupReason);
    return runCommand(
      ProvisionPostgresDependencyResourceCommand.create({
        projectId: project,
        environmentId: environment,
        name,
        ...(optionalValue(providerKey) ? { providerKey: optionalValue(providerKey) } : {}),
        ...(optionalValue(description) ? { description: optionalValue(description) } : {}),
        ...(backupRetentionRequired || backupReasonValue
          ? {
              backupRelationship: {
                retentionRequired: backupRetentionRequired,
                ...(backupReasonValue ? { reason: backupReasonValue } : {}),
              },
            }
          : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyPostgresProvision));

const importPostgresCommand = EffectCommand.make(
  "import",
  {
    project: projectOption,
    environment: environmentOption,
    name: nameOption,
    connectionUrl: connectionUrlOption,
    secretRef: secretRefOption,
    description: descriptionOption,
    backupRetentionRequired: backupRetentionOption,
    backupReason: backupReasonOption,
  },
  ({
    backupReason,
    backupRetentionRequired,
    connectionUrl,
    description,
    environment,
    name,
    project,
    secretRef,
  }) => {
    const backupReasonValue = optionalValue(backupReason);
    return runCommand(
      ImportPostgresDependencyResourceCommand.create({
        projectId: project,
        environmentId: environment,
        name,
        connectionUrl,
        ...(optionalValue(secretRef) ? { secretRef: optionalValue(secretRef) } : {}),
        ...(optionalValue(description) ? { description: optionalValue(description) } : {}),
        ...(backupRetentionRequired || backupReasonValue
          ? {
              backupRelationship: {
                retentionRequired: backupRetentionRequired,
                ...(backupReasonValue ? { reason: backupReasonValue } : {}),
              },
            }
          : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyPostgresImport));

const provisionRedisCommand = EffectCommand.make(
  "provision",
  {
    project: projectOption,
    environment: environmentOption,
    name: nameOption,
    providerKey: providerKeyOption,
    description: descriptionOption,
    backupRetentionRequired: backupRetentionOption,
    backupReason: backupReasonOption,
  },
  ({
    backupReason,
    backupRetentionRequired,
    description,
    environment,
    name,
    project,
    providerKey,
  }) => {
    const backupReasonValue = optionalValue(backupReason);
    return runCommand(
      ProvisionRedisDependencyResourceCommand.create({
        projectId: project,
        environmentId: environment,
        name,
        ...(optionalValue(providerKey) ? { providerKey: optionalValue(providerKey) } : {}),
        ...(optionalValue(description) ? { description: optionalValue(description) } : {}),
        ...(backupRetentionRequired || backupReasonValue
          ? {
              backupRelationship: {
                retentionRequired: backupRetentionRequired,
                ...(backupReasonValue ? { reason: backupReasonValue } : {}),
              },
            }
          : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyRedisProvision));

const importRedisCommand = EffectCommand.make(
  "import",
  {
    project: projectOption,
    environment: environmentOption,
    name: nameOption,
    connectionUrl: connectionUrlOption,
    secretRef: secretRefOption,
    description: descriptionOption,
    backupRetentionRequired: backupRetentionOption,
    backupReason: backupReasonOption,
  },
  ({
    backupReason,
    backupRetentionRequired,
    connectionUrl,
    description,
    environment,
    name,
    project,
    secretRef,
  }) => {
    const backupReasonValue = optionalValue(backupReason);
    return runCommand(
      ImportRedisDependencyResourceCommand.create({
        projectId: project,
        environmentId: environment,
        name,
        connectionUrl,
        ...(optionalValue(secretRef) ? { secretRef: optionalValue(secretRef) } : {}),
        ...(optionalValue(description) ? { description: optionalValue(description) } : {}),
        ...(backupRetentionRequired || backupReasonValue
          ? {
              backupRelationship: {
                retentionRequired: backupRetentionRequired,
                ...(backupReasonValue ? { reason: backupReasonValue } : {}),
              },
            }
          : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyRedisImport));

const listCommand = EffectCommand.make(
  "list",
  {
    project: optionalProjectOption,
    environment: optionalEnvironmentOption,
  },
  ({ environment, project }) =>
    runQuery(
      ListDependencyResourcesQuery.create({
        projectId: optionalValue(project),
        environmentId: optionalValue(environment),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyList));

const showCommand = EffectCommand.make(
  "show",
  {
    dependencyResourceId: dependencyResourceIdArg,
  },
  ({ dependencyResourceId }) =>
    runQuery(ShowDependencyResourceQuery.create({ dependencyResourceId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyShow));

const renameCommand = EffectCommand.make(
  "rename",
  {
    dependencyResourceId: dependencyResourceIdArg,
    name: nameOption,
  },
  ({ dependencyResourceId, name }) =>
    runCommand(RenameDependencyResourceCommand.create({ dependencyResourceId, name })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyRename));

const deleteCommand = EffectCommand.make(
  "delete",
  {
    dependencyResourceId: dependencyResourceIdArg,
  },
  ({ dependencyResourceId }) =>
    runCommand(DeleteDependencyResourceCommand.create({ dependencyResourceId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyDelete));

const postgresCommand = EffectCommand.make("postgres").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.dependencyPostgres),
  EffectCommand.withSubcommands([provisionPostgresCommand, importPostgresCommand]),
);

const redisCommand = EffectCommand.make("redis").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.dependencyRedis),
  EffectCommand.withSubcommands([provisionRedisCommand, importRedisCommand]),
);

export const dependencyCommand = EffectCommand.make("dependency").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.dependency),
  EffectCommand.withSubcommands([
    postgresCommand,
    redisCommand,
    listCommand,
    showCommand,
    renameCommand,
    deleteCommand,
  ]),
);
