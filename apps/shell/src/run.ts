import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

export async function runShellCli(options?: ShellRuntimeOptions): Promise<void> {
  const remotePgliteStateSync = await prepareRemotePgliteStateSync({
    argv: process.argv,
    env: process.env,
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

    await app.cliProgram.parseAsync(process.argv);
    process.exitCode = 0;
  } catch {
    const currentExitCode = readExitCode();
    exitCode = currentExitCode !== 0 ? currentExitCode : 1;
  } finally {
    if (!process.argv.includes("serve")) {
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
