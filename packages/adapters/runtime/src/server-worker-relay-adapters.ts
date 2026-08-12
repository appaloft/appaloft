import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import type {
  DevelopmentPlan,
  DevelopmentSessionRuntime,
  DevelopmentSessionView,
  SandboxTerminalProcess,
} from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import type {
  ServerWorkerDispatchRequest,
  ServerWorkerDispatchResult,
  ServerWorkerRelayStream,
} from "@appaloft/server-worker-relay";
import {
  createBoundedServerWorkerSourceArchive,
  materializeBoundedServerWorkerSourceArchive,
  type BoundedServerWorkerSourceArchive,
} from "@appaloft/server-worker-relay";

import type { SandboxDockerCommandResult, SandboxDockerCommandRunner } from "./docker-sandbox-provider";

interface RelayRequester {
  request(input: {
    workerId: string;
    generation: number;
    requestId: string;
    capability: "runtime.dev" | "runtime.docker";
    payload: unknown;
  }): Promise<Result<ServerWorkerDispatchResult>>;
}

interface RelayStreamRequester {
  openStream(input: {
    workerId: string;
    generation: number;
    streamId: string;
    capability: "process.pty";
    payload: unknown;
    onData(data: Uint8Array): void | Promise<void>;
    onControl?(payload: unknown): void | Promise<void>;
    onClose?(): void | Promise<void>;
  }): Promise<Result<ServerWorkerRelayStream>>;
}

function relayAdapterError(message: string, phase: string): DomainError {
  return {
    code: "server_worker_request_failed",
    category: "infra",
    message,
    retryable: true,
    details: { phase },
  };
}

function encodeValue(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

function decodeValue(value: ServerWorkerDispatchResult, phase: string): Result<unknown> {
  if (typeof value.data !== "string") return err(relayAdapterError("Worker response body is missing", phase));
  try {
    return ok(JSON.parse(Buffer.from(value.data, "base64").toString("utf8")));
  } catch {
    return err(relayAdapterError("Worker response body is invalid", phase));
  }
}

export class RelayDevelopmentSessionRuntime implements DevelopmentSessionRuntime {
  constructor(
    private readonly options: {
      workerId: string;
      generation: number;
      request: RelayRequester["request"];
      sourceTransfer?: boolean;
    },
  ) {}

  async #invoke(operation: "start" | "status" | "logs" | "stop" | "reset", input: unknown): Promise<Result<unknown>> {
    let sourceArchive: BoundedServerWorkerSourceArchive | undefined;
    if (operation === "start" && this.options.sourceTransfer) {
      const plan = (input as { plan?: DevelopmentPlan }).plan;
      if (!plan) return err(relayAdapterError("Remote Development Plan is missing", "server-worker-development-start"));
      const archived = await createBoundedServerWorkerSourceArchive(plan.sourceRoot);
      if (archived.isErr()) return err(archived.error);
      sourceArchive = archived.value;
    }
    const response = await this.options.request({
      workerId: this.options.workerId,
      generation: this.options.generation,
      requestId: `dev-${randomUUID()}`,
      capability: "runtime.dev",
      payload: { operation, input, ...(sourceArchive ? { sourceArchive } : {}) },
    });
    if (response.isErr()) return err(response.error);
    return decodeValue(response.value, `server-worker-development-${operation}`);
  }

  async start(input: {
    plan: DevelopmentPlan;
    detach: boolean;
    envFiles: readonly string[];
    environmentOverlay: Readonly<Record<string, string>>;
    https?: boolean;
    trust?: boolean;
  }): Promise<Result<DevelopmentSessionView>> {
    const result = await this.#invoke("start", input);
    return result.isErr() ? err(result.error) : ok(result.value as DevelopmentSessionView);
  }

  status(input: { sourceRoot: string }): Promise<Result<unknown>> {
    return this.#invoke("status", input);
  }

  logs(input: { sourceRoot: string; follow: boolean; tail: number }): Promise<Result<unknown>> {
    return this.#invoke("logs", input);
  }

  stop(input: { sourceRoot: string }): Promise<Result<unknown>> {
    return this.#invoke("stop", input);
  }

  reset(input: { sourceRoot: string }): Promise<Result<unknown>> {
    return this.#invoke("reset", input);
  }
}

export class ControlPlaneDevelopmentSessionRuntime implements DevelopmentSessionRuntime {
  constructor(
    private readonly options: {
      baseUrl: string;
      serverId: string;
      headers: Readonly<Record<string, string>>;
      planResolver(input: { sourceRoot: string; configFilePath?: string }): Promise<Result<DevelopmentPlan>>;
      fetch?: typeof fetch;
    },
  ) {}

  plan(input: { sourceRoot: string; configFilePath?: string }): Promise<Result<DevelopmentPlan>> {
    return this.options.planResolver(input);
  }

  async #invoke(
    operation: "start" | "status" | "logs" | "stop" | "reset",
    input: unknown,
    sourceArchive?: BoundedServerWorkerSourceArchive,
  ): Promise<Result<unknown>> {
    try {
      const response = await (this.options.fetch ?? fetch)(
        new URL(
          `/cloud/server-workers/by-server/${encodeURIComponent(this.options.serverId)}/development/${operation}`,
          this.options.baseUrl,
        ),
        {
          method: "POST",
          headers: {
            ...this.options.headers,
            "content-type": "application/json",
          },
          body: JSON.stringify({ input, ...(sourceArchive ? { sourceArchive } : {}) }),
        },
      );
      const body = await response.json() as unknown;
      if (!response.ok) {
        const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
        return err(relayAdapterError(
          typeof record.message === "string"
            ? record.message
            : typeof record.reason === "string"
              ? record.reason
              : "Cloud Development request failed",
          `server-worker-development-${operation}`,
        ));
      }
      return ok(body);
    } catch (error) {
      return err(relayAdapterError(
        error instanceof Error ? error.message : String(error),
        `server-worker-development-${operation}`,
      ));
    }
  }

  async start(input: {
    plan: DevelopmentPlan;
    detach: boolean;
    envFiles: readonly string[];
    environmentOverlay: Readonly<Record<string, string>>;
    https?: boolean;
    trust?: boolean;
  }): Promise<Result<DevelopmentSessionView>> {
    const archived = await createBoundedServerWorkerSourceArchive(input.plan.sourceRoot);
    if (archived.isErr()) return err(archived.error);
    const result = await this.#invoke("start", input, archived.value);
    return result.isErr() ? err(result.error) : ok(result.value as DevelopmentSessionView);
  }

  status(input: { sourceRoot: string }): Promise<Result<unknown>> {
    return this.#invoke("status", input);
  }

  logs(input: { sourceRoot: string; follow: boolean; tail: number }): Promise<Result<unknown>> {
    return this.#invoke("logs", input);
  }

  stop(input: { sourceRoot: string }): Promise<Result<unknown>> {
    return this.#invoke("stop", input);
  }

  reset(input: { sourceRoot: string }): Promise<Result<unknown>> {
    return this.#invoke("reset", input);
  }
}

function remoteDevelopmentRoot(root: string, sourceRoot: string): string {
  return join(
    resolve(root),
    createHash("sha256").update(resolve(sourceRoot)).digest("hex").slice(0, 24),
  );
}

function remapDevelopmentPlan(plan: DevelopmentPlan, targetRoot: string): Result<DevelopmentPlan> {
  const sourceRoot = resolve(plan.sourceRoot);
  const mapPath = (path: string): Result<string> => {
    const child = relative(sourceRoot, resolve(path));
    if (child.startsWith("..") || isAbsolute(child)) {
      return err(relayAdapterError("Remote Development path escapes the transferred source", "server-worker-development-source"));
    }
    return ok(resolve(targetRoot, child));
  };
  const services: DevelopmentPlan["services"][number][] = [];
  for (const service of plan.services) {
    const workingDirectory = mapPath(service.workingDirectory);
    if (workingDirectory.isErr()) return err(workingDirectory.error);
    services.push({ ...service, workingDirectory: workingDirectory.value });
  }
  let configFilePath: string | null = null;
  if (plan.configFilePath) {
    const mappedConfig = mapPath(plan.configFilePath);
    if (mappedConfig.isErr()) return err(mappedConfig.error);
    configFilePath = mappedConfig.value;
  }
  return ok({ ...plan, sourceRoot: targetRoot, configFilePath, services });
}

export function createRelayDevelopmentHandler(
  runtime: DevelopmentSessionRuntime,
  options: { sourceRoot: string; allowHostShell?: boolean } | undefined = undefined,
) {
  return async (request: ServerWorkerDispatchRequest): Promise<Result<ServerWorkerDispatchResult>> => {
    const payload = request.payload as {
      operation?: unknown;
      input?: unknown;
      sourceArchive?: BoundedServerWorkerSourceArchive;
    };
    let result: Result<unknown>;
    let transferredRoot: string | undefined;
    if (payload.operation === "start") {
      let startInput = payload.input as Parameters<DevelopmentSessionRuntime["start"]>[0];
      if (
        options?.allowHostShell !== true &&
        startInput.plan.services.some((service) => {
          const command = service.commandArgs ?? service.commandIntent.trim().split(/\s+/);
          const cleanup = service.cleanupArgs;
          const isCompose = (argv: readonly string[]) =>
            argv[0] === "docker" && argv[1] === "compose";
          return !isCompose(command) || (cleanup !== undefined && !isCompose(cleanup));
        })
      ) {
        return err(
          relayAdapterError(
            "Worker host Development commands require explicit owner opt-in",
            "server-worker-development-host-shell",
          ),
        );
      }
      if (payload.sourceArchive) {
        if (!options) return err(relayAdapterError("Worker Development source root is not configured", "server-worker-development-source"));
        const targetRoot = remoteDevelopmentRoot(options.sourceRoot, startInput.plan.sourceRoot);
        const materialized = await materializeBoundedServerWorkerSourceArchive(payload.sourceArchive, targetRoot);
        if (materialized.isErr()) return err(materialized.error);
        const plan = remapDevelopmentPlan(startInput.plan, targetRoot);
        if (plan.isErr()) return err(plan.error);
        startInput = { ...startInput, plan: plan.value };
        transferredRoot = targetRoot;
      }
      result = await runtime.start(startInput);
    } else if (payload.operation === "status") {
      const input = payload.input as Parameters<DevelopmentSessionRuntime["status"]>[0];
      result = await runtime.status(options ? { sourceRoot: remoteDevelopmentRoot(options.sourceRoot, input.sourceRoot) } : input);
    } else if (payload.operation === "logs") {
      const input = payload.input as Parameters<DevelopmentSessionRuntime["logs"]>[0];
      result = await runtime.logs(options ? { ...input, sourceRoot: remoteDevelopmentRoot(options.sourceRoot, input.sourceRoot) } : input);
    } else if (payload.operation === "stop") {
      const input = payload.input as Parameters<DevelopmentSessionRuntime["stop"]>[0];
      result = await runtime.stop(options ? { sourceRoot: remoteDevelopmentRoot(options.sourceRoot, input.sourceRoot) } : input);
    } else if (payload.operation === "reset") {
      const input = payload.input as Parameters<DevelopmentSessionRuntime["reset"]>[0];
      const targetRoot = options ? remoteDevelopmentRoot(options.sourceRoot, input.sourceRoot) : undefined;
      result = await runtime.reset(targetRoot ? { sourceRoot: targetRoot } : input);
      if (result.isOk() && targetRoot) await rm(targetRoot, { recursive: true, force: true });
    } else {
      return err(relayAdapterError("Worker Development operation is invalid", "server-worker-development"));
    }
    if (result.isErr() && transferredRoot) await rm(transferredRoot, { recursive: true, force: true });
    return result.isErr()
      ? err(result.error)
      : ok({ requestId: request.requestId, data: encodeValue(result.value) });
  };
}

export class RelaySandboxDockerCommandRunner implements SandboxDockerCommandRunner {
  constructor(
    private readonly options: {
      workerId: string;
      generation: number;
      relay: RelayRequester & RelayStreamRequester;
    },
  ) {}

  async run(
    argv: readonly string[],
    input: { stdin?: Uint8Array; timeoutMs?: number } = {},
  ): Promise<SandboxDockerCommandResult> {
    const response = await this.options.relay.request({
      workerId: this.options.workerId,
      generation: this.options.generation,
      requestId: `docker-${randomUUID()}`,
      capability: "runtime.docker",
      payload: {
        argv,
        ...(input.stdin ? { stdin: Buffer.from(input.stdin).toString("base64") } : {}),
        ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      },
    });
    if (response.isErr()) throw new Error(response.error.message);
    return {
      exitCode: response.value.exitCode ?? 1,
      stdout: new TextEncoder().encode(response.value.stdout ?? ""),
      stderr: response.value.stderr ?? "",
    };
  }

  async openTerminal(
    argv: readonly string[],
    input: { initialRows: number; initialCols: number },
  ): Promise<SandboxTerminalProcess> {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let resolveExit: (exitCode: number) => void = () => undefined;
    const exited = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });
    const stdout = new ReadableStream<Uint8Array>({
      start(nextController) {
        controller = nextController;
      },
    });
    let closed = false;
    const opened = await this.options.relay.openStream({
      workerId: this.options.workerId,
      generation: this.options.generation,
      streamId: `pty-${randomUUID()}`,
      capability: "process.pty",
      payload: { argv, cwd: process.cwd(), rows: input.initialRows, cols: input.initialCols },
      onData(data) {
        if (!closed) controller?.enqueue(data);
      },
      onControl(payload) {
        if (payload && typeof payload === "object" && "exitCode" in payload) {
          resolveExit(Number((payload as { exitCode: unknown }).exitCode));
        }
      },
      onClose() {
        if (closed) return;
        closed = true;
        controller?.close();
        resolveExit(0);
      },
    });
    if (opened.isErr()) throw new Error(opened.error.message);
    const stream = opened.value;
    const close = () => {
      if (closed) return;
      closed = true;
      controller?.close();
      resolveExit(0);
      void stream.close();
    };
    return {
      stdin: {
        write: async (data) => {
          const written = await stream.write(
            typeof data === "string" ? new TextEncoder().encode(data) : data,
          );
          if (written.isErr()) throw new Error(written.error.message);
        },
        end: close,
      },
      stdout,
      stderr: null,
      exited,
      kill: close,
      resize: (rows, cols) => {
        void stream.control({ kind: "resize", rows, cols });
      },
      cleanup: async () => close(),
    };
  }
}

export function createRelaySandboxDockerHandler(runner: SandboxDockerCommandRunner) {
  return async (request: ServerWorkerDispatchRequest): Promise<Result<ServerWorkerDispatchResult>> => {
    const payload = request.payload as { argv?: unknown; stdin?: unknown; timeoutMs?: unknown };
    if (
      !Array.isArray(payload.argv) ||
      payload.argv.length < 1 ||
      payload.argv.length > 256 ||
      !payload.argv.every(
        (value) =>
          typeof value === "string" && value.length <= 4_096 && !value.includes("\0"),
      ) ||
      payload.argv.reduce((total, value) => total + String(value).length, 0) > 65_536 ||
      payload.argv[0] !== "docker"
    ) {
      return err(relayAdapterError("Worker Docker argv is invalid", "server-worker-docker"));
    }
    try {
      const result = await runner.run(payload.argv, {
        ...(typeof payload.stdin === "string" ? { stdin: Buffer.from(payload.stdin, "base64") } : {}),
        ...(Number.isInteger(payload.timeoutMs) ? { timeoutMs: Number(payload.timeoutMs) } : {}),
      });
      return ok({
        requestId: request.requestId,
        exitCode: result.exitCode,
        stdout: new TextDecoder().decode(result.stdout),
        stderr: result.stderr,
      });
    } catch (error) {
      return err(relayAdapterError(error instanceof Error ? error.message : String(error), "server-worker-docker"));
    }
  };
}
