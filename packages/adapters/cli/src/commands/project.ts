import {
  ArchiveProjectCommand,
  CheckProjectDeleteSafetyQuery,
  CreateProjectCommand,
  DeleteProjectCommand,
  ListProjectsQuery,
  RenameProjectCommand,
  ReorderProjectsCommand,
  RestoreProjectCommand,
  SetProjectDescriptionCommand,
  ShowProjectQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const projectIdArg = Args.text({ name: "projectId" });
const nameOption = Options.text("name");
const descriptionOption = Options.text("description").pipe(Options.optional);
const archiveReasonOption = Options.text("reason").pipe(Options.optional);
const lifecycleStatusOption = Options.choice("lifecycle-status", [
  "active",
  "archived",
  "all",
]).pipe(Options.optional);
const limitOption = Options.integer("limit").pipe(Options.optional);
const offsetOption = Options.integer("offset").pipe(Options.optional);
const projectIdsOption = Options.text("project-ids");
const startOffsetOption = Options.integer("start-offset").pipe(Options.optional);

const createCommand = EffectCommand.make(
  "create",
  {
    name: nameOption,
    description: descriptionOption,
  },
  ({ description, name }) =>
    runCommand(
      CreateProjectCommand.create({
        name,
        description: optionalValue(description),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.projectCreate));

const listCommand = EffectCommand.make(
  "list",
  {
    lifecycleStatus: lifecycleStatusOption,
    limit: limitOption,
    offset: offsetOption,
  },
  ({ lifecycleStatus, limit, offset }) =>
    runQuery(
      ListProjectsQuery.create({
        lifecycleStatus: optionalValue(lifecycleStatus),
        limit: optionalValue(limit),
        offset: optionalValue(offset),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.projectList));

const showCommand = EffectCommand.make("show", { projectId: projectIdArg }, ({ projectId }) =>
  runQuery(ShowProjectQuery.create({ projectId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.projectShow));

const renameCommand = EffectCommand.make(
  "rename",
  {
    projectId: projectIdArg,
    name: nameOption,
  },
  ({ name, projectId }) => runCommand(RenameProjectCommand.create({ projectId, name })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.projectRename));

const reorderCommand = EffectCommand.make(
  "reorder",
  {
    projectIds: projectIdsOption,
    startOffset: startOffsetOption,
  },
  ({ projectIds, startOffset }) =>
    runCommand(
      ReorderProjectsCommand.create({
        projectIds: projectIds
          .split(",")
          .map((projectId) => projectId.trim())
          .filter(Boolean),
        startOffset: optionalValue(startOffset),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.projectReorder));

const setDescriptionCommand = EffectCommand.make(
  "set-description",
  {
    projectId: projectIdArg,
    description: descriptionOption,
  },
  ({ description, projectId }) =>
    runCommand(
      SetProjectDescriptionCommand.create({
        projectId,
        description: optionalValue(description),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.projectSetDescription));

const archiveCommand = EffectCommand.make(
  "archive",
  {
    projectId: projectIdArg,
    reason: archiveReasonOption,
  },
  ({ projectId, reason }) =>
    runCommand(
      ArchiveProjectCommand.create({
        projectId,
        reason: optionalValue(reason),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.projectArchive));

const restoreCommand = EffectCommand.make(
  "restore",
  {
    projectId: projectIdArg,
  },
  ({ projectId }) => runCommand(RestoreProjectCommand.create({ projectId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.projectRestore));

const deleteCheckCommand = EffectCommand.make(
  "delete-check",
  {
    projectId: projectIdArg,
  },
  ({ projectId }) => runQuery(CheckProjectDeleteSafetyQuery.create({ projectId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.projectDeleteCheck));

const deleteCommand = EffectCommand.make(
  "delete",
  {
    projectId: projectIdArg,
    confirm: Options.text("confirm"),
  },
  ({ confirm, projectId }) =>
    runCommand(
      DeleteProjectCommand.create({
        projectId,
        confirmation: { projectId: confirm },
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.projectDelete));

export const projectCommand = EffectCommand.make("project").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.project),
  EffectCommand.withSubcommands([
    createCommand,
    listCommand,
    showCommand,
    renameCommand,
    reorderCommand,
    setDescriptionCommand,
    archiveCommand,
    restoreCommand,
    deleteCheckCommand,
    deleteCommand,
  ]),
);
