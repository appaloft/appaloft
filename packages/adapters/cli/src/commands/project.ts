import {
  ArchiveProjectCommand,
  CreateProjectCommand,
  ListProjectsQuery,
  RenameProjectCommand,
  ShowProjectQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const projectIdArg = Args.text({ name: "projectId" });
const nameOption = Options.text("name");
const descriptionOption = Options.text("description").pipe(Options.optional);
const archiveReasonOption = Options.text("reason").pipe(Options.optional);

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

const listCommand = EffectCommand.make("list", {}, () => runQuery(ListProjectsQuery.create())).pipe(
  EffectCommand.withDescription(cliCommandDescriptions.projectList),
);

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

export const projectCommand = EffectCommand.make("project").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.project),
  EffectCommand.withSubcommands([
    createCommand,
    listCommand,
    showCommand,
    renameCommand,
    archiveCommand,
  ]),
);
