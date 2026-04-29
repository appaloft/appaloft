import {
  ListOperatorWorkQuery,
  operatorWorkKinds,
  operatorWorkStatuses,
  ShowOperatorWorkQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const workIdArg = Args.text({ name: "workId" });
const kindOption = Options.choice("kind", operatorWorkKinds).pipe(Options.optional);
const statusOption = Options.choice("status", operatorWorkStatuses).pipe(Options.optional);
const resourceIdOption = Options.text("resource-id").pipe(Options.optional);
const serverIdOption = Options.text("server-id").pipe(Options.optional);
const deploymentIdOption = Options.text("deployment-id").pipe(Options.optional);
const limitOption = Options.text("limit").pipe(Options.optional);

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
    kind: kindOption,
    status: statusOption,
    resourceId: resourceIdOption,
    serverId: serverIdOption,
    deploymentId: deploymentIdOption,
    limit: limitOption,
  },
  ({ deploymentId, kind, limit, resourceId, serverId, status }) => {
    const parsedLimit = optionalLimit(optionalValue(limit));

    return runQuery(
      ListOperatorWorkQuery.create({
        ...(optionalValue(kind) ? { kind: optionalValue(kind) } : {}),
        ...(optionalValue(status) ? { status: optionalValue(status) } : {}),
        ...(optionalValue(resourceId) ? { resourceId: optionalValue(resourceId) } : {}),
        ...(optionalValue(serverId) ? { serverId: optionalValue(serverId) } : {}),
        ...(optionalValue(deploymentId) ? { deploymentId: optionalValue(deploymentId) } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operatorWorkList));

const showCommand = EffectCommand.make(
  "show",
  {
    workId: workIdArg,
  },
  ({ workId }) =>
    runQuery(
      ShowOperatorWorkQuery.create({
        workId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operatorWorkShow));

export const operatorWorkCommand = EffectCommand.make("work").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.operatorWork),
  EffectCommand.withSubcommands([listCommand, showCommand]),
);
