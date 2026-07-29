import {
  BindRepositoryCommand,
  ShowRepositoryBindingQuery,
  UnbindRepositoryCommand,
} from "@appaloft/application";
import { Command as EffectCommand, Options } from "@effect/cli";

import { runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const repositoryOption = Options.text("repository");
const projectOption = Options.text("project");

const bindCommand = EffectCommand.make(
  "bind",
  { repository: repositoryOption, project: projectOption },
  ({ project, repository }) =>
    runCommand(
      BindRepositoryCommand.create({
        repositoryIdentity: repository,
        projectId: project,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.repositoryBindingBind));

const showCommand = EffectCommand.make("show", { repository: repositoryOption }, ({ repository }) =>
  runQuery(ShowRepositoryBindingQuery.create({ repositoryIdentity: repository })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.repositoryBindingShow));

const unbindCommand = EffectCommand.make(
  "unbind",
  { repository: repositoryOption },
  ({ repository }) =>
    runCommand(UnbindRepositoryCommand.create({ repositoryIdentity: repository })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.repositoryBindingUnbind));

export const repositoryBindingCommand = EffectCommand.make("repository-binding").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.repositoryBinding),
  EffectCommand.withSubcommands([bindCommand, showCommand, unbindCommand]),
);
