import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ash } from "@appaloft/ash";
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
  type AuditEventRecorder,
  type AppLogger,
  type Clock,
  type ExecutionContext,
  type IdGenerator,
  type ServerRepository,
  type TerminalSession,
  type TerminalSessionDescriptor,
  type TerminalSessionFrame,
  type TerminalSessionGateway,
  type TerminalSessionSummary,
  type TerminalSessionOpenRequest,
} from "@appaloft/application";
import { deriveRuntimeInstanceNames } from "./runtime-instance-names";

type TerminalSpawnOptions = {
  cwd?: string;
  stdin: "pipe";
  stdout: "pipe";
  stderr: "pipe";
};
type TerminalSubprocess = Pick<
  Bun.Subprocess<"pipe", "pipe", "pipe">,
  "stdin" | "stdout" | "stderr" | "exited" | "kill"
> & {
  resize?: (rows: number, cols: number) => void | Promise<void>;
};
type TerminalSpawn = (args: string[], options: TerminalSpawnOptions) => TerminalSubprocess;
type TerminalSessionFinalization =
  | {
      reason: "cancelled" | "source-ended";
      exitCode?: number;
    }
  | {
      reason: "error";
      errorCode: string;
    };
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
  private readonly retainedOutputFrames: TerminalSessionFrame[] = [];
  private readonly waiters: Array<(result: IteratorResult<TerminalSessionFrame>) => void> = [];
  private retainedOutputBytes = 0;
  private closed = false;

  constructor(private readonly maxRetainedOutputBytes: number) {}

  push(event: TerminalSessionFrame): void {
    if (this.closed) {
      return;
    }

    this.retainOutput(event);

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
    const replay = this.events.length > 0 ? [] : this.retainedOutputFrames.slice();
    return {
      next: () => {
        const replayEvent = replay.shift();
        if (replayEvent) {
          return Promise.resolve({ value: replayEvent, done: false });
        }

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

  private retainOutput(event: TerminalSessionFrame): void {
    if (event.kind !== "output" || this.maxRetainedOutputBytes <= 0) {
      return;
    }

    const retainedBytes = new TextEncoder().encode(event.data).byteLength;
    this.retainedOutputFrames.push(event);
    this.retainedOutputBytes += retainedBytes;

    while (
      this.retainedOutputBytes > this.maxRetainedOutputBytes &&
      this.retainedOutputFrames.length > 0
    ) {
      const removed = this.retainedOutputFrames.shift();
      if (removed?.kind === "output") {
        this.retainedOutputBytes -= new TextEncoder().encode(removed.data).byteLength;
      }
    }
  }
}

class RuntimeTerminalSession implements TerminalSession {
  private closed = false;

  constructor(
    private readonly subprocess: TerminalSubprocess,
    private readonly queue: TerminalSessionQueue,
    private readonly cleanup: () => Promise<void>,
    private readonly onFinalized: (finalization: TerminalSessionFinalization) => Promise<void>,
    private readonly onActivity: () => void,
  ) {}

  async write(data: string): Promise<void> {
    if (this.closed) {
      return;
    }

    const stdin = this.subprocess.stdin as unknown as WritableTerminalStdin;
    await stdin.write(data);
    await stdin.flush?.();
    this.onActivity();
  }

  async resize(input: { rows: number; cols: number }): Promise<void> {
    this.onActivity();
    await this.subprocess.resize?.(input.rows, input.cols);
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
    await this.finalize({
      reason: "cancelled",
    });
  }

  async complete(exitCode: number): Promise<void> {
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
    await this.finalize({
      reason: "source-ended",
      exitCode,
    });
  }

  async fail(message: string): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.queue.push({
      kind: "error",
      error: domainError.terminalSessionFailed(message),
    });
    this.queue.close();
    await this.finalize({
      reason: "error",
      errorCode: "terminal_session_failed",
    });
  }

  private async finalize(finalization: TerminalSessionFinalization): Promise<void> {
    await this.cleanup();
    await this.onFinalized(finalization);
  }

  [Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {
    return this.queue[Symbol.asyncIterator]();
  }
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

function remoteCommandWithCwd(cwd?: string): string {
  const prompt = ash.quote("\\u@\\h:\\W\\$ ");
  const setup = [
    'export APPALOFT_TERMINAL_WORKDIR="$PWD"',
    `export PS1=${prompt}`,
    "if command -v bash >/dev/null 2>&1; then exec bash --noprofile --norc -i; fi",
    "exec ${SHELL:-/bin/sh} -i",
  ].join("; ");
  return cwd ? `cd ${ash.quote(cwd)} && ${setup}` : setup;
}

function runtimeMetadata(request: TerminalSessionOpenRequest): Record<string, string> {
  return request.scope.kind === "resource"
    ? (request.scope.deployment.runtimePlan.execution.metadata ?? {})
    : {};
}

function metadataValue(metadata: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function containerWorkingDirectory(metadata: Record<string, string>): string | undefined {
  return metadataValue(metadata, ["terminalWorkdir", "containerWorkdir", "dockerWorkdir"]);
}

function resourceRuntimeNames(request: TerminalSessionOpenRequest): {
  containerName: string;
  composeProjectName: string;
} | undefined {
  if (request.scope.kind !== "resource") {
    return undefined;
  }

  return deriveRuntimeInstanceNames({
    deploymentId: request.scope.deployment.id,
    metadata: request.scope.deployment.runtimePlan.execution.metadata,
  });
}

function resourceContainerName(
  request: TerminalSessionOpenRequest,
  metadata: Record<string, string>,
): string | undefined {
  const configured = metadataValue(metadata, ["containerName", "dockerContainerName"]);
  if (configured || request.scope.kind !== "resource") {
    return configured;
  }

  return request.scope.deployment.runtimePlan.execution.kind === "docker-container"
    ? resourceRuntimeNames(request)?.containerName
    : undefined;
}

function composeFile(
  request: TerminalSessionOpenRequest,
  metadata: Record<string, string>,
): string | undefined {
  if (request.scope.kind !== "resource") {
    return undefined;
  }

  return (
    metadataValue(metadata, ["composeFile", "compose.file"]) ??
    request.scope.deployment.runtimePlan.execution.composeFile ??
    request.scope.deployment.runtimePlan.runtimeArtifact?.composeFile
  );
}

function composeProjectName(
  request: TerminalSessionOpenRequest,
  metadata: Record<string, string>,
): string | undefined {
  if (request.scope.kind !== "resource") {
    return undefined;
  }

  return (
    metadataValue(metadata, ["composeProjectName", "compose.projectName"]) ??
    resourceRuntimeNames(request)?.composeProjectName
  );
}

function composeServiceName(
  request: TerminalSessionOpenRequest,
  metadata: Record<string, string>,
): string | undefined {
  if (request.scope.kind !== "resource") {
    return undefined;
  }

  const configured =
    metadataValue(metadata, [
      "composeServiceName",
      "composeService",
      "composeTargetService",
      "targetServiceName",
      "resource.targetServiceName",
      "network.targetServiceName",
    ]) ?? request.scope.resource.networkProfile?.targetServiceName;
  if (configured) {
    return configured;
  }

  return request.scope.resource.services.length === 1
    ? request.scope.resource.services[0]?.name
    : undefined;
}

function composeShellTarget(
  request: TerminalSessionOpenRequest,
  metadata: Record<string, string>,
):
  | {
      composeFile: string;
      projectName: string;
      serviceName: string;
      workdir?: string;
    }
  | undefined {
  if (
    request.scope.kind !== "resource" ||
    request.scope.deployment.runtimePlan.execution.kind !== "docker-compose-stack"
  ) {
    return undefined;
  }

  const file = composeFile(request, metadata);
  const projectName = composeProjectName(request, metadata);
  const serviceName = composeServiceName(request, metadata);
  if (!file || !projectName || !serviceName) {
    return undefined;
  }

  const workdir = containerWorkingDirectory(metadata);
  return {
    composeFile: file,
    projectName,
    serviceName,
    ...(workdir ? { workdir } : {}),
  };
}

function localDockerExecArgs(containerName: string, workdir?: string): string[] {
  return [
    "docker",
    "exec",
    "-i",
    ...(workdir ? ["-w", workdir] : []),
    containerName,
    "sh",
    "-lc",
    remoteCommandWithCwd(),
  ];
}

function localDockerComposeExecArgs(input: {
  composeFile: string;
  projectName: string;
  serviceName: string;
  workdir?: string;
}): string[] {
  return [
    "docker",
    "compose",
    "-p",
    input.projectName,
    "-f",
    input.composeFile,
    "exec",
    "-T",
    ...(input.workdir ? ["--workdir", input.workdir] : []),
    input.serviceName,
    "sh",
    "-lc",
    remoteCommandWithCwd(),
  ];
}

function remoteDockerExecCommand(containerName: string, workdir?: string): string {
  const workdirArgs = workdir ? ` -w ${ash.quote(workdir)}` : "";
  return `docker exec -it${workdirArgs} ${ash.quote(containerName)} sh -lc ${ash.quote(
    remoteCommandWithCwd(),
  )}`;
}

function remoteDockerComposeExecCommand(input: {
  composeFile: string;
  projectName: string;
  serviceName: string;
  workdir?: string;
}): string {
  const workdirArgs = input.workdir ? ` --workdir ${ash.quote(input.workdir)}` : "";
  return `docker compose -p ${ash.quote(input.projectName)} -f ${ash.quote(
    input.composeFile,
  )} exec${workdirArgs} ${ash.quote(input.serviceName)} sh -lc ${ash.quote(
    remoteCommandWithCwd(),
  )}`;
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
  onActivity?: () => void;
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

      input.onActivity?.();
      input.queue.push({
        kind: "output",
        stream: input.name,
        data: decoder.decode(chunk.value, { stream: true }),
      });
    }

    const remaining = decoder.decode();
    if (remaining.length > 0) {
      input.onActivity?.();
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
  private readonly sessions = new Map<
    string,
    {
      session: RuntimeTerminalSession;
      summary: TerminalSessionSummary;
      lastActivityAt: string;
    }
  >();

  constructor(
    private readonly input: {
      serverRepository?: ServerRepository;
      logger?: AppLogger;
      allowTerminalSessions: boolean;
      spawnProcess?: TerminalSpawn;
      auditEventRecorder?: AuditEventRecorder;
      clock?: Clock;
      idGenerator?: IdGenerator;
      activeSessionTtlMs?: number;
      outputRetentionBytes?: number;
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
    const queue = new TerminalSessionQueue(this.outputRetentionBytes());

    try {
      const subprocess = (this.input.spawnProcess ?? Bun.spawn)(spawnSpec.args, {
        ...(spawnSpec.cwd ? { cwd: spawnSpec.cwd } : {}),
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      const summary = {
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
          kind: "websocket" as const,
          path: `/api/terminal-sessions/${encodeURIComponent(request.sessionId)}/attach`,
        },
        providerKey,
        ...(workingDirectory ? { workingDirectory } : {}),
        createdAt: this.now(),
        status: "active" as const,
      };
      const touchActivity = () => {
        const entry = this.sessions.get(request.sessionId);
        if (entry) {
          entry.lastActivityAt = this.now();
        }
      };
      const session = new RuntimeTerminalSession(
        subprocess,
        queue,
        spawnSpec.cleanup,
        async (finalization) => {
          this.sessions.delete(request.sessionId);
          await this.recordSessionClosedAudit(context, summary, finalization);
        },
        touchActivity,
      );

      this.sessions.set(request.sessionId, {
        session,
        summary,
        lastActivityAt: summary.createdAt,
      });
      await this.recordSessionOpenedAudit(context, summary);
      queue.push({
        kind: "ready",
        sessionId: request.sessionId,
        ...(workingDirectory ? { workingDirectory } : {}),
      });
      this.monitorProcess(request.sessionId, session, subprocess, queue);

      return ok(summary);
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
    const entry = this.sessions.get(sessionId);

    return entry
      ? ok(entry.session)
      : err(
          domainError.terminalSessionNotFound("Terminal session was not found", {
            sessionId,
          }),
        );
  }

  list(input?: {
    scope?: "server" | "resource";
    serverId?: string;
    resourceId?: string;
    deploymentId?: string;
    limit?: number;
  }): TerminalSessionSummary[] {
    const limit = input?.limit ?? 50;
    return [...this.sessions.values()]
      .map((entry) => entry.summary)
      .filter((summary) => (input?.scope ? summary.scope === input.scope : true))
      .filter((summary) => (input?.serverId ? summary.serverId === input.serverId : true))
      .filter((summary) => (input?.resourceId ? summary.resourceId === input.resourceId : true))
      .filter((summary) =>
        input?.deploymentId ? summary.deploymentId === input.deploymentId : true,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  show(sessionId: string): Result<TerminalSessionSummary> {
    const entry = this.sessions.get(sessionId);
    return entry
      ? ok(entry.summary)
      : err(
          domainError.terminalSessionNotFound("Terminal session was not found", {
            sessionId,
          }),
        );
  }

  async close(sessionId: string): Promise<Result<{ sessionId: string; closed: boolean; status: "closed" }>> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return err(
        domainError.terminalSessionNotFound("Terminal session was not found", {
          sessionId,
        }),
      );
    }

    entry.summary.status = "closing";
    await entry.session.close();
    this.sessions.delete(sessionId);
    return ok({
      sessionId,
      closed: true,
      status: "closed",
    });
  }

  async expire(input?: {
    olderThan?: string;
    limit?: number;
  }): Promise<Result<{ expiredCount: number; sessionIds: string[] }>> {
    const cutoff = input?.olderThan ? Date.parse(input.olderThan) : this.defaultExpiryCutoffMs();
    const candidates = [...this.sessions.values()]
      .filter((entry) =>
        Date.parse(input?.olderThan ? entry.summary.createdAt : entry.lastActivityAt) < cutoff,
      )
      .sort((left, right) => left.summary.createdAt.localeCompare(right.summary.createdAt))
      .slice(0, input?.limit ?? 200);
    const sessionIds: string[] = [];

    for (const candidate of candidates) {
      const result = await this.close(candidate.summary.sessionId);
      if (result.isOk()) {
        sessionIds.push(candidate.summary.sessionId);
      }
    }

    return ok({
      expiredCount: sessionIds.length,
      sessionIds,
    });
  }

  private async createSpawnSpec(
    context: ExecutionContext,
    request: TerminalSessionOpenRequest,
    providerKey: string,
  ): Promise<Result<{ args: string[]; cwd?: string; cleanup: () => Promise<void> }>> {
    switch (providerKey) {
      case "local-shell": {
        const metadata = runtimeMetadata(request);
        const composeTarget = composeShellTarget(request, metadata);
        if (composeTarget) {
          return ok({
            args: localDockerComposeExecArgs(composeTarget),
            cleanup: async () => {},
          });
        }

        const containerName = resourceContainerName(request, metadata);
        if (request.scope.kind === "resource" && containerName) {
          return ok({
            args: localDockerExecArgs(containerName, containerWorkingDirectory(metadata)),
            cleanup: async () => {},
          });
        }

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
        const metadata = runtimeMetadata(request);
        const composeTarget = composeShellTarget(request, metadata);
        const containerName = resourceContainerName(request, metadata);
        const terminalCommand =
          request.scope.kind === "resource" && composeTarget
            ? remoteDockerComposeExecCommand(composeTarget)
            : request.scope.kind === "resource" && containerName
              ? remoteDockerExecCommand(containerName, containerWorkingDirectory(metadata))
              : remoteCommandWithCwd(
                  request.scope.kind === "resource" ? request.scope.workingDirectory : undefined,
                );
        return ok({
          args: ["ssh", ...sshArgs(sshTarget, terminalCommand)],
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
  ): void {
    void (async () => {
      try {
        const [exitCode] = await Promise.all([
          subprocess.exited,
          readTerminalOutput({
            stream: subprocess.stdout,
            name: "stdout",
            queue,
            onActivity: () => this.touchActivity(sessionId),
          }),
          readTerminalOutput({
            stream: subprocess.stderr,
            name: "stderr",
            queue,
            onActivity: () => this.touchActivity(sessionId),
          }),
        ]);

        await session.complete(exitCode);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.input.logger?.error("terminal_session.process_failed", {
          sessionId,
          message,
        });
        await session.fail(message);
      }
    })();
  }

  private now(): string {
    return this.input.clock?.now() ?? new Date().toISOString();
  }

  private defaultExpiryCutoffMs(): number {
    const activeSessionTtlMs = this.input.activeSessionTtlMs ?? 60 * 60 * 1000;
    return Date.parse(this.now()) - activeSessionTtlMs;
  }

  private outputRetentionBytes(): number {
    return this.input.outputRetentionBytes ?? 64 * 1024;
  }

  private touchActivity(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.lastActivityAt = this.now();
    }
  }

  private nextAuditEventId(): string | undefined {
    return this.input.idGenerator?.next("aud");
  }

  private async recordSessionOpenedAudit(
    context: ExecutionContext,
    summary: TerminalSessionSummary,
  ): Promise<void> {
    await this.recordAuditEvent(context, summary, {
      eventType: "terminal-session-opened",
      payload: {
        operationKey: "terminal-sessions.open",
        openedAt: summary.createdAt,
      },
    });
  }

  private async recordSessionClosedAudit(
    context: ExecutionContext,
    summary: TerminalSessionSummary,
    finalization: TerminalSessionFinalization,
  ): Promise<void> {
    await this.recordAuditEvent(context, summary, {
      eventType: "terminal-session-closed",
      payload: {
        operationKey: "terminal-sessions.close",
        closedAt: this.now(),
        closeReason: finalization.reason,
        ...("exitCode" in finalization ? { exitCode: finalization.exitCode } : {}),
        ...("errorCode" in finalization ? { errorCode: finalization.errorCode } : {}),
      },
    });
  }

  private async recordAuditEvent(
    context: ExecutionContext,
    summary: TerminalSessionSummary,
    input: {
      eventType: string;
      payload: Record<string, string | number | boolean | null | readonly string[]>;
    },
  ): Promise<void> {
    const recorder = this.input.auditEventRecorder;
    const auditEventId = this.nextAuditEventId();
    if (!recorder || !auditEventId) {
      return;
    }

    const result = await recorder.record(toRepositoryContext(context), {
      id: auditEventId,
      aggregateId: summary.resourceId ?? summary.serverId,
      eventType: input.eventType,
      payload: {
        ...input.payload,
        sessionId: summary.sessionId,
        scope: summary.scope,
        serverId: summary.serverId,
        providerKey: summary.providerKey,
        entrypoint: context.entrypoint,
        requestId: context.requestId,
        ...(context.actor ? { actorKind: context.actor.kind, actorId: context.actor.id } : {}),
        ...(summary.resourceId ? { resourceId: summary.resourceId } : {}),
        ...(summary.deploymentId ? { deploymentId: summary.deploymentId } : {}),
      },
      createdAt: this.now(),
    });

    if (result.isErr()) {
      this.input.logger?.warn("terminal_session.audit_record_failed", {
        sessionId: summary.sessionId,
        eventType: input.eventType,
        errorCode: result.error.code,
        message: result.error.message,
      });
    }
  }
}
