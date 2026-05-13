import { PruneProviderJobLogsCommand } from "@appaloft/application";
import { Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const beforeOption = Options.text("before");
const deploymentOption = Options.text("deployment").pipe(Options.optional);
const providerOption = Options.text("provider").pipe(Options.optional);
const resourceOption = Options.text("resource").pipe(Options.optional);
const serverOption = Options.text("server").pipe(Options.optional);
const dryRunOption = Options.boolean("dry-run").pipe(Options.withDefault(true));

const pruneCommand = EffectCommand.make(
  "prune",
  {
    before: beforeOption,
    deployment: deploymentOption,
    provider: providerOption,
    resource: resourceOption,
    server: serverOption,
    dryRun: dryRunOption,
  },
  ({ before, deployment, dryRun, provider, resource, server }) =>
    runCommand(
      PruneProviderJobLogsCommand.create({
        before,
        ...(optionalValue(deployment) ? { deploymentId: optionalValue(deployment) } : {}),
        ...(optionalValue(provider) ? { providerKey: optionalValue(provider) } : {}),
        ...(optionalValue(resource) ? { resourceId: optionalValue(resource) } : {}),
        ...(optionalValue(server) ? { serverId: optionalValue(server) } : {}),
        dryRun,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.providerJobLogPrune));

export const providerJobLogCommand = EffectCommand.make("provider-job-log").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.providerJobLog),
  EffectCommand.withSubcommands([pruneCommand]),
);
