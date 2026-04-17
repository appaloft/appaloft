import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import {
  toRepositoryContext,
  type AppLogger,
  type ExecutionContext,
  type ServerRepository,
  type TerminalSession,
  type TerminalSessionDescriptor,
  type TerminalSessionFrame,
  type TerminalSessionGateway,
  type TerminalSessionOpenRequest,
} from "@appaloft/application";

type TerminalSpawnOptions = {
  cwd?: string;
  stdin: "pipe";
  stdout: "pipe";
  stderr: "pipe";
};
type TerminalSubprocess = Pick<
  Bun.Subprocess<"pipe", "pipe", "pipe">,
  "stdin" | "stdout" | "stderr" | "exited" | "kill"
>;
type TerminalSpawn = (args: string[], options: TerminalSpawnOptions) => TerminalSubprocess;
type WritableTerminalStdin = {
  write(data: string | Uint8Array): void | number | Promise<void | number>;
  flush?: () => void | Promise<void>;
  end?: () => void | Promise<void>;
};
type SshTerminalTarget = {
  host: string;
  port: string;
  identityFile?: string;
  cleanup(): Promise<void>;
};

class TerminalSessionQueue implements AsyncIterable<TerminalSessionFrame> {
  private readonly events: TerminalSessionFrame[] = [];
  private readonly waiters: Array<(result: IteratorResult<TerminalSessionFrame>) => void> = [];
  private closed = false;

  push(event: TerminalSessionFrame): void {
    if (this.closed) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: event, done: false });
      return;
    }

    this.events.push(event);
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {
    return {
      next: () => {
        const event = this.events.shift();
        if (event) {
          return Promise.resolve({ value: event, done: false });
        }

        if (this.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }

        return new Promise<IteratorResult<TerminalSessionFrame>>((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}

class RuntimeTerminalSession implements TerminalSession {
  private closed = false;

  constructor(
    private readonly subprocess: TerminalSubprocess,
    private readonly queue: TerminalSessionQueue,
    private readonly cleanup: () => Promise<void>,
    private readonly onClosed: () => void,
  ) {}

  async write(data: string): Promise<void> {
    if (this.closed) {
      return;
    }

    const stdin = this.subprocess.stdin as unknown as WritableTerminalStdin;
    await stdin.write(data);
    await stdin.flush?.();
  }

  async resize(_input: { rows: number; cols: number }): Promise<void> {
    // Bun subprocess pipes do not expose PTY resize. SSH targets receive a TTY via -tt.
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    const stdin = this.subprocess.stdin as unknown as WritableTerminalStdin;
    await stdin.end?.();
    this.subprocess.kill();
    this.queue.push({
      kind: "closed",
      reason: "cancelled",
    });
    this.queue.close();
    await this.cleanup();
    this.onClosed();
  }

  complete(exitCode: number): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.queue.push({
      kind: "closed",
      reason: "source-ended",
      exitCode,
    });
    this.queue.close();
    this.onClosed();
  }

  fail(message: string): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.queue.push({
      kind: "error",
      error: domainError.terminalSessionFailed(message),
    });
    this.queue.close();
    this.onClosed();
  }

  [Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {
    return this.queue[Symbol.asyncIterator]();
  }
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

function remoteCommandWithCwd(cwd?: string): string {
  const prompt = shellQuote("\\u@\\h:\\W\\$ ");
  const setup = [
    'export APPALOFT_TERMINAL_WORKDIR="$PWD"',
    `export PS1=${prompt}`,
    "if command -v bash >/dev/null 2>&1; then exec bash --noprofile --norc -i; fi",
    "exec ${SHELL:-/bin/sh} -i",
  ].join("; ");
  return cwd ? `cd ${shellQuote(cwd)} && ${setup}` : setup;
}

async function writeSshIdentityFile(privateKey: string): Promise<{
  identityFile: string;
  cleanup(): Promise<void>;
}> {
  const sshDir = await mkdtemp(join(tmpdir(), "appaloft-terminal-ssh-"));
  const identityFile = join(sshDir, "id_terminal");
  await writeFile(identityFile, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, {
    mode: 0o600,
  });
  await chmod(identityFile, 0o600);

  return {
    identityFile,
    cleanup: () => rm(sshDir, { recursive: true, force: true }),
  };
}

function sshArgs(target: SshTerminalTarget, remoteCommand: string): string[] {
  return [
    "-tt",
    "-p",
    target.port,
    ...(target.identityFile
      ? ["-i", target.identityFile, "-o", "IdentitiesOnly=yes"]
      : []),
    "-o",
    "BatchMode=yes",
    "-o",
    "PreferredAuthentications=publickey",
    "-o",
    "PasswordAuthentication=no",
    "-o",
    "KbdInteractiveAuthentication=no",
    "-o",
    "NumberOfPasswordPrompts=0",
    "-o",
    "StrictHostKeyChecking=accept-new",
    target.host,
    remoteCommand,
  ];
}

async function readTerminalOutput(input: {
  stream: ReadableStream<Uint8Array> | null | undefined;
  name: "stdout" | "stderr";
  queue: TerminalSessionQueue;
}): Promise<void> {
  if (!input.stream) {
    return;
  }

  const reader = input.stream.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }

      input.queue.push({
        kind: "output",
        stream: input.name,
        data: decoder.decode(chunk.value, { stream: true }),
      });
    }

    const remaining = decoder.decode();
    if (remaining.length > 0) {
      input.queue.push({
        kind: "output",
        stream: input.name,
        data: remaining,
      });
    }
  } finally {
    reader.releaseLock();
  }
}

export class RuntimeTerminalSessionGateway implements TerminalSessionGateway {
  private readonly sessions = new Map<string, RuntimeTerminalSession>();

  constructor(
    private readonly input: {
      serverRepository?: ServerRepository;
      logger?: AppLogger;
      allowTerminalSessions: boolean;
      spawnProcess?: TerminalSpawn;
    },
  ) {}

  async open(
    context: ExecutionContext,
    request: TerminalSessionOpenRequest,
  ): Promise<Result<TerminalSessionDescriptor>> {
    if (!this.input.allowTerminalSessions) {
      return err(
        domainError.terminalSessionPolicyDenied(
          "Terminal sessions are disabled by runtime policy",
          {
            phase: "terminal-session-admission",
          },
        ),
      );
    }

    const providerKey =
      request.scope.kind === "resource"
        ? request.scope.deployment.runtimePlan.target.providerKey
        : request.scope.server.providerKey;
    const workingDirectory =
      request.scope.kind === "resource" ? request.scope.workingDirectory : undefined;
    const spawnSpecResult = await this.createSpawnSpec(context, request, providerKey);

    if (spawnSpecResult.isErr()) {
      return err(spawnSpecResult.error);
    }

    const spawnSpec = spawnSpecResult.value;
    const queue = new TerminalSessionQueue();

    try {
      const subprocess = (this.input.spawnProcess ?? Bun.spawn)(spawnSpec.args, {
        ...(spawnSpec.cwd ? { cwd: spawnSpec.cwd } : {}),
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      const session = new RuntimeTerminalSession(
        subprocess,
        queue,
        spawnSpec.cleanup,
        () => {
          this.sessions.delete(request.sessionId);
        },
      );

      this.sessions.set(request.sessionId, session);
      queue.push({
        kind: "ready",
        sessionId: request.sessionId,
        ...(workingDirectory ? { workingDirectory } : {}),
      });
      this.monitorProcess(request.sessionId, session, subprocess, queue, spawnSpec.cleanup);

      return ok({
        sessionId: request.sessionId,
        scope: request.scope.kind,
        serverId: request.scope.server.id,
        ...(request.scope.kind === "resource"
          ? {
              resourceId: request.scope.resource.id,
              deploymentId: request.scope.deployment.id,
            }
          : {}),
        transport: {
          kind: "websocket",
          path: `/api/terminal-sessions/${encodeURIComponent(request.sessionId)}/attach`,
        },
        providerKey,
        ...(workingDirectory ? { workingDirectory } : {}),
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      await spawnSpec.cleanup();
      return err(
        domainError.terminalSessionFailed("Failed to start terminal session", {
          phase: "terminal-session-start",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  attach(sessionId: string): Result<TerminalSession> {
    const session = this.sessions.get(sessionId);

    return session
      ? ok(session)
      : err(
          domainError.terminalSessionNotFound("Terminal session was not found", {
            sessionId,
          }),
        );
  }

  private async createSpawnSpec(
    context: ExecutionContext,
    request: TerminalSessionOpenRequest,
    providerKey: string,
  ): Promise<Result<{ args: string[]; cwd?: string; cleanup: () => Promise<void> }>> {
    switch (providerKey) {
      case "local-shell": {
        const shell = Bun.env.SHELL?.trim() || "/bin/sh";
        const cwd = request.scope.kind === "resource" ? request.scope.workingDirectory : undefined;
        return ok({
          args: [shell, "-l"],
          ...(cwd ? { cwd } : {}),
          cleanup: async () => {},
        });
      }
      case "generic-ssh": {
        const server = request.scope.server;
        const sshTargetResult = await this.resolveSshTarget(context, server.id);
        if (sshTargetResult.isErr()) {
          return err(sshTargetResult.error);
        }

        const sshTarget = sshTargetResult.value;
        return ok({
          args: [
            "ssh",
            ...sshArgs(
              sshTarget,
              remoteCommandWithCwd(
                request.scope.kind === "resource" ? request.scope.workingDirectory : undefined,
              ),
            ),
          ],
          cleanup: sshTarget.cleanup,
        });
      }
      default:
        return err(
          domainError.terminalSessionUnsupported("Terminal sessions are not supported for provider", {
            providerKey,
          }),
        );
    }
  }

  private async resolveSshTarget(
    context: ExecutionContext,
    serverId: string,
  ): Promise<Result<SshTerminalTarget>> {
    if (!this.input.serverRepository) {
      return err(
        domainError.terminalSessionNotConfigured("SSH terminal sessions require server repository", {
          serverId,
        }),
      );
    }

    const server = await this.input.serverRepository.findOne(
      toRepositoryContext(context),
      DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate(serverId)),
    );
    const serverState = server?.toState();

    if (!serverState) {
      return err(domainError.notFound("server", serverId));
    }

    const username = serverState.credential?.username?.value;
    const privateKey = serverState.credential?.privateKey?.value;
    let identityFile: string | undefined;
    let cleanup = async () => {};

    if (serverState.credential?.kind.value === "ssh-private-key" && privateKey) {
      const identity = await writeSshIdentityFile(privateKey);
      identityFile = identity.identityFile;
      cleanup = identity.cleanup;
    }

    return ok({
      host: hostWithUsername(serverState.host.value, username),
      port: String(serverState.port.value),
      ...(identityFile ? { identityFile } : {}),
      cleanup,
    });
  }

  private monitorProcess(
    sessionId: string,
    session: RuntimeTerminalSession,
    subprocess: TerminalSubprocess,
    queue: TerminalSessionQueue,
    cleanup: () => Promise<void>,
  ): void {
    void (async () => {
      try {
        const [exitCode] = await Promise.all([
          subprocess.exited,
          readTerminalOutput({ stream: subprocess.stdout, name: "stdout", queue }),
          readTerminalOutput({ stream: subprocess.stderr, name: "stderr", queue }),
        ]);

        session.complete(exitCode);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.input.logger?.error("terminal_session.process_failed", {
          sessionId,
          message,
        });
        session.fail(message);
      } finally {
        await cleanup();
      }
    })();
  }
}
