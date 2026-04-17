import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type QueryBus,
  type TerminalSession,
  type TerminalSessionDescriptor,
  type TerminalSessionFrame,
  type TerminalSessionGateway,
  type TerminalSessionOpenRequest,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { ok, type Result } from "@appaloft/core";

import { createHttpApp } from "../src";

class TestTerminalSession implements TerminalSession {
  readonly writes: string[] = [];
  readonly resizes: Array<{ rows: number; cols: number }> = [];
  private readonly frames: TerminalSessionFrame[] = [
    {
      kind: "ready",
      sessionId: "term_test",
    },
  ];
  private readonly waiters: Array<(result: IteratorResult<TerminalSessionFrame>) => void> = [];
  private closed = false;

  async write(data: string): Promise<void> {
    this.writes.push(data);
  }

  async resize(input: { rows: number; cols: number }): Promise<void> {
    this.resizes.push(input);
  }

  async close(): Promise<void> {
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
        const frame = this.frames.shift();
        if (frame) {
          return Promise.resolve({ value: frame, done: false });
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

class TestTerminalSessionGateway implements TerminalSessionGateway {
  readonly session = new TestTerminalSession();
  attachedSessionId = "";

  async open(
    _context: ExecutionContext,
    request: TerminalSessionOpenRequest,
  ): Promise<Result<TerminalSessionDescriptor>> {
    return ok({
      sessionId: request.sessionId,
      scope: request.scope.kind,
      serverId: request.scope.server.id,
      transport: {
        kind: "websocket",
        path: `/api/terminal-sessions/${request.sessionId}/attach`,
      },
      providerKey: "local-shell",
      createdAt: new Date(0).toISOString(),
    });
  }

  attach(sessionId: string): Result<TerminalSession> {
    this.attachedSessionId = sessionId;
    return ok(this.session);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(predicate: () => boolean, failureMessage: string): Promise<void> {
  const deadline = Date.now() + 1_000;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await wait(10);
  }

  throw new Error(failureMessage);
}

function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("WebSocket did not open"));
    }, 1_000);

    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket failed to open"));
      },
      { once: true },
    );
  });
}

function waitForMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("WebSocket message was not received"));
    }, 1_000);

    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timeout);
        resolve(String(event.data));
      },
      { once: true },
    );
  });
}

describe("terminal session websocket", () => {
  test("routes client input frames to the attached terminal session", async () => {
    const terminalSessionGateway = new TestTerminalSessionGateway();
    const app = createHttpApp({
      config: resolveConfig({
        flags: {
          appVersion: "0.1.0-test",
          authProvider: "none",
          webStaticDir: "",
        },
      }),
      commandBus: {} as unknown as CommandBus,
      queryBus: {} as unknown as QueryBus,
      logger: {
        debug() {},
        error() {},
        info() {},
        warn() {},
      },
      executionContextFactory: {
        create(input) {
          return createExecutionContext(input);
        },
      },
      terminalSessionGateway,
    });

    app.listen({
      hostname: "127.0.0.1",
      port: 0,
    });

    const port = app.server?.port;
    if (typeof port !== "number") {
      throw new Error("HTTP test server did not expose a port");
    }

    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/terminal-sessions/term_test/attach`);

    try {
      await waitForOpen(socket);
      expect(JSON.parse(await waitForMessage(socket))).toEqual({
        kind: "ready",
        sessionId: "term_test",
      });

      socket.send(JSON.stringify({ kind: "input", data: "pwd\n" }));

      await waitFor(
        () => terminalSessionGateway.session.writes.includes("pwd\n"),
        "Input frame was not routed to terminal session",
      );
      expect(terminalSessionGateway.attachedSessionId).toBe("term_test");
    } finally {
      socket.close();
      app.server?.stop(true);
    }
  });
});
