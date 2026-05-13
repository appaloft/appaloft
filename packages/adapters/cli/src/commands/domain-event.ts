import { PruneDomainEventsCommand } from "@appaloft/application";
import { Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const beforeOption = Options.text("before");
const eventTypeOption = Options.text("event-type").pipe(Options.optional);
const aggregateOption = Options.text("aggregate").pipe(Options.optional);
const aggregateTypeOption = Options.text("aggregate-type").pipe(Options.optional);
const deploymentOption = Options.text("deployment").pipe(Options.optional);
const limitOption = Options.integer("limit").pipe(Options.optional);
const dryRunOption = Options.boolean("dry-run").pipe(Options.withDefault(true));

const pruneCommand = EffectCommand.make(
  "prune",
  {
    before: beforeOption,
    eventType: eventTypeOption,
    aggregate: aggregateOption,
    aggregateType: aggregateTypeOption,
    deployment: deploymentOption,
    limit: limitOption,
    dryRun: dryRunOption,
  },
  ({ aggregate, aggregateType, before, deployment, dryRun, eventType, limit }) =>
    runCommand(
      PruneDomainEventsCommand.create({
        before,
        ...(optionalValue(eventType) ? { eventType: optionalValue(eventType) } : {}),
        ...(optionalValue(aggregate) ? { aggregateId: optionalValue(aggregate) } : {}),
        ...(optionalValue(aggregateType) ? { aggregateType: optionalValue(aggregateType) } : {}),
        ...(optionalValue(deployment) ? { deploymentId: optionalValue(deployment) } : {}),
        ...(optionalValue(limit) ? { limit: optionalValue(limit) } : {}),
        dryRun,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.domainEventPrune));

export const domainEventCommand = EffectCommand.make("domain-event").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.domainEvent),
  EffectCommand.withSubcommands([pruneCommand]),
);
