import { InspectRuntimeUsageQuery, type RuntimeUsageScope } from "@appaloft/application";
import { domainError, err, type Result } from "@appaloft/core";
import { Args, Command as EffectCommand } from "@effect/cli";

import { runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const scopeArg = Args.text({ name: "scope" });

function parseScope(scope: string): Result<RuntimeUsageScope> {
  const [kind, id, extra] = scope.split(":");
  if (extra !== undefined || !kind || !id) {
    return err(
      domainError.validation("Runtime usage scope must use <kind>:<id>", {
        phase: "runtime-usage-inspection",
        scope,
      }),
    );
  }

  switch (kind) {
    case "server":
      return InspectRuntimeUsageQuery.create({ scope: { kind, serverId: id } }).map(
        (query) => query.input.scope,
      );
    case "project":
      return InspectRuntimeUsageQuery.create({ scope: { kind, projectId: id } }).map(
        (query) => query.input.scope,
      );
    case "environment":
      return InspectRuntimeUsageQuery.create({ scope: { kind, environmentId: id } }).map(
        (query) => query.input.scope,
      );
    case "resource":
      return InspectRuntimeUsageQuery.create({ scope: { kind, resourceId: id } }).map(
        (query) => query.input.scope,
      );
    case "deployment":
      return InspectRuntimeUsageQuery.create({ scope: { kind, deploymentId: id } }).map(
        (query) => query.input.scope,
      );
    default:
      return err(
        domainError.validation("Runtime usage scope kind is unsupported", {
          phase: "runtime-usage-inspection",
          scopeKind: kind,
        }),
      );
  }
}

const inspectCommand = EffectCommand.make(
  "inspect",
  {
    scope: scopeArg,
  },
  ({ scope }) =>
    runQuery(
      parseScope(scope).andThen((parsedScope) =>
        InspectRuntimeUsageQuery.create({
          scope: parsedScope,
        }),
      ),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.runtimeUsageInspect));

export const runtimeUsageCommand = EffectCommand.make("runtime-usage").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.runtimeUsage),
  EffectCommand.withSubcommands([inspectCommand]),
);
