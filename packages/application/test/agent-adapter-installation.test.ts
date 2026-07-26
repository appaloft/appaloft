import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import {
  AgentAdapterInstallationService,
  createExecutionContext,
  InMemoryAgentAdapterRegistryRepository,
} from "../src";

const now = "2026-07-26T12:00:00.000Z";

function context(tenantId: string) {
  return createExecutionContext({
    entrypoint: "http",
    actor: { kind: "user", id: `usr_${tenantId}` },
    principal: { kind: "user", actorId: `usr_${tenantId}`, userId: `usr_${tenantId}` },
    tenant: { tenantId, organizationId: tenantId, subjectId: `usr_${tenantId}` },
    requestId: `req_${tenantId}`,
  });
}

function manifest() {
  return {
    schemaVersion: "appaloft.agent-adapter/v1",
    id: "codex",
    displayName: "Codex",
    version: "1.0.0",
    kind: "declarative",
    requirements: {
      adapterApi: "^1.0.0",
      sandboxTemplate: {
        id: "agent-workspace",
        version: "^1.0.0",
        digest: `sha256:${"1".repeat(64)}`,
      },
      runtimes: [{ id: "codex", version: "^1.0.0" }],
      capabilities: {
        required: ["managed-terminal", "headless"],
        optional: [],
      },
    },
    interactionModes: [
      {
        id: "terminal",
        transport: "terminal",
        command: ["codex"],
        eventFidelity: "raw-pty",
        sessionRecovery: "process-lifetime",
      },
      {
        id: "headless",
        transport: "headless",
        command: ["codex", "exec"],
        taskInput: "append-argument",
        eventFidelity: "line-events",
        sessionRecovery: "managed-run-lineage",
      },
    ],
    persistentPaths: ["/workspace/.codex"],
    healthcheck: { kind: "process" },
    credentials: [],
  };
}

function harness() {
  const repository = new InMemoryAgentAdapterRegistryRepository();
  const activeReferences = new Map<string, number>();
  let sequence = 0;
  const service = new AgentAdapterInstallationService({
    repository,
    referenceReader: {
      countActiveWorkspaceReferences: async (_context, installationId) =>
        activeReferences.get(installationId) ?? 0,
    },
    clock: { now: () => now },
    idGenerator: { next: (prefix) => `${prefix}_${++sequence}` },
    manifestValidator: {
      validate: (input) => {
        const candidate = input as ReturnType<typeof manifest>;
        return {
          ok: true as const,
          definition: {
            manifest: candidate,
            digest: `sha256:${"a".repeat(64)}`,
            canonicalManifest: JSON.stringify(candidate),
            adapterId: candidate.id,
            adapterVersion: candidate.version,
            displayName: candidate.displayName,
            compatibility: {
              status: "compatible" as const,
              unavailableOptionalCapabilities: [],
            },
          },
        };
      },
    },
  });
  return { activeReferences, repository, service };
}

describe("Agent Adapter installation lifecycle", () => {
  test("[ADAPTER-INSTALL-007] definitions dedupe while installation readback remains tenant scoped", async () => {
    const { repository, service } = harness();
    const first = await service.install(context("org_a"), { manifest: manifest() });
    const second = await service.install(context("org_b"), { manifest: manifest() });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    if (first.isErr() || second.isErr()) return;
    expect(first.value.definitionDigest).toBe(second.value.definitionDigest);
    expect(first.value.installationId).not.toBe(second.value.installationId);
    expect(repository.definitionCount()).toBe(1);

    const tenantA = await service.list(context("org_a"));
    const tenantB = await service.list(context("org_b"));
    expect(tenantA.isOk() && tenantA.value.map((item) => item.installationId)).toEqual([
      first.value.installationId,
    ]);
    expect(tenantB.isOk() && tenantB.value.map((item) => item.installationId)).toEqual([
      second.value.installationId,
    ]);

    const leaked = await service.show(context("org_a"), second.value.installationId);
    expect(leaked.isErr()).toBe(true);
  });

  test("[ADAPTER-DISABLE-008] disable blocks new resolution and uninstall fences active references", async () => {
    const { activeReferences, service } = harness();
    const installed = await service.install(context("org_a"), { manifest: manifest() });
    expect(installed.isOk()).toBe(true);
    if (installed.isErr()) return;

    const installationId = installed.value.installationId;
    activeReferences.set(installationId, 1);

    const disabled = await service.disable(context("org_a"), installationId);
    expect(disabled.isOk()).toBe(true);
    expect((await service.resolveForNewWorkspace(context("org_a"), installationId)).isErr()).toBe(
      true,
    );
    expect((await service.uninstall(context("org_a"), installationId)).isErr()).toBe(true);
    expect((await service.show(context("org_a"), installationId)).isOk()).toBe(true);

    activeReferences.set(installationId, 0);
    expect((await service.uninstall(context("org_a"), installationId)).isOk()).toBe(true);
    expect((await service.show(context("org_a"), installationId)).isErr()).toBe(true);
    expect((await service.uninstall(context("org_a"), installationId)).isOk()).toBe(true);
  });
});
