import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  type DeploymentProgressEvent,
  type DeploymentProgressListener,
  type DeploymentProgressObserver,
  type ExecutionContextFactory,
  type QueryBus,
  type ResourceDiagnosticSummary,
  type ResourceRuntimeLogLine,
  type ResourceRuntimeLogsResult,
  type StreamDeploymentEventsResult,
  type TerminalSessionDescriptor,
  type TerminalSessionGateway,
} from "@appaloft/application";
import { createCliLogRenderer } from "@appaloft/cli-logging";
import { type DomainError, domainError, type Result } from "@appaloft/core";
import { Context, Effect, Layer, Option } from "effect";
import {
  type RemoteStateSession,
  type ServerAppliedRouteDesiredStateStore,
  type SourceLinkDependencyProvenance,
  type SourceLinkRecord,
  type SourceLinkStorageProvenance,
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
  recordDependencyProvenance?(input: {
    sourceFingerprint: string;
    target: SourceLinkTarget;
    dependencyProvenance: SourceLinkDependencyProvenance;
    updatedAt: string;
  }): Promise<Result<SourceLinkRecord>>;
  recordStorageProvenance?(input: {
    sourceFingerprint: string;
    target: SourceLinkTarget;
    storageProvenance: SourceLinkStorageProvenance;
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
  terminalSessionGateway?: TerminalSessionGateway;
  terminalIO?: CliTerminalIO;
  deploymentProgressObserver?: DeploymentProgressObserver;
  prepareDeploymentStateBackend?: (
    decision: DeploymentStateBackendDecision,
  ) => Promise<Result<RemoteStateSession>>;
  sourceLinkStore?: CliSourceLinkStore;
  serverAppliedRouteStore?: ServerAppliedRouteDesiredStateStore;
}

export interface CliTerminalReadable {
  readonly isTTY?: boolean;
  setRawMode?(enabled: boolean): void;
  resume?(): void;
  pause?(): void;
  on(event: "data", listener: (chunk: string | Uint8Array) => void): unknown;
  off?(event: "data", listener: (chunk: string | Uint8Array) => void): unknown;
  removeListener?(event: "data", listener: (chunk: string | Uint8Array) => void): unknown;
}

export interface CliTerminalWritable {
  write(data: string | Uint8Array): void | boolean;
}

export interface CliTerminalIO {
  stdin: CliTerminalReadable;
  stdout: CliTerminalWritable;
  stderr: CliTerminalWritable;
}

export interface ExecuteCommandOptions {
  onDeploymentProgress?: DeploymentProgressListener;
}

function readCliLocale(): string | undefined {
  return process.env.APPALOFT_LOCALE ?? process.env.LANG;
}

function readCliAuth() {
  const authorizationHeader = process.env.APPALOFT_AUTHORIZATION;
  const cookieHeader = process.env.APPALOFT_AUTH_COOKIE;

  return authorizationHeader || cookieHeader
    ? {
        ...(authorizationHeader ? { authorizationHeader } : {}),
        ...(cookieHeader ? { cookieHeader } : {}),
      }
    : undefined;
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
    readonly terminalSessionGateway?: TerminalSessionGateway;
    readonly terminalIO: CliTerminalIO;
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
      const auth = readCliAuth();
      const context = input.executionContextFactory.create({
        entrypoint: "cli",
        ...(locale ? { locale } : {}),
        ...(auth ? { auth } : {}),
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
      const auth = readCliAuth();

      return input.queryBus.execute(
        input.executionContextFactory.create({
          entrypoint: "cli",
          ...(locale ? { locale } : {}),
          ...(auth ? { auth } : {}),
          actor: {
            kind: "system",
            id: "cli",
            label: "appaloft-cli",
          },
        }),
        message,
      );
    },
    ...(input.terminalSessionGateway
      ? { terminalSessionGateway: input.terminalSessionGateway }
      : {}),
    terminalIO: input.terminalIO ?? {
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
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

function deploymentEventStreamErrorFromUnknown(error: unknown): DomainError {
  if (isDomainError(error)) {
    return error;
  }

  return domainError.infra("Deployment event stream failed", {
    phase: "cli-deployment-event-stream",
    message: error instanceof Error ? error.message : String(error),
  });
}

const runLoggedCommand = <T>(
  message: Result<AppCommand<T>>,
  options: {
    appLogLines: number;
  },
): Effect.Effect<T, DomainError, CliRuntime> =>
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
    return output as T;
  });

function chunkToTerminalInput(chunk: string | Uint8Array): string {
  return typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
}

function removeDataListener(
  stdin: CliTerminalReadable,
  listener: (chunk: string | Uint8Array) => void,
): void {
  if (stdin.off) {
    stdin.off("data", listener);
    return;
  }

  stdin.removeListener?.("data", listener);
}

function terminalSessionErrorFromUnknown(error: unknown): DomainError {
  if (isDomainError(error)) {
    return error;
  }

  return domainError.terminalSessionFailed("CLI terminal session failed", {
    phase: "cli-terminal-attach",
    message: error instanceof Error ? error.message : String(error),
  });
}

async function pipeTerminalSession(input: {
  descriptor: TerminalSessionDescriptor;
  gateway: TerminalSessionGateway;
  io: CliTerminalIO;
  initialSize?: {
    rows: number;
    cols: number;
  };
}): Promise<void> {
  const attachResult = input.gateway.attach(input.descriptor.sessionId);
  if (attachResult.isErr()) {
    throw attachResult.error;
  }

  const session = attachResult.value;
  const { stderr, stdin, stdout } = input.io;
  const supportsRawMode = Boolean(stdin.isTTY && stdin.setRawMode);
  const writeInput = (chunk: string | Uint8Array) => {
    void session.write(chunkToTerminalInput(chunk));
  };
  let sessionClosed = false;

  try {
    if (supportsRawMode) {
      stdin.setRawMode?.(true);
    }
    if (input.initialSize) {
      await session.resize(input.initialSize);
    }
    stdin.resume?.();
    stdin.on("data", writeInput);

    for await (const frame of session) {
      if (frame.kind === "output") {
        (frame.stream === "stderr" ? stderr : stdout).write(frame.data);
        continue;
      }

      if (frame.kind === "error") {
        throw frame.error;
      }

      if (frame.kind === "closed") {
        sessionClosed = true;
        if (typeof frame.exitCode === "number" && frame.exitCode !== 0) {
          process.exitCode = frame.exitCode;
        }
        break;
      }
    }
  } finally {
    removeDataListener(stdin, writeInput);
    if (supportsRawMode) {
      stdin.setRawMode?.(false);
    }
    stdin.pause?.();
    if (!sessionClosed) {
      await session.close();
    }
  }
}

export const runTerminalCommand = (
  message: Result<AppCommand<TerminalSessionDescriptor>>,
  options: {
    attach: boolean;
    initialRows?: number;
    initialCols?: number;
  },
): Effect.Effect<void, DomainError, CliRuntime> =>
  options.attach
    ? Effect.gen(function* () {
        const cli = yield* CliRuntime;
        if (!cli.terminalSessionGateway) {
          return yield* Effect.fail(
            domainError.terminalSessionNotConfigured(
              "CLI terminal attach requires terminal session gateway",
              {
                phase: "cli-terminal-attach",
              },
            ),
          );
        }

        const command = yield* resultToEffect(message);
        const result = yield* Effect.promise(() => cli.executeCommand(command));
        const descriptor = yield* resultToEffect(result);

        yield* Effect.tryPromise({
          try: () =>
            pipeTerminalSession({
              descriptor,
              gateway: cli.terminalSessionGateway as TerminalSessionGateway,
              io: cli.terminalIO,
              ...(typeof options.initialRows === "number" && typeof options.initialCols === "number"
                ? {
                    initialSize: {
                      rows: options.initialRows,
                      cols: options.initialCols,
                    },
                  }
                : {}),
            }),
          catch: terminalSessionErrorFromUnknown,
        });
      })
    : runCommand(message);

export const runCommand = <T>(
  message: Result<AppCommand<T>>,
): Effect.Effect<void, DomainError, CliRuntime> =>
  Effect.asVoid(runLoggedCommand(message, { appLogLines: 3 }));

export const runDeploymentCommand = <T>(
  message: Result<AppCommand<T>>,
  options: {
    appLogLines: number;
  },
): Effect.Effect<void, DomainError, CliRuntime> =>
  Effect.asVoid(runLoggedCommand(message, options));

export const runDeploymentCommandResult = <T>(
  message: Result<AppCommand<T>>,
  options: {
    appLogLines: number;
  },
): Effect.Effect<T, DomainError, CliRuntime> => runLoggedCommand(message, options);

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

function diagnosticRouteUrl(summary: ResourceDiagnosticSummary): string | undefined {
  const selectedRoute = summary.access.selectedRoute;
  if (selectedRoute) {
    const { host, pathPrefix, protocol } = selectedRoute.intent;
    return `${protocol}://${host}${pathPrefix}`;
  }

  return (
    summary.access.durableUrl ??
    summary.access.serverAppliedUrl ??
    summary.access.generatedUrl ??
    summary.access.plannedUrl
  );
}

function formatDiagnosticSourceError(error: ResourceDiagnosticSummary["sourceErrors"][number]) {
  return [
    error.source,
    error.code,
    error.phase,
    error.retryable ? "retryable" : "not-retryable",
  ].join(" · ");
}

export function formatResourceDiagnosticSummary(summary: ResourceDiagnosticSummary): string {
  const deploymentLabel = summary.deployment
    ? `${summary.deployment.id} · ${summary.deployment.status}`
    : (summary.focus.deploymentId ?? "none");
  const accessRoute = diagnosticRouteUrl(summary);
  const lines = [
    "Resource diagnostic summary",
    `Resource: ${summary.context.resourceName} (${summary.focus.resourceId})`,
    `Deployment: ${deploymentLabel}`,
    `Access: ${summary.access.status}${summary.access.reasonCode ? ` · ${summary.access.reasonCode}` : ""}`,
    ...(accessRoute ? [`Route: ${accessRoute}`] : []),
    `Proxy: ${summary.proxy.status}${summary.proxy.providerKey ? ` · ${summary.proxy.providerKey}` : ""}${summary.proxy.proxyRouteStatus ? ` · ${summary.proxy.proxyRouteStatus}` : ""}`,
    `Deployment logs: ${summary.deploymentLogs.status} · ${summary.deploymentLogs.lineCount}/${summary.deploymentLogs.tailLimit}`,
    `Runtime logs: ${summary.runtimeLogs.status} · ${summary.runtimeLogs.lineCount}/${summary.runtimeLogs.tailLimit}`,
    `Redaction: ${summary.redaction.masked ? "masked" : "not-masked"} · ${summary.redaction.maskedValueCount} value(s)`,
  ];

  if (summary.sourceErrors.length > 0) {
    lines.push("Source errors:");
    for (const sourceError of summary.sourceErrors) {
      lines.push(`- ${formatDiagnosticSourceError(sourceError)}`);
    }
  } else {
    lines.push("Source errors: none");
  }

  lines.push("Canonical JSON: rerun with --json");
  return `${lines.join("\n")}\n`;
}

export const runResourceDiagnosticSummaryQuery = (
  message: Result<AppQuery<ResourceDiagnosticSummary>>,
  options: {
    summary: boolean;
  },
): Effect.Effect<void, DomainError, CliRuntime> =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const query = yield* resultToEffect(message);
    const result = yield* Effect.promise(() => cli.executeQuery(query));
    const output = yield* resultToEffect(result);

    if (options.summary) {
      cli.terminalIO.stdout.write(formatResourceDiagnosticSummary(output));
      return;
    }

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

export const runDeploymentEventStreamQuery = (
  message: Result<AppQuery<StreamDeploymentEventsResult>>,
): Effect.Effect<void, DomainError, CliRuntime> =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const query = yield* resultToEffect(message);
    const result = yield* Effect.promise(() => cli.executeQuery(query));
    const output = yield* resultToEffect(result);

    if (output.mode === "bounded") {
      yield* print({
        deploymentId: output.deploymentId,
        envelopes: output.envelopes,
      });
      return;
    }

    yield* Effect.tryPromise({
      try: async () => {
        try {
          for await (const envelope of output.stream) {
            await Effect.runPromise(print(envelope));

            if (envelope.kind === "error") {
              throw envelope.error;
            }

            if (envelope.kind === "closed") {
              break;
            }
          }
        } finally {
          await output.stream.close();
        }
      },
      catch: deploymentEventStreamErrorFromUnknown,
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
