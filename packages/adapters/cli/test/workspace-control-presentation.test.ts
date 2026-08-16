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

    const workspaces = renderer.messages.find((message) => message.type === "workspaces");
    expect(workspaces).toEqual({
      type: "workspaces",
      workspaces: [
        {
          workspaceId: "sbx_ready",
          status: "ready",
          occupancy: {
            repositoryIdentity: "github.com/traefik/whoami",
            commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
            branch: "master",
          },
        },
        { workspaceId: "sbx_provisioning", status: "provisioning" },
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
});
