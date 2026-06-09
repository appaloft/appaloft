import {
  CleanupStorageVolumeRuntimeCommand,
  CreateStorageVolumeBackupCommand,
  CreateStorageVolumeBackupPlanQuery,
  CreateStorageVolumeCommand,
  CreateStorageVolumeRestorePlanQuery,
  DeleteStorageVolumeCommand,
  ListStorageVolumeBackupsQuery,
  ListStorageVolumesQuery,
  PruneStorageVolumeBackupCommand,
  RenameStorageVolumeCommand,
  RestoreStorageVolumeBackupCommand,
  ShowStorageVolumeBackupQuery,
  ShowStorageVolumeQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const storageVolumeIdArg = Args.text({ name: "storageVolumeId" });
const projectOption = Options.text("project");
const environmentOption = Options.text("environment");
const optionalProjectOption = Options.text("project").pipe(Options.optional);
const optionalEnvironmentOption = Options.text("environment").pipe(Options.optional);
const nameOption = Options.text("name");
const storageKindOption = Options.choice("kind", ["named-volume", "bind-mount"]).pipe(
  Options.withDefault("named-volume"),
);
const sourcePathOption = Options.text("source-path").pipe(Options.optional);
const descriptionOption = Options.text("description").pipe(Options.optional);
const backupRetentionOption = Options.boolean("backup-retention-required").pipe(
  Options.withDefault(false),
);
const backupReasonOption = Options.text("backup-reason").pipe(Options.optional);
const serverOption = Options.text("server");
const beforeOption = Options.text("before");
const dryRunOption = Options.choice("dry-run", ["true", "false"]).pipe(Options.optional);
const backupIdArg = Args.text({ name: "backupId" });
const backupStorageVolumeOption = Options.text("storage-volume");
const backupResourceOption = Options.text("resource").pipe(Options.optional);
const backupAttachmentOption = Options.text("attachment").pipe(Options.optional);
const backupDestinationPathOption = Options.text("destination-path").pipe(Options.optional);
const backupDataFormatOption = Options.choice("data-format", [
  "sqlite",
  "json-files",
  "filesystem",
  "application-export",
  "unknown",
]).pipe(Options.optional);
const backupLiveWritesOption = Options.choice("live-writes", ["true", "false"]).pipe(
  Options.withDefault("true"),
);
const backupConsistencyOption = Options.choice("consistency", [
  "crash-consistent",
  "quiesced",
  "application-consistent",
  "provider-snapshot-consistent",
]).pipe(Options.withDefault("application-consistent"));
const backupSourceAdapterOption = Options.choice("source-adapter", [
  "tar-volume",
  "sqlite-online-backup",
  "quiesce-and-copy",
  "app-export",
  "provider-snapshot",
  "unsupported",
]).pipe(Options.optional);
const backupTargetProviderOption = Options.choice("target-provider", [
  "local-filesystem",
  "s3-compatible",
  "webdav",
  "restic-repository",
  "provider-volume-snapshot",
]).pipe(Options.withDefault("local-filesystem"));
const backupTargetRefOption = Options.text("target-ref");
const backupFailureDomainOption = Options.text("failure-domain").pipe(Options.optional);
const backupSecretRefOption = Options.text("secret-ref").pipe(Options.optional);
const backupRetentionMaxCountOption = Options.integer("retention-max-count").pipe(
  Options.withDefault(3),
);
const backupRetentionMaxAgeDaysOption = Options.integer("retention-max-age-days").pipe(
  Options.optional,
);
const backupRetentionMaxBytesOption = Options.integer("retention-max-bytes").pipe(Options.optional);
const backupRetentionMinFreeBytesOption = Options.integer("retention-min-free-bytes").pipe(
  Options.optional,
);
const backupStatusOption = Options.choice("status", ["pending", "ready", "failed", "pruned"]).pipe(
  Options.optional,
);
const restoreTargetModeOption = Options.choice("target-mode", ["new-volume", "in-place"]).pipe(
  Options.withDefault("new-volume"),
);
const restoreTargetStorageVolumeOption = Options.text("target-storage-volume").pipe(
  Options.optional,
);
const restoredVolumeNameOption = Options.text("restored-volume-name").pipe(Options.optional);
const acknowledgeDestructiveRestoreOption = Options.boolean("acknowledge-destructive-restore").pipe(
  Options.withDefault(false),
);

type StorageBackupCommandOptions = {
  storageVolume: string;
  resource: string | undefined;
  attachment: string | undefined;
  destinationPath: string | undefined;
  dataFormat: string | undefined;
  liveWrites: "true" | "false";
  consistency:
    | "crash-consistent"
    | "quiesced"
    | "application-consistent"
    | "provider-snapshot-consistent";
  sourceAdapter: string | undefined;
  targetProvider:
    | "local-filesystem"
    | "s3-compatible"
    | "webdav"
    | "restic-repository"
    | "provider-volume-snapshot";
  targetRef: string;
  failureDomain: string | undefined;
  secretRef: string | undefined;
  retentionMaxCount: number;
  retentionMaxAgeDays: number | undefined;
  retentionMaxBytes: number | undefined;
  retentionMinFreeBytes: number | undefined;
};

function createBackupPlanRequest(input: StorageBackupCommandOptions) {
  return {
    source: {
      storageVolumeId: input.storageVolume,
      ...(input.resource ? { resourceId: input.resource } : {}),
      ...(input.attachment ? { attachmentId: input.attachment } : {}),
      ...(input.destinationPath ? { destinationPath: input.destinationPath } : {}),
      ...(input.dataFormat
        ? {
            dataFormat: input.dataFormat as
              | "sqlite"
              | "json-files"
              | "filesystem"
              | "application-export"
              | "unknown",
          }
        : {}),
      liveWrites: input.liveWrites === "true",
    },
    requestedConsistency: input.consistency,
    ...(input.sourceAdapter
      ? {
          preferredSourceAdapter: input.sourceAdapter as
            | "tar-volume"
            | "sqlite-online-backup"
            | "quiesce-and-copy"
            | "app-export"
            | "provider-snapshot"
            | "unsupported",
        }
      : {}),
    target: {
      providerKey: input.targetProvider,
      targetRef: input.targetRef,
      ...(input.failureDomain ? { failureDomain: input.failureDomain } : {}),
      ...(input.secretRef ? { secretRef: input.secretRef } : {}),
    },
    retention: {
      maxCount: input.retentionMaxCount,
      ...(input.retentionMaxAgeDays !== undefined ? { maxAgeDays: input.retentionMaxAgeDays } : {}),
      ...(input.retentionMaxBytes !== undefined ? { maxBytes: input.retentionMaxBytes } : {}),
      ...(input.retentionMinFreeBytes !== undefined
        ? { minFreeBytes: input.retentionMinFreeBytes }
        : {}),
    },
  };
}

const createCommand = EffectCommand.make(
  "create",
  {
    project: projectOption,
    environment: environmentOption,
    name: nameOption,
    kind: storageKindOption,
    sourcePath: sourcePathOption,
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
    sourcePath,
  }) => {
    const backupReasonValue = optionalValue(backupReason);
    return runCommand(
      CreateStorageVolumeCommand.create({
        projectId: project,
        environmentId: environment,
        name,
        kind,
        ...(optionalValue(description) ? { description: optionalValue(description) } : {}),
        ...(optionalValue(sourcePath) ? { sourcePath: optionalValue(sourcePath) } : {}),
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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeCreate));

const listCommand = EffectCommand.make(
  "list",
  {
    project: optionalProjectOption,
    environment: optionalEnvironmentOption,
  },
  ({ environment, project }) =>
    runQuery(
      ListStorageVolumesQuery.create({
        projectId: optionalValue(project),
        environmentId: optionalValue(environment),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeList));

const showCommand = EffectCommand.make(
  "show",
  {
    storageVolumeId: storageVolumeIdArg,
  },
  ({ storageVolumeId }) => runQuery(ShowStorageVolumeQuery.create({ storageVolumeId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeShow));

const renameCommand = EffectCommand.make(
  "rename",
  {
    storageVolumeId: storageVolumeIdArg,
    name: nameOption,
  },
  ({ name, storageVolumeId }) =>
    runCommand(RenameStorageVolumeCommand.create({ storageVolumeId, name })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeRename));

const deleteCommand = EffectCommand.make(
  "delete",
  {
    storageVolumeId: storageVolumeIdArg,
  },
  ({ storageVolumeId }) => runCommand(DeleteStorageVolumeCommand.create({ storageVolumeId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeDelete));

const cleanupRuntimeCommand = EffectCommand.make(
  "cleanup-runtime",
  {
    storageVolumeId: storageVolumeIdArg,
    serverId: serverOption,
    before: beforeOption,
    dryRun: dryRunOption,
  },
  ({ before, dryRun, serverId, storageVolumeId }) =>
    runCommand(
      CleanupStorageVolumeRuntimeCommand.create({
        storageVolumeId,
        serverId,
        before,
        dryRun: optionalValue(dryRun) !== "false",
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeCleanupRuntime));

const backupPlanCommand = EffectCommand.make(
  "plan",
  {
    storageVolume: backupStorageVolumeOption,
    resource: backupResourceOption,
    attachment: backupAttachmentOption,
    destinationPath: backupDestinationPathOption,
    dataFormat: backupDataFormatOption,
    liveWrites: backupLiveWritesOption,
    consistency: backupConsistencyOption,
    sourceAdapter: backupSourceAdapterOption,
    targetProvider: backupTargetProviderOption,
    targetRef: backupTargetRefOption,
    failureDomain: backupFailureDomainOption,
    secretRef: backupSecretRefOption,
    retentionMaxCount: backupRetentionMaxCountOption,
    retentionMaxAgeDays: backupRetentionMaxAgeDaysOption,
    retentionMaxBytes: backupRetentionMaxBytesOption,
    retentionMinFreeBytes: backupRetentionMinFreeBytesOption,
  },
  (input) =>
    runQuery(
      CreateStorageVolumeBackupPlanQuery.create(
        createBackupPlanRequest({
          ...input,
          resource: optionalValue(input.resource),
          attachment: optionalValue(input.attachment),
          destinationPath: optionalValue(input.destinationPath),
          dataFormat: optionalValue(input.dataFormat),
          sourceAdapter: optionalValue(input.sourceAdapter),
          failureDomain: optionalValue(input.failureDomain),
          secretRef: optionalValue(input.secretRef),
          retentionMaxAgeDays: optionalValue(input.retentionMaxAgeDays),
          retentionMaxBytes: optionalValue(input.retentionMaxBytes),
          retentionMinFreeBytes: optionalValue(input.retentionMinFreeBytes),
        }),
      ),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeBackupPlan));

const backupCreateCommand = EffectCommand.make(
  "create",
  {
    storageVolume: backupStorageVolumeOption,
    resource: backupResourceOption,
    attachment: backupAttachmentOption,
    destinationPath: backupDestinationPathOption,
    dataFormat: backupDataFormatOption,
    liveWrites: backupLiveWritesOption,
    consistency: backupConsistencyOption,
    sourceAdapter: backupSourceAdapterOption,
    targetProvider: backupTargetProviderOption,
    targetRef: backupTargetRefOption,
    failureDomain: backupFailureDomainOption,
    secretRef: backupSecretRefOption,
    retentionMaxCount: backupRetentionMaxCountOption,
    retentionMaxAgeDays: backupRetentionMaxAgeDaysOption,
    retentionMaxBytes: backupRetentionMaxBytesOption,
    retentionMinFreeBytes: backupRetentionMinFreeBytesOption,
  },
  (input) =>
    runCommand(
      CreateStorageVolumeBackupCommand.create({
        planRequest: createBackupPlanRequest({
          ...input,
          resource: optionalValue(input.resource),
          attachment: optionalValue(input.attachment),
          destinationPath: optionalValue(input.destinationPath),
          dataFormat: optionalValue(input.dataFormat),
          sourceAdapter: optionalValue(input.sourceAdapter),
          failureDomain: optionalValue(input.failureDomain),
          secretRef: optionalValue(input.secretRef),
          retentionMaxAgeDays: optionalValue(input.retentionMaxAgeDays),
          retentionMaxBytes: optionalValue(input.retentionMaxBytes),
          retentionMinFreeBytes: optionalValue(input.retentionMinFreeBytes),
        }),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeBackupCreate));

const backupListCommand = EffectCommand.make(
  "list",
  {
    storageVolume: backupStorageVolumeOption,
    status: backupStatusOption,
  },
  ({ status, storageVolume }) =>
    runQuery(
      ListStorageVolumeBackupsQuery.create({
        storageVolumeId: storageVolume,
        ...(optionalValue(status) ? { status: optionalValue(status) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeBackupList));

const backupShowCommand = EffectCommand.make(
  "show",
  {
    backupId: backupIdArg,
  },
  ({ backupId }) => runQuery(ShowStorageVolumeBackupQuery.create({ backupId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeBackupShow));

const backupRestorePlanCommand = EffectCommand.make(
  "restore-plan",
  {
    backupId: backupIdArg,
    targetMode: restoreTargetModeOption,
    targetStorageVolume: restoreTargetStorageVolumeOption,
    acknowledgeDestructiveRestore: acknowledgeDestructiveRestoreOption,
  },
  ({ acknowledgeDestructiveRestore, backupId, targetMode, targetStorageVolume }) =>
    runQuery(
      CreateStorageVolumeRestorePlanQuery.create({
        backupId,
        targetMode,
        ...(optionalValue(targetStorageVolume)
          ? { targetStorageVolumeId: optionalValue(targetStorageVolume) }
          : {}),
        acknowledgeDestructiveRestore,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeBackupRestorePlan));

const backupRestoreCommand = EffectCommand.make(
  "restore",
  {
    backupId: backupIdArg,
    targetMode: restoreTargetModeOption,
    restoredVolumeName: restoredVolumeNameOption,
    targetStorageVolume: restoreTargetStorageVolumeOption,
    acknowledgeDestructiveRestore: acknowledgeDestructiveRestoreOption,
  },
  ({
    acknowledgeDestructiveRestore,
    backupId,
    restoredVolumeName,
    targetMode,
    targetStorageVolume,
  }) =>
    runCommand(
      RestoreStorageVolumeBackupCommand.create({
        backupId,
        targetMode,
        ...(optionalValue(restoredVolumeName)
          ? { restoredVolumeName: optionalValue(restoredVolumeName) }
          : {}),
        ...(optionalValue(targetStorageVolume)
          ? { targetStorageVolumeId: optionalValue(targetStorageVolume) }
          : {}),
        acknowledgeDestructiveRestore,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeBackupRestore));

const backupPruneCommand = EffectCommand.make(
  "prune",
  {
    backupId: backupIdArg,
  },
  ({ backupId }) => runCommand(PruneStorageVolumeBackupCommand.create({ backupId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.storageVolumeBackupPrune));

const backupCommand = EffectCommand.make("backup").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.storageVolumeBackup),
  EffectCommand.withSubcommands([
    backupPlanCommand,
    backupCreateCommand,
    backupListCommand,
    backupShowCommand,
    backupRestorePlanCommand,
    backupRestoreCommand,
    backupPruneCommand,
  ]),
);

export const storageCommand = EffectCommand.make("storage").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.storage),
  EffectCommand.withSubcommands([
    EffectCommand.make("volume").pipe(
      EffectCommand.withDescription(cliCommandDescriptions.storageVolume),
      EffectCommand.withSubcommands([
        createCommand,
        listCommand,
        showCommand,
        renameCommand,
        deleteCommand,
        cleanupRuntimeCommand,
        backupCommand,
      ]),
    ),
  ]),
);
