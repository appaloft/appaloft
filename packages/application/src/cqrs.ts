import { type DomainEvent, domainError, err, type Result } from "@appaloft/core";
import { i18nKeys } from "@appaloft/i18n";
import { type DependencyContainer } from "tsyringe";

import {
  appaloftTraceAttributes,
  createCommandSpanName,
  createDomainErrorTraceAttributes,
  createExecutionContextAttributes,
  createQuerySpanName,
  type ExecutionContext,
} from "./execution-context";
import { type AppLogger } from "./ports";

type MessageConstructor<TMessage, TArgs extends unknown[] = unknown[]> = new (
  ...args: TArgs
) => TMessage;
export type HandlerConstructor<THandler, TArgs extends unknown[] = unknown[]> = new (
  ...args: TArgs
) => THandler;

export abstract class Command<TResult = unknown> {
  protected declare readonly __commandResult?: TResult;
}

export abstract class Query<TResult = unknown> {
  protected declare readonly __queryResult?: TResult;
}

export interface CommandHandlerContract<TCommand extends Command<TResult>, TResult = unknown> {
  handle(context: ExecutionContext, command: TCommand): Promise<Result<TResult>>;
}

export interface QueryHandlerContract<TQuery extends Query<TResult>, TResult = unknown> {
  handle(context: ExecutionContext, query: TQuery): Promise<Result<TResult>>;
}

export interface EventHandlerContract<TEvent extends DomainEvent = DomainEvent> {
  handle(context: ExecutionContext, event: TEvent): Promise<Result<void>>;
}

const commandHandlerRegistry = new WeakMap<
  object,
  HandlerConstructor<CommandHandlerContract<Command<unknown>, unknown>>
>();
const queryHandlerRegistry = new WeakMap<
  object,
  HandlerConstructor<QueryHandlerContract<Query<unknown>, unknown>>
>();
const eventHandlerRegistry = new Map<string, HandlerConstructor<EventHandlerContract>[]>();

export function CommandHandler<TCommand extends Command<unknown>, TArgs extends unknown[]>(
  commandType: MessageConstructor<TCommand, TArgs>,
): ClassDecorator {
  return (target): void => {
    commandHandlerRegistry.set(
      commandType,
      target as unknown as HandlerConstructor<CommandHandlerContract<Command<unknown>, unknown>>,
    );
  };
}

export function QueryHandler<TQuery extends Query<unknown>, TArgs extends unknown[]>(
  queryType: MessageConstructor<TQuery, TArgs>,
): ClassDecorator {
  return (target): void => {
    queryHandlerRegistry.set(
      queryType,
      target as unknown as HandlerConstructor<QueryHandlerContract<Query<unknown>, unknown>>,
    );
  };
}

export function EventHandler(eventType: string): ClassDecorator {
  return (target): void => {
    const handlers = eventHandlerRegistry.get(eventType) ?? [];
    handlers.push(target as unknown as HandlerConstructor<EventHandlerContract>);
    eventHandlerRegistry.set(eventType, handlers);
  };
}

export function eventHandlerTypesFor(
  eventType: string,
): HandlerConstructor<EventHandlerContract>[] {
  return eventHandlerRegistry.get(eventType) ?? [];
}

export class CommandBus {
  constructor(
    private readonly container: DependencyContainer,
    private readonly logger: AppLogger,
  ) {}

  async execute<TResult>(
    context: ExecutionContext,
    command: Command<TResult>,
  ): Promise<Result<TResult>> {
    const handlerType = commandHandlerRegistry.get(command.constructor);

    if (!handlerType) {
      return err(
        domainError.infra(context.t(i18nKeys.backend.cqrs.noCommandHandler), {
          command: command.constructor.name,
        }),
      );
    }

    this.logger.debug("command_bus.execute", {
      requestId: context.requestId,
      entrypoint: context.entrypoint,
      command: command.constructor.name,
      handler: handlerType.name,
    });

    const handler = this.container.resolve(handlerType as never) as CommandHandlerContract<
      Command<TResult>,
      TResult
    >;

    return context.tracer.startActiveSpan(
      createCommandSpanName(command.constructor.name),
      {
        attributes: {
          ...createExecutionContextAttributes(context),
          [appaloftTraceAttributes.commandName]: command.constructor.name,
          [appaloftTraceAttributes.handlerName]: handlerType.name,
        },
      },
      async (span) => {
        try {
          const result = await handler.handle(context, command);

          result.match(
            () => {
              span.setStatus("ok");
            },
            (error) => {
              span.setStatus("error", error.message);
              span.setAttributes(createDomainErrorTraceAttributes(error));
            },
          );

          return result;
        } catch (error) {
          span.setStatus(
            "error",
            error instanceof Error ? error.message : "Unhandled command error",
          );
          span.recordError(error instanceof Error ? error : { message: String(error) });
          throw error;
        }
      },
    );
  }
}

export class QueryBus {
  constructor(
    private readonly container: DependencyContainer,
    private readonly logger: AppLogger,
  ) {}

  async execute<TResult>(
    context: ExecutionContext,
    query: Query<TResult>,
  ): Promise<Result<TResult>> {
    const handlerType = queryHandlerRegistry.get(query.constructor);

    if (!handlerType) {
      return err(
        domainError.infra(context.t(i18nKeys.backend.cqrs.noQueryHandler), {
          query: query.constructor.name,
        }),
      );
    }

    this.logger.debug("query_bus.execute", {
      requestId: context.requestId,
      entrypoint: context.entrypoint,
      query: query.constructor.name,
      handler: handlerType.name,
    });

    const handler = this.container.resolve(handlerType as never) as QueryHandlerContract<
      Query<TResult>,
      TResult
    >;

    return context.tracer.startActiveSpan(
      createQuerySpanName(query.constructor.name),
      {
        attributes: {
          ...createExecutionContextAttributes(context),
          [appaloftTraceAttributes.queryName]: query.constructor.name,
          [appaloftTraceAttributes.handlerName]: handlerType.name,
        },
      },
      async (span) => {
        try {
          const result = await handler.handle(context, query);

          result.match(
            () => {
              span.setStatus("ok");
            },
            (error) => {
              span.setStatus("error", error.message);
              span.setAttributes(createDomainErrorTraceAttributes(error));
            },
          );

          return result;
        } catch (error) {
          span.setStatus("error", error instanceof Error ? error.message : "Unhandled query error");
          span.recordError(error instanceof Error ? error : { message: String(error) });
          throw error;
        }
      },
    );
  }
}
