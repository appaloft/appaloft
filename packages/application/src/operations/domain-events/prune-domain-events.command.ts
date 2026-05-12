import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type DomainEventStreamPruneResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import { pruneDomainEventsCommandInputSchema } from "./domain-events.schema";

export {
  type PruneDomainEventsCommandInput,
  pruneDomainEventsCommandInputSchema,
} from "./domain-events.schema";

export class PruneDomainEventsCommand extends Command<DomainEventStreamPruneResult> {
  constructor(
    public readonly before: string,
    public readonly dryRun: boolean,
    public readonly eventType?: string,
    public readonly aggregateId?: string,
    public readonly aggregateType?: string,
    public readonly deploymentId?: string,
    public readonly limit?: number,
  ) {
    super();
  }

  static create(input: unknown): Result<PruneDomainEventsCommand> {
    return parseOperationInput(pruneDomainEventsCommandInputSchema, input).map(
      (parsed) =>
        new PruneDomainEventsCommand(
          parsed.before,
          parsed.dryRun,
          trimToUndefined(parsed.eventType),
          trimToUndefined(parsed.aggregateId),
          trimToUndefined(parsed.aggregateType),
          trimToUndefined(parsed.deploymentId),
          parsed.limit,
        ),
    );
  }
}
