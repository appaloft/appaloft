import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command,
  IssueSandboxAgentAttachAccessCommand,
  ListAgentTaskRunsQuery,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  ListSandboxPortsQuery,
  ListSandboxPromotionsQuery,
  type Query,
  ShowSandboxQuery,
  type TerminalSession,
  type TerminalSessionFrame,
} from "@appaloft/application";
import { ok } from "@appaloft/core";
import {
  createBoundedWorkspaceControlPresentation,
  type WorkspaceControlRendererEvent,
  type WorkspaceControlRendererMessage,
  type WorkspaceControlRendererSession,
} from "../src/workspace-control-presentation";

class FakeRendererSession implements WorkspaceControlRendererSession {
  readonly messages: WorkspaceControlRendererMessage[] = [];
  closed = 0;

  constructor(private readonly rendererEvents: readonly WorkspaceControlRendererEvent[]) {}

  send(message: WorkspaceControlRendererMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  async *events(): AsyncIterable<WorkspaceControlRendererEvent> {
    for (const event of this.rendererEvents) {
      yield event;
    }
  }

  close(): Promise<void> {
    this.closed += 1;
    return Promise.resolve();
  }
}

describe("Workspace control presentation", () => {
  test("[WS-TUI-QUERY-002][WS-TUI-DETAIL-003][WS-TUI-CAPABILITY-010] reads bounded existing state and derives actions from attach capabilities", async () => {
    const queries: Query<unknown>[] = [];
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_1" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });

    await presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        queries.push(query as Query<unknown>);
        if (query instanceof ListSandboxesQuery) {
          return ok({
            items: [
              {
                sandboxId: "sbx_1",
                status: "running",
                sourceKind: "template",
                source: { kind: "template", templateId: "tpl_agent" },
                requestedIsolation: "container-trusted",
                limits: {},
                networkPolicy: {},
                createdAt: "2026-08-11T00:00:00.000Z",
                providerKey: "registered-server",
                provisionAttempts: 1,
              },
            ],
          } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({
            sandboxId: "sbx_1",
            status: "running",
            sourceKind: "template",
            source: { kind: "template", templateId: "tpl_agent" },
            requestedIsolation: "container-trusted",
            limits: {},
            networkPolicy: {},
            createdAt: "2026-08-11T00:00:00.000Z",
            providerKey: "registered-server",
            provisionAttempts: 1,
          } as T);
        }
        if (query instanceof ListSandboxAgentRuntimesQuery) {
          return ok({
            items: [
              {
                runtimeId: "sar_pi",
                sandboxId: "sbx_1",
                harnessKey: "pi",
                harnessTemplateId: "pi-default",
                status: "running",
                interaction: { transport: "managed-terminal", sessionId: "term_1" },
                capabilities: {},
                createdAt: "2026-08-11T00:00:00.000Z",
              },
              {
                runtimeId: "sar_future",
                sandboxId: "sbx_1",
                harnessKey: "future-agent",
                harnessTemplateId: "future-default",
                status: "running",
                interaction: { transport: "native-attach", command: ["agent", "attach"] },
                capabilities: {},
                createdAt: "2026-08-11T00:00:00.000Z",
              },
            ],
          } as T);
        }
        if (query instanceof ListSandboxPortsQuery) {
          return ok({
            items: [
              {
                exposureId: "exp_preview",
                port: 3000,
                visibility: "private",
                url: "https://user:password@preview.example.test/path?token=secret#fragment",
                expiresAt: "2026-08-11T01:00:00.000Z",
                credential: "must-not-cross",
              },
            ],
          } as T);
        }
        if (query instanceof ListSandboxPromotionsQuery) {
          return ok({
            items: [
              {
                promotionId: "prm_1",
                status: "verified",
                proofVerdict: "verified",
                secret: "must-not-cross",
              },
            ],
          } as T);
        }
        if (query instanceof ListAgentTaskRunsQuery) {
          return ok({
            items: [
              {
                taskRunId: `task_${String((query as ListAgentTaskRunsQuery).input.runtimeId)}`,
                runtimeId: (query as ListAgentTaskRunsQuery).input.runtimeId,
                status: "running",
                credential: "must-not-cross",
              },
            ],
          } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    expect(queries.some((query) => query instanceof ListSandboxesQuery)).toBe(true);
    expect(queries.some((query) => query instanceof ShowSandboxQuery)).toBe(true);
    const detail = renderer.messages.find((message) => message.type === "detail");
    expect(detail).toMatchObject({
      type: "detail",
      workspace: {
        workspaceId: "sbx_1",
        status: "running",
        providerKey: "registered-server",
      },
      runtimes: [
        { runtimeId: "sar_pi", attach: { transport: "managed-terminal" } },
        { runtimeId: "sar_future", attach: { transport: "native-attach" } },
      ],
    });
    expect(detail?.type === "detail" ? detail.ports[0] : undefined).toMatchObject({
      exposureId: "exp_preview",
      url: "https://preview.example.test/path",
    });
    expect(detail?.type === "detail" ? detail.tasks[0]?.status : undefined).toBe("running");
    expect(detail?.type === "detail" ? detail.promotions[0] : undefined).toMatchObject({
      promotionId: "prm_1",
      proofVerdict: "verified",
    });
    expect(JSON.stringify(renderer.messages)).not.toContain("credential");
    expect(JSON.stringify(renderer.messages)).not.toContain("must-not-cross");
    expect(JSON.stringify(renderer.messages)).not.toContain("token=secret");
    expect(renderer.closed).toBe(1);
  });

  test("[WS-TUI-EMBED-004][WS-TUI-RECONNECT-007][WS-TUI-FULLSCREEN-006] keeps one managed Session across input, resize and reconnect", async () => {
    class FakeTerminalSession implements TerminalSession {
      readonly writes: string[] = [];
      readonly resizes: Array<{ rows: number; cols: number }> = [];
      detached = 0;
      closed = 0;

      constructor(private readonly label: string) {}

      async *[Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {
        yield { kind: "ready", sessionId: "term_same" };
        yield { kind: "output", stream: "stdout", data: `${this.label}:READY` };
      }

      write(data: string): Promise<void> {
        this.writes.push(data);
        return Promise.resolve();
      }

      resize(input: { rows: number; cols: number }): Promise<void> {
        this.resizes.push(input);
        return Promise.resolve();
      }

      detach(): Promise<void> {
        this.detached += 1;
        return Promise.resolve();
      }

      close(): Promise<void> {
        this.closed += 1;
        return Promise.resolve();
      }
    }

    const firstSession = new FakeTerminalSession("first");
    const secondSession = new FakeTerminalSession("second");
    const attachedSessionIds: string[] = [];
    const renderer = new FakeRendererSession([
      { type: "attach", workspaceId: "sbx_1", runtimeId: "sar_pi" },
      { type: "terminal-input", data: "hello\r" },
      { type: "terminal-resize", cols: 120, rows: 40 },
      { type: "terminal-reconnect" },
      { type: "detach" },
      { type: "quit" },
    ]);
    const commands: Command<unknown>[] = [];
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      now: () => "2026-08-11T00:00:00.000Z",
    });

    await presentation.start({
      executeCommand: async <T>(command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({
          workspaceId: "sbx_1",
          runtimeId: "sar_pi",
          transport: "managed-terminal",
          sessionId: "term_same",
          processId: "proc_agent",
          access: {
            kind: "websocket",
            path: "/terminal-sessions/term_same",
            expiresAt: "2026-08-11T00:10:00.000Z",
          },
        } as T);
      },
      executeQuery: async () => ok({ items: [] }),
      terminalSessionGateway: {
        attach(sessionId) {
          attachedSessionIds.push(sessionId);
          return ok(attachedSessionIds.length === 1 ? firstSession : secondSession);
        },
      },
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(IssueSandboxAgentAttachAccessCommand);
    expect(commands[0]).toMatchObject({
      input: {
        sandboxId: "sbx_1",
        runtimeId: "sar_pi",
        expiresAt: "2026-08-11T00:10:00.000Z",
      },
    });
    expect(attachedSessionIds).toEqual(["term_same", "term_same"]);
    expect(firstSession.writes).toEqual(["hello\r"]);
    expect(firstSession.resizes).toEqual([{ cols: 120, rows: 40 }]);
    expect(firstSession.detached).toBe(1);
    expect(secondSession.detached).toBe(1);
    expect(firstSession.closed + secondSession.closed).toBe(0);
    expect(renderer.messages.filter((message) => message.type === "terminal-ready")).toHaveLength(
      2,
    );
    expect(renderer.messages.some((message) => message.type === "terminal-output")).toBe(true);
  });

  test("[WS-TUI-EMBED-004][WS-TUI-CAPABILITY-010] opens Adapter-declared native attach under the Bun-parent terminal port without a shell", async () => {
    const renderer = new FakeRendererSession([
      { type: "attach", workspaceId: "sbx_1", runtimeId: "sar_future" },
      { type: "terminal-input", data: "native-input" },
      { type: "terminal-resize", cols: 90, rows: 30 },
      { type: "quit" },
    ]);
    const nativeSession = {
      writes: [] as string[],
      resizes: [] as Array<{ rows: number; cols: number }>,
      detached: 0,
      closed: 0,
      async *[Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {
        yield { kind: "ready", sessionId: "native_sar_future" };
        yield { kind: "output", stream: "stdout", data: "native:READY" };
      },
      write(data: string) {
        this.writes.push(data);
        return Promise.resolve();
      },
      resize(size: { rows: number; cols: number }) {
        this.resizes.push(size);
        return Promise.resolve();
      },
      detach() {
        this.detached += 1;
        return Promise.resolve();
      },
      close() {
        this.closed += 1;
        return Promise.resolve();
      },
    } satisfies TerminalSession & {
      writes: string[];
      resizes: Array<{ rows: number; cols: number }>;
      detached: number;
      closed: number;
    };
    const openedArgv: readonly string[][] = [];
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      now: () => "2026-08-11T00:00:00.000Z",
    });

    await presentation.start({
      executeCommand: async <T>() =>
        ok({
          workspaceId: "sbx_1",
          runtimeId: "sar_future",
          transport: "native-attach",
          access: {
            exposureId: "exp_agent",
            port: 22,
            visibility: "private",
            url: "ssh://agent.example.test:22",
            expiresAt: "2026-08-11T00:10:00.000Z",
          },
          clientCommand: ["ssh", "-p", "22", "agent.example.test"],
          clientHandoff: "local-client-exec",
        } as T),
      executeQuery: async () => ok({ items: [] }),
      openNativeWorkspaceTerminal: async ({ argv }) => {
        openedArgv.push(argv);
        return { sessionId: "native_sar_future", session: nativeSession };
      },
    });

    expect(openedArgv).toEqual([["ssh", "-p", "22", "agent.example.test"]]);
    expect(nativeSession.writes).toEqual(["native-input"]);
    expect(nativeSession.resizes).toEqual([{ cols: 90, rows: 30 }]);
    expect(nativeSession.detached).toBe(1);
    expect(nativeSession.closed).toBe(0);
    expect(renderer.messages).toContainEqual({
      type: "terminal-ready",
      workspaceId: "sbx_1",
      runtimeId: "sar_future",
      sessionId: "native_sar_future",
    });
  });

  test("[WS-TUI-ERROR-008] reports a safe terminal error and detaches exactly once", async () => {
    const renderer = new FakeRendererSession([
      { type: "attach", workspaceId: "sbx_1", runtimeId: "sar_pi" },
      { type: "quit" },
    ]);
    const terminal = {
      detached: 0,
      async *[Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {
        yield {
          kind: "error",
          error: {
            code: "terminal_transport_failed",
            retryable: true,
            credential: "must-not-cross",
            message: "token=must-not-cross",
          },
        };
      },
      write: () => Promise.resolve(),
      resize: () => Promise.resolve(),
      detach() {
        this.detached += 1;
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    } satisfies TerminalSession & { detached: number };
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });

    await presentation.start({
      executeCommand: async <T>() =>
        ok({
          transport: "managed-terminal",
          sessionId: "term_1",
        } as T),
      executeQuery: async () => ok({ items: [] }),
      terminalSessionGateway: {
        attach: () => ok(terminal),
      },
    });

    expect(renderer.messages).toContainEqual({
      type: "error",
      code: "terminal_transport_failed",
      phase: "workspace-control-terminal",
      retryable: true,
    });
    expect(JSON.stringify(renderer.messages)).not.toContain("must-not-cross");
    expect(terminal.detached).toBe(1);
    expect(renderer.closed).toBe(1);
  });

  test("[WS-TUI-ERROR-008] treats an already-restored renderer as a graceful user exit", async () => {
    let closed = 0;
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => ({
        send: async () => {
          throw new Error("This socket has been ended by the other party");
        },
        async *events() {},
        close: async () => {
          closed += 1;
        },
      }),
    });

    await expect(
      presentation.start({
        executeCommand: async () => ok({}),
        executeQuery: async () => ok({ items: [] }),
      }),
    ).resolves.toBeUndefined();
    expect(closed).toBe(1);
  });
});
