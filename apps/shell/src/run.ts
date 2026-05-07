import { type DomainError } from "@appaloft/core";
import { createAppComposition, type ShellRuntimeOptions } from "./composition";
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

  const app = await createAppComposition(undefined, {
    ...options,
    ...(remotePgliteStateSyncSession ? { remotePgliteStateSyncSession } : {}),
  });
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
