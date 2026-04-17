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
  createRuntimeLogsSpanName,
  type ExecutionContext,
  type ResourceRuntimeLogContext,
  type ResourceRuntimeLogEvent,
  type ResourceRuntimeLogLine,
  type ResourceRuntimeLogReader,
  type ResourceRuntimeLogRequest,
  type ResourceRuntimeLogStream,
  type ResourceRuntimeLogStreamName,
  type ServerRepository,
  type TraceAttributes,
  toRepositoryContext,
  appaloftTraceAttributes,
} from "@appaloft/application";

type RuntimeLogCloseReason = "completed" | "cancelled" | "source-ended";
type RuntimeLogCommandKind =
  | "docker_logs"
  | "docker_compose_logs"
  | "ssh_docker_logs"
  | "ssh_compose_logs";
type RuntimeLogSpawnOptions = {
  cwd?: string;
  stdout: "pipe";
  stderr: "pipe";
};
type RuntimeLogSubprocess = Pick<
  Bun.Subprocess<"ignore", "pipe", "pipe">,
  "stdout" | "stderr" | "exited" | "kill"
>;
type RuntimeLogSpawn = (args: string[], options: RuntimeLogSpawnOptions) => RuntimeLogSubprocess;
type RuntimeLogProcessOutcome =
  | {
      kind: "exited";
      exitCode: number;
    }
  | {
      kind: "timeout";
    };
type RuntimeResourceRuntimeLogReaderOptions = {
  boundedProcessTimeoutMs?: number;
};
type SshRuntimeLogTarget = {
  host: string;
  port: string;
  identityFile?: string;
  cleanup(): Promise<void>;
};

const defaultBoundedProcessTimeoutMs = 10_000;

class RuntimeLogLineBuffer {
  private pending = "";

  push(chunk: string): string[] {
    const combined = `${this.pending}${chunk}`;
    const parts = combined.split(/\r?\n/);
    this.pending = parts.pop() ?? "";
    return parts.filter((line) => line.length > 0);
  }

  flush(): string[] {
    const line = this.pending;
    this.pending = "";
    return line ? [line] : [];
  }
}

class RuntimeLogEventQueue implements AsyncIterable<ResourceRuntimeLogEvent> {
  private readonly events: ResourceRuntimeLogEvent[] = [];
  private readonly waiters: Array<
    (result: IteratorResult<ResourceRuntimeLogEvent>) => void
  > = [];
  private closed = false;

  push(event: ResourceRuntimeLogEvent): void {
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

  [Symbol.asyncIterator](): AsyncIterator<ResourceRuntimeLogEvent> {
    return {
      next: () => {
        const event = this.events.shift();
        if (event) {
          return Promise.resolve({ value: event, done: false });
        }

        if (this.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }

        return new Promise<IteratorResult<ResourceRuntimeLogEvent>>((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}

class QueueResourceRuntimeLogStream implements ResourceRuntimeLogStream {
  private closed = false;

  constructor(
    private readonly queue: RuntimeLogEventQueue,
    private readonly closeBackend: () => void | Promise<void>,
  ) {}

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await this.closeBackend();
    this.queue.push({
      kind: "closed",
      reason: "cancelled",
    });
    this.queue.close();
  }

  complete(reason: RuntimeLogCloseReason): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.queue.push({
      kind: "closed",
      reason,
    });
    this.queue.close();
  }

  fail(event: ResourceRuntimeLogEvent): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.queue.push(event);
    this.queue.close();
  }

  [Symbol.asyncIterator](): AsyncIterator<ResourceRuntimeLogEvent> {
    return this.queue[Symbol.asyncIterator]();
  }
}

function tailTextLines(text: string, count: number): string[] {
  if (count <= 0) {
    return [];
  }

  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .slice(-count);
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function metadataValue(
  context: ResourceRuntimeLogContext,
  key: string,
): string | undefined {
  const value = context.deployment.runtimePlan.execution.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function runtimeKind(context: ResourceRuntimeLogContext): string {
  return context.deployment.runtimePlan.execution.kind;
}

function targetMetadataValue(
  context: ResourceRuntimeLogContext,
  key: string,
): string | undefined {
  const value = context.deployment.runtimePlan.target.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function runtimeInstanceId(context: ResourceRuntimeLogContext): string | undefined {
  return (
    metadataValue(context, "containerName") ??
    metadataValue(context, "pid") ??
    metadataValue(context, "composeFile")
  );
}

function createLine(input: {
  context: ResourceRuntimeLogContext;
  message: string;
  stream: ResourceRuntimeLogStreamName;
  sequence: number;
}): ResourceRuntimeLogLine {
  const targetServiceName = input.context.resource.networkProfile?.targetServiceName;
  const instanceId = runtimeInstanceId(input.context);

  return {
    resourceId: input.context.resource.id,
    deploymentId: input.context.deployment.id,
    ...(targetServiceName ? { serviceName: targetServiceName } : {}),
    runtimeKind: runtimeKind(input.context),
    ...(instanceId ? { runtimeInstanceId: instanceId } : {}),
    stream: input.stream,
    timestamp: new Date().toISOString(),
    sequence: input.sequence,
    message: input.message,
    masked: false,
  };
}

function redactLine(message: string, redactions: readonly string[]): {
  message: string;
  masked: boolean;
} {
  let redacted = message;
  let masked = false;

  for (const redaction of redactions) {
    if (!redaction || !redacted.includes(redaction)) {
      continue;
    }

    redacted = redacted.split(redaction).join("********");
    masked = true;
  }

  return { message: redacted, masked };
}

function createLineEvent(input: {
  context: ResourceRuntimeLogContext;
  message: string;
  stream: ResourceRuntimeLogStreamName;
  sequence: number;
}): ResourceRuntimeLogEvent {
  const redacted = redactLine(input.message, input.context.redactions);
  return {
    kind: "line",
    line: {
      ...createLine(input),
      message: redacted.message,
      masked: redacted.masked,
    },
  };
}

function createStaticStream(events: ResourceRuntimeLogEvent[]): ResourceRuntimeLogStream {
  const queue = new RuntimeLogEventQueue();
  const stream = new QueueResourceRuntimeLogStream(queue, () => undefined);

  queueMicrotask(() => {
    for (const event of events) {
      queue.push(event);
    }
    stream.complete("source-ended");
  });

  return stream;
}

function createStreamFailure(
  message: string,
  context: ResourceRuntimeLogContext,
  step: string,
): ResourceRuntimeLogEvent {
  return {
    kind: "error",
    error: domainError.resourceRuntimeLogStreamFailed(message, {
      phase: "runtime-log-stream",
      step,
      resourceId: context.resource.id,
      deploymentId: context.deployment.id,
      runtimeKind: runtimeKind(context),
    }),
  };
}

function createStreamTimeoutFailure(input: {
  context: ResourceRuntimeLogContext;
  command: RuntimeLogCommandKind;
  timeoutMs: number;
}): ResourceRuntimeLogEvent {
  return {
    kind: "error",
    error: domainError.timeout("Runtime log process timed out", {
      phase: "runtime-log-stream",
      step: "process-timeout",
      resourceId: input.context.resource.id,
      deploymentId: input.context.deployment.id,
      runtimeKind: runtimeKind(input.context),
      adapter: input.command,
      timeoutMs: input.timeoutMs,
    }),
  };
}

function createProcessTimeout(timeoutMs: number): {
  cancel(): void;
  promise: Promise<RuntimeLogProcessOutcome>;
} {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return {
    promise: new Promise<RuntimeLogProcessOutcome>((resolve) => {
      timeout = setTimeout(() => {
        resolve({ kind: "timeout" });
      }, timeoutMs);
    }),
    cancel() {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
    },
  };
}

async function readProcessStream(input: {
  stream: ReadableStream<Uint8Array> | null | undefined;
  name: ResourceRuntimeLogStreamName;
  queue: RuntimeLogEventQueue;
  context: ResourceRuntimeLogContext;
  nextSequence(): number;
}): Promise<void> {
  if (!input.stream) {
    return;
  }

  const reader = input.stream.getReader();
  const decoder = new TextDecoder();
  const lines = new RuntimeLogLineBuffer();

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }

      const text = decoder.decode(chunk.value, { stream: true });
      for (const line of lines.push(text)) {
        input.queue.push(
          createLineEvent({
            context: input.context,
            message: line,
            stream: input.name,
            sequence: input.nextSequence(),
          }),
        );
      }
    }

    const remaining = decoder.decode();
    for (const line of lines.push(remaining)) {
      input.queue.push(
        createLineEvent({
          context: input.context,
          message: line,
          stream: input.name,
          sequence: input.nextSequence(),
        }),
      );
    }
    for (const line of lines.flush()) {
      input.queue.push(
        createLineEvent({
          context: input.context,
          message: line,
          stream: input.name,
          sequence: input.nextSequence(),
        }),
      );
    }
  } finally {
    reader.releaseLock();
  }
}

function createProcessRuntimeLogStream(input: {
  args: string[];
  command: RuntimeLogCommandKind;
  cwd?: string;
  executionContext: ExecutionContext;
  context: ResourceRuntimeLogContext;
  request: ResourceRuntimeLogRequest;
  signal: AbortSignal;
  spawnProcess: RuntimeLogSpawn;
  boundedProcessTimeoutMs: number;
  cleanupBackend?: () => void | Promise<void>;
}): ResourceRuntimeLogStream {
  const queue = new RuntimeLogEventQueue();
  let sequence = 0;
  const subprocess = input.spawnProcess(input.args, {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stream = new QueueResourceRuntimeLogStream(queue, () => {
    subprocess.kill();
  });
  const timeoutMs = input.boundedProcessTimeoutMs;
  const nextSequence = () => {
    sequence += 1;
    return sequence;
  };
  let closeRequested = false;
  const abort = () => {
    closeRequested = true;
    void stream.close();
  };

  input.signal.addEventListener("abort", abort, { once: true });

  void input.executionContext.tracer.startActiveSpan(
    createRuntimeLogsSpanName("process"),
    {
      attributes: createRuntimeLogProcessTraceAttributes(input),
    },
    async (span) => {
      const processDone = Promise.all([
        subprocess.exited,
        readProcessStream({
          stream: subprocess.stdout,
          name: "stdout",
          queue,
          context: input.context,
          nextSequence,
        }),
        readProcessStream({
          stream: subprocess.stderr,
          name: "stderr",
          queue,
          context: input.context,
          nextSequence,
        }),
      ]).then(([exitCode]): RuntimeLogProcessOutcome => ({ kind: "exited", exitCode }));
      const processTimeout = input.request.follow ? undefined : createProcessTimeout(timeoutMs);

      try {
        const outcome = processTimeout
          ? await Promise.race([processDone, processTimeout.promise])
          : await processDone;

        span.setAttribute(appaloftTraceAttributes.runtimeLogLineCount, sequence);

        if (outcome.kind === "timeout") {
          subprocess.kill();
          void processDone.catch(() => undefined);

          if (input.signal.aborted || closeRequested) {
            span.setAttribute(appaloftTraceAttributes.runtimeLogCloseReason, "cancelled");
            span.setStatus("ok");
            stream.complete("cancelled");
            return;
          }

          span.setAttributes({
            [appaloftTraceAttributes.runtimeLogCloseReason]: "timeout",
            [appaloftTraceAttributes.runtimeLogTimeoutMs]: timeoutMs,
          });
          span.setStatus("error", `Runtime log process timed out after ${timeoutMs}ms`);
          stream.fail(
            createStreamTimeoutFailure({
              context: input.context,
              command: input.command,
              timeoutMs,
            }),
          );
          return;
        }

        if (input.signal.aborted) {
          span.setAttribute(appaloftTraceAttributes.runtimeLogCloseReason, "cancelled");
          span.setStatus("ok");
          stream.complete("cancelled");
          return;
        }

        const exitCode = outcome.exitCode;

        if (exitCode === 0) {
          span.setAttribute(appaloftTraceAttributes.runtimeLogCloseReason, "source-ended");
          span.setStatus("ok");
          stream.complete("source-ended");
          return;
        }

        span.setStatus("error", `Runtime log process exited with code ${exitCode}`);
        stream.fail(
          createStreamFailure(
            `Runtime log process exited with code ${exitCode}`,
            input.context,
            "process-exit",
          ),
        );
      } catch (error: unknown) {
        span.setStatus(
          "error",
          error instanceof Error ? error.message : "Runtime log process stream failed",
        );
        span.setAttribute(appaloftTraceAttributes.runtimeLogLineCount, sequence);
        span.recordError(error instanceof Error ? error : { message: String(error) });
        stream.fail(
          createStreamFailure(
            error instanceof Error ? error.message : String(error),
            input.context,
            "process-stream-read",
          ),
        );
      } finally {
        processTimeout?.cancel();
        input.signal.removeEventListener("abort", abort);
        await input.cleanupBackend?.();
      }
    },
  );

  return stream;
}

function createRuntimeLogProcessTraceAttributes(input: {
  command: RuntimeLogCommandKind;
  context: ResourceRuntimeLogContext;
  request: ResourceRuntimeLogRequest;
}): TraceAttributes {
  return {
    [appaloftTraceAttributes.resourceId]: input.context.resource.id,
    [appaloftTraceAttributes.deploymentId]: input.context.deployment.id,
    [appaloftTraceAttributes.runtimeKind]: runtimeKind(input.context),
    [appaloftTraceAttributes.targetProviderKey]: input.context.deployment.runtimePlan.target.providerKey,
    [appaloftTraceAttributes.runtimeLogCommand]: input.command,
    [appaloftTraceAttributes.runtimeLogFollow]: input.request.follow,
    [appaloftTraceAttributes.runtimeLogTailLines]: input.request.tailLines,
    [appaloftTraceAttributes.runtimeLogServiceName]: input.request.serviceName,
  };
}

function isGenericSshRuntime(context: ResourceRuntimeLogContext): boolean {
  return context.deployment.runtimePlan.target.providerKey === "generic-ssh";
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

function stableRuntimeLogHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function sshControlPath(target: SshRuntimeLogTarget): string {
  const targetHash = stableRuntimeLogHash(`${target.host}:${target.port}`);
  return join(tmpdir(), `appaloft-runtime-log-${targetHash}.sock`);
}

async function writeSshIdentityFile(privateKey: string): Promise<{
  identityFile: string;
  cleanup(): Promise<void>;
}> {
  const sshDir = await mkdtemp(join(tmpdir(), "appaloft-runtime-log-ssh-"));
  const identityFile = join(sshDir, "id_runtime_log");
  await writeFile(identityFile, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, {
    mode: 0o600,
  });
  await chmod(identityFile, 0o600);

  return {
    identityFile,
    cleanup: () => rm(sshDir, { recursive: true, force: true }),
  };
}

function sshArgs(
  target: SshRuntimeLogTarget,
  options: {
    reuseConnection: boolean;
  },
): string[] {
  return [
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
    ...(options.reuseConnection
      ? [
          "-o",
          "ControlMaster=auto",
          "-o",
          "ControlPersist=120s",
          "-o",
          `ControlPath=${sshControlPath(target)}`,
        ]
      : []),
    target.host,
  ];
}

function remoteCommandWithCwd(command: string, cwd?: string): string {
  return cwd ? `cd ${shellQuote(cwd)} && ${command}` : command;
}

function dockerLogsCommand(input: {
  containerName: string;
  request: ResourceRuntimeLogRequest;
}): string {
  return [
    "docker",
    "logs",
    "--tail",
    shellQuote(String(input.request.tailLines)),
    ...(input.request.follow ? ["--follow"] : []),
    shellQuote(input.containerName),
  ].join(" ");
}

function dockerComposeLogsCommand(input: {
  composeFile: string;
  request: ResourceRuntimeLogRequest;
}): string {
  return [
    "docker",
    "compose",
    "-f",
    shellQuote(input.composeFile),
    "logs",
    "--no-color",
    "--tail",
    shellQuote(String(input.request.tailLines)),
    ...(input.request.follow ? ["--follow"] : []),
    ...(input.request.serviceName ? [shellQuote(input.request.serviceName)] : []),
  ].join(" ");
}

async function createFileRuntimeLogStream(input: {
  path: string;
  request: ResourceRuntimeLogRequest;
  context: ResourceRuntimeLogContext;
  signal: AbortSignal;
}): Promise<Result<ResourceRuntimeLogStream>> {
  const file = Bun.file(input.path);
  if (!(await file.exists())) {
    return err(
      domainError.resourceRuntimeLogsUnavailable("Runtime log file is not available", {
        phase: "runtime-instance-resolution",
        step: "file-tail",
        resourceId: input.context.resource.id,
        deploymentId: input.context.deployment.id,
        runtimeKind: runtimeKind(input.context),
      }),
    );
  }

  const text = await file.text();
  const initialLines = tailTextLines(text, input.request.tailLines);
  let sequence = 0;

  if (!input.request.follow) {
    return ok(
      createStaticStream(
        initialLines.map((line) => {
          sequence += 1;
          return createLineEvent({
            context: input.context,
            message: line,
            stream: "stdout",
            sequence,
          });
        }),
      ),
    );
  }

  const queue = new RuntimeLogEventQueue();
  let offset = file.size;
  let polling = false;
  let interval: Timer | undefined;
  const stream = new QueueResourceRuntimeLogStream(queue, () => {
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
  });
  const pushLine = (line: string) => {
    sequence += 1;
    queue.push(
      createLineEvent({
        context: input.context,
        message: line,
        stream: "stdout",
        sequence,
      }),
    );
  };

  for (const line of initialLines) {
    pushLine(line);
  }

  const poll = async () => {
    if (polling) {
      return;
    }

    polling = true;
    try {
      const current = Bun.file(input.path);
      if (!(await current.exists())) {
        stream.fail(createStreamFailure("Runtime log file disappeared", input.context, "file-tail"));
        return;
      }

      if (current.size < offset) {
        offset = 0;
      }

      if (current.size > offset) {
        const chunk = await current.slice(offset, current.size).text();
        offset = current.size;
        for (const line of tailTextLines(chunk, Number.MAX_SAFE_INTEGER)) {
          pushLine(line);
        }
      }
    } catch (error) {
      stream.fail(
        createStreamFailure(
          error instanceof Error ? error.message : String(error),
          input.context,
          "file-tail",
        ),
      );
    } finally {
      polling = false;
    }
  };
  const abort = () => {
    void stream.close();
  };

  input.signal.addEventListener("abort", abort, { once: true });
  interval = setInterval(() => {
    void poll();
  }, 1000);

  return ok(stream);
}

export class RuntimeResourceRuntimeLogReader implements ResourceRuntimeLogReader {
  private readonly boundedProcessTimeoutMs: number;

  constructor(
    private readonly serverRepository?: ServerRepository,
    private readonly spawnProcess: RuntimeLogSpawn = (args, options) =>
      Bun.spawn(args, options),
    options: RuntimeResourceRuntimeLogReaderOptions = {},
  ) {
    this.boundedProcessTimeoutMs =
      options.boundedProcessTimeoutMs ?? defaultBoundedProcessTimeoutMs;
  }

  async open(
    context: ExecutionContext,
    logContext: ResourceRuntimeLogContext,
    request: ResourceRuntimeLogRequest,
    signal: AbortSignal,
  ): Promise<Result<ResourceRuntimeLogStream>> {
    const execution = logContext.deployment.runtimePlan.execution;

    switch (execution.kind) {
      case "host-process": {
        const logPath = metadataValue(logContext, "logPath");
        if (!logPath) {
          return err(
            domainError.resourceRuntimeLogsUnavailable("Host process log path is not available", {
              phase: "runtime-instance-resolution",
              step: "host-process-log-path",
              resourceId: logContext.resource.id,
              deploymentId: logContext.deployment.id,
              runtimeKind: execution.kind,
            }),
          );
        }

        return createFileRuntimeLogStream({
          path: logPath,
          request,
          context: logContext,
          signal,
        });
      }
      case "docker-container": {
        const containerName = metadataValue(logContext, "containerName");
        if (!containerName) {
          return err(
            domainError.resourceRuntimeLogsUnavailable("Docker container name is not available", {
              phase: "runtime-instance-resolution",
              step: "docker-container-name",
              resourceId: logContext.resource.id,
              deploymentId: logContext.deployment.id,
              runtimeKind: execution.kind,
            }),
          );
        }

        const sshTargetResult = await this.resolveSshTarget(context, logContext);
        if (sshTargetResult.isErr()) {
          return err(sshTargetResult.error);
        }

        const sshTarget = sshTargetResult.value;
        if (sshTarget) {
          return ok(
            createProcessRuntimeLogStream({
              args: [
                "ssh",
                ...sshArgs(sshTarget, { reuseConnection: request.follow }),
                dockerLogsCommand({
                  containerName,
                  request,
                }),
              ],
              command: "ssh_docker_logs",
              context: logContext,
              executionContext: context,
              request,
              signal,
              spawnProcess: this.spawnProcess,
              boundedProcessTimeoutMs: this.boundedProcessTimeoutMs,
              cleanupBackend: sshTarget.cleanup,
            }),
          );
        }

        return ok(
          createProcessRuntimeLogStream({
            args: [
              "docker",
              "logs",
              "--tail",
              String(request.tailLines),
              ...(request.follow ? ["--follow"] : []),
              containerName,
            ],
            command: "docker_logs",
            context: logContext,
            executionContext: context,
            request,
            signal,
            spawnProcess: this.spawnProcess,
            boundedProcessTimeoutMs: this.boundedProcessTimeoutMs,
          }),
        );
      }
      case "docker-compose-stack": {
        const composeFile = metadataValue(logContext, "composeFile") ?? execution.composeFile;
        const cwd = metadataValue(logContext, "workdir") ?? execution.workingDirectory;
        if (!composeFile) {
          return err(
            domainError.resourceRuntimeLogsUnavailable("Docker compose file is not available", {
              phase: "runtime-instance-resolution",
              step: "docker-compose-file",
              resourceId: logContext.resource.id,
              deploymentId: logContext.deployment.id,
              runtimeKind: execution.kind,
            }),
          );
        }

        const sshTargetResult = await this.resolveSshTarget(context, logContext);
        if (sshTargetResult.isErr()) {
          return err(sshTargetResult.error);
        }

        const sshTarget = sshTargetResult.value;
        if (sshTarget) {
          return ok(
            createProcessRuntimeLogStream({
              args: [
                "ssh",
                ...sshArgs(sshTarget, { reuseConnection: request.follow }),
                remoteCommandWithCwd(
                  dockerComposeLogsCommand({
                    composeFile,
                    request,
                  }),
                  cwd,
                ),
              ],
              command: "ssh_compose_logs",
              context: logContext,
              executionContext: context,
              request,
              signal,
              spawnProcess: this.spawnProcess,
              boundedProcessTimeoutMs: this.boundedProcessTimeoutMs,
              cleanupBackend: sshTarget.cleanup,
            }),
          );
        }

        return ok(
          createProcessRuntimeLogStream({
            args: [
              "docker",
              "compose",
              "-f",
              composeFile,
              "logs",
              "--no-color",
              "--tail",
              String(request.tailLines),
              ...(request.follow ? ["--follow"] : []),
              ...(request.serviceName ? [request.serviceName] : []),
            ],
            ...(cwd ? { cwd } : {}),
            command: "docker_compose_logs",
            context: logContext,
            executionContext: context,
            request,
            signal,
            spawnProcess: this.spawnProcess,
            boundedProcessTimeoutMs: this.boundedProcessTimeoutMs,
          }),
        );
      }
    }
  }

  private async resolveSshTarget(
    context: ExecutionContext,
    logContext: ResourceRuntimeLogContext,
  ): Promise<Result<SshRuntimeLogTarget | null>> {
    if (!isGenericSshRuntime(logContext)) {
      return ok(null);
    }

    const target = logContext.deployment.runtimePlan.target;
    const serverId = target.serverIds[0];
    const metadataHost =
      metadataValue(logContext, "host") ?? targetMetadataValue(logContext, "serverHost");
    let host = metadataHost;
    let port = targetMetadataValue(logContext, "serverPort") ?? "22";
    let identityFile: string | undefined;
    let cleanup = async () => {};

    if (this.serverRepository && serverId) {
      const server = await this.serverRepository.findOne(
        toRepositoryContext(context),
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate(serverId)),
      );
      const serverState = server?.toState();

      if (serverState) {
        const username = serverState.credential?.username?.value;
        host = username
          ? hostWithUsername(serverState.host.value, username)
          : (metadataHost ?? serverState.host.value);
        port = String(serverState.port.value);

        const privateKey = serverState.credential?.privateKey?.value;
        if (serverState.credential?.kind.value === "ssh-private-key" && privateKey) {
          const identity = await writeSshIdentityFile(privateKey);
          identityFile = identity.identityFile;
          cleanup = identity.cleanup;
        }
      }
    }

    if (!host) {
      return err(
        domainError.resourceRuntimeLogsUnavailable("SSH runtime target is not available", {
          phase: "runtime-instance-resolution",
          step: "ssh-runtime-target",
          resourceId: logContext.resource.id,
          deploymentId: logContext.deployment.id,
          runtimeKind: runtimeKind(logContext),
          ...(serverId ? { targetId: serverId } : {}),
        }),
      );
    }

    return ok({
      host,
      port,
      ...(identityFile ? { identityFile } : {}),
      cleanup,
    });
  }
}
