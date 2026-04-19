import { createAppComposition, type ShellRuntimeOptions } from "./composition";
import {
  prepareRemotePgliteStateSync,
  type RemotePgliteStateSyncSession,
} from "./remote-pglite-state-sync";

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
    process.stderr.write(`${remotePgliteStateSync.error.message}\n`);
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
        process.stderr.write(`${synced.error.message}\n`);
        exitCode = exitCode === 0 ? 1 : exitCode;
      }
    }
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
