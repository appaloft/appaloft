import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { domainError } from "@appaloft/core";
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

function parseRendererEvent(value: unknown): WorkspaceControlRendererEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case "select":
      return typeof record.workspaceId === "string"
        ? { type: "select", workspaceId: record.workspaceId }
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
            terminate: () => {
              child.kill("SIGTERM");
            },
          };
        },
      });
    },
  });
}
