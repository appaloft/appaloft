import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createRemoteCliProgram,
  defaultCliControlPlaneProfileStore,
  resolveCliExecutionTarget,
  runStandaloneControlPlaneCli,
} from "@appaloft/adapter-cli";
import {
  createAppaloftMcpServer,
  runAppaloftMcpRemoteStdioProxy,
  runAppaloftMcpStdioServer,
  startAppaloftMcpHttpServer,
} from "@appaloft/ai-mcp";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { type AppComposition, createAppComposition, type ShellRuntimeOptions } from "./composition";
import {
  prepareRemotePgliteStateSync,
  type RemotePgliteStateSyncSession,
} from "./remote-pglite-state-sync";

function formatDetailValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    return value.replace(/\s+/g, " ").trim() || null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function formatDetailLine(
  label: string,
  error: DomainError,
  keys: readonly string[],
): string | null {
  const details = keys
    .map((key) => {
      const value = formatDetailValue(error.details?.[key]);
      return value ? `${key}=${value}` : null;
    })
    .filter((value): value is string => value !== null);

  return details.length > 0 ? `${label}: ${details.join(" ")}` : null;
}

export function formatDomainError(error: DomainError): string {
  const phase = typeof error.details?.phase === "string" ? error.details.phase : undefined;
  const details = [
    `code=${error.code}`,
    `category=${error.category}`,
    ...(phase ? [`phase=${phase}`] : []),
    `retryable=${String(error.retryable)}`,
  ];
  const lines = [error.message, details.join(" ")];

  if (phase === "remote-state-lock") {
    const lockLine = formatDetailLine("lock", error, [
      "stateBackend",
      "host",
      "port",
      "lockOwner",
      "correlationId",
      "lockStartedAt",
      "lockHeartbeatAt",
      "staleAfterSeconds",
      "waitedSeconds",
      "lockAcquireTimeoutSeconds",
      "retryAfterSeconds",
      "stderr",
    ]);

    if (lockLine) {
      lines.push(lockLine);
    }
  } else if (phase?.startsWith("remote-state-")) {
    const remoteStateLine = formatDetailLine("details", error, [
      "stateBackend",
      "host",
      "port",
      "exitCode",
      "reason",
      "stderr",
      "message",
    ]);

    if (remoteStateLine) {
      lines.push(remoteStateLine);
    }
  }

  for (const link of error.knowledge?.links ?? []) {
    if (link.rel === "human-doc" || link.rel === "llm-guide") {
      lines.push(`${link.rel}: ${link.href}`);
    }
  }

  const firstSafeRemedy = error.knowledge?.remedies?.find((remedy) => remedy.safeByDefault);
  if (firstSafeRemedy) {
    lines.push(`remedy: ${firstSafeRemedy.label}`);
  }

  return `${lines.join("\n")}\n`;
}

function writeDomainError(error: DomainError): void {
  process.stderr.write(formatDomainError(error));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPgliteInitializationFailure(error: unknown): boolean {
  return errorMessage(error).includes("PGlite failed to initialize properly");
}

export async function quarantineRemotePgliteMirror(
  session: RemotePgliteStateSyncSession,
  cause: unknown,
): Promise<Result<void>> {
  const pgliteDataDir = session.localPgliteDataDir;
  const localDataRoot = dirname(pgliteDataDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const quarantineDir = `${pgliteDataDir}.incompatible-${stamp}`;
  const recoveryDir = join(localDataRoot, "recovery");
  const recoveryFile = join(recoveryDir, `pglite-incompatible-${stamp}.json`);

  try {
    if (existsSync(pgliteDataDir)) {
      await rename(pgliteDataDir, quarantineDir);
    }
    await mkdir(pgliteDataDir, { recursive: true });
    await mkdir(recoveryDir, { recursive: true });
    await writeFile(
      recoveryFile,
      `${JSON.stringify(
        {
          phase: "remote-state-sync-download",
          reason: "remote_pglite_incompatible",
          recoveredAt: new Date().toISOString(),
          stateBackend: "ssh-pglite",
          host: session.target.host,
          port: String(session.target.port ?? 22),
          localQuarantineDir: quarantineDir,
          message: errorMessage(cause),
        },
        null,
        2,
      )}\n`,
    );

    return ok(undefined);
  } catch (error) {
    return err(
      domainError.infra("SSH remote PGlite incompatible local mirror could not be quarantined", {
        phase: "remote-state-sync-download",
        stateBackend: "ssh-pglite",
        host: session.target.host,
        port: String(session.target.port ?? 22),
        reason: "remote_pglite_incompatible",
        message: errorMessage(error),
      }),
    );
  }
}

async function createShellComposition(
  options: ShellRuntimeOptions | undefined,
  remotePgliteStateSyncSession: RemotePgliteStateSyncSession | undefined,
): Promise<Result<AppComposition>> {
  try {
    return ok(
      await createAppComposition(undefined, {
        ...options,
        ...(remotePgliteStateSyncSession ? { remotePgliteStateSyncSession } : {}),
      }),
    );
  } catch (error) {
    if (!remotePgliteStateSyncSession) {
      throw error;
    }

    if (!isPgliteInitializationFailure(error)) {
      return err(
        domainError.infra("SSH remote PGlite command composition could not be created", {
          phase: "remote-state-sync-download",
          stateBackend: "ssh-pglite",
          host: remotePgliteStateSyncSession.target.host,
          port: String(remotePgliteStateSyncSession.target.port ?? 22),
          reason: "remote_pglite_composition_failed",
          message: errorMessage(error),
        }),
      );
    }

    const quarantined = await quarantineRemotePgliteMirror(remotePgliteStateSyncSession, error);
    if (quarantined.isErr()) {
      return err(quarantined.error);
    }

    try {
      return ok(
        await createAppComposition(undefined, {
          ...options,
          remotePgliteStateSyncSession,
        }),
      );
    } catch (retryError) {
      return err(
        domainError.infra("SSH remote PGlite state could not be opened after recovery", {
          phase: "remote-state-sync-download",
          stateBackend: "ssh-pglite",
          host: remotePgliteStateSyncSession.target.host,
          port: String(remotePgliteStateSyncSession.target.port ?? 22),
          reason: "remote_pglite_incompatible",
          message: errorMessage(retryError),
        }),
      );
    }
  }
}

function readExitCode(): number {
  const value = process.exitCode;
  return typeof value === "number" ? value : Number(value) || 0;
}

function commandArgs(argv: readonly string[]): readonly string[] {
  const args = argv.slice(2);
  return args[0] === "appaloft" ? args.slice(1) : args;
}

function isMcpCommand(argv: readonly string[]): boolean {
  const args = commandArgs(argv);
  return (
    args[0] === "mcp" &&
    (args.length === 1 || args[1] === "stdio" || args[1] === "serve" || args[1] === "remote-stdio")
  );
}

function mcpMode(argv: readonly string[]): "stdio" | "serve" | "remote-stdio" | null {
  const args = commandArgs(argv);
  if (args[0] !== "mcp") {
    return null;
  }

  if (args.length === 1 || args[1] === "stdio") {
    return "stdio";
  }

  if (args[1] === "serve" || args[1] === "remote-stdio") {
    return args[1];
  }

  return null;
}

function readOptionValue(args: readonly string[], name: string): string | null {
  const longName = `--${name}`;
  const equalsPrefix = `${longName}=`;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === longName) {
      return args[index + 1] ?? null;
    }
    if (arg.startsWith(equalsPrefix)) {
      return arg.slice(equalsPrefix.length);
    }
  }

  return null;
}

function readMcpHttpOptions(
  argv: readonly string[],
): Result<{ hostname: string; port: number }, DomainError> {
  const args = commandArgs(argv);
  const hostname =
    readOptionValue(args, "host") ?? readOptionValue(args, "hostname") ?? "127.0.0.1";
  const portValue = readOptionValue(args, "port") ?? "3939";
  const port = Number(portValue);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return err(
      domainError.validation("MCP HTTP port must be an integer between 1 and 65535", {
        port: portValue,
      }),
    );
  }

  return ok({ hostname, port });
}

async function runShellMcpStdio(app: AppComposition): Promise<void> {
  const server = createAppaloftMcpServer({
    commandBus: app.commandBus,
    queryBus: app.queryBus,
    executionContextFactory: app.executionContextFactory,
  });

  await runAppaloftMcpStdioServer({ server });
}

async function runShellMcpHttp(app: AppComposition, argv: readonly string[]): Promise<void> {
  const options = readMcpHttpOptions(argv);
  if (options.isErr()) {
    writeDomainError(options.error);
    process.exit(1);
  }

  const server = createAppaloftMcpServer({
    commandBus: app.commandBus,
    queryBus: app.queryBus,
    executionContextFactory: app.executionContextFactory,
  });
  const handle = startAppaloftMcpHttpServer({
    server,
    hostname: options.value.hostname,
    port: options.value.port,
  });
  process.stdout.write(
    `Appaloft MCP HTTP server listening at http://${options.value.hostname}:${handle.port}/mcp\n`,
  );

  await new Promise<void>(() => {});
}

async function runShellMcpRemoteStdio(argv: readonly string[]): Promise<void> {
  const args = commandArgs(argv);
  const profileName = readOptionValue(args, "profile") ?? "mcp";
  const store = defaultCliControlPlaneProfileStore(process.env);
  const data = await store.read();
  if (data.isErr()) {
    writeDomainError(data.error);
    process.exit(1);
  }

  const profile = data.value.profiles[profileName];
  if (!profile) {
    writeDomainError(
      domainError.validation("Appaloft MCP profile was not found; run appaloft auth mcp login", {
        phase: "mcp-remote-stdio-profile",
        profile: profileName,
      }),
    );
    process.exit(1);
  }

  if (profile.auth.kind !== "bearer") {
    writeDomainError(
      domainError.validation(
        "Appaloft MCP remote stdio requires a bearer profile; run appaloft auth mcp login",
        {
          phase: "mcp-remote-stdio-profile",
          profile: profileName,
        },
      ),
    );
    process.exit(1);
  }

  const endpoint = new URL("/mcp", profile.baseUrl).toString();
  await runAppaloftMcpRemoteStdioProxy({
    endpoint,
    authorization: `Bearer ${profile.auth.token}`,
  });
}

export async function runShellCli(options?: ShellRuntimeOptions): Promise<void> {
  const argv = process.argv;
  const mcpCommand = isMcpCommand(argv);
  const controlPlaneCli = await runStandaloneControlPlaneCli({
    argv,
    env: process.env,
  });
  if (controlPlaneCli.handled) {
    if (controlPlaneCli.exitCode !== 0) {
      process.exit(controlPlaneCli.exitCode);
    }
    return;
  }

  const executionTarget = await resolveCliExecutionTarget({
    argv,
    env: process.env,
  });
  if (executionTarget.isErr()) {
    writeDomainError(executionTarget.error);
    process.exit(1);
  }

  const target = executionTarget.value;
  const cliArgv = Array.from(target.argv);
  if (target.kind === "remote") {
    const remoteCliProgram = createRemoteCliProgram({
      version: process.env.APPALOFT_APP_VERSION ?? "0.0.0",
      profile: target.profile,
    });
    let exitCode = 0;

    try {
      await remoteCliProgram.parseAsync(cliArgv);
      process.exitCode = 0;
    } catch {
      const currentExitCode = readExitCode();
      exitCode = currentExitCode !== 0 ? currentExitCode : 1;
    }

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
    return;
  }

  if (mcpCommand && mcpMode(argv) === "remote-stdio") {
    await runShellMcpRemoteStdio(argv);
    return;
  }

  const remotePgliteStateSync = await prepareRemotePgliteStateSync({
    argv: cliArgv,
    env: process.env,
    ...(options?.pgliteRuntimeAssets ? { pgliteRuntimeAssets: options.pgliteRuntimeAssets } : {}),
  });
  if (remotePgliteStateSync.isErr()) {
    writeDomainError(remotePgliteStateSync.error);
    process.exit(1);
  }

  const remotePgliteStateSyncSession: RemotePgliteStateSyncSession | undefined =
    remotePgliteStateSync.value ?? options?.remotePgliteStateSyncSession;
  if (remotePgliteStateSyncSession) {
    process.env.APPALOFT_PGLITE_DATA_DIR = remotePgliteStateSyncSession.localPgliteDataDir;
  }

  const appResult = await createShellComposition(options, remotePgliteStateSyncSession);
  if (appResult.isErr()) {
    writeDomainError(appResult.error);
    if (remotePgliteStateSyncSession) {
      const released = await remotePgliteStateSyncSession.releaseForCliRuntime();
      if (released.isErr()) {
        writeDomainError(released.error);
      }
    }
    process.exit(1);
  }

  const app = appResult.value;
  let exitCode = 0;

  try {
    if (remotePgliteStateSyncSession) {
      const released = await remotePgliteStateSyncSession.releaseForCliRuntime();
      if (released.isErr()) {
        writeDomainError(released.error);
        process.exit(1);
      }
    }

    if (mcpCommand) {
      const mode = mcpMode(argv);
      if (mode === "serve") {
        await runShellMcpHttp(app, argv);
      } else if (mode === "remote-stdio") {
        await runShellMcpRemoteStdio(argv);
      } else {
        await runShellMcpStdio(app);
      }
    } else {
      await app.cliProgram.parseAsync(cliArgv);
    }
    process.exitCode = 0;
  } catch {
    const currentExitCode = readExitCode();
    exitCode = currentExitCode !== 0 ? currentExitCode : 1;
  } finally {
    if (!cliArgv.includes("serve") && !cliArgv.includes("worker")) {
      await app.shutdown();
    }

    if (remotePgliteStateSyncSession) {
      const synced = await remotePgliteStateSyncSession.syncBackAndRelease();
      if (synced.isErr()) {
        writeDomainError(synced.error);
        exitCode = exitCode === 0 ? 1 : exitCode;
      }
    }
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
