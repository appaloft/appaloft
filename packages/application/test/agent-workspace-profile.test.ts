import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import {
  AgentAdapterInstallationService,
  type AgentWorkspaceProfileCompiledPlan,
  AgentWorkspaceProfileInstallationService,
  createExecutionContext,
  InMemoryAgentAdapterRegistryRepository,
  InMemoryAgentWorkspaceProfileRegistryRepository,
} from "../src";

const now = "2026-07-27T00:00:00.000Z";
const adapterDigest = `sha256:${"a".repeat(64)}`;
const profileDigest = `sha256:${"b".repeat(64)}`;
const templateDigest = `sha256:${"c".repeat(64)}`;

function context(tenantId: string) {
  return createExecutionContext({
    entrypoint: "http",
    actor: { kind: "user", id: `usr_${tenantId}` },
    principal: { kind: "user", actorId: `usr_${tenantId}`, userId: `usr_${tenantId}` },
    tenant: { tenantId, organizationId: tenantId, subjectId: `usr_${tenantId}` },
    requestId: `req_${tenantId}`,
  });
}

function adapterManifest() {
  return {
    id: "codex-cli",
    version: "1.2.3",
    displayName: "Codex CLI",
    digest: adapterDigest,
  };
}

function profileManifest() {
  return {
    id: "codex-standard",
    version: "1.0.0",
    displayName: "Codex Standard",
    adapterDefinitionDigest: adapterDigest,
  };
}

function compiledPlan(
  profileInstallationId: string,
  adapterInstallationId: string,
): AgentWorkspaceProfileCompiledPlan {
  const harnessKey = `declarative-codex-${profileDigest.slice(7, 19)}`;
  return {
    sandbox: {
      source: { kind: "template", templateId: "node-agent" },
      requestedIsolation: "container-trusted",
      limits: {
        cpuMillis: 2_000,
        memoryBytes: 4_294_967_296,
        diskBytes: 21_474_836_480,
        maxProcesses: 128,
      },
      networkPolicy: { mode: "deny" },
    },
    initialization: [],
    runtime: {
      harnessKey,
      harnessTemplateId: "aht_codex_declarative_v1",
      declarativeHarness: { key: harnessKey },
    },
    defaultPorts: [],
    suggestedChecks: [],
    credentialRequirements: [],
    pin: {
      profileInstallationId,
      profileDefinitionDigest: profileDigest,
      profileId: "codex-standard",
      profileVersion: "1.0.0",
      adapterInstallationId,
      adapterDefinitionDigest: adapterDigest,
      adapterId: "codex-cli",
      adapterVersion: "1.2.3",
      harnessKey,
      harnessTemplateId: "aht_codex_declarative_v1",
      sandboxTemplateId: "node-agent",
      sandboxTemplateVersion: "22.4.1",
      sandboxTemplateDigest: templateDigest,
      capabilities: {
        taskMode: true,
        interactive: true,
        backgroundRuns: true,
        nativeSession: false,
        persistentPaths: ["/workspace/.codex"],
        healthcheck: { kind: "process" },
      },
    },
  };
}

function harness() {
  let sequence = 0;
  const adapterRepository = new InMemoryAgentAdapterRegistryRepository();
  const adapterService = new AgentAdapterInstallationService({
    repository: adapterRepository,
    referenceReader: { countActiveWorkspaceReferences: async () => 0 },
    clock: { now: () => now },
    idGenerator: { next: (prefix) => `${prefix}_${++sequence}` },
    manifestValidator: {
      validate: (input) => {
        const manifest = input as ReturnType<typeof adapterManifest>;
        return {
          ok: true as const,
          definition: {
            manifest,
            digest: manifest.digest,
            canonicalManifest: JSON.stringify(manifest),
            adapterId: manifest.id,
            adapterVersion: manifest.version,
            displayName: manifest.displayName,
            compatibility: {
              status: "compatible" as const,
              unavailableOptionalCapabilities: [],
            },
          },
        };
      },
    },
  });
  const profileRepository = new InMemoryAgentWorkspaceProfileRegistryRepository();
  const activeReferences = new Map<string, number>();
  const registeredHarnesses: Readonly<Record<string, unknown>>[] = [];
  const service = new AgentWorkspaceProfileInstallationService({
    repository: profileRepository,
    referenceReader: {
      countActiveWorkspaceReferences: async (_context, installationId) =>
        activeReferences.get(installationId) ?? 0,
    },
    adapterService,
    clock: { now: () => now },
    idGenerator: { next: (prefix) => `${prefix}_${++sequence}` },
    validatorCompiler: {
      validate: (input) => {
        const manifest = input as ReturnType<typeof profileManifest>;
        return {
          ok: true as const,
          definition: {
            manifest,
            digest: profileDigest,
            canonicalManifest: JSON.stringify(manifest),
            profileId: manifest.id,
            profileVersion: manifest.version,
            displayName: manifest.displayName,
            adapterDefinitionDigest: manifest.adapterDefinitionDigest,
          },
        };
      },
      compile: (_manifest, input) => {
        const plan = compiledPlan(
          input.profileInstallationId,
          input.adapterInstallation.installation.installationId,
        );
        return {
          ok: true as const,
          plan: {
            ...plan,
            ...(input.credentialReferences
              ? {
                  credentialBindings: input.credentialReferences.map((reference) => ({
                    requirementId: reference.requirementId,
                    kind: "model-api" as const,
                    purpose: "Codex model access",
                    delivery: {
                      kind: "process-environment" as const,
                      variable: "OPENAI_API_KEY",
                    },
                    connectionReference: reference.connectionReference,
                  })),
                }
              : {}),
          },
        };
      },
    },
    harnessRegistrar: {
      register: (descriptor) => {
        registeredHarnesses.push(descriptor);
        return ok(undefined);
      },
    },
  });
  return {
    activeReferences,
    adapterService,
    registeredHarnesses,
    service,
  };
}

describe("Agent Workspace Profile installation and compilation", () => {
  test("[PROFILE-MANIFEST-009] installs immutable tenant-scoped Profile definitions", async () => {
    const { adapterService, service } = harness();
    expect(
      (await adapterService.install(context("org_a"), { manifest: adapterManifest() })).isOk(),
    ).toBe(true);
    const first = await service.install(context("org_a"), { manifest: profileManifest() });
    const repeated = await service.install(context("org_a"), { manifest: profileManifest() });
    const otherTenant = await service.install(context("org_b"), { manifest: profileManifest() });

    expect(first.isOk()).toBe(true);
    expect(repeated.isOk()).toBe(true);
    expect(otherTenant.isOk()).toBe(true);
    if (first.isErr() || repeated.isErr() || otherTenant.isErr()) return;
    expect(repeated.value.installationId).toBe(first.value.installationId);
    expect(otherTenant.value.installationId).not.toBe(first.value.installationId);
    const tenantAList = await service.list(context("org_a"));
    const tenantBList = await service.list(context("org_b"));
    expect(tenantAList.isOk()).toBe(true);
    expect(tenantBList.isOk()).toBe(true);
    if (tenantAList.isErr() || tenantBList.isErr()) return;
    expect(tenantAList.value).toHaveLength(1);
    expect(tenantBList.value).toHaveLength(1);
  });

  test("[PROFILE-PIN-010][ADAPTER-CAP-004] compiles and registers an immutable resolved pin", async () => {
    const { adapterService, registeredHarnesses, service } = harness();
    const adapter = await adapterService.install(context("org_a"), {
      manifest: adapterManifest(),
    });
    const profile = await service.install(context("org_a"), { manifest: profileManifest() });
    expect(adapter.isOk()).toBe(true);
    expect(profile.isOk()).toBe(true);
    if (adapter.isErr() || profile.isErr()) return;

    const compiled = await service.compileForNewWorkspace(
      context("org_a"),
      profile.value.installationId,
    );
    expect(compiled.isOk()).toBe(true);
    if (compiled.isErr()) return;
    expect(compiled.value.pin).toMatchObject({
      profileInstallationId: profile.value.installationId,
      profileDefinitionDigest: profileDigest,
      adapterInstallationId: adapter.value.installationId,
      adapterDefinitionDigest: adapterDigest,
      harnessKey: compiled.value.runtime.harnessKey,
      capabilities: {
        taskMode: true,
        interactive: true,
      },
    });
    expect(registeredHarnesses).toEqual([{ key: compiled.value.runtime.harnessKey }]);
  });

  test("[ADAPTER-CRED-006][PROFILE-PIN-010] compiles named references into the pinned plan", async () => {
    const { adapterService, service } = harness();
    await adapterService.install(context("org_a"), { manifest: adapterManifest() });
    const profile = await service.install(context("org_a"), { manifest: profileManifest() });
    expect(profile.isOk()).toBe(true);
    if (profile.isErr()) return;

    const configured = await service.configureCredentialConnections(context("org_a"), {
      installationId: profile.value.installationId,
      connections: [{ requirementId: "model-api", connectionReference: "model-default" }],
    });
    expect(configured.isOk()).toBe(true);
    const compiled = await service.compileForNewWorkspace(
      context("org_a"),
      profile.value.installationId,
    );

    expect(compiled._unsafeUnwrap().credentialBindings).toEqual([
      {
        requirementId: "model-api",
        kind: "model-api",
        purpose: "Codex model access",
        delivery: { kind: "process-environment", variable: "OPENAI_API_KEY" },
        connectionReference: "model-default",
      },
    ]);
  });

  test("[PROFILE-PIN-010][ADAPTER-DISABLE-008] disable fences new compiles and active references fence uninstall", async () => {
    const { activeReferences, adapterService, service } = harness();
    await adapterService.install(context("org_a"), { manifest: adapterManifest() });
    const profile = await service.install(context("org_a"), { manifest: profileManifest() });
    expect(profile.isOk()).toBe(true);
    if (profile.isErr()) return;
    activeReferences.set(profile.value.installationId, 1);

    expect((await service.disable(context("org_a"), profile.value.installationId)).isOk()).toBe(
      true,
    );
    expect(
      (
        await service.compileForNewWorkspace(context("org_a"), profile.value.installationId)
      ).isErr(),
    ).toBe(true);
    expect((await service.uninstall(context("org_a"), profile.value.installationId)).isErr()).toBe(
      true,
    );

    activeReferences.set(profile.value.installationId, 0);
    expect((await service.uninstall(context("org_a"), profile.value.installationId)).isOk()).toBe(
      true,
    );
  });
});
