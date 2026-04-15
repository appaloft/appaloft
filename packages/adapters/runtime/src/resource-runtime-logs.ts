import { domainError, err, ok, type Result } from "@yundu/core";
import {
  type ExecutionContext,
  type ResourceRuntimeLogContext,
  type ResourceRuntimeLogEvent,
  type ResourceRuntimeLogLine,
  type ResourceRuntimeLogReader,
  type ResourceRuntimeLogRequest,
  type ResourceRuntimeLogStream,
  type ResourceRuntimeLogStreamName,
} from "@yundu/application";

type RuntimeLogCloseReason = "completed" | "cancelled" | "source-ended";

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
  cwd?: string;
  context: ResourceRuntimeLogContext;
  signal: AbortSignal;
}): ResourceRuntimeLogStream {
  const queue = new RuntimeLogEventQueue();
  let sequence = 0;
  const subprocess = Bun.spawn(input.args, {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stream = new QueueResourceRuntimeLogStream(queue, () => {
    subprocess.kill();
  });
  const nextSequence = () => {
    sequence += 1;
    return sequence;
  };
  const abort = () => {
    void stream.close();
  };

  input.signal.addEventListener("abort", abort, { once: true });

  void Promise.all([
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
  ]).catch((error: unknown) => {
    stream.fail(
      createStreamFailure(
        error instanceof Error ? error.message : String(error),
        input.context,
        "process-stream-read",
      ),
    );
  });

  void subprocess.exited.then((exitCode) => {
    input.signal.removeEventListener("abort", abort);
    if (input.signal.aborted) {
      stream.complete("cancelled");
      return;
    }

    if (exitCode === 0) {
      stream.complete("source-ended");
      return;
    }

    stream.fail(
      createStreamFailure(
        `Runtime log process exited with code ${exitCode}`,
        input.context,
        "process-exit",
      ),
    );
  });

  return stream;
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
  async open(
    _context: ExecutionContext,
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
            context: logContext,
            signal,
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
            context: logContext,
            signal,
          }),
        );
      }
    }
  }
}
