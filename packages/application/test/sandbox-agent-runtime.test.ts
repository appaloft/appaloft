import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { domainError, err, ok } from "@appaloft/core";
import {
  createExecutionContext,
  InMemorySandboxAgentDeliveryRepository,
  type SandboxAgentDeliveryDependencies,
  SandboxAgentDeliveryService,
  type SandboxAgentHarness,
  SandboxAgentHarnessRegistry,
  toRepositoryContext,
} from "../src";

const context = createExecutionContext({
  entrypoint: "http",
  requestId: "req_agent_test",
  tenant: { tenantId: "tenant_a", organizationId: "org_a" },
});

test("[WS-CREATE-PROFILE-009] an exact unique Profile pin aliases the reviewed native Agent harness", async () => {
  const executedTasks: string[] = [];
  const preparedRuntimes: string[] = [];
  const profileInteraction = {
    transport: "managed-terminal" as const,
    command: ["pi", "--provider", "openai", "--model", "deepseek-v4-flash"],
    sessionRecovery: "managed-run-lineage" as const,
  };
  const profileCapabilities = {
    taskMode: true,
    interactive: true,
    backgroundRuns: true,
    nativeSession: false,
    persistentPaths: ["/workspace/.appaloft-agent", "/workspace/.pi"],
    healthcheck: { kind: "process" as const },
  };
  const nativeHarness: SandboxAgentHarness = {
    key: "pi",
    templateId: "aht_pi_managed_v1",
    sandboxTemplateId: "stp_pi_pinned",
    version: "1.0.0",
    templateDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    capabilities: {
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: false,
      persistentPaths: ["/workspace/.appaloft-agent"],
    },
    admitSandbox: (source) => source.kind === "template" && source.templateId === "stp_pi_pinned",
    async execute(input) {
      executedTasks.push(input.task);
      return { events: [], outcomeDigest: "sha256:native-pi" };
    },
    async cancel() {},
  };
  const registry = new SandboxAgentHarnessRegistry([nativeHarness]);

  expect(
    registry.registerAlias({
      key: "declarative-pi-default-0123456789ab",
      templateId: "aht_pi_managed_v1",
      sandboxTemplateId: "stp_pi_pinned",
      version: "1.0.0",
      templateDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      runtimeRequirements: [{ id: "pi", version: ">=1.0.0 <2.0.0" }],
      interaction: profileInteraction,
      capabilities: profileCapabilities,
    }),
  ).toBe(true);
  expect(
    registry.registerAlias({
      key: "declarative-unreviewed-0123456789ab",
      templateId: "aht_pi_managed_v1",
      sandboxTemplateId: "stp_unreviewed",
      version: "1.0.0",
      templateDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      runtimeRequirements: [{ id: "pi", version: ">=1.0.0 <2.0.0" }],
    }),
  ).toBe(false);

  const aliased = registry.resolve("declarative-pi-default-0123456789ab");
  expect(aliased?.key).toBe("declarative-pi-default-0123456789ab");
  expect(aliased?.templateId).toBe(nativeHarness.templateId);
  expect(aliased?.interaction).toEqual(profileInteraction);
  expect(aliased?.capabilities).toEqual(profileCapabilities);
  expect(aliased?.admitSandbox?.({ kind: "template", templateId: "stp_pi_pinned" })).toBe(true);
  await aliased?.execute({
    executionContext: context,
    sandboxId: "sbx_pi",
    runtimeId: "sar_pi",
    runId: "srun_pi",
    task: "Use brokered model access",
    context: { mode: "fresh" },
    requestApproval: async () => "rejected",
  });
  expect(executedTasks).toEqual(["Use brokered model access"]);
  expect(registry.resolve("declarative-unreviewed-0123456789ab")).toBeNull();

  registry.register({
    ...nativeHarness,
    key: "opencode",
    templateId: "aht_opencode_managed_v1",
    sandboxTemplateId: "stp_opencode_pinned",
    version: "1.18.4",
    templateDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    interaction: {
      transport: "native-attach",
      command: ["opencode", "attach", "http://127.0.0.1:4096"],
      sessionRecovery: "native-session-store",
      clientHandoff: "local-client-exec",
      serverPort: 4096,
    },
    prepareRuntime: async ({ runtimeId }) => {
      preparedRuntimes.push(runtimeId);
    },
  });
  const displayOnlyInteraction = {
    transport: "native-attach" as const,
    command: ["opencode", "attach", "http://127.0.0.1:4096"],
    sessionRecovery: "native-session-store" as const,
    clientHandoff: "display-only" as const,
    serverPort: 4096,
  };
  expect(
    registry.registerAlias({
      key: "declarative-opencode-default-0123456789ab",
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.0.0",
      templateDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      runtimeRequirements: [{ id: "opencode", version: ">=1.18.0 <2.0.0" }],
      interaction: displayOnlyInteraction,
      capabilities: {
        ...profileCapabilities,
        nativeSession: true,
        healthcheck: { kind: "http", port: 4096, path: "/global/health" },
      },
    }),
  ).toBe(true);
  const openCodeAlias = registry.resolve("declarative-opencode-default-0123456789ab");
  expect(openCodeAlias?.interaction).toEqual(displayOnlyInteraction);
  await openCodeAlias?.prepareRuntime?.({
    executionContext: context,
    sandboxId: "sbx_opencode",
    runtimeId: "sar_opencode",
  });
  expect(preparedRuntimes).toEqual(["sar_opencode"]);
  expect(
    registry.registerAlias({
      key: "declarative-opencode-incompatible-0123456789ab",
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.0.0",
      templateDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      runtimeRequirements: [{ id: "opencode", version: "<1.18.0" }],
    }),
  ).toBe(false);

  registry.register({ ...nativeHarness, key: "pi-duplicate" });
  expect(() =>
    registry.registerAlias({
      key: "declarative-ambiguous-0123456789ab",
      templateId: "aht_pi_managed_v1",
      sandboxTemplateId: "stp_pi_pinned",
      version: "1.0.0",
      templateDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      runtimeRequirements: [
        { id: "pi", version: ">=1.0.0 <2.0.0" },
        { id: "pi-duplicate", version: ">=1.0.0 <2.0.0" },
      ],
    }),
  ).toThrow("Sandbox Agent harness alias declarative-ambiguous-0123456789ab is ambiguous");
  expect(registry.resolve("declarative-ambiguous-0123456789ab")).toBeNull();
});

test("[R8-OCC-TASK-001] resolves a missing declarative alias to the unique native template after restart", () => {
  const registry = new SandboxAgentHarnessRegistry();
  registry.register({
    key: "opencode",
    templateId: "aht_opencode_managed_v1",
    sandboxTemplateId: "stp_opencode_pinned",
    version: "1.18.4",
    templateDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    capabilities: {
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: true,
      persistentPaths: ["/workspace/.appaloft-agent"],
    },
    async execute() {
      return { events: [], outcomeDigest: "sha256:opencode" };
    },
    async cancel() {},
  });

  expect(registry.resolve("declarative-appaloft-remote-fff987d41dde")).toBeNull();
  expect(
    registry.resolve("declarative-appaloft-remote-fff987d41dde", {
      templateId: "aht_opencode_managed_v1",
    })?.key,
  ).toBe("opencode");
});

test("[R8-OCC-TASK-002] reconciles an occupancy run after restart without the declarative alias", async () => {
  const executed: string[] = [];
  const native: SandboxAgentHarness = {
    key: "opencode",
    templateId: "aht_opencode_managed_v1",
    sandboxTemplateId: "stp_opencode_pinned",
    version: "1.18.4",
    templateDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    capabilities: {
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: true,
      persistentPaths: ["/workspace/.appaloft-agent"],
    },
    async execute(input) {
      executed.push(input.task);
      return { events: [], outcomeDigest: "sha256:occupancy" };
    },
    async cancel() {},
  };
  const alias = {
    key: "declarative-appaloft-remote-fff987d41dde",
    templateId: "aht_opencode_managed_v1",
    sandboxTemplateId: "stp_opencode_pinned",
    version: "1.0.0",
    templateDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    runtimeRequirements: [{ id: "opencode", version: ">=1.18.0 <2.0.0" }],
  };
  const pin = {
    ...credentialProfileFixture().pin,
    harnessKey: alias.key,
    harnessTemplateId: "aht_opencode_managed_v1",
    sandboxTemplateId: "stp_opencode_pinned",
  };
  const profilePlan = {
    ...credentialProfileFixture().profilePlan,
    sandbox: {
      ...credentialProfileFixture().profilePlan.sandbox,
      source: { kind: "template" as const, templateId: "stp_opencode_pinned" },
    },
    runtime: {
      harnessKey: alias.key,
      harnessTemplateId: "aht_opencode_managed_v1",
      declarativeHarness: {},
    },
    credentialRequirements: [],
    credentialBindings: [],
    pin,
  };
  const started = fixture({
    harness: native,
    alias,
    workspaceProfileResolver: {
      async compileForNewWorkspace() {
        return ok(profilePlan);
      },
    },
  });
  const runtime = await started.service.createRuntime(context, {
    sandboxId: "sbx_demo",
    harnessKey: alias.key,
    harnessTemplateId: "aht_opencode_managed_v1",
    idempotencyKey: "runtime_occupancy_restart",
    profileInstallationId: pin.profileInstallationId,
    profilePlan,
  });
  if (runtime.isErr()) throw new Error(JSON.stringify(runtime.error));
  const created = await started.service.createRun(context, {
    sandboxId: "sbx_demo",
    runtimeId: "sar_test",
    task: "open a PR",
    context: { mode: "fresh" },
    idempotencyKey: "run_occupancy_restart",
  });
  expect(created.isOk()).toBe(true);

  const restarted = fixture({
    harness: native,
    repository: started.repository,
  });
  const reconciled = await restarted.service.reconcileRun(context, "srun_test");
  expect(reconciled.isOk()).toBe(true);
  expect(reconciled._unsafeUnwrap().status).toBe("completed");
  expect(executed).toEqual(["open a PR"]);
});

test("[R8-OCC-TASK-003] fails a headless occupancy run when no model is bound", async () => {
  const { service } = fixture({
    harness: {
      key: "opencode",
      templateId: "aht_opencode_managed_v1",
      version: "1.18.4",
      templateDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      async execute() {
        throw new Error("sandbox_agent_model_connection_binding_missing");
      },
      async cancel() {},
    },
  });
  const runtime = await service.createRuntime(context, {
    sandboxId: "sbx_demo",
    harnessKey: "opencode",
    harnessTemplateId: "aht_opencode_managed_v1",
    idempotencyKey: "runtime_occupancy_no_model",
  });
  if (runtime.isErr()) throw new Error(JSON.stringify(runtime.error));
  const created = await service.createRun(context, {
    sandboxId: "sbx_demo",
    runtimeId: "sar_test",
    task: "open a PR",
    context: { mode: "fresh" },
    idempotencyKey: "run_occupancy_no_model",
  });
  if (created.isErr()) throw new Error(JSON.stringify(created.error));
  expect(created._unsafeUnwrap().status).toBe("accepted");

  const reconciled = await service.reconcileRun(context, "srun_test");
  expect(reconciled.isErr()).toBe(true);
  expect((await service.showRun(context, "sar_test", "srun_test"))._unsafeUnwrap()).toMatchObject({
    status: "failed",
    failure: {
      code: "sandbox_agent_model_connection_binding_missing",
      summary: "Connect a model in the Agent session, then retry the Task.",
    },
  });
});

function fixture(
  options: {
    harness?: SandboxAgentHarness;
    alias?: Parameters<SandboxAgentHarnessRegistry["registerAlias"]>[0];
    repository?: InMemorySandboxAgentDeliveryRepository;
    readProof?: () => Promise<{ verdict: "verified" | "failed" | "pending"; reasonCode?: string }>;
    workspaceProfileResolver?: SandboxAgentDeliveryDependencies["workspaceProfileResolver"];
    processCredentialGrants?: SandboxAgentDeliveryDependencies["processCredentialGrants"];
    attachUrl?: string;
  } = {},
) {
  const counters = { resources: 0, deployments: 0 };
  const exposedPorts: Array<{
    sandboxId: string;
    port: number;
    visibility: "private";
    expiresAt: string;
  }> = [];
  const harness: SandboxAgentHarness = options.harness ?? {
    key: "fake",
    templateId: "aht_fake_1",
    version: "1.0.0",
    templateDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    async execute(input) {
      return {
        events: [
          { type: "message", data: { text: `worked:${input.task}` } },
          { type: "tool", data: { command: "bun test", apiToken: "must-redact" } },
        ],
        outcomeDigest: "sha256:run-complete",
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    },
    async cancel() {},
  };
  const queued: Array<{ kind: string; id: string }> = [];
  const repository = options.repository ?? new InMemorySandboxAgentDeliveryRepository();
  const harnessRegistry = new SandboxAgentHarnessRegistry([harness]);
  if (options.alias) expect(harnessRegistry.registerAlias(options.alias)).toBe(true);
  const service = new SandboxAgentDeliveryService({
    repository,
    sandboxReader: {
      async show(_context, sandboxId) {
        return {
          sandboxId,
          status: "ready",
          workspaceRevision: "rev_1",
          source: { kind: "template", templateId: "aht_fake_1" },
        };
      },
    },
    sandboxAccess: {
      async exposePort(_context, sandboxId, input) {
        exposedPorts.push({ sandboxId, ...input });
        return ok({
          exposureId: "sbp_attach",
          port: input.port,
          visibility: input.visibility,
          url: options.attachUrl ?? "https://attach.example.test/capability",
          expiresAt: input.expiresAt,
        });
      },
    },
    harnessRegistry,
    ...(options.workspaceProfileResolver
      ? { workspaceProfileResolver: options.workspaceProfileResolver }
      : {}),
    ...(options.processCredentialGrants
      ? { processCredentialGrants: options.processCredentialGrants }
      : {}),
    workQueue: {
      async enqueue(_context, item) {
        queued.push(item);
      },
    },
    artifactCapture: {
      async capture() {
        return {
          digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          workspaceRevision: "rev_1",
          storeReference: "artifact://sha256/demo",
          entries: [{ path: "index.html", digest: "sha256:file", sizeBytes: 12, mode: "file" }],
        };
      },
      async delete() {},
    },
    previewProvider: {
      async create(_context, input) {
        return {
          previewId: input.previewId,
          artifactDigest: input.artifactDigest,
          status: "ready",
          url: "https://candidate.example.test",
          expiresAt: "2026-07-20T02:00:00.000Z",
          verified: true,
        };
      },
      async delete() {},
    },
    promotionTarget: {
      async createResource() {
        counters.resources += 1;
        return { resourceId: "res_demo" };
      },
      async createDeployment() {
        counters.deployments += 1;
        return {
          deploymentId:
            counters.deployments === 1 ? "dep_demo" : `dep_demo_${counters.deployments}`,
        };
      },
      async readProof() {
        return options.readProof ? options.readProof() : { verdict: "verified" };
      },
    },
    taskProtector: {
      async protect(_context, plaintext) {
        return ok({
          envelope: `test:${Buffer.from(plaintext).toString("base64url")}`,
          keyId: "test",
        });
      },
      async unprotect(_context, envelope) {
        return ok({
          plaintext: Buffer.from(envelope.slice("test:".length), "base64url").toString("utf8"),
          keyId: "test",
        });
      },
    },
    clock: { now: () => "2026-07-20T00:00:00.000Z" },
    idGenerator: { next: (prefix) => `${prefix}_test` },
  });
  return { service, repository, queued, counters, exposedPorts };
}

function credentialProfileFixture() {
  const pin = {
    profileInstallationId: "awpi_codex",
    profileDefinitionDigest: `sha256:${"1".repeat(64)}`,
    profileId: "codex-default",
    profileVersion: "1.0.0",
    adapterInstallationId: "aai_codex",
    adapterDefinitionDigest: `sha256:${"2".repeat(64)}`,
    adapterId: "codex-cli",
    adapterVersion: "1.0.0",
    harnessKey: "fake",
    harnessTemplateId: "aht_fake_1",
    sandboxTemplateId: "aht_fake_1",
    sandboxTemplateVersion: "1.0.0",
    sandboxTemplateDigest: `sha256:${"a".repeat(64)}`,
    capabilities: {
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: false,
      persistentPaths: ["/workspace"],
      healthcheck: { kind: "process" as const },
    },
  };
  const binding = {
    requirementId: "model-api",
    kind: "model-api" as const,
    purpose: "Codex model access",
    delivery: {
      kind: "process-environment" as const,
      variable: "OPENAI_API_KEY",
    },
    connectionReference: "model-default",
  };
  return {
    pin,
    binding,
    profilePlan: {
      sandbox: {
        source: { kind: "template" as const, templateId: "aht_fake_1" },
        requestedIsolation: "container-trusted" as const,
        limits: {
          cpuMillis: 1_000,
          memoryBytes: 1_024,
          diskBytes: 2_048,
          maxProcesses: 16,
        },
        networkPolicy: { mode: "deny" as const },
      },
      initialization: [],
      runtime: {
        harnessKey: "fake",
        harnessTemplateId: "aht_fake_1",
        declarativeHarness: {},
      },
      defaultPorts: [],
      suggestedChecks: [],
      credentialRequirements: [
        {
          id: "model-api",
          kind: "model-api" as const,
          required: true,
          purpose: "Codex model access",
          delivery: {
            kind: "process-environment" as const,
            variable: "OPENAI_API_KEY",
          },
        },
      ],
      credentialBindings: [binding],
      pin,
    },
  };
}

describe("SandboxAgentDeliveryService", () => {
  test("[PROFILE-PIN-010][WS-OPEN-ADMIT-008] persists a precompiled Profile pin without recompiling after Sandbox creation", async () => {
    let compileCalls = 0;
    const pin = {
      profileInstallationId: "awpi_profile",
      profileDefinitionDigest: `sha256:${"1".repeat(64)}`,
      profileId: "fake-default",
      profileVersion: "1.0.0",
      adapterInstallationId: "aai_fake",
      adapterDefinitionDigest: `sha256:${"2".repeat(64)}`,
      adapterId: "fake",
      adapterVersion: "1.0.0",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      sandboxTemplateId: "aht_fake_1",
      sandboxTemplateVersion: "1.0.0",
      sandboxTemplateDigest: `sha256:${"a".repeat(64)}`,
      capabilities: {
        taskMode: true,
        interactive: false,
        backgroundRuns: true,
        nativeSession: false,
        persistentPaths: ["/workspace"],
        healthcheck: { kind: "process" as const },
      },
    };
    const profilePlan = {
      sandbox: {
        source: { kind: "template" as const, templateId: "aht_fake_1" },
        requestedIsolation: "container-trusted" as const,
        limits: {
          cpuMillis: 1_000,
          memoryBytes: 1_024,
          diskBytes: 2_048,
          maxProcesses: 16,
        },
        networkPolicy: { mode: "deny" as const },
      },
      initialization: [],
      runtime: {
        harnessKey: "fake",
        harnessTemplateId: "aht_fake_1",
        declarativeHarness: {},
      },
      defaultPorts: [],
      suggestedChecks: [],
      credentialRequirements: [],
      pin,
    };
    const { service, repository } = fixture({
      workspaceProfileResolver: {
        async compileForNewWorkspace() {
          compileCalls += 1;
          return ok(profilePlan);
        },
      },
    });

    const created = await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_profile",
      profileInstallationId: "awpi_profile",
      profilePlan,
    });

    expect(created._unsafeUnwrap()).toMatchObject({
      harnessKey: "fake",
      capabilities: pin.capabilities,
    });
    expect(compileCalls).toBe(0);
    const stored = await repository.findRuntime(toRepositoryContext(context), "sar_test");
    expect(stored?.profilePin).toEqual(pin);
  });

  test("[ADAPTER-CRED-006][PROFILE-PIN-010][GH-AUTO-DURABLE-CREDENTIAL-023] re-admits, launches and revokes the exact persisted child scope", async () => {
    const calls: Array<{ kind: string; input: Record<string, unknown> }> = [];
    let harnessCredentialBindings: readonly unknown[] | undefined;
    let processCredentialAdmitted = false;
    const { pin, binding, profilePlan } = credentialProfileFixture();
    const { service, repository } = fixture({
      harness: {
        key: "fake",
        templateId: "aht_fake_1",
        version: "1.0.0",
        templateDigest: `sha256:${"a".repeat(64)}`,
        interaction: {
          transport: "managed-terminal",
          command: ["codex"],
          sessionRecovery: "managed-run-lineage",
        },
        async execute(input) {
          harnessCredentialBindings = input.credentialBindings;
          const launched = await input.launchProcess?.({
            argv: ["codex", "exec", input.task],
            background: true,
          });
          if (!launched?.isOk()) throw new Error("privileged launch unavailable");
          return { events: [], outcomeDigest: "sha256:credential-run-complete" };
        },
        async cancel() {},
      },
      workspaceProfileResolver: {
        async compileForNewWorkspace() {
          return ok(profilePlan);
        },
      },
      processCredentialGrants: {
        async admit(_context, input) {
          calls.push({ kind: "admit", input });
          processCredentialAdmitted = true;
          return ok(undefined);
        },
        async launch(_context, input) {
          calls.push({ kind: "launch", input });
          if (!processCredentialAdmitted) {
            return err(
              domainError.conflict("Process credential scope was not admitted", {
                code: "test_process_credential_scope_not_admitted",
              }),
            );
          }
          return ok({ mode: "background", processId: "spr_codex" });
        },
        async openTerminal(_context, input) {
          calls.push({ kind: "terminal", input });
          return ok({
            workspaceId: input.scope.sandboxId,
            runtimeId: input.scope.runtimeId,
            transport: "managed-terminal",
            sessionId: "term_codex",
            processId: "spr_codex_tui",
            access: {
              kind: "websocket",
              path: "/api/terminal-sessions/term_codex/attach",
              expiresAt: input.expiresAt,
            },
          });
        },
        async revoke(_context, input) {
          calls.push({ kind: "revoke", input });
          return ok(undefined);
        },
      },
    });

    const runtime = await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_credential",
      profileInstallationId: "awpi_codex",
    });
    expect(runtime.isOk()).toBe(true);
    const stored = await repository.findRuntime(toRepositoryContext(context), "sar_test");
    expect(stored?.credentialBindings).toEqual([binding]);
    const terminal = await service.issueAttachAccess(context, {
      sandboxId: "sbx_demo",
      runtimeId: "sar_test",
      expiresAt: "2026-07-20T00:30:00.000Z",
    });
    expect(terminal._unsafeUnwrap()).toMatchObject({
      transport: "managed-terminal",
      sessionId: "term_codex",
      processId: "spr_codex_tui",
    });

    processCredentialAdmitted = false;
    const run = await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: "sar_test",
      task: "fix issue 834",
      context: { mode: "fresh" },
      idempotencyKey: "run_credential",
    });
    expect(run.isOk()).toBe(true);
    const reconciled = await service.reconcileRun(context, "srun_test");
    expect(reconciled.isOk()).toBe(true);
    expect(harnessCredentialBindings).toEqual([binding]);
    expect(calls.map((call) => call.kind)).toEqual([
      "admit",
      "terminal",
      "admit",
      "launch",
      "revoke",
    ]);
    expect(calls[2]?.input).toMatchObject({
      scope: {
        tenantId: "tenant_a",
        organizationId: "org_a",
        sandboxId: "sbx_demo",
        profileInstallationId: "awpi_codex",
        adapterInstallationId: "aai_codex",
        adapterDefinitionDigest: pin.adapterDefinitionDigest,
        runtimeId: "sar_test",
      },
      bindings: [binding],
    });
    expect(calls[3]?.input).toMatchObject({
      scope: {
        tenantId: "tenant_a",
        organizationId: "org_a",
        sandboxId: "sbx_demo",
        profileInstallationId: "awpi_codex",
        adapterInstallationId: "aai_codex",
        adapterDefinitionDigest: pin.adapterDefinitionDigest,
        runtimeId: "sar_test",
        runId: "srun_test",
      },
      bindings: [binding],
      process: {
        argv: ["codex", "exec", "fix issue 834"],
        background: true,
      },
    });
    const terminated = await service.terminateRuntime(context, "sbx_demo", "sar_test");
    expect(terminated.isOk()).toBe(true);
    expect(calls.at(-1)).toMatchObject({
      kind: "revoke",
      input: {
        reason: "runtime-terminated",
        scope: {
          tenantId: "tenant_a",
          sandboxId: "sbx_demo",
          runtimeId: "sar_test",
        },
      },
    });
    expect(JSON.stringify(calls)).not.toContain("sk-test-secret-value");
  });

  test("[WS-ATTACH-MANAGED-014] opens a managed terminal for a pinned credentialless Profile", async () => {
    const { profilePlan } = credentialProfileFixture();
    const credentiallessProfilePlan = {
      ...profilePlan,
      credentialRequirements: [],
      credentialBindings: [],
    };
    let openedBindings: readonly unknown[] | undefined;
    const { service } = fixture({
      harness: {
        key: "fake",
        templateId: "aht_fake_1",
        version: "1.0.0",
        templateDigest: `sha256:${"a".repeat(64)}`,
        interaction: {
          transport: "managed-terminal",
          command: ["pi", "--offline"],
          sessionRecovery: "managed-run-lineage",
        },
        async execute() {
          return { events: [], outcomeDigest: "sha256:credentialless-run-complete" };
        },
        async cancel() {},
      },
      workspaceProfileResolver: {
        async compileForNewWorkspace() {
          return ok(credentiallessProfilePlan);
        },
      },
      processCredentialGrants: {
        async admit() {
          return ok(undefined);
        },
        async launch() {
          return ok({ mode: "background", processId: "spr_pi" });
        },
        async openTerminal(_context, input) {
          openedBindings = input.bindings;
          return ok({
            workspaceId: input.scope.sandboxId,
            runtimeId: input.scope.runtimeId,
            transport: "managed-terminal",
            sessionId: "term_pi",
            processId: "spr_pi_tui",
            access: {
              kind: "websocket",
              path: "/api/terminal-sessions/term_pi/attach",
              expiresAt: input.expiresAt,
            },
          });
        },
        async revoke() {
          return ok(undefined);
        },
      },
    });

    const runtime = await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_credentialless_terminal",
      profileInstallationId: "awpi_codex",
      profilePlan: credentiallessProfilePlan,
    });
    expect(runtime.isOk()).toBe(true);

    const attached = await service.issueAttachAccess(context, {
      sandboxId: "sbx_demo",
      runtimeId: "sar_test",
      expiresAt: "2026-07-20T00:30:00.000Z",
    });

    expect(attached._unsafeUnwrap()).toMatchObject({
      transport: "managed-terminal",
      sessionId: "term_pi",
      processId: "spr_pi_tui",
    });
    expect(openedBindings).toEqual([]);
  });

  test("[ADAPTER-RUNTIME-013] creates a ready Runtime only after its credential-scoped start child launches", async () => {
    const calls: Array<{ kind: string; input: Record<string, unknown> }> = [];
    const { profilePlan } = credentialProfileFixture();
    const { service } = fixture({
      harness: {
        key: "fake",
        templateId: "aht_fake_1",
        version: "1.0.0",
        templateDigest: `sha256:${"a".repeat(64)}`,
        async prepareRuntime(input) {
          const launched = await input.launchProcess?.({
            argv: ["opencode", "serve", "--port", "4096"],
            background: true,
          });
          if (!launched?.isOk()) throw new Error("runtime start launch unavailable");
        },
        async execute() {
          return { events: [], outcomeDigest: "sha256:complete" };
        },
        async cancel() {},
      },
      workspaceProfileResolver: {
        async compileForNewWorkspace() {
          return ok(profilePlan);
        },
      },
      processCredentialGrants: {
        async admit(_context, input) {
          calls.push({ kind: "admit", input });
          return ok(undefined);
        },
        async launch(_context, input) {
          calls.push({ kind: "launch", input });
          return ok({ mode: "background", processId: "spr_opencode_server" });
        },
        async openTerminal() {
          throw new Error("terminal must not open");
        },
        async revoke(_context, input) {
          calls.push({ kind: "revoke", input });
          return ok(undefined);
        },
      },
    });

    const runtime = await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_start",
      profileInstallationId: "awpi_codex",
    });

    expect(runtime._unsafeUnwrap()).toMatchObject({ status: "ready" });
    expect(calls.map((call) => call.kind)).toEqual(["admit", "launch"]);
    expect(calls[1]?.input).toMatchObject({
      scope: {
        tenantId: "tenant_a",
        sandboxId: "sbx_demo",
        runtimeId: "sar_test",
        runId: "sar_test",
      },
      process: {
        argv: ["opencode", "serve", "--port", "4096"],
        background: true,
      },
    });
  });

  test("[ADAPTER-RUNTIME-013] records failed startup and revokes its exact Runtime credential scope", async () => {
    const calls: Array<{ kind: string; input: Record<string, unknown> }> = [];
    const { profilePlan } = credentialProfileFixture();
    const { service, repository } = fixture({
      harness: {
        key: "fake",
        templateId: "aht_fake_1",
        version: "1.0.0",
        templateDigest: `sha256:${"a".repeat(64)}`,
        async prepareRuntime(input) {
          const launched = await input.launchProcess?.({
            argv: ["opencode", "serve", "--port", "4096"],
            background: true,
          });
          if (!launched?.isOk()) throw new Error("runtime start launch unavailable");
          throw new Error("command_agent_runtime_start_failed");
        },
        async execute() {
          return { events: [], outcomeDigest: "sha256:must-not-run" };
        },
        async cancel() {},
      },
      workspaceProfileResolver: {
        async compileForNewWorkspace() {
          return ok(profilePlan);
        },
      },
      processCredentialGrants: {
        async admit(_context, input) {
          calls.push({ kind: "admit", input });
          return ok(undefined);
        },
        async launch(_context, input) {
          calls.push({ kind: "launch", input });
          return ok({ mode: "background", processId: "spr_failed_server" });
        },
        async openTerminal() {
          throw new Error("terminal must not open");
        },
        async revoke(_context, input) {
          calls.push({ kind: "revoke", input });
          return ok(undefined);
        },
      },
    });

    const runtime = await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_start_failed",
      profileInstallationId: "awpi_codex",
    });

    expect(runtime._unsafeUnwrapErr()).toMatchObject({
      details: {
        code: "sandbox_agent_delivery_adapter_failed",
        cause: "command_agent_runtime_start_failed",
      },
    });
    expect(calls.map((call) => call.kind)).toEqual(["admit", "launch", "revoke"]);
    expect(calls[2]?.input).toMatchObject({
      reason: "failed",
      scope: {
        tenantId: "tenant_a",
        sandboxId: "sbx_demo",
        runtimeId: "sar_test",
      },
    });
    const stored = await repository.findRuntime(toRepositoryContext(context), "sar_test");
    expect(stored?.runtime.toState().status.value).toBe("failed");
  });

  test("[ADAPTER-RUNTIME-013][WS-ATTACH-NATIVE-015] makes the scoped replacement launcher available during native attach refresh", async () => {
    const launches: Array<Record<string, unknown>> = [];
    let prepareCalls = 0;
    const { profilePlan } = credentialProfileFixture();
    const { service } = fixture({
      harness: {
        key: "fake",
        templateId: "aht_fake_1",
        version: "1.0.0",
        templateDigest: `sha256:${"a".repeat(64)}`,
        interaction: {
          transport: "native-attach",
          command: ["opencode", "attach", "http://127.0.0.1:4096"],
          sessionRecovery: "native-session-store",
          serverPort: 4_096,
        },
        async prepareRuntime(input) {
          prepareCalls += 1;
          const launched = await input.launchProcess?.({
            argv: ["opencode", "serve", "--port", "4096"],
            background: true,
            ...(prepareCalls > 1 ? { replaceTerminated: true } : {}),
          });
          if (!launched?.isOk()) throw new Error("runtime start launch unavailable");
        },
        async execute() {
          return { events: [], outcomeDigest: "sha256:complete" };
        },
        async cancel() {},
      },
      workspaceProfileResolver: {
        async compileForNewWorkspace() {
          return ok(profilePlan);
        },
      },
      processCredentialGrants: {
        async admit() {
          return ok(undefined);
        },
        async launch(_context, input) {
          launches.push(input);
          return ok({ mode: "background", processId: `spr_server_${launches.length}` });
        },
        async openTerminal() {
          throw new Error("terminal must not open");
        },
        async revoke() {
          return ok(undefined);
        },
      },
    });
    const runtime = (
      await service.createRuntime(context, {
        sandboxId: "sbx_demo",
        harnessKey: "fake",
        harnessTemplateId: "aht_fake_1",
        idempotencyKey: "runtime_attach_refresh",
        profileInstallationId: "awpi_codex",
      })
    )._unsafeUnwrap();

    const attached = await service.issueAttachAccess(context, {
      sandboxId: "sbx_demo",
      runtimeId: runtime.runtimeId,
      expiresAt: "2026-07-20T00:30:00.000Z",
    });

    expect(attached.isOk()).toBe(true);
    expect(launches).toHaveLength(2);
    expect(launches[1]).toMatchObject({
      scope: { runtimeId: "sar_test", runId: "sar_test" },
      process: { replaceTerminated: true },
    });
  });

  test("[GH-AUTO-DURABLE-CREDENTIAL-023] fails closed before harness or process launch when restored admission is denied", async () => {
    const { profilePlan } = credentialProfileFixture();
    let admissionCalls = 0;
    let harnessCalls = 0;
    let launchCalls = 0;
    const { service } = fixture({
      harness: {
        key: "fake",
        templateId: "aht_fake_1",
        version: "1.0.0",
        templateDigest: `sha256:${"a".repeat(64)}`,
        async execute() {
          harnessCalls += 1;
          return { events: [], outcomeDigest: "sha256:must-not-run" };
        },
        async cancel() {},
      },
      workspaceProfileResolver: {
        async compileForNewWorkspace() {
          return ok(profilePlan);
        },
      },
      processCredentialGrants: {
        async admit() {
          admissionCalls += 1;
          return admissionCalls === 1
            ? ok(undefined)
            : err(
                domainError.conflict("Credential connection is revoked", {
                  code: "agent_credential_connection_revoked",
                }),
              );
        },
        async launch() {
          launchCalls += 1;
          return ok({ mode: "background", processId: "spr_must_not_launch" });
        },
        async openTerminal() {
          throw new Error("terminal must not open");
        },
        async revoke() {
          return ok(undefined);
        },
      },
    });

    const runtime = await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_denied_after_restart",
      profileInstallationId: "awpi_codex",
    });
    expect(runtime.isOk()).toBe(true);
    await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: "sar_test",
      task: "must not execute",
      context: { mode: "fresh" },
      idempotencyKey: "run_denied_after_restart",
    });

    const reconciled = await service.reconcileRun(context, "srun_test");

    expect(reconciled._unsafeUnwrapErr().details?.code).toBe("agent_credential_connection_revoked");
    expect(admissionCalls).toBe(2);
    expect(harnessCalls).toBe(0);
    expect(launchCalls).toBe(0);
    expect((await service.showRun(context, "sar_test", "srun_test"))._unsafeUnwrap()).toMatchObject(
      {
        status: "failed",
        failure: {
          code: "agent_credential_connection_revoked",
          summary: expect.stringContaining("retryable=false"),
        },
      },
    );
  });

  test("[GH-AUTO-CONTROL-010][GH-AUTO-DURABLE-CREDENTIAL-023] cancellation wins while restored admission is pending", async () => {
    const { profilePlan } = credentialProfileFixture();
    let admissionCalls = 0;
    let releaseAdmission: (() => void) | undefined;
    const admissionPending = new Promise<void>((resolve) => {
      releaseAdmission = resolve;
    });
    let markAdmissionStarted: (() => void) | undefined;
    const admissionStarted = new Promise<void>((resolve) => {
      markAdmissionStarted = resolve;
    });
    let harnessCalls = 0;
    let launchCalls = 0;
    const revokeReasons: string[] = [];
    const { service } = fixture({
      harness: {
        key: "fake",
        templateId: "aht_fake_1",
        version: "1.0.0",
        templateDigest: `sha256:${"a".repeat(64)}`,
        async execute() {
          harnessCalls += 1;
          return { events: [], outcomeDigest: "sha256:must-not-run" };
        },
        async cancel() {},
      },
      workspaceProfileResolver: {
        async compileForNewWorkspace() {
          return ok(profilePlan);
        },
      },
      processCredentialGrants: {
        async admit() {
          admissionCalls += 1;
          if (admissionCalls === 1) return ok(undefined);
          markAdmissionStarted?.();
          await admissionPending;
          return ok(undefined);
        },
        async launch() {
          launchCalls += 1;
          return ok({ mode: "background", processId: "spr_must_not_launch" });
        },
        async openTerminal() {
          throw new Error("terminal must not open");
        },
        async revoke(_context, input) {
          revokeReasons.push(input.reason);
          return ok(undefined);
        },
      },
    });
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_cancel_admission",
      profileInstallationId: "awpi_codex",
    });
    await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: "sar_test",
      task: "must not execute",
      context: { mode: "fresh" },
      idempotencyKey: "run_cancel_admission",
    });

    const reconciling = service.reconcileRun(context, "srun_test");
    await admissionStarted;
    const cancelled = await service.cancelRun(context, "sar_test", "srun_test");
    releaseAdmission?.();
    const reconciled = await reconciling;

    expect(cancelled._unsafeUnwrap().status).toBe("cancelled");
    expect(reconciled._unsafeUnwrap().status).toBe("cancelled");
    expect(harnessCalls).toBe(0);
    expect(launchCalls).toBe(0);
    expect(revokeReasons.filter((reason) => reason === "cancelled")).toHaveLength(2);
  });

  test("[AGENT-ADAPTER-018] lists neutral harness capabilities and admitted templates", async () => {
    const { service } = fixture({
      harness: {
        key: "opencode",
        templateId: "aht_opencode_managed_v1",
        sandboxTemplateId: "sbt_opencode",
        version: "1.2.3",
        templateDigest: `sha256:${"a".repeat(64)}`,
        interaction: {
          transport: "native-attach",
          command: ["opencode", "attach"],
          sessionRecovery: "native-session-store",
          serverPort: 4096,
        },
        capabilities: {
          taskMode: true,
          interactive: true,
          backgroundRuns: true,
          nativeSession: true,
          persistentPaths: ["/workspace"],
          healthcheck: { kind: "http", port: 4096, path: "/global/health" },
        },
        async execute() {
          return { events: [], outcomeDigest: "sha256:complete" };
        },
        async cancel() {},
      },
    });

    expect((await service.listHarnesses(context))._unsafeUnwrap()).toEqual([
      expect.objectContaining({
        key: "opencode",
        harnessTemplateId: "aht_opencode_managed_v1",
        sandboxTemplateId: "sbt_opencode",
        capabilities: expect.objectContaining({ nativeSession: true, taskMode: true }),
      }),
    ]);
  });

  test("[AGENT-WS-ATTACH-016][WS-ATTACH-NATIVE-015] refreshes the native runtime and issues scoped attach access", async () => {
    let prepareCalls = 0;
    const preparedCredentialBindings: Array<unknown> = [];
    const { service, exposedPorts } = fixture({
      harness: {
        key: "opencode",
        templateId: "aht_opencode_managed_v1",
        version: "1.2.3",
        templateDigest: `sha256:${"a".repeat(64)}`,
        interaction: {
          transport: "native-attach",
          command: ["opencode", "attach", "http://127.0.0.1:4096", "--dir", "/workspace"],
          sessionRecovery: "native-session-store",
          serverPort: 4096,
        },
        async prepareRuntime(input) {
          prepareCalls += 1;
          preparedCredentialBindings.push(input.credentialBindings);
        },
        async execute() {
          return { events: [], outcomeDigest: "sha256:complete" };
        },
        async cancel() {},
      },
    });
    const runtime = (
      await service.createRuntime(context, {
        sandboxId: "sbx_demo",
        harnessKey: "opencode",
        harnessTemplateId: "aht_opencode_managed_v1",
        idempotencyKey: "runtime_attach",
      })
    )._unsafeUnwrap();

    const attach = (
      await service.issueAttachAccess(context, {
        sandboxId: "sbx_demo",
        runtimeId: runtime.runtimeId,
        expiresAt: "2026-07-20T01:00:00.000Z",
      })
    )._unsafeUnwrap();

    expect(prepareCalls).toBe(2);
    expect(preparedCredentialBindings).toEqual([[], []]);
    expect(exposedPorts).toEqual([
      {
        sandboxId: "sbx_demo",
        port: 4096,
        visibility: "private",
        expiresAt: "2026-07-20T01:00:00.000Z",
      },
    ]);
    expect(attach).toEqual({
      workspaceId: "sbx_demo",
      runtimeId: runtime.runtimeId,
      transport: "native-attach",
      access: expect.objectContaining({
        exposureId: "sbp_attach",
        visibility: "private",
        url: "https://attach.example.test/capability",
      }),
      clientCommand: [
        "opencode",
        "attach",
        "https://attach.example.test/capability",
        "--dir",
        "/workspace",
      ],
      clientHandoff: "display-only",
    });
  });

  test("[WS-ATTACH-NATIVE-015] accepts a signed loopback gateway attach URL", async () => {
    const { service } = fixture({
      attachUrl: "http://127.0.0.1:8788/s/sexp_attach/capability",
      harness: {
        key: "opencode",
        templateId: "aht_opencode_managed_v1",
        version: "1.2.3",
        templateDigest: `sha256:${"a".repeat(64)}`,
        interaction: {
          transport: "native-attach",
          command: ["opencode", "attach", "http://127.0.0.1:4096"],
          sessionRecovery: "native-session-store",
          serverPort: 4096,
        },
        async execute() {
          return { events: [], outcomeDigest: "sha256:complete" };
        },
        async cancel() {},
      },
    });
    const runtime = (
      await service.createRuntime(context, {
        sandboxId: "sbx_loopback",
        harnessKey: "opencode",
        harnessTemplateId: "aht_opencode_managed_v1",
        idempotencyKey: "runtime_loopback_attach",
      })
    )._unsafeUnwrap();

    const attach = (
      await service.issueAttachAccess(context, {
        sandboxId: "sbx_loopback",
        runtimeId: runtime.runtimeId,
        expiresAt: "2026-07-20T01:00:00.000Z",
      })
    )._unsafeUnwrap();
    expect(attach.transport).toBe("native-attach");
    if (attach.transport !== "native-attach") return;
    expect(attach.access.url).toBe("http://127.0.0.1:8788/s/sexp_attach/capability");
    expect(attach.clientCommand).toEqual([
      "opencode",
      "attach",
      "http://127.0.0.1:8788/s/sexp_attach/capability",
    ]);
  });

  test("[WS-ATTACH-NATIVE-015] rejects a raw loopback OpenCode port as attach access", async () => {
    const { service } = fixture({
      attachUrl: "http://127.0.0.1:4096",
      harness: {
        key: "opencode",
        templateId: "aht_opencode_managed_v1",
        version: "1.2.3",
        templateDigest: `sha256:${"a".repeat(64)}`,
        interaction: {
          transport: "native-attach",
          command: ["opencode", "attach", "http://127.0.0.1:4096"],
          sessionRecovery: "native-session-store",
          serverPort: 4096,
        },
        async execute() {
          return { events: [], outcomeDigest: "sha256:complete" };
        },
        async cancel() {},
      },
    });
    const runtime = (
      await service.createRuntime(context, {
        sandboxId: "sbx_raw_loopback",
        harnessKey: "opencode",
        harnessTemplateId: "aht_opencode_managed_v1",
        idempotencyKey: "runtime_raw_loopback_attach",
      })
    )._unsafeUnwrap();

    const attach = await service.issueAttachAccess(context, {
      sandboxId: "sbx_raw_loopback",
      runtimeId: runtime.runtimeId,
      expiresAt: "2026-07-20T01:00:00.000Z",
    });
    expect(attach.isErr()).toBe(true);
    if (attach.isErr()) {
      expect(attach.error.details?.code).toBe("agent_workspace_native_attach_access_unsafe");
    }
  });

  test("[WS-ATTACH-UNSUPPORTED-016] fails closed when the Adapter declares no attach transport", async () => {
    const { service } = fixture();
    const runtime = (
      await service.createRuntime(context, {
        sandboxId: "sbx_unsupported",
        harnessKey: "fake",
        harnessTemplateId: "aht_fake_1",
        idempotencyKey: "runtime_unsupported_attach",
      })
    )._unsafeUnwrap();

    const attached = await service.issueAttachAccess(context, {
      sandboxId: "sbx_unsupported",
      runtimeId: runtime.runtimeId,
      expiresAt: "2026-07-20T01:00:00.000Z",
    });

    expect(attached.isErr()).toBe(true);
    expect(attached._unsafeUnwrapErr().details?.code).toBe(
      "agent_workspace_native_attach_unavailable",
    );
  });

  test("[AGENT-WS-START-009] persists failed startup and invokes harness termination", async () => {
    const failedHarness: SandboxAgentHarness = {
      key: "failed",
      templateId: "aht_fake_1",
      version: "1.0.0",
      templateDigest: `sha256:${"a".repeat(64)}`,
      async prepareRuntime() {
        throw new Error("server did not start");
      },
      async execute() {
        return { events: [], outcomeDigest: "sha256:unreachable" };
      },
      async cancel() {},
    };
    const failedFixture = fixture({ harness: failedHarness });
    const failed = await failedFixture.service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "failed",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_failed",
    });
    expect(failed.isErr()).toBe(true);
    expect(
      (await failedFixture.service.listRuntimes(context, "sbx_demo"))._unsafeUnwrap().items,
    ).toEqual([expect.objectContaining({ harnessKey: "failed", status: "failed" })]);

    let terminated = false;
    const readyHarness: SandboxAgentHarness = {
      ...failedHarness,
      key: "ready",
      async prepareRuntime() {},
      async terminateRuntime() {
        terminated = true;
      },
    };
    const readyFixture = fixture({ harness: readyHarness });
    await readyFixture.service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "ready",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_ready",
    });
    await readyFixture.service.terminateRuntime(context, "sbx_demo", "sar_test");
    expect(terminated).toBe(true);
  });

  test("[AGENT-FAILURE-011] persists a bounded redacted harness failure", async () => {
    const { service } = fixture({
      harness: {
        key: "failed-run",
        templateId: "aht_fake_1",
        version: "1.0.0",
        templateDigest: `sha256:${"a".repeat(64)}`,
        async execute() {
          throw new Error(
            `Provider request failed\napi_key=must-not-persist\n${"x".repeat(2_000)}`,
          );
        },
        async cancel() {},
      },
    });
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "failed-run",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_failed_run",
    });
    await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: "sar_test",
      task: "Fix the fixture",
      context: { mode: "fresh" },
      idempotencyKey: "run_failed",
    });

    const reconciled = await service.reconcileRun(context, "srun_test");
    expect(reconciled.isErr()).toBe(true);
    const shown = await service.showRun(context, "sar_test", "srun_test");
    expect(shown._unsafeUnwrap()).toMatchObject({
      status: "failed",
      failure: {
        code: "sandbox_agent_harness_failed",
      },
    });
    const summary = shown._unsafeUnwrap().failure?.summary ?? "";
    expect(summary).toContain("Provider request failed");
    expect(summary).not.toContain("must-not-persist");
    expect(summary.length).toBeLessThanOrEqual(1_024);
  });

  test("[AGENT-FAILURE-011] preserves a stable secret-safe harness failure code", async () => {
    const { service } = fixture({
      harness: {
        key: "failed-run-code",
        templateId: "aht_fake_1",
        version: "1.0.0",
        templateDigest: `sha256:${"a".repeat(64)}`,
        async execute() {
          throw new Error("pi_model_gateway_unreachable");
        },
        async cancel() {},
      },
    });
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "failed-run-code",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_failed_run_code",
    });
    await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: "sar_test",
      task: "Diagnose the fixture",
      context: { mode: "fresh" },
      idempotencyKey: "run_failed_code",
    });

    const reconciled = await service.reconcileRun(context, "srun_test");
    expect(reconciled.isErr()).toBe(true);
    expect((await service.showRun(context, "sar_test", "srun_test"))._unsafeUnwrap()).toMatchObject(
      {
        status: "failed",
        failure: {
          code: "pi_model_gateway_unreachable",
          summary: "pi_model_gateway_unreachable",
        },
      },
    );
  });

  test("[PROMOTION-SCOPE-001] runtime-style deploy tokens cannot resolve external intent", async () => {
    const { service } = fixture();
    const runtimeIdentity = createExecutionContext({
      entrypoint: "http",
      requestId: "req_runtime_identity",
      actor: { kind: "deploy-token", id: "runtime_token" },
      tenant: { tenantId: "tenant_a" },
    });
    const promotion = await service.acceptPromotion(runtimeIdentity, {
      promotionId: "sprom_hidden",
      expectedArtifactDigest: `sha256:${"a".repeat(64)}`,
      idempotencyKey: "blocked",
    });
    const approval = await service.resolveApproval(runtimeIdentity, {
      approvalId: "saa_hidden",
      decision: "approve",
    });
    expect(promotion._unsafeUnwrapErr().details?.code).toBe(
      "sandbox_agent_external_approval_required",
    );
    expect(approval._unsafeUnwrapErr().details?.code).toBe(
      "sandbox_agent_external_approval_required",
    );
  });

  test("[AGENT-RUN-003] persists, executes and redacts one durable Run", async () => {
    const { service, queued } = fixture();
    const runtime = await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_once",
    });
    expect(runtime._unsafeUnwrap()).toMatchObject({ status: "ready", sandboxId: "sbx_demo" });

    const run = await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: runtime._unsafeUnwrap().runtimeId,
      task: "build the app",
      context: { mode: "fresh" },
      idempotencyKey: "run_once",
    });
    expect(run._unsafeUnwrap().status).toBe("accepted");
    expect(queued).toEqual([{ kind: "sandbox-agent-run", id: "srun_test" }]);

    await service.reconcileRun(context, "srun_test");
    const shown = await service.showRun(context, "sar_test", "srun_test");
    expect(shown._unsafeUnwrap().status).toBe("completed");
    const events = await service.listRunEvents(context, "srun_test", {});
    expect(JSON.stringify(events._unsafeUnwrap())).not.toContain("must-redact");
    expect(events._unsafeUnwrap().items).toHaveLength(2);
  });

  test("[AGENT-STREAM-009] persists active harness frames and follows them through terminal close", async () => {
    let releaseRun: (() => void) | undefined;
    let framePersisted: (() => void) | undefined;
    const runGate = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    const frameGate = new Promise<void>((resolve) => {
      framePersisted = resolve;
    });
    const harness: SandboxAgentHarness = {
      key: "fake",
      templateId: "aht_fake_1",
      version: "1.0.0",
      templateDigest: `sha256:${"a".repeat(64)}`,
      async execute(input) {
        await input.emitEvent?.({
          type: "message",
          data: { text: "working", apiToken: "must-redact" },
        });
        await input.emitEvent?.({
          type: "tool-result",
          data: { tool: "test", status: "passed" },
        });
        framePersisted?.();
        await runGate;
        return { events: [], outcomeDigest: "sha256:stream-complete" };
      },
      async cancel() {},
    };
    const { service } = fixture({ harness });
    const runtime = await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_stream",
    });
    await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: runtime._unsafeUnwrap().runtimeId,
      task: "stream the work",
      context: { mode: "fresh" },
      idempotencyKey: "run_stream",
    });

    const reconciling = service.reconcileRun(context, "srun_test");
    await frameGate;
    expect((await service.showRun(context, "sar_test", "srun_test"))._unsafeUnwrap().status).toBe(
      "running",
    );
    const persisted = (await service.listRunEvents(context, "srun_test", {}))._unsafeUnwrap();
    expect(persisted.items).toHaveLength(2);
    expect(JSON.stringify(persisted)).not.toContain("must-redact");

    const opened = await service.streamRunEvents(
      context,
      "srun_test",
      { afterSequence: 1, limit: 100 },
      new AbortController().signal,
    );
    const stream = opened._unsafeUnwrap().stream;
    const iterator = stream[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({
      done: false,
      value: expect.objectContaining({
        kind: "event",
        runId: "srun_test",
        sequence: 2,
        eventType: "tool-result",
      }),
    });

    releaseRun?.();
    await reconciling;
    expect(await iterator.next()).toEqual({
      done: false,
      value: expect.objectContaining({ kind: "closed", reason: "terminal" }),
    });
    await stream.close();
  });

  test("[PROMOTION-PROOF-004] completes only after verified Deployment proof", async () => {
    const { service } = fixture();
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_once",
    });
    const artifact = await service.createSourceArtifact(context, {
      sandboxId: "sbx_demo",
      sourceRoot: "app",
    });
    const preview = await service.createCandidatePreview(context, {
      artifactId: artifact._unsafeUnwrap().artifactId,
    });
    const planned = await service.planPromotion(context, {
      sandboxId: "sbx_demo",
      artifactId: artifact._unsafeUnwrap().artifactId,
      expectedArtifactDigest: artifact._unsafeUnwrap().digest,
      candidatePreviewId: preview._unsafeUnwrap().previewId,
      target: {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceName: "Generated app",
      },
    });
    await service.acceptPromotion(context, {
      promotionId: planned._unsafeUnwrap().promotionId,
      expectedArtifactDigest: artifact._unsafeUnwrap().digest,
      idempotencyKey: "promotion_once",
    });
    await service.reconcilePromotion(context, planned._unsafeUnwrap().promotionId);
    const shown = await service.showPromotion(context, planned._unsafeUnwrap().promotionId);
    expect(shown._unsafeUnwrap()).toMatchObject({
      status: "completed",
      resourceId: "res_demo",
      deploymentId: "dep_demo",
      proofVerdict: "verified",
    });
  });

  test("[AGENT-RUN-003] cancellation wins over a late harness result", async () => {
    let releaseExecution: (() => void) | undefined;
    const executionStarted = new Promise<void>((resolve) => {
      releaseExecution = resolve;
    });
    let rejectHarness: ((error: Error) => void) | undefined;
    const harness: SandboxAgentHarness = {
      key: "fake",
      templateId: "aht_fake_1",
      version: "1.0.0",
      templateDigest: `sha256:${"a".repeat(64)}`,
      execute: () =>
        new Promise((_, reject) => {
          rejectHarness = reject;
          releaseExecution?.();
        }),
      async cancel() {
        rejectHarness?.(new Error("cancelled"));
      },
    };
    const revokeReasons: string[] = [];
    const { repository, service } = fixture({
      harness,
      processCredentialGrants: {
        async admit() {
          return ok(undefined);
        },
        async launch() {
          return ok({ mode: "background", processId: "spr_cancel" });
        },
        async openTerminal() {
          throw new Error("not used");
        },
        async revoke(_context, input) {
          revokeReasons.push(input.reason);
          return ok(undefined);
        },
      },
    });
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_cancel",
    });
    const runtimeRecord = await repository.findRuntime(toRepositoryContext(context), "sar_test");
    if (!runtimeRecord) throw new Error("Runtime was not persisted");
    runtimeRecord.profilePin = {
      profileInstallationId: "awpi_cancel",
      profileDefinitionDigest: `sha256:${"1".repeat(64)}`,
      profileId: "cancel-profile",
      profileVersion: "1.0.0",
      adapterInstallationId: "aai_cancel",
      adapterDefinitionDigest: `sha256:${"2".repeat(64)}`,
      adapterId: "cancel-agent",
      adapterVersion: "1.0.0",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      sandboxTemplateId: "aht_fake_1",
      sandboxTemplateVersion: "1.0.0",
      sandboxTemplateDigest: `sha256:${"a".repeat(64)}`,
      capabilities: {
        taskMode: true,
        interactive: false,
        backgroundRuns: true,
        nativeSession: false,
        persistentPaths: ["/workspace"],
      },
    };
    runtimeRecord.credentialBindings = [
      {
        requirementId: "model-api",
        kind: "model-api",
        purpose: "Model access",
        delivery: {
          kind: "process-environment",
          variable: "OPENAI_API_KEY",
        },
        connectionReference: "model-cancel",
      },
    ];
    await repository.saveRuntime(toRepositoryContext(context), runtimeRecord);
    await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: "sar_test",
      task: "keep working",
      context: { mode: "fresh" },
      idempotencyKey: "run_cancel",
    });
    const reconciling = service.reconcileRun(context, "srun_test");
    await executionStarted;
    const cancelled = await service.cancelRun(context, "sar_test", "srun_test");
    expect(cancelled._unsafeUnwrap().status).toBe("cancelled");
    expect((await reconciling)._unsafeUnwrap().status).toBe("cancelled");
    expect((await service.showRun(context, "sar_test", "srun_test"))._unsafeUnwrap().status).toBe(
      "cancelled",
    );
    expect(revokeReasons).toContain("cancelled");
  });

  test("[AGENT-APPROVAL-004] waits durably for an external exact-digest decision", async () => {
    const harness: SandboxAgentHarness = {
      key: "fake",
      templateId: "aht_fake_1",
      version: "1.0.0",
      templateDigest: `sha256:${"a".repeat(64)}`,
      async execute(input) {
        const decision = await input.requestApproval({
          capability: "external-write",
          requestDigest: `sha256:${"c".repeat(64)}`,
          destination: "api.example.test",
          expiresAt: "2026-07-20T01:00:00.000Z",
        });
        if (decision !== "approved") throw new Error("approval rejected");
        return { events: [], outcomeDigest: "sha256:approved-run" };
      },
      async cancel() {},
    };
    const { service } = fixture({ harness });
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_approval",
    });
    await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: "sar_test",
      task: "write externally",
      context: { mode: "fresh" },
      idempotencyKey: "run_approval",
    });
    const waiting = await service.reconcileRun(context, "srun_test");
    expect(waiting.isErr()).toBe(true);
    expect((await service.showRun(context, "sar_test", "srun_test"))._unsafeUnwrap().status).toBe(
      "waiting-approval",
    );
    const approvals = (await service.listApprovals(context, "srun_test"))._unsafeUnwrap().items;
    expect(approvals).toEqual([
      expect.objectContaining({
        approvalId: "saa_test",
        status: "requested",
        capability: "external-write",
        destination: "api.example.test",
      }),
    ]);
    await service.resolveApproval(context, { approvalId: "saa_test", decision: "approve" });
    expect((await service.reconcileRun(context, "srun_test"))._unsafeUnwrap().status).toBe(
      "completed",
    );
  });

  test("[PROMOTION-PROOF-004] pending proof remains verifying until a later verified read", async () => {
    let verdict: "pending" | "verified" = "pending";
    const { service } = fixture({ readProof: async () => ({ verdict }) });
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_pending",
    });
    const artifact = (
      await service.createSourceArtifact(context, {
        sandboxId: "sbx_demo",
        sourceRoot: "app",
      })
    )._unsafeUnwrap();
    const preview = (
      await service.createCandidatePreview(context, {
        artifactId: artifact.artifactId,
      })
    )._unsafeUnwrap();
    const promotion = (
      await service.planPromotion(context, {
        sandboxId: "sbx_demo",
        artifactId: artifact.artifactId,
        expectedArtifactDigest: artifact.digest,
        candidatePreviewId: preview.previewId,
        target: { projectId: "prj_demo", environmentId: "env_demo", resourceName: "Generated app" },
      })
    )._unsafeUnwrap();
    await service.acceptPromotion(context, {
      promotionId: promotion.promotionId,
      expectedArtifactDigest: artifact.digest,
      idempotencyKey: "promotion_pending",
    });
    expect(
      (await service.reconcilePromotion(context, promotion.promotionId))._unsafeUnwrap().status,
    ).toBe("verifying");
    verdict = "verified";
    expect(
      (await service.reconcilePromotion(context, promotion.promotionId))._unsafeUnwrap().status,
    ).toBe("completed");
  });

  test("[PROMOTION-RETRY-003] reuses Resource, creates a new Deployment, and protects Artifact once", async () => {
    let verdict: "failed" | "verified" = "failed";
    const { service, counters } = fixture({ readProof: async () => ({ verdict }) });
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_retry",
    });
    const artifact = (
      await service.createSourceArtifact(context, {
        sandboxId: "sbx_demo",
        sourceRoot: "app",
      })
    )._unsafeUnwrap();
    const preview = (
      await service.createCandidatePreview(context, {
        artifactId: artifact.artifactId,
      })
    )._unsafeUnwrap();
    const promotion = (
      await service.planPromotion(context, {
        sandboxId: "sbx_demo",
        artifactId: artifact.artifactId,
        expectedArtifactDigest: artifact.digest,
        candidatePreviewId: preview.previewId,
        target: { projectId: "prj_demo", environmentId: "env_demo", resourceName: "Generated app" },
      })
    )._unsafeUnwrap();
    const acceptance = {
      promotionId: promotion.promotionId,
      expectedArtifactDigest: artifact.digest,
      idempotencyKey: "promotion_retry_once",
    };
    await service.acceptPromotion(context, acceptance);
    await service.acceptPromotion(context, acceptance);
    expect(
      (await service.showSourceArtifact(context, artifact.artifactId))._unsafeUnwrap()
        .referenceCount,
    ).toBe(1);
    expect(
      (await service.reconcilePromotion(context, promotion.promotionId))._unsafeUnwrap().status,
    ).toBe("failed");
    verdict = "verified";
    await service.retryPromotion(context, promotion.promotionId, "promotion_retry_two");
    const completed = (
      await service.reconcilePromotion(context, promotion.promotionId)
    )._unsafeUnwrap();
    expect(completed).toMatchObject({
      status: "completed",
      resourceId: "res_demo",
      deploymentId: "dep_demo_2",
    });
    expect(counters).toEqual({ resources: 1, deployments: 2 });
  });
});
