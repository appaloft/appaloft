import { ListSourceEventsQuery, ShowSourceEventQuery } from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const sourceEventIdArg = Args.text({ name: "sourceEventId" });
const projectOption = Options.text("project").pipe(Options.optional);
const resourceOption = Options.text("resource").pipe(Options.optional);
const sourceEventStatuses = [
  "accepted",
  "deduped",
  "ignored",
  "blocked",
  "dispatched",
  "failed",
] as const;
const sourceEventKinds = ["github", "gitlab", "generic-signed"] as const;
const statusOption = Options.choice("status", sourceEventStatuses).pipe(Options.optional);
const sourceKindOption = Options.choice("source-kind", sourceEventKinds).pipe(Options.optional);
const limitOption = Options.text("limit").pipe(Options.optional);
const cursorOption = Options.text("cursor").pipe(Options.optional);

function optionalLimit(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const listCommand = EffectCommand.make(
  "list",
  {
    project: projectOption,
    resource: resourceOption,
    status: statusOption,
    sourceKind: sourceKindOption,
    limit: limitOption,
    cursor: cursorOption,
  },
  ({ cursor, limit, project, resource, sourceKind, status }) => {
    const parsedLimit = optionalLimit(optionalValue(limit));

    return runQuery(
      ListSourceEventsQuery.create({
        ...(optionalValue(project) ? { projectId: optionalValue(project) } : {}),
        ...(optionalValue(resource) ? { resourceId: optionalValue(resource) } : {}),
        ...(optionalValue(status) ? { status: optionalValue(status) } : {}),
        ...(optionalValue(sourceKind) ? { sourceKind: optionalValue(sourceKind) } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
        ...(optionalValue(cursor) ? { cursor: optionalValue(cursor) } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.sourceEventList));

const showCommand = EffectCommand.make(
  "show",
  {
    sourceEventId: sourceEventIdArg,
    project: projectOption,
    resource: resourceOption,
  },
  ({ project, resource, sourceEventId }) =>
    runQuery(
      ShowSourceEventQuery.create({
        sourceEventId,
        ...(optionalValue(project) ? { projectId: optionalValue(project) } : {}),
        ...(optionalValue(resource) ? { resourceId: optionalValue(resource) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.sourceEventShow));

export const sourceEventCommand = EffectCommand.make("source-event").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.sourceEvent),
  EffectCommand.withSubcommands([listCommand, showCommand]),
);
