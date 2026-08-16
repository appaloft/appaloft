import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { domainError } from "@appaloft/core";
import { occupancyBrowserLaunchAllowed } from "./occupancy-chrome.js";
import {
  createBoundedOperatePresentation,
  type OperateAction,
  type OperatePresentation,
  type OperateRendererSession,
} from "./operate-presentation.js";
import {
  createBoundedWorkspaceControlPresentation,
  type WorkspaceControlPresentation,
  type WorkspaceControlRendererEvent,
  type WorkspaceControlRendererSession,
} from "./workspace-control-presentation.js";

const loopbackHost = "127.0.0.1";
const maxProtocolLineBytes = 1_048_576;
const rendererConnectTimeoutMs = 5_000;
const rendererExitTimeoutMs = 1_000;

export interface WorkspaceControlRendererProcess {
  readonly exited: Promise<void>;
  terminate(): void;
}

export interface WorkspaceControlRendererLaunchInput {
  readonly host: typeof loopbackHost;
  readonly port: number;
  readonly token: string;
}

export interface OpenLoopbackWorkspaceControlRendererInput {
  launch(input: WorkspaceControlRendererLaunchInput): Promise<WorkspaceControlRendererProcess>;
}

class AsyncEventQueue<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private ended = false;

  push(value: T): void {
    if (this.ended) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.values.push(value);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  iterable(): AsyncIterable<T> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          const value = this.values.shift();
          if (value !== undefined) return Promise.resolve({ done: false as const, value });
          if (this.ended) return Promise.resolve({ done: true as const, value: undefined });
          return new Promise<IteratorResult<T>>((resolveNext) => this.waiters.push(resolveNext));
        },
      }),
    };
  }
}

function rendererError(message: string, reason: string, details?: Record<string, unknown>) {
  return domainError.infra(message, {
    phase: "workspace-control-renderer",
    reason,
    ...details,
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose) => {
    if (!server.listening) {
      resolveClose();
      return;
    }
    server.close(() => resolveClose());
  });
}

function tokenMatches(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string") return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function boundedText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= max && !value.includes("\0")
  );
}

function parseRendererEvent(value: unknown): WorkspaceControlRendererEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const operateAction = (): OperateAction | undefined => {
    const action = record.action;
    if (!action || typeof action !== "object") return undefined;
    const candidate = action as Record<string, unknown>;
    if (!boundedText(candidate.resourceId, 160) || !boundedText(candidate.kind, 40)) {
      return undefined;
    }
    if (candidate.kind === "retry" || candidate.kind === "redeploy") {
      return boundedText(candidate.deploymentId, 160)
        ? {
            kind: candidate.kind,
            resourceId: candidate.resourceId,
            deploymentId: candidate.deploymentId,
          }
        : undefined;
    }
    if (candidate.kind === "rollback") {
      return boundedText(candidate.deploymentId, 160) &&
        boundedText(candidate.candidateDeploymentId, 160)
        ? {
            kind: candidate.kind,
            resourceId: candidate.resourceId,
            deploymentId: candidate.deploymentId,
            candidateDeploymentId: candidate.candidateDeploymentId,
          }
        : undefined;
    }
    if (candidate.kind === "backup-create") {
      return boundedText(candidate.storageVolumeId, 160) && boundedText(candidate.policyId, 160)
        ? {
            kind: candidate.kind,
            resourceId: candidate.resourceId,
            storageVolumeId: candidate.storageVolumeId,
            policyId: candidate.policyId,
          }
        : undefined;
    }
    if (candidate.kind === "restore-independent") {
      return boundedText(candidate.backupId, 160) &&
        (candidate.restoredVolumeName === undefined ||
          boundedText(candidate.restoredVolumeName, 160))
        ? {
            kind: candidate.kind,
            resourceId: candidate.resourceId,
            backupId: candidate.backupId,
            ...(typeof candidate.restoredVolumeName === "string"
              ? { restoredVolumeName: candidate.restoredVolumeName }
              : {}),
          }
        : undefined;
    }
    return undefined;
  };
  switch (record.type) {
    case "operate-select":
      return boundedText(record.resourceId, 160)
        ? { type: "operate-select", resourceId: record.resourceId }
        : undefined;
    case "operate-refresh":
      return { type: "operate-refresh" };
    case "operate-preview-action": {
      const action = operateAction();
      return action ? { type: "operate-preview-action", action } : undefined;
    }
    case "operate-confirm-action": {
      const action = operateAction();
      return action && boundedText(record.token, 160)
        ? { type: "operate-confirm-action", token: record.token, action }
        : undefined;
    }
    case "operate-quit":
      return { type: "operate-quit" };
    case "development-refresh":
      return { type: "development-refresh" };
    case "development-restart":
      return { type: "development-restart" };
    case "development-stop":
      return { type: "development-stop" };
    case "development-detach":
      return { type: "development-detach" };
    case "select":
      return typeof record.workspaceId === "string"
        ? { type: "select", workspaceId: record.workspaceId }
        : undefined;
    case "open-pr":
      return typeof record.workspaceId === "string"
        ? { type: "open-pr", workspaceId: record.workspaceId }
        : undefined;
    case "refresh":
      return typeof record.workspaceId === "string"
        ? { type: "refresh", workspaceId: record.workspaceId }
        : { type: "refresh" };
    case "attach":
      return typeof record.workspaceId === "string" && typeof record.runtimeId === "string"
        ? { type: "attach", workspaceId: record.workspaceId, runtimeId: record.runtimeId }
        : undefined;
    case "lifecycle-action":
      return typeof record.workspaceId === "string" &&
        (record.action === "pause" || record.action === "resume" || record.action === "terminate")
        ? {
            type: "lifecycle-action",
            workspaceId: record.workspaceId,
            action: record.action,
          }
        : undefined;
    case "snapshot-create":
      return boundedText(record.workspaceId, 160) &&
        (record.capability === "filesystem" || record.capability === "filesystem-memory") &&
        (record.ttlDays === 1 || record.ttlDays === 7 || record.ttlDays === 30)
        ? {
            type: "snapshot-create",
            workspaceId: record.workspaceId,
            capability: record.capability,
            ttlDays: record.ttlDays,
          }
        : undefined;
    case "snapshot-delete":
      return boundedText(record.workspaceId, 160) && boundedText(record.snapshotId, 160)
        ? {
            type: "snapshot-delete",
            workspaceId: record.workspaceId,
            snapshotId: record.snapshotId,
          }
        : undefined;
    case "preview-expose":
      return typeof record.workspaceId === "string" &&
        typeof record.port === "number" &&
        Number.isInteger(record.port) &&
        record.port >= 1 &&
        record.port <= 65_535 &&
        (record.visibility === "private" ||
          record.visibility === "organization" ||
          record.visibility === "public") &&
        (record.ttlMinutes === 60 || record.ttlMinutes === 480 || record.ttlMinutes === 1440)
        ? {
            type: "preview-expose",
            workspaceId: record.workspaceId,
            port: record.port,
            visibility: record.visibility,
            ttlMinutes: record.ttlMinutes,
          }
        : undefined;
    case "preview-revoke":
      return boundedText(record.workspaceId, 160) && boundedText(record.exposureId, 160)
        ? { type: "preview-revoke", workspaceId: record.workspaceId, exposureId: record.exposureId }
        : undefined;
    case "task-approve":
      return boundedText(record.workspaceId, 160) && boundedText(record.taskRunId, 160)
        ? { type: "task-approve", workspaceId: record.workspaceId, taskRunId: record.taskRunId }
        : undefined;
    case "task-deliver": {
      if (
        !boundedText(record.workspaceId, 160) ||
        !boundedText(record.taskRunId, 160) ||
        !boundedText(record.branch, 512) ||
        !boundedText(record.commitMessage, 512) ||
        !boundedText(record.remote, 120)
      ) {
        return undefined;
      }
      const pullRequest = record.pullRequest;
      if (pullRequest !== undefined) {
        if (!pullRequest || typeof pullRequest !== "object") return undefined;
        const pr = pullRequest as Record<string, unknown>;
        if (
          !boundedText(pr.title, 256) ||
          (pr.body !== undefined && (typeof pr.body !== "string" || pr.body.length > 16_384)) ||
          (pr.base !== undefined && !boundedText(pr.base, 512))
        ) {
          return undefined;
        }
        return {
          type: "task-deliver",
          workspaceId: record.workspaceId,
          taskRunId: record.taskRunId,
          branch: record.branch,
          commitMessage: record.commitMessage,
          remote: record.remote,
          pullRequest: {
            title: pr.title,
            ...(typeof pr.body === "string" ? { body: pr.body } : {}),
            ...(typeof pr.base === "string" ? { base: pr.base } : {}),
          },
        };
      }
      return {
        type: "task-deliver",
        workspaceId: record.workspaceId,
        taskRunId: record.taskRunId,
        branch: record.branch,
        commitMessage: record.commitMessage,
        remote: record.remote,
      };
    }
    case "promotion-accept":
    case "promotion-retry":
      return boundedText(record.workspaceId, 160) && boundedText(record.promotionId, 160)
        ? {
            type: record.type,
            workspaceId: record.workspaceId,
            promotionId: record.promotionId,
          }
        : undefined;
    case "terminal-input":
      return typeof record.data === "string"
        ? { type: "terminal-input", data: record.data }
        : undefined;
    case "terminal-resize":
      return typeof record.cols === "number" && typeof record.rows === "number"
        ? { type: "terminal-resize", cols: record.cols, rows: record.rows }
        : undefined;
    case "terminal-reconnect":
      return { type: "terminal-reconnect" };
    case "detach":
      return { type: "detach" };
    case "quit":
      return { type: "quit" };
    default:
      return undefined;
  }
}

function listen(server: Server): Promise<number> {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error: Error) => rejectListen(error);
    server.once("error", onError);
    server.listen({ host: loopbackHost, port: 0, exclusive: true }, () => {
      server.off("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectListen(rendererError("Renderer listener has no TCP address", "listener-address"));
        return;
      }
      resolveListen(address.port);
    });
  });
}

function writeMessage(socket: Socket, message: unknown): Promise<void> {
  return new Promise((resolveWrite, rejectWrite) => {
    socket.write(`${JSON.stringify(message)}\n`, (error) => {
      if (error) rejectWrite(error);
      else resolveWrite();
    });
  });
}

function waitWithTimeout<T>(promise: Promise<T>, timeoutMs: number, error: unknown): Promise<T> {
  return new Promise((resolveWait, rejectWait) => {
    const timer = setTimeout(() => rejectWait(error), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolveWait(value);
      },
      (reason) => {
        clearTimeout(timer);
        rejectWait(reason);
      },
    );
  });
}

export async function openLoopbackWorkspaceControlRenderer(
  input: OpenLoopbackWorkspaceControlRendererInput,
): Promise<WorkspaceControlRendererSession> {
  const token = randomBytes(32).toString("hex");
  const events = new AsyncEventQueue<WorkspaceControlRendererEvent>();
  let authenticatedSocket: Socket | undefined;
  let resolveAuthenticated!: (socket: Socket) => void;
  let rejectAuthenticated!: (error: unknown) => void;
  const authenticated = new Promise<Socket>((resolveAuth, rejectAuth) => {
    resolveAuthenticated = resolveAuth;
    rejectAuthenticated = rejectAuth;
  });
  const server = createServer();
  server.maxConnections = 1;
  server.on("connection", (socket) => {
    if (authenticatedSocket) {
      socket.destroy();
      return;
    }
    socket.setEncoding("utf8");
    socket.setNoDelay(true);
    let authenticatedClient = false;
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      if (Buffer.byteLength(buffer) > maxProtocolLineBytes) {
        rejectAuthenticated(rendererError("Renderer protocol line is too large", "line-limit"));
        socket.destroy();
        return;
      }
      while (buffer.includes("\n")) {
        const newline = buffer.indexOf("\n");
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          if (!authenticatedClient)
            rejectAuthenticated(rendererError("Renderer handshake is invalid", "handshake-json"));
          socket.destroy();
          return;
        }
        const record = parsed as Record<string, unknown>;
        if (!authenticatedClient) {
          if (record.type !== "hello" || !tokenMatches(record.token, token)) {
            rejectAuthenticated(rendererError("Renderer authentication failed", "handshake-auth"));
            socket.destroy();
            return;
          }
          authenticatedClient = true;
          authenticatedSocket = socket;
          void writeMessage(socket, { type: "hello-ok" }).then(
            () => resolveAuthenticated(socket),
            rejectAuthenticated,
          );
          void closeServer(server);
          continue;
        }
        const event = parseRendererEvent(parsed);
        if (event) events.push(event);
      }
    });
    socket.on("close", () => events.end());
    socket.on("error", (error) => {
      if (!authenticatedClient) rejectAuthenticated(error);
      events.end();
    });
  });

  let process: WorkspaceControlRendererProcess | undefined;
  try {
    const port = await listen(server);
    process = await input.launch({ host: loopbackHost, port, token });
    void process.exited.then(
      () => events.end(),
      () => events.end(),
    );
    const exitedBeforeAuthentication = process.exited.then<never>(
      () => {
        throw rendererError("Renderer exited before authentication", "process-exited");
      },
      () => {
        throw rendererError("Renderer failed before authentication", "process-failed");
      },
    );
    const socket = await waitWithTimeout(
      Promise.race([authenticated, exitedBeforeAuthentication]),
      rendererConnectTimeoutMs,
      rendererError("Renderer did not connect", "connect-timeout"),
    );
    let closed = false;
    return {
      send: (message) => writeMessage(socket, message),
      events: () => events.iterable(),
      close: async () => {
        if (closed) return;
        closed = true;
        events.end();
        try {
          if (!socket.destroyed) {
            await writeMessage(socket, { type: "shutdown" });
            socket.end();
          }
          await waitWithTimeout(
            process?.exited ?? Promise.resolve(),
            rendererExitTimeoutMs,
            rendererError("Renderer did not exit after shutdown", "exit-timeout"),
          );
        } catch {
          process?.terminate();
        } finally {
          socket.destroy();
          await closeServer(server);
        }
      },
    };
  } catch (error) {
    process?.terminate();
    authenticatedSocket?.destroy();
    await closeServer(server);
    throw error;
  }
}

export function resolveWorkspaceControlRendererBinary(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const executable =
    process.platform === "win32" ? "appaloft-workspace-tui.exe" : "appaloft-workspace-tui";
  const configured = environment.APPALOFT_WORKSPACE_TUI_BINARY;
  const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const candidates = [
    ...(configured ? [isAbsolute(configured) ? configured : resolve(configured)] : []),
    join(dirname(process.execPath), executable),
    join(moduleRoot, "apps", "workspace-control-tui", "target", "release", executable),
    join(moduleRoot, "apps", "workspace-control-tui", "target", "debug", executable),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

export interface RatatuiWorkspaceControlPresentationInput {
  readonly binaryPath?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export function createRatatuiWorkspaceControlPresentation(
  input: RatatuiWorkspaceControlPresentationInput = {},
): WorkspaceControlPresentation {
  return createBoundedWorkspaceControlPresentation({
    openRenderer: async () => {
      const environment = input.environment ?? process.env;
      const binaryPath = input.binaryPath ?? resolveWorkspaceControlRendererBinary(environment);
      if (!binaryPath) {
        throw rendererError("Workspace renderer is unavailable", "binary-missing", {
          platform: process.platform,
          architecture: process.arch,
        });
      }
      return openLoopbackWorkspaceControlRenderer({
        launch: async ({ port, token }) => {
          const child = spawn(binaryPath, [], {
            shell: false,
            stdio: "inherit",
            env: {
              ...environment,
              APPALOFT_WORKSPACE_TUI_PORT: String(port),
              APPALOFT_WORKSPACE_TUI_TOKEN: token,
            },
          });
          const exited = new Promise<void>((resolveExit, rejectExit) => {
            child.once("error", rejectExit);
            child.once("exit", () => resolveExit());
          });
          return {
            exited,
            terminate() {
              child.kill();
            },
          };
        },
      });
    },
    openUrl: async (url) => {
      const environment = input.environment ?? process.env;
      if (!occupancyBrowserLaunchAllowed(environment)) return false;
      const command =
        process.platform === "darwin"
          ? ["open", url]
          : process.platform === "win32"
            ? ["cmd", "/c", "start", "", url]
            : ["xdg-open", url];
      const child = spawn(command[0]!, command.slice(1), {
        shell: false,
        stdio: "ignore",
      });
      child.unref();
      return true;
    },
  });
}

export function createRatatuiOperatePresentation(
  input: RatatuiWorkspaceControlPresentationInput = {},
): OperatePresentation {
  return createBoundedOperatePresentation({
    openRenderer: async () => {
      const environment = input.environment ?? process.env;
      const binaryPath = input.binaryPath ?? resolveWorkspaceControlRendererBinary(environment);
      if (!binaryPath) {
        throw rendererError("Operate renderer is unavailable", "binary-missing", {
          platform: process.platform,
          architecture: process.arch,
        });
      }
      const renderer = await openLoopbackWorkspaceControlRenderer({
        launch: async ({ port, token }) => {
          const child = spawn(binaryPath, [], {
            shell: false,
            stdio: "inherit",
            env: {
              ...environment,
              APPALOFT_TUI_MODE: "operate",
              APPALOFT_WORKSPACE_TUI_PORT: String(port),
              APPALOFT_WORKSPACE_TUI_TOKEN: token,
            },
          });
          const exited = new Promise<void>((resolveExit, rejectExit) => {
            child.once("error", rejectExit);
            child.once("exit", () => resolveExit());
          });
          return { exited, terminate: () => child.kill("SIGTERM") };
        },
      });
      return renderer as unknown as OperateRendererSession;
    },
  });
}
