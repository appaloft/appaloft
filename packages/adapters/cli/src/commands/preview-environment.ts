import {
  DeletePreviewEnvironmentCommand,
  ListPreviewEnvironmentsQuery,
  ShowPreviewEnvironmentQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalNumber, optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const previewEnvironmentStatuses = ["active", "cleanup-requested"] as const;

const previewEnvironmentIdArg = Args.text({ name: "previewEnvironmentId" });
const projectOption = Options.text("project").pipe(Options.optional);
const environmentOption = Options.text("environment").pipe(Options.optional);
const resourceOption = Options.text("resource").pipe(Options.optional);
const requiredResourceOption = Options.text("resource");
const statusOption = Options.choice("status", previewEnvironmentStatuses).pipe(Options.optional);
const repositoryOption = Options.text("repository").pipe(Options.optional);
const pullRequestNumberOption = Options.text("pull-request-number").pipe(Options.optional);
const limitOption = Options.text("limit").pipe(Options.optional);
const cursorOption = Options.text("cursor").pipe(Options.optional);

const listCommand = EffectCommand.make(
  "list",
  {
    project: projectOption,
    environment: environmentOption,
    resource: resourceOption,
    status: statusOption,
    repository: repositoryOption,
    pullRequestNumber: pullRequestNumberOption,
    limit: limitOption,
    cursor: cursorOption,
  },
  ({ cursor, environment, limit, project, pullRequestNumber, repository, resource, status }) => {
    const projectId = optionalValue(project);
    const environmentId = optionalValue(environment);
    const resourceId = optionalValue(resource);
    const statusValue = optionalValue(status);
    const repositoryFullName = optionalValue(repository);
    const pullRequestNumberValue = optionalNumber(pullRequestNumber);
    const limitValue = optionalNumber(limit);
    const cursorValue = optionalValue(cursor);

    return runQuery(
      ListPreviewEnvironmentsQuery.create({
        ...(projectId ? { projectId } : {}),
        ...(environmentId ? { environmentId } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(statusValue ? { status: statusValue } : {}),
        ...(repositoryFullName ? { repositoryFullName } : {}),
        ...(pullRequestNumberValue !== undefined
          ? { pullRequestNumber: pullRequestNumberValue }
          : {}),
        ...(limitValue !== undefined ? { limit: limitValue } : {}),
        ...(cursorValue ? { cursor: cursorValue } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.previewEnvironmentList));

const showCommand = EffectCommand.make(
  "show",
  {
    previewEnvironmentId: previewEnvironmentIdArg,
    project: projectOption,
    resource: resourceOption,
  },
  ({ previewEnvironmentId, project, resource }) => {
    const projectId = optionalValue(project);
    const resourceId = optionalValue(resource);

    return runQuery(
      ShowPreviewEnvironmentQuery.create({
        previewEnvironmentId,
        ...(projectId ? { projectId } : {}),
        ...(resourceId ? { resourceId } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.previewEnvironmentShow));

const deleteCommand = EffectCommand.make(
  "delete",
  {
    previewEnvironmentId: previewEnvironmentIdArg,
    resource: requiredResourceOption,
  },
  ({ previewEnvironmentId, resource }) =>
    runCommand(
      DeletePreviewEnvironmentCommand.create({
        previewEnvironmentId,
        resourceId: resource,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.previewEnvironmentDelete));

export const previewEnvironmentCommand = EffectCommand.make("environment").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.previewEnvironment),
  EffectCommand.withSubcommands([listCommand, showCommand, deleteCommand]),
);
