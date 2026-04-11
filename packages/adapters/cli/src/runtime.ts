import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  type ExecutionContextFactory,
  type QueryBus,
} from "@yundu/application";
import { type DomainError, type Result } from "@yundu/core";
import { Console, Context, Effect, Layer, Option } from "effect";

export interface CliProgram {
  parseAsync(argv?: string[]): Promise<void>;
}

export interface CliProgramInput {
  version: string;
  startServer(): Promise<void>;
  commandBus: CommandBus;
  queryBus: QueryBus;
  executionContextFactory: ExecutionContextFactory;
}

export class CliRuntime extends Context.Tag("CliRuntime")<
  CliRuntime,
  {
    readonly version: string;
    readonly startServer: () => Promise<void>;
    readonly executeCommand: <T>(message: AppCommand<T>) => Promise<Result<T>>;
    readonly executeQuery: <T>(message: AppQuery<T>) => Promise<Result<T>>;
  }
>() {}

export const CliRuntimeLive = (input: CliProgramInput) =>
  Layer.succeed(CliRuntime, {
    version: input.version,
    startServer: input.startServer,
    executeCommand: <T>(message: AppCommand<T>) =>
      input.commandBus.execute(
        input.executionContextFactory.create({
          entrypoint: "cli",
          actor: {
            kind: "system",
            id: "cli",
            label: "yundu-cli",
          },
        }),
        message,
      ),
    executeQuery: <T>(message: AppQuery<T>) =>
      input.queryBus.execute(
        input.executionContextFactory.create({
          entrypoint: "cli",
          actor: {
            kind: "system",
            id: "cli",
            label: "yundu-cli",
          },
        }),
        message,
      ),
  });

export const optionalValue = <T>(value: Option.Option<T>): T | undefined =>
  Option.getOrElse(value, () => undefined);

export const optionalNumber = (value: Option.Option<string>): number | undefined => {
  const raw = optionalValue(value);
  return raw === undefined ? undefined : Number(raw);
};

export const print = (value: unknown) => Console.log(JSON.stringify(value, null, 2) ?? "null");

const resultToEffect = <T>(result: Result<T>): Effect.Effect<T, DomainError> =>
  result.match<Effect.Effect<T, DomainError>>(
    (value) => Effect.succeed(value),
    (error) => Effect.fail(error as DomainError),
  );

export const runCommand = <T>(
  message: Result<AppCommand<T>>,
): Effect.Effect<void, DomainError, CliRuntime> =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const command = yield* resultToEffect(message);
    const result = yield* Effect.promise(() => cli.executeCommand(command));
    const output = yield* resultToEffect(result);

    yield* print(output);
  });

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
  Console.error(
    JSON.stringify(
      {
        error,
      },
      null,
      2,
    ) ?? String(error),
  ).pipe(
    Effect.zipRight(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );
