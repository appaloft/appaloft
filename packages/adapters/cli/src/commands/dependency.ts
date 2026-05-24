import {
  AcceptDependencyResourceProvisioningPlanCommand,
  ConfigureDependencyResourceBackupPolicyCommand,
  CreateDependencyResourceBackupCommand,
  CreateDependencyResourceProvisioningPlanCommand,
  DeleteDependencyResourceCommand,
  ImportDependencyResourceCommand,
  ListDependencyResourceBackupPoliciesQuery,
  ListDependencyResourceBackupsQuery,
  ListDependencyResourcesQuery,
  type ManagedDependencyResourceKind,
  ProvisionDependencyResourceCommand,
  RenameDependencyResourceCommand,
  RestoreDependencyResourceBackupCommand,
  ShowDependencyResourceBackupPolicyQuery,
  ShowDependencyResourceBackupQuery,
  ShowDependencyResourceProvisioningPlanQuery,
  ShowDependencyResourceQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const dependencyResourceIdArg = Args.text({ name: "dependencyResourceId" });
const backupIdArg = Args.text({ name: "backupId" });
const policyIdArg = Args.text({ name: "policyId" });
const projectOption = Options.text("project");
const environmentOption = Options.text("environment");
const optionalProjectOption = Options.text("project").pipe(Options.optional);
const optionalEnvironmentOption = Options.text("environment").pipe(Options.optional);
const kindOption = Options.text("kind");
const modeOption = Options.text("mode").pipe(Options.withDefault("create"));
const nameOption = Options.text("name");
const serverOption = Options.text("server").pipe(Options.optional);
const providerKeyOption = Options.text("provider-key").pipe(Options.optional);
const descriptionOption = Options.text("description").pipe(Options.optional);
const connectionUrlOption = Options.text("connection-url");
const optionalConnectionUrlOption = Options.text("connection-url").pipe(Options.optional);
const secretRefOption = Options.text("secret-ref").pipe(Options.optional);
const acknowledgeMutationOption = Options.boolean("acknowledge-mutation").pipe(
  Options.withDefault(false),
);
const backupRetentionOption = Options.boolean("backup-retention-required").pipe(
  Options.withDefault(false),
);
const backupReasonOption = Options.text("backup-reason").pipe(Options.optional);
const confirmDataOverwriteOption = Options.boolean("confirm-data-overwrite").pipe(
  Options.withDefault(false),
);
const confirmRuntimeNotRestartedOption = Options.boolean("confirm-runtime-not-restarted").pipe(
  Options.withDefault(false),
);
const retentionDaysOption = Options.integer("retention-days");
const scheduleIntervalHoursOption = Options.integer("interval-hours");
const enabledOption = Options.boolean("enabled").pipe(Options.withDefault(true));
const retryOnFailureOption = Options.boolean("retry-on-failure").pipe(Options.withDefault(true));
const nextRunAtOption = Options.text("next-run-at").pipe(Options.optional);
const enabledOnlyOption = Options.boolean("enabled-only").pipe(Options.withDefault(false));
const dueAtOption = Options.text("due-at").pipe(Options.optional);

function dependencyKindValue(kind: string): ManagedDependencyResourceKind {
  return kind as ManagedDependencyResourceKind;
}

const planCommand = EffectCommand.make(
  "plan",
  {
    mode: modeOption,
    kind: kindOption,
    project: projectOption,
    environment: environmentOption,
    name: nameOption,
    server: serverOption,
    providerKey: providerKeyOption,
    connectionUrl: optionalConnectionUrlOption,
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
    kind,
    mode,
    name,
    project,
    providerKey,
    secretRef,
    server,
  }) => {
    const backupReasonValue = optionalValue(backupReason);
    const backupRelationship =
      backupRetentionRequired || backupReasonValue
        ? {
            retentionRequired: backupRetentionRequired,
            ...(backupReasonValue ? { reason: backupReasonValue } : {}),
          }
        : undefined;

    return runCommand(
      CreateDependencyResourceProvisioningPlanCommand.create(
        mode === "reuse"
          ? {
              mode: "reuse",
              reuse: {
                kind: dependencyKindValue(kind),
                projectId: project,
                environmentId: environment,
                name,
                connectionUrl: optionalValue(connectionUrl) ?? "",
                ...(optionalValue(secretRef) ? { secretRef: optionalValue(secretRef) } : {}),
                ...(optionalValue(description) ? { description: optionalValue(description) } : {}),
                ...(backupRelationship ? { backupRelationship } : {}),
              },
            }
          : {
              mode: "create",
              create: {
                kind: dependencyKindValue(kind),
                projectId: project,
                environmentId: environment,
                name,
                ...(optionalValue(server) ? { serverId: optionalValue(server) } : {}),
                ...(optionalValue(providerKey) ? { providerKey: optionalValue(providerKey) } : {}),
                ...(optionalValue(description) ? { description: optionalValue(description) } : {}),
                ...(backupRelationship ? { backupRelationship } : {}),
              },
            },
      ),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyPlan));

const acceptCommand = EffectCommand.make(
  "accept",
  {
    planId: Args.text({ name: "planId" }),
    acknowledgeMutation: acknowledgeMutationOption,
  },
  ({ acknowledgeMutation, planId }) =>
    runCommand(
      AcceptDependencyResourceProvisioningPlanCommand.create({
        planId,
        acknowledgeMutation: acknowledgeMutation as true,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyAccept));

const statusCommand = EffectCommand.make(
  "status",
  {
    planId: Args.text({ name: "planId" }),
  },
  ({ planId }) => runQuery(ShowDependencyResourceProvisioningPlanQuery.create({ planId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyStatus));

const provisionCommand = EffectCommand.make(
  "provision",
  {
    kind: kindOption,
    project: projectOption,
    environment: environmentOption,
    name: nameOption,
    server: serverOption,
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
    kind,
    name,
    project,
    providerKey,
    server,
  }) => {
    const backupReasonValue = optionalValue(backupReason);
    return runCommand(
      ProvisionDependencyResourceCommand.create({
        kind: dependencyKindValue(kind),
        projectId: project,
        environmentId: environment,
        name,
        ...(optionalValue(server) ? { serverId: optionalValue(server) } : {}),
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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyProvision));

const importCommand = EffectCommand.make(
  "import",
  {
    kind: kindOption,
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
    kind,
    name,
    project,
    secretRef,
  }) => {
    const backupReasonValue = optionalValue(backupReason);
    return runCommand(
      ImportDependencyResourceCommand.create({
        kind: dependencyKindValue(kind),
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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyImport));

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

const backupCreateCommand = EffectCommand.make(
  "create",
  {
    dependencyResourceId: dependencyResourceIdArg,
    providerKey: providerKeyOption,
    description: descriptionOption,
  },
  ({ dependencyResourceId, description, providerKey }) =>
    runCommand(
      CreateDependencyResourceBackupCommand.create({
        dependencyResourceId,
        ...(optionalValue(description) ? { description: optionalValue(description) } : {}),
        ...(optionalValue(providerKey) ? { providerKey: optionalValue(providerKey) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyBackupCreate));

const backupListCommand = EffectCommand.make(
  "list",
  {
    dependencyResourceId: dependencyResourceIdArg,
  },
  ({ dependencyResourceId }) =>
    runQuery(ListDependencyResourceBackupsQuery.create({ dependencyResourceId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyBackupList));

const backupShowCommand = EffectCommand.make(
  "show",
  {
    backupId: backupIdArg,
  },
  ({ backupId }) => runQuery(ShowDependencyResourceBackupQuery.create({ backupId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyBackupShow));

const backupRestoreCommand = EffectCommand.make(
  "restore",
  {
    backupId: backupIdArg,
    acknowledgeDataOverwrite: confirmDataOverwriteOption,
    acknowledgeRuntimeNotRestarted: confirmRuntimeNotRestartedOption,
  },
  ({ acknowledgeDataOverwrite, acknowledgeRuntimeNotRestarted, backupId }) =>
    runCommand(
      RestoreDependencyResourceBackupCommand.create({
        backupId,
        acknowledgeDataOverwrite: acknowledgeDataOverwrite as true,
        acknowledgeRuntimeNotRestarted: acknowledgeRuntimeNotRestarted as true,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyBackupRestore));

const backupPolicyConfigureCommand = EffectCommand.make(
  "configure",
  {
    dependencyResourceId: dependencyResourceIdArg,
    policyId: Options.text("policy-id").pipe(Options.optional),
    retentionDays: retentionDaysOption,
    scheduleIntervalHours: scheduleIntervalHoursOption,
    providerKey: providerKeyOption,
    retryOnFailure: retryOnFailureOption,
    enabled: enabledOption,
    nextRunAt: nextRunAtOption,
  },
  ({
    dependencyResourceId,
    enabled,
    nextRunAt,
    policyId,
    providerKey,
    retentionDays,
    retryOnFailure,
    scheduleIntervalHours,
  }) =>
    runCommand(
      ConfigureDependencyResourceBackupPolicyCommand.create({
        dependencyResourceId,
        retentionDays,
        scheduleIntervalHours,
        enabled,
        retryOnFailure,
        ...(optionalValue(policyId) ? { policyId: optionalValue(policyId) } : {}),
        ...(optionalValue(providerKey) ? { providerKey: optionalValue(providerKey) } : {}),
        ...(optionalValue(nextRunAt) ? { nextRunAt: optionalValue(nextRunAt) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyBackupPolicyConfigure));

const backupPolicyListCommand = EffectCommand.make(
  "list",
  {
    dependencyResourceId: Args.text({ name: "dependencyResourceId" }).pipe(Args.optional),
    enabledOnly: enabledOnlyOption,
    dueAt: dueAtOption,
  },
  ({ dependencyResourceId, dueAt, enabledOnly }) =>
    runQuery(
      ListDependencyResourceBackupPoliciesQuery.create({
        ...(optionalValue(dependencyResourceId)
          ? { dependencyResourceId: optionalValue(dependencyResourceId) }
          : {}),
        enabledOnly,
        ...(optionalValue(dueAt) ? { dueAt: optionalValue(dueAt) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyBackupPolicyList));

const backupPolicyShowCommand = EffectCommand.make(
  "show",
  {
    policyId: policyIdArg,
  },
  ({ policyId }) => runQuery(ShowDependencyResourceBackupPolicyQuery.create({ policyId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.dependencyBackupPolicyShow));

const backupPolicyCommand = EffectCommand.make("policy").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.dependencyBackupPolicy),
  EffectCommand.withSubcommands([
    backupPolicyConfigureCommand,
    backupPolicyListCommand,
    backupPolicyShowCommand,
  ]),
);

const backupCommand = EffectCommand.make("backup").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.dependencyBackup),
  EffectCommand.withSubcommands([
    backupCreateCommand,
    backupListCommand,
    backupShowCommand,
    backupRestoreCommand,
    backupPolicyCommand,
  ]),
);

export const dependencyCommand = EffectCommand.make("dependency").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.dependency),
  EffectCommand.withSubcommands([
    planCommand,
    acceptCommand,
    statusCommand,
    provisionCommand,
    importCommand,
    backupCommand,
    listCommand,
    showCommand,
    renameCommand,
    deleteCommand,
  ]),
);
