import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  type DeploymentProgressEvent,
  type DeploymentProgressListener,
  type DeploymentProgressObserver,
  type ExecutionContextFactory,
  type QueryBus,
} from "@yundu/application";
import { createCliLogRenderer } from "@yundu/cli-logging";
import { type DomainError, type Result } from "@yundu/core";
import { Context, Effect, Layer, Option } from "effect";

export interface CliProgram {
  parseAsync(argv?: string[]): Promise<void>;
}

export interface CliProgramInput {
  version: string;
  startServer(): Promise<void>;
  commandBus: CommandBus;
  queryBus: QueryBus;
  executionContextFactory: ExecutionContextFactory;
  deploymentProgressObserver?: DeploymentProgressObserver;
}

export interface ExecuteCommandOptions {
  onDeploymentProgress?: DeploymentProgressListener;
}

function readCliLocale(): string | undefined {
  return process.env.YUNDU_LOCALE ?? process.env.LANG;
}

export class CliRuntime extends Context.Tag("CliRuntime")<
  CliRuntime,
  {
    readonly version: string;
    readonly startServer: () => Promise<void>;
    readonly executeCommand: <T>(
      message: AppCommand<T>,
      options?: ExecuteCommandOptions,
    ) => Promise<Result<T>>;
    readonly executeQuery: <T>(message: AppQuery<T>) => Promise<Result<T>>;
  }
>() {}

export const CliRuntimeLive = (input: CliProgramInput) =>
  Layer.succeed(CliRuntime, {
    version: input.version,
    startServer: input.startServer,
    executeCommand: async <T>(message: AppCommand<T>, options?: ExecuteCommandOptions) => {
      const locale = readCliLocale();
      const context = input.executionContextFactory.create({
        entrypoint: "cli",
        ...(locale ? { locale } : {}),
        actor: {
          kind: "system",
          id: "cli",
          label: "yundu-cli",
        },
      });
      const unsubscribe =
        options?.onDeploymentProgress && input.deploymentProgressObserver
          ? input.deploymentProgressObserver.subscribe((eventContext, event) => {
              if (eventContext.requestId === context.requestId) {
                options.onDeploymentProgress?.(eventContext, event);
              }
            })
          : undefined;

      try {
        return await input.commandBus.execute(context, message);
      } finally {
        unsubscribe?.();
      }
    },
    executeQuery: <T>(message: AppQuery<T>) => {
      const locale = readCliLocale();

      return input.queryBus.execute(
        input.executionContextFactory.create({
          entrypoint: "cli",
          ...(locale ? { locale } : {}),
          actor: {
            kind: "system",
            id: "cli",
            label: "yundu-cli",
          },
        }),
        message,
      );
    },
  });

export const optionalValue = <T>(value: Option.Option<T>): T | undefined =>
  Option.getOrElse(value, () => undefined);

export const optionalNumber = (value: Option.Option<string>): number | undefined => {
  const raw = optionalValue(value);
  return raw === undefined ? undefined : Number(raw);
};

export const print = (value: unknown) =>
  Effect.sync(() => {
    createCliLogRenderer().json(value);
  });

export const resultToEffect = <T>(result: Result<T>): Effect.Effect<T, DomainError> =>
  result.match<Effect.Effect<T, DomainError>>(
    (value) => Effect.succeed(value),
    (error) => Effect.fail(error as DomainError),
  );

const runLoggedCommand = <T>(
  message: Result<AppCommand<T>>,
  options: {
    appLogLines: number;
  },
): Effect.Effect<void, DomainError, CliRuntime> =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const command = yield* resultToEffect(message);
    const renderer = createCliLogRenderer({
      appLogLines: options.appLogLines,
    });
    let failed = false;
    let output: T | undefined;

    try {
      const result = yield* Effect.promise(() =>
        cli.executeCommand(command, {
          onDeploymentProgress: (_context, event: DeploymentProgressEvent) => {
            renderer.deploymentProgress(event);
          },
        }),
      );
      output = yield* resultToEffect(result);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      renderer.stopDeploymentProgress({ failed });
    }

    yield* print(output);
  });

export const runCommand = <T>(
  message: Result<AppCommand<T>>,
): Effect.Effect<void, DomainError, CliRuntime> => runLoggedCommand(message, { appLogLines: 3 });

export const runDeploymentCommand = <T>(
  message: Result<AppCommand<T>>,
  options: {
    appLogLines: number;
  },
): Effect.Effect<void, DomainError, CliRuntime> => runLoggedCommand(message, options);

export const runQuery = <T>(
  message: Result<AppQuery<T>>,
): Effect.Effect<void, DomainError, CliRuntime> =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const query = yield* resultToEffect(message);
    const result = yield* Effect.promise(() => cli.executeQuery(query));
    const output = yield* resultToEffect(result);

    yield* print(output);
  });

export const printCliError = (error: unknown) =>
  Effect.sync(() => {
    createCliLogRenderer().plain({
      label: "error",
      level: "error",
      message:
        JSON.stringify(
          {
            error,
          },
          null,
          2,
        ) ?? String(error),
    });
    process.exitCode = 1;
  });
