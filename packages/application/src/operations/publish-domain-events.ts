import { type ExecutionContext } from "../execution-context";
import { type AppLogger, type EventBus } from "../ports";

export async function publishDomainEventsAndReturn<T>(
  context: ExecutionContext,
  eventBus: EventBus,
  logger: AppLogger,
  entity: {
    pullDomainEvents(): unknown[];
  },
  value: T,
): Promise<T> {
  const events = entity.pullDomainEvents();

  await eventBus.publish(context, events as never[]);
  logger.debug("published_domain_events", {
    requestId: context.requestId,
    count: events.length,
  });

  return value;
}
