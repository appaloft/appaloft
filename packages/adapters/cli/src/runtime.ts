import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  type DeploymentProgressEvent,
  type DeploymentProgressListener,
  type DeploymentProgressObserver,
  type ExecutionContextFactory,
  type QueryBus,
  type ResourceRuntimeLogLine,
  type ResourceRuntimeLogsResult,
} from "@appaloft/application";
import { createCliLogRenderer } from "@appaloft/cli-logging";
import { type DomainError, domainError, type Result } from "@appaloft/core";
import { Context, Effect, Layer, Option } from "effect";
import {
  type RemoteStateSession,
  type ServerAppliedRouteDesiredStateStore,
  type SourceLinkRecord,
  type SourceLinkTarget,
} from "./commands/deployment-remote-state.js";
import { type DeploymentStateBackendDecision } from "./commands/deployment-state.js";

export interface CliSourceLinkStore {
  read(sourceFingerprint: string): Promise<Result<SourceLinkRecord | null>>;
  requireSameTargetOrMissing(
    sourceFingerprint: string,
    target: SourceLinkTarget,
  ): Promise<Result<SourceLinkRecord | null>>;
  createIfMissing(input: {
    sourceFingerprint: string;
    target: SourceLinkTarget;
    updatedAt: string;
  }): Promise<Result<SourceLinkRecord>>;
}

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
  prepareDeploymentStateBackend?: (
    decision: DeploymentStateBackendDecision,
  ) => Promise<Result<RemoteStateSession>>;
  sourceLinkStore?: CliSourceLinkStore;
  serverAppliedRouteStore?: ServerAppliedRouteDesiredStateStore;
}

export interface ExecuteCommandOptions {
  onDeploymentProgress?: DeploymentProgressListener;
}

function readCliLocale(): string | undefined {
  return process.env.APPALOFT_LOCALE ?? process.env.LANG;
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
    readonly prepareDeploymentStateBackend?: (
      decision: DeploymentStateBackendDecision,
    ) => Promise<Result<RemoteStateSession>>;
    readonly sourceLinkStore?: CliSourceLinkStore;
    readonly serverAppliedRouteStore?: ServerAppliedRouteDesiredStateStore;
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
          label: "appaloft-cli",
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
            label: "appaloft-cli",
          },
        }),
        message,
      );
    },
    ...(input.prepareDeploymentStateBackend
      ? { prepareDeploymentStateBackend: input.prepareDeploymentStateBackend }
      : {}),
    ...(input.sourceLinkStore ? { sourceLinkStore: input.sourceLinkStore } : {}),
    ...(input.serverAppliedRouteStore
      ? { serverAppliedRouteStore: input.serverAppliedRouteStore }
      : {}),
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

function printRuntimeLogLine(line: ResourceRuntimeLogLine): void {
  const timestamp = line.timestamp ? `[${line.timestamp}] ` : "";
  const stream = line.stream && line.stream !== "unknown" ? `${line.stream} ` : "";
  process.stdout.write(`${timestamp}${stream}${line.message}\n`);
}

function isDomainError(value: unknown): value is DomainError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" &&
    typeof record.category === "string" &&
    typeof record.message === "string" &&
    typeof record.retryable === "boolean"
  );
}

function runtimeLogErrorFromUnknown(error: unknown): DomainError {
  if (isDomainError(error)) {
    return error;
  }

  return domainError.infra("Runtime log stream failed", {
    phase: "cli-runtime-log-stream",
    message: error instanceof Error ? error.message : String(error),
  });
}

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

export const runResourceRuntimeLogsQuery = (
  message: Result<AppQuery<ResourceRuntimeLogsResult>>,
): Effect.Effect<void, DomainError, CliRuntime> =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const query = yield* resultToEffect(message);
    const result = yield* Effect.promise(() => cli.executeQuery(query));
    const output = yield* resultToEffect(result);

    if (output.mode === "bounded") {
      for (const line of output.logs) {
        printRuntimeLogLine(line);
      }
      return;
    }

    yield* Effect.tryPromise({
      try: async () => {
        try {
          for await (const event of output.stream) {
            if (event.kind === "line") {
              printRuntimeLogLine(event.line);
              continue;
            }

            if (event.kind === "error") {
              throw event.error;
            }

            if (event.kind === "closed") {
              break;
            }
          }
        } finally {
          await output.stream.close();
        }
      },
      catch: runtimeLogErrorFromUnknown,
    });
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
