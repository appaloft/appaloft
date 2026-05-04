import {
  CreateStorageVolumeCommand,
  DeleteStorageVolumeCommand,
  ListStorageVolumesQuery,
  RenameStorageVolumeCommand,
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
      ]),
    ),
  ]),
);
