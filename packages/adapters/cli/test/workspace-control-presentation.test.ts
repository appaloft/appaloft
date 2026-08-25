import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  AcceptSandboxPromotionCommand,
  ApproveAgentTaskRunCommand,
  type Command,
  CreateSandboxSnapshotCommand,
  DeleteSandboxSnapshotCommand,
  DeliverAgentTaskRunCommand,
  DeploymentProofQuery,
  ExposeSandboxPortCommand,
  IssueSandboxAgentAttachAccessCommand,
  ListAgentTaskRunsQuery,
  ListPreviewEnvironmentsQuery,
  ListResourcesQuery,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  ListSandboxPortsQuery,
  ListSandboxPromotionsQuery,
  ListSandboxSnapshotsQuery,
  PauseSandboxCommand,
  type Query,
  ResumeSandboxCommand,
  RetrySandboxPromotionCommand,
  RevokeSandboxPortCommand,
  ShowSandboxQuery,
  type TerminalSession,
  type TerminalSessionFrame,
  TerminateSandboxAgentRuntimeCommand,
  TerminateSandboxCommand,
} from "@appaloft/application";
import { domainError, err, ok } from "@appaloft/core";
import {
  createBoundedWorkspaceControlPresentation,
  handleWorkspaceControlWaitScreenInterrupt,
  type WorkspaceControlRendererEvent,
  type WorkspaceControlRendererMessage,
  type WorkspaceControlRendererSession,
} from "../src/workspace-control-presentation";
import {
  setWorkspaceTuiScrollbackWriter,
  WORKSPACE_TUI_DISABLE_MOUSE,
  WORKSPACE_TUI_LEAVE_ALT_SCREEN,
} from "../src/workspace-tui-launch";

class FakeRendererSession implements WorkspaceControlRendererSession {
  readonly messages: WorkspaceControlRendererMessage[] = [];
  closed = 0;
  private readonly hang: ReturnType<typeof Promise.withResolvers<void>> | undefined;

  constructor(
    private readonly rendererEvents: readonly WorkspaceControlRendererEvent[],
    private readonly options: {
      readonly allowQuitDuringDetail?: boolean;
      readonly hangUntilClose?: boolean;
    } = {},
  ) {
    this.hang = options.hangUntilClose ? Promise.withResolvers() : undefined;
  }

  send(message: WorkspaceControlRendererMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  async *events(): AsyncIterable<WorkspaceControlRendererEvent> {
    await Promise.resolve();
    if (this.hang) {
      await this.hang.promise;
      return;
    }
    for (const [index, event] of this.rendererEvents.entries()) {
      const next = this.rendererEvents[index + 1];
      yield event;
      if (
        event.type === "select" &&
        next &&
        (next.type !== "quit" || !this.options.allowQuitDuringDetail)
      ) {
        await waitForSelectedDetail(this, event.workspaceId);
      }
    }
  }

  close(): Promise<void> {
    this.closed += 1;
    this.hang?.resolve();
    return Promise.resolve();
  }
}

async function waitForSelectedDetail(
  renderer: FakeRendererSession,
  workspaceId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (
      renderer.closed > 0 ||
      renderer.messages.some(
        (message) => message.type === "detail" && message.workspace.workspaceId === workspaceId,
      )
    ) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error(`Workspace detail never arrived for ${workspaceId}`);
}

async function waitForPopulatedWorkspaces(
  renderer: FakeRendererSession,
): Promise<Extract<WorkspaceControlRendererMessage, { type: "workspaces" }>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const workspaces = renderer.messages.findLast((message) => message.type === "workspaces");
    if (workspaces && workspaces.workspaces.length > 0) return workspaces;
    await Promise.resolve();
  }
  throw new Error("Workspace list never populated");
}

describe("Workspace control presentation", () => {
  test("[WS-TUI-RECOVERY-001][WS-TUI-RECOVERY-002][WS-TUI-RECOVERY-007][WS-TUI-RECOVERY-008][WS-ACT-PARITY-008][WS-ACT-SAFE-007] presents exact bounded recovery, activation and target evidence", async () => {
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
          return ok({ items: [{ sandboxId: "sbx_1", status: "paused" }] } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({
            sandboxId: "sbx_1",
            status: "paused",
            requestedIsolation: "gvisor",
            realizedIsolation: "gvisor",
            provisionAttempts: 2,
            suspension: {
              mode: "compute-released",
              portability: "provider-family",
              recoveryFamily: "docker-linux-amd64",
            },
            activation: {
              project: { projectId: "prj_web", disposition: "created" },
              repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
              profile: { profileInstallationId: "awpi_default", disposition: "reused" },
            },
            targetSelection: {
              targetClass: "managed",
              source: "platform-default",
              reason: "managed_entitlement_default",
            },
          } as T);
        }
        if (query instanceof ListSandboxAgentRuntimesQuery) {
          return ok({ items: [{ runtimeId: "sar_1", status: "terminated" }] } as T);
        }
        if (query instanceof ListSandboxPortsQuery) return ok({ items: [] } as T);
        if (query instanceof ListSandboxSnapshotsQuery) {
          return ok({
            items: [
              {
                snapshotId: "ssn_other",
                sourceSandboxId: "sbx_other",
                capability: "filesystem",
                reason: "manual",
                portability: "provider-local",
                status: "ready",
                createdAt: "2026-08-10T00:00:00.000Z",
              },
              {
                snapshotId: "ssn_1",
                sourceSandboxId: "sbx_1",
                capability: "filesystem-memory",
                reason: "pre-termination",
                portability: "provider-family",
                recoveryFamily: "docker-linux-amd64",
                status: "ready",
                createdAt: "2026-08-11T00:00:00.000Z",
                expiresAt: "2026-08-18T00:00:00.000Z",
              },
            ],
          } as T);
        }
        if (
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListAgentTaskRunsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    expect(queries.filter((query) => query instanceof ListSandboxSnapshotsQuery)).toHaveLength(1);
    const detail = renderer.messages.findLast((message) => message.type === "detail");
    expect(detail).toMatchObject({
      type: "detail",
      activation: {
        project: { projectId: "prj_web", disposition: "created" },
        repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
        profile: { profileInstallationId: "awpi_default", disposition: "reused" },
      },
      targetSelection: {
        targetClass: "managed",
        source: "platform-default",
        reason: "managed_entitlement_default",
      },
      recovery: {
        requestedIsolation: "gvisor",
        realizedIsolation: "gvisor",
        provisionAttempts: 2,
        suspension: {
          mode: "compute-released",
          portability: "provider-family",
          recoveryFamily: "docker-linux-amd64",
        },
        snapshots: [
          {
            snapshotId: "ssn_1",
            capability: "filesystem-memory",
            reason: "pre-termination",
            portability: "provider-family",
            recoveryFamily: "docker-linux-amd64",
            status: "ready",
            expiresAt: "2026-08-18T00:00:00.000Z",
          },
        ],
        cleanup: {
          state: "not-applicable",
          activeRuntimeCount: 0,
          activePreviewCount: 0,
          scope: "workspace-owned-readback",
        },
      },
    });
    expect(JSON.stringify(detail)).not.toContain("ssn_other");
  });

  test("[WS-ACT-SAFE-007] drops malformed target evidence before terminal rendering", async () => {
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
        if (query instanceof ListSandboxesQuery) {
          return ok({ items: [{ sandboxId: "sbx_1", status: "ready" }] } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({
            sandboxId: "sbx_1",
            status: "ready",
            targetSelection: {
              targetClass: "managed",
              source: "platform-default",
              reason: "managed\u001b[2Jspoofed",
            },
          } as T);
        }
        if (
          query instanceof ListSandboxAgentRuntimesQuery ||
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxSnapshotsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListAgentTaskRunsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    const detail = renderer.messages.findLast((message) => message.type === "detail");
    expect(detail).not.toHaveProperty("targetSelection");
    expect(JSON.stringify(detail)).not.toContain("spoofed");
  });

  test("[WS-TUI-RECOVERY-004][WS-TUI-RECOVERY-005][WS-TUI-RECOVERY-006][WS-TUI-RECOVERY-009] dispatches exact Snapshot actions without detaching the Agent", async () => {
    const commands: Command<unknown>[] = [];
    const terminal = {
      detached: 0,
      async *[Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {},
      write: () => Promise.resolve(),
      resize: () => Promise.resolve(),
      detach() {
        this.detached += 1;
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    } satisfies TerminalSession & { detached: number };
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_1" },
      { type: "attach", workspaceId: "sbx_1", runtimeId: "sar_1" },
      {
        type: "snapshot-create",
        workspaceId: "sbx_1",
        capability: "filesystem-memory",
        ttlDays: 7,
      },
      { type: "snapshot-delete", workspaceId: "sbx_1", snapshotId: "ssn_1" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      now: () => "2026-08-11T00:00:00.000Z",
    });

    await presentation.start({
      executeCommand: async <T>(command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok(
          (command instanceof IssueSandboxAgentAttachAccessCommand
            ? { transport: "managed-terminal", sessionId: "term_same" }
            : {}) as T,
        );
      },
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          return ok({ items: [{ sandboxId: "sbx_1", status: "ready" }] } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({ sandboxId: "sbx_1", status: "ready" } as T);
        }
        if (query instanceof ListSandboxAgentRuntimesQuery) {
          return ok({
            items: [
              {
                runtimeId: "sar_1",
                status: "running",
                interaction: { transport: "managed-terminal" },
              },
            ],
          } as T);
        }
        if (query instanceof ListSandboxSnapshotsQuery) {
          return ok({
            items: [
              {
                snapshotId: "ssn_1",
                sourceSandboxId: "sbx_1",
                capability: "filesystem",
                reason: "manual",
                portability: "provider-local",
                status: "ready",
                createdAt: "2026-08-10T00:00:00.000Z",
              },
            ],
          } as T);
        }
        return ok({ items: [] } as T);
      },
      terminalSessionGateway: { attach: () => ok(terminal) },
    });

    expect(commands.map((command) => command.constructor)).toEqual([
      IssueSandboxAgentAttachAccessCommand,
      CreateSandboxSnapshotCommand,
      DeleteSandboxSnapshotCommand,
    ]);
    expect(commands[1]).toMatchObject({
      input: {
        sandboxId: "sbx_1",
        capability: "filesystem-memory",
        expiresAt: "2026-08-18T00:00:00.000Z",
      },
    });
    expect(commands[2]).toMatchObject({ input: { snapshotId: "ssn_1" } });
    expect(
      renderer.messages.filter((message) => message.type === "recovery-complete"),
    ).toHaveLength(2);
    expect(renderer.messages.filter((message) => message.type === "terminal-ready")).toHaveLength(
      1,
    );
    expect(renderer.messages.some((message) => message.type === "terminal-closed")).toBe(false);
    expect(terminal.detached).toBe(1);
  });

  test("[WS-TUI-RECOVERY-010] preserves only stable safe Snapshot failure metadata", async () => {
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_1" },
      {
        type: "snapshot-create",
        workspaceId: "sbx_1",
        capability: "filesystem",
        ttlDays: 1,
      },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });

    await presentation.start({
      executeCommand: async () =>
        err(
          domainError.conflict("provider token=must-not-cross", {
            providerHandle: "must-not-cross",
          }),
        ),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          return ok({ items: [{ sandboxId: "sbx_1", status: "ready" }] } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({ sandboxId: "sbx_1", status: "ready" } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    const error = renderer.messages.find((message) => message.type === "error");
    expect(error).toMatchObject({
      type: "error",
      code: "conflict",
      phase: "workspace-control-snapshot-create",
      retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain("must-not-cross");
    expect(renderer.messages.some((message) => message.type === "recovery-complete")).toBe(false);
  });

  test("[WS-TUI-DELIVERY-001..011] validates visible delivery targets, dispatches existing operations and reads real proof", async () => {
    const commands: Command<unknown>[] = [];
    const queries: Query<unknown>[] = [];
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_1" },
      {
        type: "preview-expose",
        workspaceId: "sbx_1",
        port: 3000,
        visibility: "private",
        ttlMinutes: 60,
      },
      { type: "preview-revoke", workspaceId: "sbx_1", exposureId: "exp_1" },
      { type: "task-approve", workspaceId: "sbx_1", taskRunId: "task_approval" },
      {
        type: "task-deliver",
        workspaceId: "sbx_1",
        taskRunId: "task_delivery",
        branch: "feat/tui-delivery",
        commitMessage: "feat: deliver from tui",
        remote: "origin",
        pullRequest: { title: "Deliver from TUI", base: "main", body: "bounded body" },
      },
      { type: "promotion-accept", workspaceId: "sbx_1", promotionId: "prm_planned" },
      { type: "promotion-retry", workspaceId: "sbx_1", promotionId: "prm_failed" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      now: () => "2026-08-11T00:00:00.000Z",
      idempotencyKey: () => "idem_tui_delivery",
    });

    await presentation.start({
      executeCommand: async <T>(command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({} as T);
      },
      executeQuery: async <T>(query: Query<T>) => {
        queries.push(query as Query<unknown>);
        if (query instanceof ListSandboxesQuery || query instanceof ShowSandboxQuery) {
          const descriptor = {
            sandboxId: "sbx_1",
            status: "ready",
            sourceKind: "template",
            providerKey: "registered-server",
            createdAt: "2026-08-11T00:00:00.000Z",
          };
          return ok(
            (query instanceof ListSandboxesQuery ? { items: [descriptor] } : descriptor) as T,
          );
        }
        if (query instanceof ListSandboxAgentRuntimesQuery) {
          return ok({ items: [{ runtimeId: "sar_1", status: "running" }] } as T);
        }
        if (query instanceof ListSandboxPortsQuery) {
          return ok({ items: [{ exposureId: "exp_1", port: 3000, visibility: "private" }] } as T);
        }
        if (query instanceof ListAgentTaskRunsQuery) {
          return ok({
            items: [
              { taskRunId: "task_approval", runtimeId: "sar_1", status: "awaiting-approval" },
              { taskRunId: "task_delivery", runtimeId: "sar_1", status: "approved" },
            ],
          } as T);
        }
        if (query instanceof ListSandboxPromotionsQuery) {
          return ok({
            items: [
              {
                promotionId: "prm_planned",
                status: "planned",
                artifactDigest:
                  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                resourceId: "res_1",
                deploymentId: "dep_1",
              },
              {
                promotionId: "prm_failed",
                status: "failed",
                artifactDigest:
                  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              },
            ],
          } as T);
        }
        if (query instanceof DeploymentProofQuery) {
          return ok({
            verdict: "partially-verified",
            mismatches: [{ reasonCode: "route-mismatch" }],
            unavailableEvidence: [{ kind: "health" }, { kind: "recovery" }],
          } as T);
        }
        if (query instanceof ListSandboxSnapshotsQuery) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    expect(commands.map((command) => command.constructor)).toEqual([
      ExposeSandboxPortCommand,
      RevokeSandboxPortCommand,
      ApproveAgentTaskRunCommand,
      DeliverAgentTaskRunCommand,
      AcceptSandboxPromotionCommand,
      RetrySandboxPromotionCommand,
    ]);
    expect(commands[0]).toMatchObject({
      input: {
        sandboxId: "sbx_1",
        port: 3000,
        visibility: "private",
        expiresAt: "2026-08-11T01:00:00.000Z",
      },
    });
    expect(commands[3]).toMatchObject({
      input: {
        workspaceId: "sbx_1",
        taskRunId: "task_delivery",
        branch: "feat/tui-delivery",
        commitMessage: "feat: deliver from tui",
        remote: "origin",
        pullRequest: {
          provider: "github",
          title: "Deliver from TUI",
          base: "main",
          body: "bounded body",
        },
      },
    });
    expect(commands[4]).toMatchObject({
      input: {
        promotionId: "prm_planned",
        expectedArtifactDigest:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        idempotencyKey: "idem_tui_delivery",
      },
    });
    expect(commands[5]).toMatchObject({
      input: { promotionId: "prm_failed", idempotencyKey: "idem_tui_delivery" },
    });
    expect(
      renderer.messages.filter((message) => message.type === "delivery-complete"),
    ).toHaveLength(6);
    expect(queries.some((query) => query instanceof DeploymentProofQuery)).toBe(true);
    const detail = renderer.messages.findLast((message) => message.type === "detail");
    expect(detail?.type === "detail" ? detail.promotions[0]?.proof : undefined).toEqual({
      verdict: "partially-verified",
      mismatchCount: 1,
      unavailableEvidenceCount: 2,
    });
    expect(JSON.stringify(renderer.messages)).not.toContain("sha256:aaaaaaaa");
  });

  test("[WS-TUI-DELIVERY-002][WS-TUI-DELIVERY-009] rejects a stale target without dispatching", async () => {
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_1" },
      { type: "preview-revoke", workspaceId: "sbx_1", exposureId: "exp_stale" },
      { type: "quit" },
    ]);
    const commands: Command<unknown>[] = [];
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });

    await presentation.start({
      executeCommand: async <T>(command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({} as T);
      },
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          return ok({ items: [{ sandboxId: "sbx_1", status: "ready" }] } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({ sandboxId: "sbx_1", status: "ready" } as T);
        }
        return ok({ items: [] } as T);
      },
    });

    expect(commands).toEqual([]);
    expect(renderer.messages).toContainEqual({
      type: "error",
      code: "workspace_control_failed",
      phase: "workspace-control-preview-revoke",
      retryable: false,
    });
  });

  test("[WS-TUI-DELIVERY-008] keeps the exact Agent Session attached across delivery mutation", async () => {
    const terminal = {
      detached: 0,
      async *[Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {},
      write: () => Promise.resolve(),
      resize: () => Promise.resolve(),
      detach() {
        this.detached += 1;
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    } satisfies TerminalSession & { detached: number };
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_1" },
      { type: "attach", workspaceId: "sbx_1", runtimeId: "sar_1" },
      {
        type: "preview-expose",
        workspaceId: "sbx_1",
        port: 3000,
        visibility: "private",
        ttlMinutes: 60,
      },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      now: () => "2026-08-11T00:00:00.000Z",
    });

    await presentation.start({
      executeCommand: async <T>(command: Command<T>) =>
        ok(
          (command instanceof IssueSandboxAgentAttachAccessCommand
            ? { transport: "managed-terminal", sessionId: "term_same" }
            : {}) as T,
        ),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          return ok({ items: [{ sandboxId: "sbx_1", status: "ready" }] } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({ sandboxId: "sbx_1", status: "ready" } as T);
        }
        if (query instanceof ListSandboxAgentRuntimesQuery) {
          return ok({ items: [{ runtimeId: "sar_1", status: "running" }] } as T);
        }
        return ok({ items: [] } as T);
      },
      terminalSessionGateway: { attach: () => ok(terminal) },
    });

    expect(renderer.messages.filter((message) => message.type === "terminal-ready")).toEqual([
      {
        type: "terminal-ready",
        workspaceId: "sbx_1",
        runtimeId: "sar_1",
        sessionId: "term_same",
      },
    ]);
    expect(renderer.messages.some((message) => message.type === "terminal-closed")).toBe(false);
    expect(terminal.detached).toBe(1);
  });

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
                deploymentId: "dep_1",
                resourceId: "res_1",
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
        if (query instanceof DeploymentProofQuery) {
          return ok({ verdict: "verified", mismatches: [], unavailableEvidence: [] } as T);
        }
        if (query instanceof ListSandboxSnapshotsQuery) {
          return ok({ items: [] } as T);
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
      proof: { verdict: "verified", mismatchCount: 0, unavailableEvidenceCount: 0 },
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

  test("[WS-TUI-ACTION-002][WS-TUI-ACTION-003][WS-TUI-ACTION-007] dispatches pause/resume once and reads public state back", async () => {
    for (const action of ["pause", "resume"] as const) {
      const renderer = new FakeRendererSession([
        { type: "select", workspaceId: "sbx_1" },
        { type: "lifecycle-action", workspaceId: "sbx_1", action } as WorkspaceControlRendererEvent,
        { type: "quit" },
      ]);
      const commands: Command<unknown>[] = [];
      const queries: Query<unknown>[] = [];
      let mutated = false;
      const presentation = createBoundedWorkspaceControlPresentation({
        openRenderer: async () => renderer,
      });

      await presentation.start({
        executeCommand: async <T>(command: Command<T>) => {
          commands.push(command as Command<unknown>);
          mutated = true;
          return ok({ sandboxId: "sbx_1", status: action === "pause" ? "paused" : "ready" } as T);
        },
        executeQuery: async <T>(query: Query<T>) => {
          queries.push(query as Query<unknown>);
          if (query instanceof ListSandboxesQuery) {
            return ok({
              items: [
                {
                  sandboxId: "sbx_1",
                  status: mutated
                    ? action === "pause"
                      ? "paused"
                      : "ready"
                    : action === "pause"
                      ? "ready"
                      : "paused",
                },
              ],
            } as T);
          }
          if (query instanceof ShowSandboxQuery) {
            return ok({
              sandboxId: "sbx_1",
              status: mutated
                ? action === "pause"
                  ? "paused"
                  : "ready"
                : action === "pause"
                  ? "ready"
                  : "paused",
            } as T);
          }
          if (
            query instanceof ListSandboxAgentRuntimesQuery ||
            query instanceof ListSandboxPortsQuery ||
            query instanceof ListSandboxPromotionsQuery ||
            query instanceof ListSandboxSnapshotsQuery
          ) {
            return ok({ items: [] } as T);
          }
          throw new Error(`unexpected query ${query.constructor.name}`);
        },
      });

      expect(commands).toHaveLength(1);
      expect(commands[0]).toBeInstanceOf(
        action === "pause" ? PauseSandboxCommand : ResumeSandboxCommand,
      );
      expect(queries.filter((query) => query instanceof ListSandboxesQuery)).toHaveLength(2);
      expect(queries.filter((query) => query instanceof ShowSandboxQuery)).toHaveLength(2);
    }
  });

  test("[WS-TUI-ACTION-005][WS-TUI-ACTION-006] detaches before runtime-first confirmed termination", async () => {
    const order: string[] = [];
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_1" },
      { type: "attach", workspaceId: "sbx_1", runtimeId: "sar_1" },
      {
        type: "lifecycle-action",
        workspaceId: "sbx_1",
        action: "terminate",
      } as WorkspaceControlRendererEvent,
      { type: "quit" },
    ]);
    const terminal = {
      async *[Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {
        yield { kind: "ready", sessionId: "term_1" };
      },
      write: () => Promise.resolve(),
      resize: () => Promise.resolve(),
      detach: () => {
        order.push("detach");
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    } satisfies TerminalSession;
    let terminated = false;
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });

    await presentation.start({
      executeCommand: async <T>(command: Command<T>) => {
        if (command instanceof IssueSandboxAgentAttachAccessCommand) {
          return ok({ transport: "managed-terminal", sessionId: "term_1" } as T);
        }
        if (command instanceof TerminateSandboxAgentRuntimeCommand) {
          order.push("terminate-runtime");
          return ok({ sandboxId: "sbx_1", runtimeId: "sar_1", status: "terminated" } as T);
        }
        if (command instanceof TerminateSandboxCommand) {
          order.push("terminate-workspace");
          terminated = true;
          return ok({ sandboxId: "sbx_1", status: "terminated" } as T);
        }
        throw new Error(`unexpected command ${command.constructor.name}`);
      },
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          return ok({ items: [{ sandboxId: "sbx_1", status: "ready" }] } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({ sandboxId: "sbx_1", status: terminated ? "terminated" : "ready" } as T);
        }
        if (query instanceof ListSandboxAgentRuntimesQuery) {
          return ok({
            items: [{ sandboxId: "sbx_1", runtimeId: "sar_1", status: "ready" }],
          } as T);
        }
        if (
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListAgentTaskRunsQuery ||
          query instanceof ListSandboxSnapshotsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
      terminalSessionGateway: { attach: () => ok(terminal) },
    });

    expect(order).toEqual(["detach", "terminate-runtime", "terminate-workspace"]);
  });

  test("[WS-TUI-ACTION-008] lifecycle command failures preserve only stable safe presentation metadata", async () => {
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_1" },
      {
        type: "lifecycle-action",
        workspaceId: "sbx_1",
        action: "pause",
      },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });

    await presentation.start({
      executeCommand: async () =>
        err(
          domainError.conflict("token=must-not-cross", {
            phase: "sandbox-pause",
            credential: "must-not-cross",
          }),
        ),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          return ok({ items: [{ sandboxId: "sbx_1", status: "ready" }] } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({ sandboxId: "sbx_1", status: "ready" } as T);
        }
        if (
          query instanceof ListSandboxAgentRuntimesQuery ||
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListSandboxSnapshotsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    const error = renderer.messages.find((message) => message.type === "error");
    expect(error).toMatchObject({
      type: "error",
      code: "conflict",
      phase: "workspace-control-lifecycle-action",
      retryable: false,
    });
    expect(JSON.stringify(renderer.messages)).not.toContain("must-not-cross");
  });

  test("[WS-TUI-ENTRY-001] quit is accepted before the first Workspace list resolves", async () => {
    let resolveList: ((value: { items: readonly unknown[] }) => void) | undefined;
    const listStarted = Promise.withResolvers<void>();
    const renderer = new FakeRendererSession([{ type: "quit" }]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });

    const started = presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          listStarted.resolve();
          return await new Promise((resolve) => {
            resolveList = (value) => resolve(ok(value) as never);
          });
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    await listStarted.promise;
    await started;
    expect(renderer.closed).toBe(1);
    expect(renderer.messages[0]).toMatchObject({
      type: "chrome",
      home: true,
      title: "Appaloft Cloud Agents",
    });
    resolveList?.({ items: [{ sandboxId: "sbx_late", status: "ready" }] });
  });

  test("[WS-TUI-ENTRY-001] wait-screen SIGINT quits before harness focus", async () => {
    const renderer = new FakeRendererSession([], { hangUntilClose: true });
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    const started = presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) return ok({ items: [] } as T);
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });
    for (let attempt = 0; attempt < 50 && renderer.messages.length === 0; attempt += 1) {
      await Bun.sleep(10);
    }
    expect(renderer.messages[0]).toMatchObject({
      type: "chrome",
      home: true,
      title: "Appaloft Cloud Agents",
    });
    handleWorkspaceControlWaitScreenInterrupt({
      attached: false,
      close: () => renderer.close(),
      exitProcess: false,
    });
    await started;
    expect(renderer.closed).toBeGreaterThanOrEqual(1);
    const source = await Bun.file(
      new URL("../src/workspace-control-presentation.ts", import.meta.url),
    ).text();
    expect(source).toContain("restoreWorkspaceTuiScrollback");
    expect(source).toContain("process.exit(0)");
    expect(source).not.toContain("process.exit(130)");
    expect(source).toContain("occupyPending");
    expect(source).toContain("abortOccupy");
    const sigintArm = source.indexOf('process.on("SIGINT", quitWaitScreen)');
    const openRenderer = source.indexOf("await input.openRenderer()");
    expect(sigintArm).toBeGreaterThan(-1);
    expect(openRenderer).toBeGreaterThan(-1);
    expect(sigintArm).toBeLessThan(openRenderer);
    let attachedClosed = 0;
    handleWorkspaceControlWaitScreenInterrupt({
      attached: true,
      close: async () => {
        attachedClosed += 1;
      },
      exitProcess: false,
    });
    expect(attachedClosed).toBe(0);
    let occupyAborted = 0;
    handleWorkspaceControlWaitScreenInterrupt({
      attached: false,
      occupyPending: true,
      abortOccupy: () => {
        occupyAborted += 1;
      },
      close: () => renderer.close(),
      exitProcess: false,
    });
    expect(occupyAborted).toBe(1);
  });

  test("[WS-TUI-ENTRY-001] quit is accepted while occupancy detail is still loading", async () => {
    let resolveDetail: ((value: Record<string, unknown>) => void) | undefined;
    const detailStarted = Promise.withResolvers<void>();
    const renderer = new FakeRendererSession(
      [{ type: "select", workspaceId: "sbx_ready" }, { type: "quit" }],
      { allowQuitDuringDetail: true },
    );
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });

    const started = presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          return ok({
            items: [
              {
                sandboxId: "sbx_ready",
                status: "ready",
                occupancy: {
                  repositoryIdentity: "github.com/traefik/whoami",
                  commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
                  branch: "master",
                },
              },
            ],
          } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          detailStarted.resolve();
          return await new Promise((resolve) => {
            resolveDetail = (value) => resolve(ok(value) as never);
          });
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    await detailStarted.promise;
    await started;
    expect(renderer.closed).toBe(1);
    expect(renderer.messages.some((message) => message.type === "detail")).toBe(false);
    resolveDetail?.({ sandboxId: "sbx_ready", status: "ready" });
  });

  test("[WS-REMOTE-CA-069][WS-REMOTE-CA-070][WS-REMOTE-CA-071] TUI list copies occupancy and omits leftovers", async () => {
    const renderer = new FakeRendererSession([{ type: "quit" }]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });

    await presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          return ok({
            items: [
              {
                sandboxId: "sbx_ready",
                status: "ready",
                occupancy: {
                  repositoryIdentity: "github.com/traefik/whoami",
                  commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
                  branch: "master",
                },
              },
              { sandboxId: "sbx_provisioning", status: "provisioning" },
              { sandboxId: "sbx_failed", status: "failed" },
              { sandboxId: "sbx_terminated", status: "terminated" },
            ],
          } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    const workspaces = await waitForPopulatedWorkspaces(renderer);
    expect(workspaces).toEqual({
      type: "workspaces",
      workspaces: [
        {
          workspaceId: "sbx_ready",
          name: "traefik/whoami@1ce75d0",
          status: "ready",
          occupancy: {
            repositoryIdentity: "github.com/traefik/whoami",
            commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
            branch: "master",
          },
        },
        { workspaceId: "sbx_provisioning", name: "provisioning", status: "provisioning" },
      ],
    });
  });

  test("[WS-REMOTE-CA-072][WS-REMOTE-CA-073][WS-REMOTE-CA-074] TUI detail copies occupancy preview and last deployment", async () => {
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_ready" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });

    await presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          return ok({
            items: [
              {
                sandboxId: "sbx_ready",
                status: "ready",
                activation: {
                  project: { projectId: "prj_web", disposition: "created" },
                  repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
                  profile: { profileInstallationId: "awpi_default", disposition: "reused" },
                },
              },
            ],
          } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({
            sandboxId: "sbx_ready",
            status: "ready",
            activation: {
              project: { projectId: "prj_web", disposition: "created" },
              repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
              profile: { profileInstallationId: "awpi_default", disposition: "reused" },
            },
          } as T);
        }
        if (query instanceof ListResourcesQuery) {
          return ok({
            items: [
              {
                projectId: "prj_web",
                slug: "app",
                lastDeploymentId: "dep_rfqfapqwpyjn",
                lastDeploymentStatus: "succeeded",
                accessSummary: {
                  latestGeneratedAccessRoute: {
                    url: "http://app-sc156jw98k.127.0.0.1.sslip.io",
                    deploymentStatus: "succeeded",
                  },
                  latestDurableDomainRoute: {
                    url: "https://whoami.example",
                    deploymentStatus: "succeeded",
                  },
                },
              },
              {
                projectId: "prj_other",
                slug: "app",
                lastDeploymentId: "dep_other",
                lastDeploymentStatus: "succeeded",
                accessSummary: {
                  latestGeneratedAccessRoute: {
                    url: "http://other.example.test",
                    deploymentStatus: "succeeded",
                  },
                },
              },
            ],
          } as T);
        }
        if (
          query instanceof ListPreviewEnvironmentsQuery ||
          query instanceof ListSandboxAgentRuntimesQuery ||
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListSandboxSnapshotsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    const detail = renderer.messages.find((message) => message.type === "detail");
    expect(detail).toMatchObject({
      type: "detail",
      preview: { url: "http://app-sc156jw98k.127.0.0.1.sslip.io/" },
      production: { url: "https://whoami.example/" },
      deployment: { id: "dep_rfqfapqwpyjn", status: "succeeded" },
    });
    expect(JSON.stringify(detail)).not.toContain("dep_other");
    expect(JSON.stringify(detail)).not.toContain("other.example.test");
  });

  test("[WS-REMOTE-CA-075][WS-REMOTE-CA-077] TUI detail copies matching preview-environment PR", async () => {
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_ready" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });

    await presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery || query instanceof ShowSandboxQuery) {
          return ok({
            items: [
              {
                sandboxId: "sbx_ready",
                status: "ready",
                occupancy: {
                  repositoryIdentity: "github.com/traefik/whoami",
                  commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
                  branch: "feat/occupancy",
                },
                activation: {
                  project: { projectId: "prj_web", disposition: "created" },
                  repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
                  profile: { profileInstallationId: "awpi_default", disposition: "reused" },
                },
              },
            ],
            sandboxId: "sbx_ready",
            status: "ready",
            occupancy: {
              repositoryIdentity: "github.com/traefik/whoami",
              commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
              branch: "feat/occupancy",
            },
            activation: {
              project: { projectId: "prj_web", disposition: "created" },
              repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
              profile: { profileInstallationId: "awpi_default", disposition: "reused" },
            },
          } as T);
        }
        if (query instanceof ListPreviewEnvironmentsQuery) {
          return ok({
            items: [
              {
                updatedAt: "2026-08-16T00:00:00.000Z",
                source: {
                  repositoryFullName: "octocat/Hello-World",
                  pullRequestNumber: 1,
                  headSha: "1ce75d01b6978863647da42557a707a479da3a51",
                },
              },
              {
                updatedAt: "2026-08-16T01:00:00.000Z",
                source: {
                  repositoryFullName: "traefik/whoami",
                  pullRequestNumber: 928,
                  headSha: "1ce75d01b6978863647da42557a707a479da3a51",
                },
              },
            ],
          } as T);
        }
        if (
          query instanceof ListResourcesQuery ||
          query instanceof ListSandboxAgentRuntimesQuery ||
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListSandboxSnapshotsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    const detail = renderer.messages.find((message) => message.type === "detail");
    expect(detail).toMatchObject({
      type: "detail",
      pullRequest: {
        number: 928,
        url: "https://github.com/traefik/whoami/pull/928",
      },
    });
    expect(JSON.stringify(detail)).not.toContain('"number":1');
  });

  test("[WS-REMOTE-CA-087][WS-REMOTE-CA-088][WS-REMOTE-CA-089] TUI o opens only the selected GitHub PR URL", async () => {
    const opened: string[] = [];
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_ready" },
      { type: "open-pr", workspaceId: "sbx_other" },
      { type: "open-pr", workspaceId: "sbx_ready" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      openUrl: async (url) => {
        opened.push(url);
        return true;
      },
    });

    await presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery || query instanceof ShowSandboxQuery) {
          return ok({
            items: [
              {
                sandboxId: "sbx_ready",
                status: "ready",
                occupancy: {
                  repositoryIdentity: "github.com/traefik/whoami",
                  commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
                  branch: "feat/occupancy",
                },
                activation: {
                  project: { projectId: "prj_web", disposition: "created" },
                  repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
                  profile: { profileInstallationId: "awpi_default", disposition: "reused" },
                },
              },
            ],
            sandboxId: "sbx_ready",
            status: "ready",
            occupancy: {
              repositoryIdentity: "github.com/traefik/whoami",
              commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
              branch: "feat/occupancy",
            },
            activation: {
              project: { projectId: "prj_web", disposition: "created" },
              repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
              profile: { profileInstallationId: "awpi_default", disposition: "reused" },
            },
          } as T);
        }
        if (query instanceof ListPreviewEnvironmentsQuery) {
          return ok({
            items: [
              {
                updatedAt: "2026-08-16T01:00:00.000Z",
                source: {
                  repositoryFullName: "traefik/whoami",
                  pullRequestNumber: 928,
                  headSha: "1ce75d01b6978863647da42557a707a479da3a51",
                },
              },
            ],
          } as T);
        }
        if (
          query instanceof ListResourcesQuery ||
          query instanceof ListSandboxAgentRuntimesQuery ||
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListSandboxSnapshotsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    expect(opened).toEqual(["https://github.com/traefik/whoami/pull/928"]);
    expect(renderer.messages.some((message) => message.type === "error")).toBe(true);
  });

  test("[WS-REMOTE-CA-088] missing PR open stays lean", async () => {
    const opened: string[] = [];
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_ready" },
      { type: "open-pr", workspaceId: "sbx_ready" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      openUrl: async (url) => {
        opened.push(url);
        return true;
      },
    });

    await presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery || query instanceof ShowSandboxQuery) {
          return ok({
            items: [{ sandboxId: "sbx_ready", status: "ready" }],
            sandboxId: "sbx_ready",
            status: "ready",
          } as T);
        }
        if (
          query instanceof ListPreviewEnvironmentsQuery ||
          query instanceof ListResourcesQuery ||
          query instanceof ListSandboxAgentRuntimesQuery ||
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListSandboxSnapshotsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    expect(opened).toEqual([]);
    expect(renderer.messages).toContainEqual({
      type: "error",
      code: "occupancy_pr_unavailable",
      phase: "workspace-control-open-pr",
      retryable: false,
    });
  });

  test("[WS-REMOTE-CA-090][WS-REMOTE-CA-091] TUI p and P open occupancy Preview and Production", async () => {
    const opened: string[] = [];
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_ready" },
      { type: "open-preview", workspaceId: "sbx_other" },
      { type: "open-preview", workspaceId: "sbx_ready" },
      { type: "open-production", workspaceId: "sbx_ready" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      openUrl: async (url) => {
        opened.push(url);
        return true;
      },
    });

    await presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          return ok({
            items: [
              {
                sandboxId: "sbx_ready",
                status: "ready",
                activation: {
                  project: { projectId: "prj_web", disposition: "created" },
                  repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
                  profile: { profileInstallationId: "awpi_default", disposition: "reused" },
                },
              },
            ],
          } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({
            sandboxId: "sbx_ready",
            status: "ready",
            activation: {
              project: { projectId: "prj_web", disposition: "created" },
              repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
              profile: { profileInstallationId: "awpi_default", disposition: "reused" },
            },
          } as T);
        }
        if (query instanceof ListResourcesQuery) {
          return ok({
            items: [
              {
                projectId: "prj_web",
                slug: "app",
                lastDeploymentId: "dep_rfqfapqwpyjn",
                lastDeploymentStatus: "succeeded",
                accessSummary: {
                  latestGeneratedAccessRoute: {
                    url: "http://app-sc156jw98k.127.0.0.1.sslip.io",
                    deploymentStatus: "succeeded",
                  },
                  latestDurableDomainRoute: {
                    url: "https://whoami.example",
                    deploymentStatus: "succeeded",
                  },
                },
              },
            ],
          } as T);
        }
        if (
          query instanceof ListPreviewEnvironmentsQuery ||
          query instanceof ListSandboxAgentRuntimesQuery ||
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListSandboxSnapshotsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    expect(opened).toEqual([
      "http://app-sc156jw98k.127.0.0.1.sslip.io/",
      "https://whoami.example/",
    ]);
    expect(renderer.messages.some((message) => message.type === "error")).toBe(true);
  });

  test("[WS-REMOTE-CA-092] missing preview and production open stays lean", async () => {
    const opened: string[] = [];
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_ready" },
      { type: "open-preview", workspaceId: "sbx_ready" },
      { type: "open-production", workspaceId: "sbx_ready" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      openUrl: async (url) => {
        opened.push(url);
        return true;
      },
    });

    await presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery || query instanceof ShowSandboxQuery) {
          return ok({
            items: [{ sandboxId: "sbx_ready", status: "ready" }],
            sandboxId: "sbx_ready",
            status: "ready",
          } as T);
        }
        if (
          query instanceof ListPreviewEnvironmentsQuery ||
          query instanceof ListResourcesQuery ||
          query instanceof ListSandboxAgentRuntimesQuery ||
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListSandboxSnapshotsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    expect(opened).toEqual([]);
    expect(renderer.messages).toContainEqual({
      type: "error",
      code: "occupancy_preview_unavailable",
      phase: "workspace-control-open-preview",
      retryable: false,
    });
    expect(renderer.messages).toContainEqual({
      type: "error",
      code: "occupancy_production_unavailable",
      phase: "workspace-control-open-production",
      retryable: false,
    });
  });

  test("[WS-REMOTE-CA-093][WS-REMOTE-CA-094] TUI c opens compare or existing PR", async () => {
    const opened: string[] = [];
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_ready" },
      { type: "open-compare", workspaceId: "sbx_other" },
      { type: "open-compare", workspaceId: "sbx_ready" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      openUrl: async (url) => {
        opened.push(url);
        return true;
      },
    });

    await presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery || query instanceof ShowSandboxQuery) {
          return ok({
            items: [
              {
                sandboxId: "sbx_ready",
                status: "ready",
                occupancy: {
                  repositoryIdentity: "github.com/traefik/whoami",
                  commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
                  branch: "feat/occupancy",
                },
              },
            ],
            sandboxId: "sbx_ready",
            status: "ready",
            occupancy: {
              repositoryIdentity: "github.com/traefik/whoami",
              commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
              branch: "feat/occupancy",
            },
          } as T);
        }
        if (
          query instanceof ListPreviewEnvironmentsQuery ||
          query instanceof ListResourcesQuery ||
          query instanceof ListSandboxAgentRuntimesQuery ||
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListSandboxSnapshotsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    expect(opened).toEqual(["https://github.com/traefik/whoami/compare/feat/occupancy?expand=1"]);
    expect(renderer.messages.some((message) => message.type === "error")).toBe(true);
  });

  test("[WS-REMOTE-CA-094] existing PR compare stays on pull URL", async () => {
    const opened: string[] = [];
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_ready" },
      { type: "open-compare", workspaceId: "sbx_ready" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      openUrl: async (url) => {
        opened.push(url);
        return true;
      },
    });

    await presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery || query instanceof ShowSandboxQuery) {
          return ok({
            items: [
              {
                sandboxId: "sbx_ready",
                status: "ready",
                occupancy: {
                  repositoryIdentity: "github.com/traefik/whoami",
                  commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
                  branch: "feat/occupancy",
                },
                activation: {
                  project: { projectId: "prj_web", disposition: "created" },
                  repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
                  profile: { profileInstallationId: "awpi_default", disposition: "reused" },
                },
              },
            ],
            sandboxId: "sbx_ready",
            status: "ready",
            occupancy: {
              repositoryIdentity: "github.com/traefik/whoami",
              commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
              branch: "feat/occupancy",
            },
            activation: {
              project: { projectId: "prj_web", disposition: "created" },
              repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
              profile: { profileInstallationId: "awpi_default", disposition: "reused" },
            },
          } as T);
        }
        if (query instanceof ListPreviewEnvironmentsQuery) {
          return ok({
            items: [
              {
                updatedAt: "2026-08-16T01:00:00.000Z",
                source: {
                  repositoryFullName: "traefik/whoami",
                  pullRequestNumber: 928,
                  headSha: "1ce75d01b6978863647da42557a707a479da3a51",
                },
              },
            ],
          } as T);
        }
        if (
          query instanceof ListResourcesQuery ||
          query instanceof ListSandboxAgentRuntimesQuery ||
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListSandboxSnapshotsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    expect(opened).toEqual(["https://github.com/traefik/whoami/pull/928"]);
  });

  test("[WS-REMOTE-CA-095] missing compare stays lean", async () => {
    const opened: string[] = [];
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_ready" },
      { type: "open-compare", workspaceId: "sbx_ready" },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
      openUrl: async (url) => {
        opened.push(url);
        return true;
      },
    });

    await presentation.start({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery || query instanceof ShowSandboxQuery) {
          return ok({
            items: [{ sandboxId: "sbx_ready", status: "ready" }],
            sandboxId: "sbx_ready",
            status: "ready",
          } as T);
        }
        if (
          query instanceof ListPreviewEnvironmentsQuery ||
          query instanceof ListResourcesQuery ||
          query instanceof ListSandboxAgentRuntimesQuery ||
          query instanceof ListSandboxPortsQuery ||
          query instanceof ListSandboxPromotionsQuery ||
          query instanceof ListSandboxSnapshotsQuery
        ) {
          return ok({ items: [] } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    });

    expect(opened).toEqual([]);
    expect(renderer.messages).toContainEqual({
      type: "error",
      code: "occupancy_compare_unavailable",
      phase: "workspace-control-open-compare",
      retryable: false,
    });
  });

  test("[WS-REMOTE-PROGRESS-193][WS-REMOTE-PROGRESS-194] occupy bootstrap paints collapsed preparing wait then attaches without waiting on skills", async () => {
    const terminal = {
      detached: 0,
      async *[Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {},
      write: () => Promise.resolve(),
      resize: () => Promise.resolve(),
      detach() {
        this.detached += 1;
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    } satisfies TerminalSession & { detached: number };
    const renderer = new FakeRendererSession([]);
    renderer.events = async function* events() {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (
          this.messages.some((message) => message.type === "terminal-ready") ||
          this.messages.some((message) => message.type === "error")
        ) {
          break;
        }
        await Promise.resolve();
      }
      yield { type: "quit" };
    };
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    let skillBlockers = 0;
    await presentation.start({
      occupancyChrome: { project: "hello-static" },
      occupyBootstrap: async ({ reportProgress }) => {
        await reportProgress("Waking the agent…");
        await reportProgress("Including your skills…");
        skillBlockers += 1;
        return {
          workspaceId: "sbx_1",
          projectName: "hello-static",
          attach: {
            workspaceId: "sbx_1",
            runtimeId: "sar_1",
            transport: "managed-terminal",
            sessionId: "term_occupy",
            processId: "proc_1",
            access: {
              kind: "websocket",
              path: "/sessions/term_occupy",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          },
        };
      },
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) {
          return ok({ items: [{ sandboxId: "sbx_1", status: "ready" }] } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({ sandboxId: "sbx_1", status: "ready" } as T);
        }
        return ok({ items: [] } as T);
      },
      terminalSessionGateway: { attach: () => ok(terminal) },
    });
    expect(skillBlockers).toBe(1);
    expect(renderer.messages[0]).toEqual({
      type: "loading",
      collapsed: true,
      title: "Appaloft Cloud Agents",
      project: "hello-static",
    });
    expect(renderer.messages).toContainEqual({
      type: "progress",
      message: "Waking the agent…",
      step: "disk",
    });
    expect(renderer.messages).toContainEqual({
      type: "progress",
      message: "Including your skills…",
      step: "skills",
    });
    expect(renderer.messages).toContainEqual({
      type: "progress",
      message: "Finalizing configuration…",
      step: "disk",
    });
    expect(renderer.messages).toContainEqual({
      type: "chrome",
      title: "Appaloft Cloud Agents",
      project: "hello-static",
    });
    expect(
      renderer.messages.some(
        (message) =>
          (message.type === "chrome" || message.type === "loading") && "previewUrl" in message,
      ),
    ).toBeFalse();
    expect(renderer.messages).toContainEqual({
      type: "terminal-ready",
      workspaceId: "sbx_1",
      runtimeId: "sar_1",
      sessionId: "term_occupy",
    });
    const attachAt = renderer.messages.findIndex((message) => message.type === "terminal-ready");
    expect(attachAt).toBeGreaterThan(-1);
    expect(renderer.messages.some((message) => message.type === "workspaces")).toBeFalse();
  });

  test("[WS-REMOTE-PROGRESS-196] attach does not surface list or detail conflicts", async () => {
    const terminal = {
      detached: 0,
      async *[Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {},
      write: () => Promise.resolve(),
      resize: () => Promise.resolve(),
      detach() {
        this.detached += 1;
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    } satisfies TerminalSession & { detached: number };
    const renderer = new FakeRendererSession([
      { type: "select", workspaceId: "sbx_1" },
      { type: "quit" },
    ]);
    renderer.events = async function* events() {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (this.messages.some((message) => message.type === "terminal-ready")) break;
        await Promise.resolve();
      }
      yield { type: "select", workspaceId: "sbx_1" };
      yield { type: "quit" };
    };
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    const conflict = domainError.conflict("Sandbox port publishing is unsupported", {
      code: "conflict",
      phase: "sandbox-ports",
    });
    await presentation.start({
      occupyBootstrap: async ({ reportProgress }) => {
        await reportProgress("Waking the agent…");
        return {
          workspaceId: "sbx_1",
          attach: {
            workspaceId: "sbx_1",
            runtimeId: "sar_1",
            transport: "managed-terminal",
            sessionId: "term_occupy",
            processId: "proc_1",
            access: {
              kind: "websocket",
              path: "/sessions/term_occupy",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          },
        };
      },
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListSandboxesQuery) return err(conflict);
        if (query instanceof ListSandboxPortsQuery) return err(conflict);
        if (query instanceof ShowSandboxQuery) return err(conflict);
        return ok({ items: [] } as T);
      },
      terminalSessionGateway: { attach: () => ok(terminal) },
    });
    expect(renderer.messages).toContainEqual({
      type: "terminal-ready",
      workspaceId: "sbx_1",
      runtimeId: "sar_1",
      sessionId: "term_occupy",
    });
    expect(renderer.messages.some((message) => message.type === "error")).toBeFalse();
    expect(
      renderer.messages.some(
        (message) =>
          message.type === "error" &&
          (message.phase === "occupancy-code-bootstrap" ||
            message.phase === "workspace-control-select"),
      ),
    ).toBeFalse();
  });

  test("[WS-REMOTE-PROGRESS-201] locator miss exits the occupancy TUI instead of staying on Resolving repository", async () => {
    const renderer = new FakeRendererSession([]);
    renderer.events = async function* events() {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if (this.closed > 0) break;
        await Promise.resolve();
      }
      yield { type: "quit" };
    };
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    const started = Date.now();
    await expect(
      presentation.start({
        occupyBootstrap: async ({ reportProgress }) => {
          await reportProgress("Resolving repository…");
          throw {
            code: "workspace_remote_repository_missing",
            category: "user" as const,
            message: "Remote code needs a Git repository with an origin",
            retryable: false,
            details: {
              phase: "remote-code-locator",
              guidance: "Run appaloft code from a Git repository, or use appaloft code --local.",
            },
          };
        },
        executeCommand: async () => ok({}),
        executeQuery: async <T>() => ok({ items: [] } as T),
      }),
    ).rejects.toMatchObject({
      code: "workspace_remote_repository_missing",
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(renderer.closed).toBeGreaterThan(0);
    expect(
      renderer.messages.some(
        (message) => message.type === "progress" && message.message === "Resolving repository…",
      ),
    ).toBeTrue();
  });

  test("[WS-REMOTE-PROGRESS-219] occupy failure after TUI is drawn restores then prints on the normal screen", async () => {
    const { Effect } = await import("effect");
    const { printCliError } = await import("../src/runtime.js");
    const renderer = new FakeRendererSession([], { hangUntilClose: true });
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    const timeline: string[] = [];
    setWorkspaceTuiScrollbackWriter((text) => {
      timeline.push(`restore:${text}`);
    });
    let stdout = "";
    let stderr = "";
    const originalStdout = process.stdout.write.bind(process.stdout);
    const originalStderr = process.stderr.write.bind(process.stderr);
    const originalExitCode = process.exitCode;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      stderr += text;
      if (text.includes("error:")) timeline.push("error-print");
      return true;
    }) as typeof process.stderr.write;
    const unstructured = {
      code: "sdk_unstructured_error",
      category: "infra" as const,
      message:
        'The server returned an error that did not match the Appaloft error contract. HTTP 500 code exec_failed. Body: {"error":"omp: not found"}',
      retryable: false,
      details: {
        status: 500,
        remoteCode: "exec_failed",
        bodyPreview: '{"error":"omp: not found"}',
      },
    };
    try {
      await expect(
        presentation.start({
          occupyBootstrap: async ({ reportProgress }) => {
            await reportProgress("Loading your project…");
            throw unstructured;
          },
          executeCommand: async () => ok({}),
          executeQuery: async <T>() => ok({ items: [] } as T),
        }),
      ).rejects.toMatchObject({
        code: "sdk_unstructured_error",
      });
      expect(renderer.messages[0]).toEqual({
        type: "loading",
        collapsed: true,
        title: "Appaloft Cloud Agents",
      });
      expect(renderer.messages).toContainEqual({
        type: "progress",
        message: "Loading your project…",
      });
      expect(renderer.messages).toContainEqual({
        type: "progress",
        message: "Loading your project…",
        status: "failed",
      });
      expect(renderer.messages.some((message) => message.type === "error")).toBeFalse();
      expect(renderer.closed).toBeGreaterThan(0);
      expect(timeline.some((entry) => entry.startsWith("restore:"))).toBeTrue();
      expect(timeline.includes("error-print")).toBeFalse();
      const restoreEntries = timeline.filter((entry) => entry.startsWith("restore:"));
      expect(restoreEntries).toHaveLength(1);
      const restoredBeforePrint = restoreEntries.join("");
      expect(restoredBeforePrint).toContain(WORKSPACE_TUI_LEAVE_ALT_SCREEN);
      expect(restoredBeforePrint).toContain("\x1b[?1049l");
      expect(restoredBeforePrint).toContain("\x1b[?25h");
      expect(restoredBeforePrint).toContain(WORKSPACE_TUI_DISABLE_MOUSE);

      await Effect.runPromise(printCliError(unstructured));

      expect(timeline.includes("error-print")).toBeTrue();
      expect(timeline.findIndex((entry) => entry.startsWith("restore:"))).toBeLessThan(
        timeline.indexOf("error-print"),
      );
      expect(stdout).not.toContain("error:");
      expect(stderr).toContain("HTTP 500");
      expect(stderr).toContain("omp: not found");
      expect(stderr).not.toMatch(/occupancy/iu);
      expect(JSON.stringify(renderer.messages)).not.toMatch(/occupancy/iu);
      const source = await Bun.file(
        new URL("../src/workspace-control-presentation.ts", import.meta.url),
      ).text();
      const occupyFailureAt = source.indexOf("occupyFailure =");
      const leaveAt = source.indexOf("leaveWorkspaceTuiOnce(renderer)", occupyFailureAt);
      const throwAt = source.lastIndexOf("throw occupyFailure");
      expect(occupyFailureAt).toBeGreaterThan(-1);
      expect(leaveAt).toBeGreaterThan(occupyFailureAt);
      expect(leaveAt).toBeLessThan(throwAt);
      const launchSource = await Bun.file(
        new URL("../src/workspace-tui-launch.ts", import.meta.url),
      ).text();
      const leaveFnAt = launchSource.indexOf("export async function leaveWorkspaceTuiOnce");
      const closeInLeaveAt = launchSource.indexOf("await renderer.close()", leaveFnAt);
      const restoreInLeaveAt = launchSource.indexOf("restoreWorkspaceTuiScrollback()", leaveFnAt);
      expect(leaveFnAt).toBeGreaterThan(-1);
      expect(closeInLeaveAt).toBeGreaterThan(leaveFnAt);
      expect(restoreInLeaveAt).toBeGreaterThan(closeInLeaveAt);
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
      process.exitCode = originalExitCode ?? 0;
      setWorkspaceTuiScrollbackWriter(undefined);
    }
  });

  test("[WS-REMOTE-COMPAT-220][WS-REMOTE-PROGRESS-219] folder.local unstructured validation after TUI restores then prints a human next step", async () => {
    const { Effect } = await import("effect");
    const { printCliError } = await import("../src/runtime.js");
    const { occupancyCloudCompatError } = await import("../src/remote-code-session.js");
    const renderer = new FakeRendererSession([], { hangUntilClose: true });
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    const timeline: string[] = [];
    setWorkspaceTuiScrollbackWriter((text) => {
      timeline.push(`restore:${text}`);
    });
    let stdout = "";
    let stderr = "";
    const originalStdout = process.stdout.write.bind(process.stdout);
    const originalStderr = process.stderr.write.bind(process.stderr);
    const originalExitCode = process.exitCode;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      stderr += text;
      if (text.includes("error:")) timeline.push("error-print");
      return true;
    }) as typeof process.stderr.write;
    const remapped = occupancyCloudCompatError(
      {
        code: "bad_request",
        category: "user",
        message: "Input validation failed",
        retryable: false,
        details: { phase: "orpc-error-normalization", orpcCode: "BAD_REQUEST" },
      },
      { id: "srv_4lifk0yrcecy", name: "hostinger" },
      {
        repositoryIdentity: "folder.local/cwd/nux-67e3a052-unlinked",
        repository: "https://folder.local/cwd/nux-67e3a052-unlinked.git",
      },
    );
    try {
      await expect(
        presentation.start({
          occupyBootstrap: async ({ reportProgress }) => {
            await reportProgress("Waking the agent…");
            throw remapped;
          },
          executeCommand: async () => ok({}),
          executeQuery: async <T>() => ok({ items: [] } as T),
        }),
      ).rejects.toMatchObject({
        code: "workspace_open_folder_local_input_invalid",
      });
      expect(renderer.messages[0]).toEqual({
        type: "loading",
        collapsed: true,
        title: "Appaloft Cloud Agents",
      });
      expect(renderer.messages).toContainEqual({
        type: "progress",
        message: "Waking the agent…",
        step: "disk",
        status: "failed",
      });
      expect(renderer.messages.some((message) => message.type === "error")).toBeFalse();
      expect(renderer.closed).toBeGreaterThan(0);
      expect(timeline.some((entry) => entry.startsWith("restore:"))).toBeTrue();
      expect(timeline.includes("error-print")).toBeFalse();
      const restoreEntries = timeline.filter((entry) => entry.startsWith("restore:"));
      expect(restoreEntries).toHaveLength(1);
      const restoredBeforePrint = restoreEntries.join("");
      expect(restoredBeforePrint).toContain(WORKSPACE_TUI_LEAVE_ALT_SCREEN);
      expect(restoredBeforePrint).toContain("\x1b[?1049l");

      await Effect.runPromise(printCliError(remapped));

      expect(timeline.includes("error-print")).toBeTrue();
      expect(timeline.findIndex((entry) => entry.startsWith("restore:"))).toBeLessThan(
        timeline.indexOf("error-print"),
      );
      expect(stdout).not.toContain("error:");
      expect(stderr).not.toBe("Input validation failed");
      expect(stderr).not.toContain("error: Input validation failed\n");
      expect(stderr).toContain("Cloud could not start this folder session on hostinger");
      expect(stderr).toContain("appaloft code --pi --server srv_4lifk0yrcecy");
      expect(stderr).not.toContain("This Cloud does not accept Server targeting");
      expect(stderr).not.toMatch(/occupancy/iu);
      expect(stderr).not.toContain("sbx_");
      expect(JSON.stringify(renderer.messages)).not.toMatch(/occupancy/iu);
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
      process.exitCode = originalExitCode ?? 0;
      setWorkspaceTuiScrollbackWriter(undefined);
    }
  });

  test("[WS-REMOTE-COMPAT-222][WS-REMOTE-PROGRESS-224] occupy Cloudflare 502 fail-closes without Opening folder.local", async () => {
    const { formatHumanCliError } = await import("../src/runtime.js");
    const { occupancyCloudCompatError } = await import("../src/remote-code-session.js");
    const renderer = new FakeRendererSession([]);
    let closedDuringOccupy = -1;
    renderer.events = async function* events() {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (
          this.messages.some(
            (message) => message.type === "progress" && message.status === "retrying",
          ) ||
          this.closed > 0
        ) {
          break;
        }
        await Promise.resolve();
      }
      closedDuringOccupy = this.closed;
      yield { type: "quit" };
    };
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    const timeline: string[] = [];
    setWorkspaceTuiScrollbackWriter((text) => {
      timeline.push(`restore:${text}`);
    });
    let stdout = "";
    let stderr = "";
    const originalStdout = process.stdout.write.bind(process.stdout);
    const originalStderr = process.stderr.write.bind(process.stderr);
    const originalExitCode = process.exitCode;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      stderr += text;
      if (text.includes("error:")) timeline.push("error-print");
      return true;
    }) as typeof process.stderr.write;
    const remapped = occupancyCloudCompatError(
      {
        code: "sdk_unstructured_error",
        category: "infra",
        message:
          "The server returned an error that did not match the Appaloft error contract. HTTP 502 Body: {cloudflare 502 bad gateway, origin invalid or incomplete response}",
        retryable: true,
        details: {
          status: 502,
          bodyPreview: "{cloudflare 502 bad gateway, origin invalid or incomplete response}",
        },
      },
      { id: "srv_4lifk0yrcecy", name: "hostinger" },
      {
        repositoryIdentity: "folder.local/cwd/appaloft-cloud",
        repository: "https://folder.local/cwd/appaloft-cloud.git",
      },
      { alias: "pi", harness: "pi" },
    );
    try {
      await expect(
        presentation.start({
          occupyBootstrap: async ({ reportProgress }) => {
            await reportProgress("Loading your project…");
            await reportProgress("Including your skills…");
            await reportProgress("Waking the agent…");
            throw remapped;
          },
          executeCommand: async () => ok({}),
          executeQuery: async <T>() => ok({ items: [] } as T),
        }),
      ).rejects.toMatchObject({
        code: "workspace_open_cloud_temporarily_unreachable",
      });
      expect(closedDuringOccupy).toBeGreaterThanOrEqual(0);
      expect(renderer.closed).toBeGreaterThan(0);
      expect(renderer.messages[0]).toEqual({
        type: "loading",
        collapsed: true,
        title: "Appaloft Cloud Agents",
      });
      expect(renderer.messages).toContainEqual({
        type: "progress",
        message: "Waking the agent…",
        step: "disk",
      });
      expect(
        renderer.messages.some(
          (message) => message.type === "progress" && message.status === "failed",
        ),
      ).toBeTrue();
      expect(renderer.messages.some((message) => message.type === "terminal-ready")).toBeFalse();
      expect(`${stdout}${stderr}`).not.toContain("Opening folder.local");
      expect(`${stdout}${stderr}`).not.toContain("folder.local/cwd/appaloft-cloud");
      expect(remapped.details).not.toHaveProperty("repositoryIdentity");
      const printed = formatHumanCliError(remapped);
      expect(printed).toContain("Cloud is temporarily unreachable");
      expect(printed).toContain("HTTP 502");
      expect(printed).toContain("appaloft code --pi --server srv_4lifk0yrcecy");
      expect(printed).not.toContain("Opening folder.local");
      expect(printed).not.toContain("folder.local/cwd/appaloft-cloud");
      expect(printed).not.toContain("did not match the Appaloft error contract");
      expect(printed).not.toMatch(/occupancy/iu);
      expect(JSON.stringify(renderer.messages)).not.toMatch(/occupancy/iu);
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
      process.exitCode = originalExitCode ?? 0;
      setWorkspaceTuiScrollbackWriter(undefined);
    }
  });

  test("[WS-REMOTE-PROGRESS-223] Preparing disk 502/503 keeps the wait panel up, retries, then attaches", async () => {
    const { err, ok } = await import("@appaloft/core");
    const { occupancyCloudCompatError, openWorkspaceWithOccupyDiskGatewayRetry } =
      await import("../src/remote-code-session.js");
    const cloudflare502 = {
      code: "sdk_unstructured_error",
      category: "infra" as const,
      message:
        "The server returned an error that did not match the Appaloft error contract. HTTP 502 Body: {cloudflare 502 bad gateway, origin invalid or incomplete response}",
      retryable: true,
      details: {
        status: 502,
        bodyPreview: "{cloudflare 502 bad gateway, origin invalid or incomplete response}",
      },
    };
    const html503 = {
      code: "control_plane_unexpected_html_response",
      category: "infra" as const,
      message: "Control plane returned HTML instead of JSON.",
      retryable: true,
      details: { status: 503, bodyKind: "html" },
    };
    const terminal = {
      detached: 0,
      async *[Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {},
      write: () => Promise.resolve(),
      resize: () => Promise.resolve(),
      detach() {
        this.detached += 1;
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    } satisfies TerminalSession & { detached: number };
    const renderer = new FakeRendererSession([]);
    renderer.events = async function* events() {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (this.messages.some((message) => message.type === "terminal-ready") || this.closed > 0) {
          break;
        }
        await Promise.resolve();
      }
      yield { type: "quit" };
    };
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    const timeline: string[] = [];
    setWorkspaceTuiScrollbackWriter((text) => {
      timeline.push(`restore:${text}`);
    });
    let stdout = "";
    let stderr = "";
    const originalStdout = process.stdout.write.bind(process.stdout);
    const originalStderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;
    let opens = 0;
    let closedDuringRetry = -1;
    let restoreDuringRetry = false;
    try {
      await presentation.start({
        occupancyChrome: { project: "appaloft-clo-cloud" },
        occupyBootstrap: async ({ reportProgress }) => {
          await reportProgress("Loading your project…");
          await reportProgress("Including your skills…");
          await reportProgress("Waking the agent…");
          const opened = await openWorkspaceWithOccupyDiskGatewayRetry(
            async () => {
              opens += 1;
              if (opens === 1) return err(cloudflare502);
              if (opens === 2) return err(html503);
              return ok({ workspaceId: "ws_hostinger" });
            },
            {
              delayMs: 0,
              onRetry: async () => {
                closedDuringRetry = renderer.closed;
                restoreDuringRetry = timeline.some((entry) => entry.startsWith("restore:"));
                await reportProgress("Waking the agent…", { status: "retrying" });
              },
            },
          );
          if (opened.isErr()) {
            throw occupancyCloudCompatError(
              opened.error,
              { id: "srv_4lifk0yrcecy", name: "hostinger" },
              undefined,
              { alias: "omp", harness: "omp" },
            );
          }
          return {
            workspaceId: "ws_hostinger",
            projectName: "appaloft-clo-cloud",
            attach: {
              workspaceId: "ws_hostinger",
              runtimeId: "sar_1",
              transport: "managed-terminal",
              sessionId: "term_occupy",
              processId: "proc_1",
              access: {
                kind: "websocket",
                path: "/sessions/term_occupy",
                expiresAt: "2099-01-01T00:00:00.000Z",
              },
            },
          };
        },
        executeCommand: async () => ok({}),
        executeQuery: async <T>() => ok({ items: [] } as T),
        terminalSessionGateway: { attach: () => ok(terminal) },
      });
      expect(opens).toBe(3);
      expect(closedDuringRetry).toBe(0);
      expect(restoreDuringRetry).toBeFalse();
      expect(renderer.messages[0]).toEqual({
        type: "loading",
        collapsed: true,
        title: "Appaloft Cloud Agents",
        project: "appaloft-clo-cloud",
      });
      expect(renderer.messages).toContainEqual({
        type: "progress",
        message: "Waking the agent…",
        step: "disk",
      });
      expect(renderer.messages).toContainEqual({
        type: "progress",
        message: "Waking the agent…",
        step: "disk",
        status: "retrying",
      });
      expect(
        renderer.messages.some(
          (message) => message.type === "progress" && message.status === "failed",
        ),
      ).toBeFalse();
      expect(renderer.messages.some((message) => message.type === "error")).toBeFalse();
      expect(renderer.messages).toContainEqual({
        type: "terminal-ready",
        workspaceId: "ws_hostinger",
        runtimeId: "sar_1",
        sessionId: "term_occupy",
      });
      const attachAt = renderer.messages.findIndex((message) => message.type === "terminal-ready");
      const restoreBeforeAttach = timeline.filter((entry) => entry.startsWith("restore:")).join("");
      expect(attachAt).toBeGreaterThan(-1);
      expect(restoreBeforeAttach).not.toContain("\x1b[?1049l");
      expect(`${stdout}${stderr}`).not.toContain("did not match the Appaloft error contract");
      expect(`${stdout}${stderr}`).not.toContain("cloudflare 502 bad gateway");
      expect(`${stdout}${stderr}`.toLowerCase()).not.toContain("occupancy");
      expect(JSON.stringify(renderer.messages)).not.toMatch(/occupancy/iu);
      expect(JSON.stringify(renderer.messages)).not.toContain("sbx_");
      expect(JSON.stringify(renderer.messages)).not.toContain("focus_mode");
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
      setWorkspaceTuiScrollbackWriter(undefined);
    }
  });

  test("[WS-REMOTE-PROGRESS-223][WS-REMOTE-COMPAT-222] Preparing disk 502 keeps retrying past a 4-attempt burst without leaving alt", async () => {
    const { err, ok } = await import("@appaloft/core");
    const { formatHumanCliError } = await import("../src/runtime.js");
    const {
      DEFAULT_OCCUPY_DISK_GATEWAY_ATTEMPTS,
      occupancyCloudCompatError,
      OCCUPY_DISK_GATEWAY_UNLIMITED_ATTEMPTS,
      openWorkspaceWithOccupyDiskGatewayRetry,
    } = await import("../src/remote-code-session.js");
    const cloudflare502 = {
      code: "sdk_unstructured_error",
      category: "infra" as const,
      message:
        "The server returned an error that did not match the Appaloft error contract. HTTP 502 Body: {cloudflare 502 bad gateway, origin invalid or incomplete response}",
      retryable: true,
      details: {
        status: 502,
        bodyPreview: "{cloudflare 502 bad gateway, origin invalid or incomplete response}",
      },
    };
    const terminal = {
      detached: 0,
      async *[Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {},
      write: () => Promise.resolve(),
      resize: () => Promise.resolve(),
      detach() {
        this.detached += 1;
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    } satisfies TerminalSession & { detached: number };
    const renderer = new FakeRendererSession([]);
    renderer.events = async function* events() {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (this.messages.some((message) => message.type === "terminal-ready") || this.closed > 0) {
          break;
        }
        await Promise.resolve();
      }
      yield { type: "quit" };
    };
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    const timeline: string[] = [];
    setWorkspaceTuiScrollbackWriter((text) => {
      timeline.push(`restore:${text}`);
    });
    let stdout = "";
    let stderr = "";
    const originalStdout = process.stdout.write.bind(process.stdout);
    const originalStderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;
    let opens = 0;
    let closedDuringRetry = -1;
    try {
      await presentation.start({
        occupancyChrome: { project: "appaloft-cloud" },
        occupyBootstrap: async ({ reportProgress }) => {
          await reportProgress("Loading your project…");
          await reportProgress("Including your skills…");
          await reportProgress("Waking the agent…");
          const opened = await openWorkspaceWithOccupyDiskGatewayRetry(
            async () => {
              opens += 1;
              if (opens <= DEFAULT_OCCUPY_DISK_GATEWAY_ATTEMPTS) return err(cloudflare502);
              return ok({ workspaceId: "ws_hostinger" });
            },
            {
              delayMs: 0,
              attempts: OCCUPY_DISK_GATEWAY_UNLIMITED_ATTEMPTS,
              onRetry: async () => {
                closedDuringRetry = renderer.closed;
                await reportProgress("Waking the agent…", { status: "retrying" });
              },
            },
          );
          if (opened.isErr()) {
            throw occupancyCloudCompatError(
              opened.error,
              { id: "srv_4lifk0yrcecy", name: "hostinger" },
              {
                repositoryIdentity: "folder.local/cwd/appaloft-cloud",
                repository: "https://folder.local/cwd/appaloft-cloud.git",
              },
              { alias: "pi", harness: "pi" },
            );
          }
          return {
            workspaceId: "ws_hostinger",
            projectName: "appaloft-cloud",
            attach: {
              workspaceId: "ws_hostinger",
              runtimeId: "sar_1",
              transport: "managed-terminal",
              sessionId: "term_occupy",
              processId: "proc_1",
              access: {
                kind: "websocket",
                path: "/sessions/term_occupy",
                expiresAt: "2099-01-01T00:00:00.000Z",
              },
            },
          };
        },
        executeCommand: async () => ok({}),
        executeQuery: async <T>() => ok({ items: [] } as T),
        terminalSessionGateway: { attach: () => ok(terminal) },
      });
      expect(opens).toBe(DEFAULT_OCCUPY_DISK_GATEWAY_ATTEMPTS + 1);
      expect(closedDuringRetry).toBe(0);
      expect(renderer.messages).toContainEqual({
        type: "progress",
        message: "Waking the agent…",
        step: "disk",
        status: "retrying",
      });
      expect(
        renderer.messages.some(
          (message) => message.type === "progress" && message.status === "failed",
        ),
      ).toBeFalse();
      expect(renderer.messages.some((message) => message.type === "error")).toBeFalse();
      expect(renderer.messages).toContainEqual({
        type: "terminal-ready",
        workspaceId: "ws_hostinger",
        runtimeId: "sar_1",
        sessionId: "term_occupy",
      });
      const restoreDuringOccupy = timeline.filter((entry) => entry.startsWith("restore:")).join("");
      expect(restoreDuringOccupy).not.toContain("\x1b[?1049l");
      expect(`${stdout}${stderr}`).not.toContain("Opening folder.local");
      expect(`${stdout}${stderr}`).not.toContain("folder.local/cwd/appaloft-cloud");
      expect(`${stdout}${stderr}`).not.toContain("did not match the Appaloft error contract");
      expect(`${stdout}${stderr}`.toLowerCase()).not.toContain("occupancy");
      const leftover = occupancyCloudCompatError(
        {
          ...cloudflare502,
          details: {
            ...cloudflare502.details,
            repositoryIdentity: "folder.local/cwd/appaloft-cloud",
          },
        },
        { id: "srv_4lifk0yrcecy", name: "hostinger" },
        {
          repositoryIdentity: "folder.local/cwd/appaloft-cloud",
          repository: "https://folder.local/cwd/appaloft-cloud.git",
        },
        { alias: "pi", harness: "pi" },
      );
      const printed = formatHumanCliError({
        ...leftover,
        details: {
          ...leftover.details,
          repositoryIdentity: "folder.local/cwd/appaloft-cloud",
        },
      });
      expect(printed).not.toContain("Opening folder.local");
      expect(printed).not.toContain("Opening folder.local/cwd/appaloft-cloud");
      expect(printed).toContain("Cloud is temporarily unreachable");
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
      setWorkspaceTuiScrollbackWriter(undefined);
    }
  });

  test("[WS-REMOTE-PROGRESS-224][WS-REMOTE-COMPAT-222] live TUI 502 fail-closes without Opening folder.local", async () => {
    const { formatHumanCliError } = await import("../src/runtime.js");
    const { occupancyCloudCompatError } = await import("../src/remote-code-session.js");
    class RustOwnedRenderer extends FakeRendererSession {
      readonly ownsLeaveAltScreen = true;
      override close(): Promise<void> {
        if (this.closed === 0) {
          process.stdout.write(WORKSPACE_TUI_LEAVE_ALT_SCREEN);
        }
        return super.close();
      }
    }
    const renderer = new RustOwnedRenderer([]);
    let leaveAltDuringOccupy = 0;
    renderer.events = async function* events() {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (
          this.messages.some(
            (message) => message.type === "progress" && message.status === "retrying",
          ) ||
          this.closed > 0
        ) {
          break;
        }
        await Promise.resolve();
      }
      leaveAltDuringOccupy = stdout.split("\x1b[?1049l").length - 1;
      yield { type: "quit" };
    };
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    const timeline: string[] = [];
    setWorkspaceTuiScrollbackWriter((text) => {
      timeline.push(`restore:${text}`);
    });
    let stdout = "";
    let stderr = "";
    const originalStdout = process.stdout.write.bind(process.stdout);
    const originalStderr = process.stderr.write.bind(process.stderr);
    const originalExitCode = process.exitCode;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      stderr += text;
      if (text.includes("error:")) timeline.push("error-print");
      return true;
    }) as typeof process.stderr.write;
    const remapped = occupancyCloudCompatError(
      {
        code: "sdk_unstructured_error",
        category: "infra",
        message:
          "The server returned an error that did not match the Appaloft error contract. HTTP 502 Body: {cloudflare 502 bad gateway, origin invalid or incomplete response}",
        retryable: true,
        details: {
          status: 502,
          bodyPreview: "{cloudflare 502 bad gateway, origin invalid or incomplete response}",
          repositoryIdentity: "folder.local/cwd/appaloft-cloud",
        },
      },
      { id: "srv_4lifk0yrcecy", name: "hostinger" },
      {
        repositoryIdentity: "folder.local/cwd/appaloft-cloud",
        repository: "https://folder.local/cwd/appaloft-cloud.git",
      },
      { alias: "pi", harness: "pi" },
    );
    try {
      await expect(
        presentation.start({
          occupyBootstrap: async ({ reportProgress }) => {
            await reportProgress("Loading your project…");
            await reportProgress("Including your skills…");
            await reportProgress("Waking the agent…");
            throw remapped;
          },
          executeCommand: async () => ok({}),
          executeQuery: async <T>() => ok({ items: [] } as T),
        }),
      ).rejects.toMatchObject({
        code: "workspace_open_cloud_temporarily_unreachable",
      });
      expect(
        renderer.messages.some(
          (message) => message.type === "progress" && message.status === "failed",
        ),
      ).toBeTrue();
      expect(renderer.messages.some((message) => message.type === "terminal-ready")).toBeFalse();
      expect(leaveAltDuringOccupy).toBeGreaterThanOrEqual(0);
      expect(`${stdout}${stderr}`).not.toContain("Opening folder.local");
      const printed = formatHumanCliError({
        ...remapped,
        details: {
          ...remapped.details,
          repositoryIdentity: "folder.local/cwd/appaloft-cloud",
        },
      });
      expect(printed).not.toContain("Opening folder.local");
      expect(printed).toContain("Cloud is temporarily unreachable");
      expect(printed).toContain("HTTP 502");
      expect(printed).not.toContain("did not match the Appaloft error contract");
      expect(`${stdout}${stderr}`).not.toMatch(/occupancy/iu);
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
      process.exitCode = originalExitCode ?? 0;
      setWorkspaceTuiScrollbackWriter(undefined);
    }
  });

  test("[WS-REMOTE-PROGRESS-225][WS-REMOTE-PROGRESS-226] quit during in-flight Preparing disk hang is not exit 0 success", async () => {
    const { openWorkspaceWithOccupyDiskGatewayRetry, WORKSPACE_OPEN_DISK_PREP_CANCELLED } =
      await import("../src/remote-code-session.js");
    const renderer = new FakeRendererSession([]);
    renderer.events = async function* events() {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (
          this.messages.some(
            (message) =>
              message.type === "progress" && message.message === "Waking the agent…",
          )
        ) {
          break;
        }
        await Promise.resolve();
      }
      yield { type: "quit" };
    };
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    const started = Date.now();
    await expect(
      presentation.start({
        occupyBootstrap: async ({ reportProgress, signal }) => {
          await reportProgress("Waking the agent…");
          const hung = await openWorkspaceWithOccupyDiskGatewayRetry(
            () => new Promise(() => undefined),
            {
              delayMs: 0,
              attempts: Number.POSITIVE_INFINITY,
              deadlineMs: 5_000,
              attemptTimeoutMs: 5_000,
              signal,
            },
          );
          if (hung.isErr()) throw hung.error;
          return undefined;
        },
        executeCommand: async () => ok({}),
        executeQuery: async <T>() => ok({ items: [] } as T),
      }),
    ).rejects.toMatchObject({
      code: WORKSPACE_OPEN_DISK_PREP_CANCELLED,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(renderer.closed).toBeGreaterThan(0);
    expect(renderer.messages.some((message) => message.type === "terminal-ready")).toBeFalse();
    const source = await Bun.file(
      new URL("../src/workspace-control-presentation.ts", import.meta.url),
    ).text();
    expect(source).toContain("occupyPending");
    expect(source).toContain("if (input.occupyPending) {\n    return;");
  });

  test("[WS-TUI-HOME-001] workspace TTY opens occupancy home before occupy", async () => {
    const renderer = new FakeRendererSession([{ type: "quit" }]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    await presentation.start({
      occupancyHome: true,
      occupancyChrome: { project: "appaloft-cloud" },
      occupyBootstrap: async () => {
        throw new Error("home must not occupy until enter");
      },
      executeCommand: async () => ok({}),
      executeQuery: async <T>() =>
        ok({
          items: [{ id: "prj_home", name: "appaloft-cloud" }],
        } as T),
    });
    expect(renderer.messages[0]).toMatchObject({
      type: "chrome",
      home: true,
      title: "Appaloft Cloud Agents",
      project: "appaloft-cloud",
      vendors: ["grok", "codex", "claude", "opencode", "pi"],
      targets: [{ projectId: "prj_home", name: "appaloft-cloud" }],
    });
    expect(renderer.messages.some((message) => message.type === "loading")).toBe(false);
  });

  test("[WS-TUI-HOME-001] occupy failure from home stays on home", async () => {
    const renderer = new FakeRendererSession([
      { type: "launch", vendor: "grok", forceNew: false },
      { type: "quit" },
    ]);
    const presentation = createBoundedWorkspaceControlPresentation({
      openRenderer: async () => renderer,
    });
    await presentation.start({
      occupancyHome: true,
      occupancyChrome: { project: "appaloft-cloud", selectedVendor: "grok" },
      occupyBootstrap: async () => {
        throw {
          code: "workspace_remote_server_missing",
          message: "No enrolled Server is available for a remote Agent session",
        };
      },
      executeCommand: async () => ok({}),
      executeQuery: async <T>() => ok({ items: [] } as T),
    });
    expect(renderer.messages.some((message) => message.type === "loading")).toBe(true);
    expect(
      renderer.messages.some(
        (message) =>
          message.type === "error" &&
          message.code === "workspace_remote_server_missing" &&
          message.message === "No enrolled Server is available for a remote Agent session",
      ),
    ).toBe(true);
    expect(renderer.messages.filter((message) => message.type === "chrome").length).toBeGreaterThan(
      1,
    );
    expect(renderer.closed).toBe(1);
  });

  test("[WS-TUI-HOME-001] code occupy session end leaves the TUI instead of opening home", async () => {
    const renderer = new FakeRendererSession([], { hangUntilClose: true });
    const terminal = {
      detached: 0,
      async *[Symbol.asyncIterator]() {
        yield { kind: "closed" as const, reason: "source-ended", exitCode: 0 };
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
      occupyBootstrap: async () => ({
        workspaceId: "sbx_1",
        attach: {
          workspaceId: "sbx_1",
          runtimeId: "sar_1",
          transport: "managed-terminal",
          sessionId: "term_occupy",
          processId: "proc_1",
          access: {
            kind: "websocket",
            path: "/sessions/term_occupy",
            expiresAt: "2099-01-01T00:00:00.000Z",
          },
        },
      }),
      executeCommand: async () => ok({}),
      executeQuery: async <T>() => ok({ items: [] } as T),
      terminalSessionGateway: { attach: () => ok(terminal) },
    });
    expect(renderer.closed).toBeGreaterThan(0);
    expect(
      renderer.messages.some((message) => message.type === "chrome" && message.home === true),
    ).toBe(false);
    expect(renderer.messages.some((message) => message.type === "terminal-closed")).toBe(false);
  });

});
