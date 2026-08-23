import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok } from "@appaloft/core";

import {
  AgentWorkspaceOpenCommandHandler,
  AgentWorkspaceOpenService,
  createExecutionContext,
  OpenAgentWorkspaceCommand,
  type WorkspaceOpenDependencies,
} from "../src";
import { shouldSkipWorkspaceSourceMaterialization } from "../src/agent-workspace-open";

const input = {
  repository: "https://github.com/Acme/Web.git",
  repositoryIdentity: "github.com/Acme/Web",
  ref: "refs/heads/feature/open",
  branch: "feature/open",
  commitSha: "0123456789abcdef0123456789abcdef01234567",
  attach: false,
};

describe("Agent Workspace open application workflow", () => {
  test("[WS-OPEN-CRED-007][WS-OPEN-ADMIT-008][WS-OPEN-CREATE-010][WS-OPEN-RESUME-011][WS-OPEN-SHA-013][WS-OPEN-PARTIAL-017][WS-OPEN-REMOTE-018][WS-OPEN-PROFILE-021][WS-ACT-TARGET-003][WS-ACT-RESUME-005][WS-ACT-SAFE-007] preflights before effects, preserves source pins and activation evidence, resumes, and releases failed placement", async () => {
    const phases: string[] = [];
    let failSandboxCreate = false;
    let failSourceCredential = false;
    let failSourceFetch = false;
    let failSourceCredentialCacheExit = false;
    let releasedReservations = 0;
    const placementReservationIds: (string | undefined)[] = [];
    const sandboxPlacement: Array<{ providerKey?: string; expiresAt?: string }> = [];
    const admittedCredentials: Array<
      readonly { requirementId: string; connectionReference: string }[] | undefined
    > = [];
    const admittedScopes: Array<Parameters<WorkspaceOpenDependencies["preflight"]["admit"]>[2]> =
      [];
    const executedCommands: Array<{ argv: string[]; stdin?: Uint8Array }> = [];
    const failedEntries: Array<{ workspaceId?: string; phase: string; code: string }> = [];
    const activation = {
      project: { projectId: "prj_web", disposition: "created" as const },
      repositoryBinding: { bindingId: "rbd_web", disposition: "created" as const },
      profile: { profileInstallationId: "awpi_default", disposition: "created" as const },
    };
    let pendingActivation = activation;
    const ensuredRuntimes: Array<{ sandboxId: string; runtimeId: string }> = [];
    let preferred:
      | {
          workspaceId: string;
          runtimeId: string;
          commitSha: string;
          profileInstallationId: string;
          status: "ready";
          targetSelection: {
            targetClass: "managed";
            source: "platform-default";
            reason: string;
          };
          activation: typeof activation;
        }
      | undefined;
    let profileWorkspace = preferred;
    const dependencies: WorkspaceOpenDependencies = {
      preflight: {
        resolveContext: async () => {
          phases.push("context");
          return ok({
            projectId: "prj_web",
            profileInstallationId: "awpi_default",
            activation,
          });
        },
        admit: async (_context, _resolved, options) => {
          phases.push("preflight");
          admittedCredentials.push(options?.credentialReferences);
          admittedScopes.push(options);
          return ok({
            projectId: "prj_web",
            profileInstallationId: "awpi_default",
            activation,
            plan: {
              sandbox: {
                source: { kind: "template", templateId: "sbt_agent" },
                requestedIsolation: "gvisor",
                limits: {
                  cpuMillis: 1_000,
                  memoryBytes: 536_870_912,
                  diskBytes: 2_147_483_648,
                  maxProcesses: 32,
                },
                networkPolicy: {
                  mode: "allowlist",
                  rules: [{ kind: "domain", value: "github.com", ports: [443] }],
                },
              },
              initialization: [],
              runtime: {
                harnessKey: "custom-agent",
                harnessTemplateId: "aht_custom",
                declarativeHarness: {},
              },
              defaultPorts: [],
              suggestedChecks: [],
              credentialRequirements: [],
              pin: {
                profileInstallationId: "awpi_default",
                profileDefinitionDigest: `sha256:${"a".repeat(64)}`,
                profileId: "custom-default",
                profileVersion: "1.0.0",
                adapterInstallationId: "aai_custom",
                adapterDefinitionDigest: `sha256:${"b".repeat(64)}`,
                adapterId: "custom-agent",
                adapterVersion: "1.0.0",
                harnessKey: "custom-agent",
                harnessTemplateId: "aht_custom",
                sandboxTemplateId: "sbt_agent",
                sandboxTemplateVersion: "1",
                sandboxTemplateDigest: `sha256:${"c".repeat(64)}`,
                capabilities: {
                  taskMode: true,
                  interactive: true,
                  backgroundRuns: true,
                  nativeSession: false,
                  persistentPaths: ["/workspace"],
                },
              },
            },
            reservation: {
              reservationId: "res_1",
              targetSelection: {
                targetClass: "managed",
                source: "platform-default",
                reason: "managed_entitlement_default",
              },
            },
          });
        },
      },
      entries: {
        findByWorkspaceIds: async (_context, workspaceIds) =>
          new Map(
            preferred && workspaceIds.includes(preferred.workspaceId)
              ? [[preferred.workspaceId, preferred]]
              : [],
          ),
        findByWorkspaceId: async () => preferred,
        findPreferred: async (_context, _key, selection?: { profileInstallationId?: string }) =>
          selection?.profileInstallationId === "awpi_default" && profileWorkspace
            ? profileWorkspace
            : preferred,
        findLiveProfileInstallationIds: async () => [],
        begin: async (_context, _key, value) => {
          pendingActivation = value.activation as typeof activation;
          return ok({ workspaceId: "sbx_1", created: true });
        },
        complete: async (_context, value) => {
          preferred = {
            workspaceId: value.workspaceId,
            runtimeId: value.runtimeId,
            commitSha: value.commitSha,
            profileInstallationId: "awpi_default",
            status: "ready",
            targetSelection: {
              targetClass: "managed",
              source: "platform-default",
              reason: "managed_entitlement_default",
            },
            activation: pendingActivation,
          };
          return ok(undefined);
        },
        fail: async (_context, value) => {
          failedEntries.push({
            ...(value.workspaceId ? { workspaceId: value.workspaceId } : {}),
            phase: value.phase,
            code: value.code,
          });
          return ok(undefined);
        },
        markWorkspaceTerminated: async () => ok({ advanced: true }),
      },
      sourceCredentials: {
        resolve: async () => {
          phases.push("source-credential");
          return failSourceCredential
            ? err(
                domainError.conflict("Workspace source credential is unavailable", {
                  code: "workspace_open_source_credential_unavailable",
                }),
              )
            : ok({
                kind: "http-basic",
                username: "x-access-token",
                password: "source-token-must-not-enter-argv",
              });
        },
      },
      sandboxes: {
        create: async (_context, sandboxInput) => {
          placementReservationIds.push(sandboxInput.placementReservationId);
          sandboxPlacement.push({
            ...(sandboxInput.providerKey ? { providerKey: sandboxInput.providerKey } : {}),
            ...(sandboxInput.expiresAt ? { expiresAt: sandboxInput.expiresAt } : {}),
          });
          phases.push("sandbox-create");
          if (failSandboxCreate) {
            return err(
              domainError.conflict("Registered Server provisioning failed", {
                code: "workspace_open_provider_failed",
              }),
            );
          }
          return ok({ sandboxId: "sbx_1", name: "resonant-silence", status: "ready" });
        },
        resume: async (_context, workspaceId) => {
          phases.push("sandbox-resume");
          return ok({ sandboxId: workspaceId, name: "resonant-silence", status: "ready" });
        },
        exec: async (_context, _workspaceId, command) => {
          executedCommands.push({
            argv: [...command.argv],
            ...(command.stdin ? { stdin: command.stdin.slice() } : {}),
          });
          return ok({
            mode: "foreground",
            frames: [
              {
                kind: "exit",
                exitCode:
                  (failSourceFetch && command.argv.includes("fetch")) ||
                  (failSourceCredentialCacheExit &&
                    command.argv.includes("rm") &&
                    command.argv.some((value) => value.endsWith("/credentials")))
                    ? 1
                    : 0,
              },
            ],
          });
        },
        exposePort: async () => ok(undefined),
      },
      agents: {
        showRuntime: async (_context, value) =>
          ok({
            runtimeId: value.runtimeId,
            sandboxId: value.sandboxId,
            harnessKey: "custom-agent",
            harnessTemplateId: "aht_custom",
            status: "ready",
            profilePin: {
              profileInstallationId: "awpi_default",
              profileDefinitionDigest: `sha256:${"a".repeat(64)}`,
              profileId: "custom-default",
              profileVersion: "1.0.0",
              adapterInstallationId: "aai_custom",
              adapterDefinitionDigest: `sha256:${"b".repeat(64)}`,
              adapterId: "custom-agent",
              adapterVersion: "1.0.0",
              harnessKey: "custom-agent",
              harnessTemplateId: "aht_custom",
              sandboxTemplateId: "sbt_agent",
              sandboxTemplateVersion: "1",
              sandboxTemplateDigest: `sha256:${"c".repeat(64)}`,
              capabilities: {
                taskMode: true,
                interactive: true,
                backgroundRuns: true,
                nativeSession: false,
                persistentPaths: ["/workspace"],
              },
            },
            capabilities: {
              taskMode: true,
              interactive: true,
              backgroundRuns: true,
              nativeSession: false,
              persistentPaths: ["/workspace"],
            },
            createdAt: "2026-07-28T00:00:00.000Z",
          }),
        createRuntime: async () =>
          ok({
            runtimeId: "sar_1",
            sandboxId: "sbx_1",
            harnessKey: "custom-agent",
            harnessTemplateId: "aht_custom",
            status: "ready",
            capabilities: {
              taskMode: true,
              interactive: true,
              backgroundRuns: true,
              nativeSession: false,
              persistentPaths: ["/workspace"],
            },
            createdAt: "2026-07-28T00:00:00.000Z",
          }),
        ensureRuntime: async (_context, value) => {
          ensuredRuntimes.push(value);
          return ok(undefined);
        },
        attach: async () => {
          throw new Error("attach should not run");
        },
      },
      reservations: {
        consume: async () => ok(undefined),
        release: async () => {
          releasedReservations += 1;
          return ok(undefined);
        },
      },
      now: () => "2026-07-28T00:00:00.000Z",
    };
    const service = new AgentWorkspaceOpenService(dependencies);
    const context = createExecutionContext({
      requestId: "req_workspace_open",
      entrypoint: "cli",
      actor: { kind: "user", id: "usr_1" },
      tenant: { tenantId: "ten_1" },
    });

    const created = await service.open(context, input, {
      credentialReferences: [
        {
          requirementId: "model-api",
          connectionReference: "agent-credential://tenant_1/agentcred_1",
        },
      ],
      credentialAdmissionScope: {
        owner: { kind: "organization", id: "org_1" },
        agentProfileId: "agp_1",
        use: "automation",
        untrustedCode: false,
        serverPoolId: "server-pool-1",
      },
      placementProviderKey: "server-pool-1",
      expiresAt: "2026-07-28T02:00:00.000Z",
    });
    const mismatched = await service.open(context, {
      ...input,
      commitSha: "f".repeat(40),
    });
    const resumed = await service.open(context, input);
    profileWorkspace = preferred;
    preferred = {
      workspaceId: "sbx_opencode",
      runtimeId: "sar_opencode",
      commitSha: input.commitSha,
      profileInstallationId: "awpi_opencode",
      status: "ready",
      targetSelection: {
        targetClass: "managed",
        source: "platform-default",
        reason: "managed_entitlement_default",
      },
      activation,
    };
    const explicitlySelectedProfileResumed = await service.open(context, {
      ...input,
      profile: "awpi_default",
    });
    preferred = profileWorkspace;
    failSourceCredential = true;
    const sourceCredentialFailure = await service.open(context, {
      ...input,
      forceNew: true,
    });
    failSourceCredential = false;
    failSandboxCreate = true;
    const providerFailure = await service.open(context, {
      ...input,
      forceNew: true,
    });

    expect(created._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_1",
      resumed: false,
      agent: { runtimeId: "sar_1" },
      activation,
      targetSelection: {
        targetClass: "managed",
        source: "platform-default",
        reason: "managed_entitlement_default",
      },
    });
    expect(resumed._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_1",
      resumed: true,
      agent: { runtimeId: "sar_1" },
      activation,
      targetSelection: {
        targetClass: "managed",
        source: "platform-default",
        reason: "managed_entitlement_default",
      },
    });
    expect(ensuredRuntimes).toEqual([
      { sandboxId: "sbx_1", runtimeId: "sar_1" },
      { sandboxId: "sbx_1", runtimeId: "sar_1" },
    ]);
    expect(explicitlySelectedProfileResumed._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_1",
      resumed: true,
      agent: { runtimeId: "sar_1" },
    });
    const publicEvidence = JSON.stringify(created._unsafeUnwrap());
    for (const privateField of [
      "serverId",
      "host",
      "providerHandle",
      "providerKey",
      "capacity",
      "credential",
      "token",
    ]) {
      expect(publicEvidence).not.toContain(`"${privateField}"`);
    }
    expect(placementReservationIds).toEqual(["res_1", "res_1"]);
    expect(sandboxPlacement).toEqual([
      {
        providerKey: "server-pool-1",
        expiresAt: "2026-07-28T02:00:00.000Z",
      },
      {},
    ]);
    expect(admittedCredentials[0]).toEqual([
      {
        requirementId: "model-api",
        connectionReference: "agent-credential://tenant_1/agentcred_1",
      },
    ]);
    expect(admittedScopes[0]?.credentialAdmissionScope).toEqual({
      owner: { kind: "organization", id: "org_1" },
      agentProfileId: "agp_1",
      use: "automation",
      untrustedCode: false,
      serverPoolId: "server-pool-1",
    });
    expect(executedCommands.map(({ argv }) => argv)).toEqual([
      ["git", "init", "."],
      ["git", "remote", "add", "origin", "https://github.com/Acme/Web.git"],
      ["mkdir", "-m", "700", "/tmp/.appaloft-workspace-source-credential"],
      [
        "git",
        "-c",
        "credential.helper=",
        "-c",
        "credential.helper=store --file=/tmp/.appaloft-workspace-source-credential/credentials",
        "credential",
        "approve",
      ],
      [
        "git",
        "-c",
        "credential.helper=",
        "-c",
        "credential.helper=store --file=/tmp/.appaloft-workspace-source-credential/credentials",
        "-c",
        "credential.interactive=never",
        "-c",
        "core.askPass=/bin/false",
        "fetch",
        "--no-tags",
        "--depth",
        "1",
        "origin",
        "0123456789abcdef0123456789abcdef01234567",
      ],
      ["rm", "-f", "/tmp/.appaloft-workspace-source-credential/credentials"],
      ["rmdir", "/tmp/.appaloft-workspace-source-credential"],
      ["git", "checkout", "--detach", "0123456789abcdef0123456789abcdef01234567"],
      ["git", "switch", "-c", "feature/open"],
    ]);
    expect(JSON.stringify(executedCommands.map(({ argv }) => argv))).not.toContain(
      "source-token-must-not-enter-argv",
    );
    expect(new TextDecoder().decode(executedCommands[3]?.stdin)).toBe(
      "protocol=https\nhost=github.com\nusername=x-access-token\npassword=source-token-must-not-enter-argv\n\n",
    );
    const authenticatedApproval = executedCommands[3];
    const authenticatedFetch = executedCommands[4];
    expect(authenticatedApproval?.stdin).toBeDefined();
    expect(authenticatedFetch?.stdin).toBeUndefined();
    const temporaryDirectory = Bun.spawnSync(["mktemp", "-d"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(temporaryDirectory.exitCode).toBe(0);
    const credentialCacheDirectory = temporaryDirectory.stdout.toString().trim();
    const credentialStoreFile = `${credentialCacheDirectory}/credentials`;
    const productionCredentialStoreFile = "/tmp/.appaloft-workspace-source-credential/credentials";
    const withProbeStore = (argv: readonly string[]): string[] =>
      argv.map((argument) => argument.replace(productionCredentialStoreFile, credentialStoreFile));
    try {
      const approved = Bun.spawnSync(withProbeStore(authenticatedApproval?.argv ?? []), {
        stdin: new Blob([new TextDecoder().decode(authenticatedApproval?.stdin)]),
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(approved.exitCode).toBe(0);
      expect(approved.stderr.toString()).toBe("");

      const fetchArgumentIndex = authenticatedFetch?.argv.indexOf("fetch") ?? -1;
      expect(fetchArgumentIndex).toBeGreaterThan(0);
      const filled = Bun.spawnSync(
        [
          ...withProbeStore(authenticatedFetch?.argv.slice(0, fetchArgumentIndex) ?? []),
          "credential",
          "fill",
        ],
        {
          stdin: new Blob(["protocol=https\nhost=github.com\n\n"]),
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      expect(filled.exitCode).toBe(0);
      expect(filled.stderr.toString()).toBe("");
      expect(filled.stdout.toString()).toContain("username=x-access-token\n");
      expect(filled.stdout.toString()).toContain("password=source-token-must-not-enter-argv\n");
    } finally {
      const storeCleanup = Bun.spawnSync(["rm", "-f", credentialStoreFile], {
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(storeCleanup.exitCode).toBe(0);
      const directoryCleanup = Bun.spawnSync(["rmdir", credentialCacheDirectory], {
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(directoryCleanup.exitCode).toBe(0);
    }
    expect(mismatched._unsafeUnwrapErr().details?.code).toBe("workspace_open_source_pin_mismatch");
    expect(mismatched._unsafeUnwrapErr().details?.guidance).toContain("--new");
    expect(sourceCredentialFailure._unsafeUnwrapErr().details?.code).toBe(
      "workspace_open_source_credential_unavailable",
    );
    expect(providerFailure.isErr()).toBe(true);
    expect(providerFailure._unsafeUnwrapErr().details).toMatchObject({
      workspaceId: "sbx_1",
      sandboxId: "sbx_1",
      phase: "workspace-open-sandbox-create",
      terminate: "appaloft workspace terminate sbx_1",
    });
    expect(releasedReservations).toBe(2);
    expect(failedEntries).toEqual([
      {
        workspaceId: "sbx_1",
        phase: "workspace-open-sandbox-create",
        code: "conflict",
      },
    ]);
    expect(phases).toEqual([
      "context",
      "source-credential",
      "preflight",
      "sandbox-create",
      "context",
      "context",
      "sandbox-resume",
      "context",
      "sandbox-resume",
      "context",
      "source-credential",
      "context",
      "source-credential",
      "preflight",
      "sandbox-create",
    ]);

    const commandCountBeforeFetchFailure = executedCommands.length;
    failSandboxCreate = false;
    failSourceFetch = true;
    const sourceFetchFailure = await service.open(context, {
      ...input,
      forceNew: true,
    });
    failSourceFetch = false;
    expect(sourceFetchFailure._unsafeUnwrapErr().details?.code).toBe(
      "workspace_open_source_materialization_failed",
    );
    expect(executedCommands.slice(commandCountBeforeFetchFailure).map(({ argv }) => argv)).toEqual([
      ["git", "init", "."],
      ["git", "remote", "add", "origin", "https://github.com/Acme/Web.git"],
      ["mkdir", "-m", "700", "/tmp/.appaloft-workspace-source-credential"],
      [
        "git",
        "-c",
        "credential.helper=",
        "-c",
        "credential.helper=store --file=/tmp/.appaloft-workspace-source-credential/credentials",
        "credential",
        "approve",
      ],
      [
        "git",
        "-c",
        "credential.helper=",
        "-c",
        "credential.helper=store --file=/tmp/.appaloft-workspace-source-credential/credentials",
        "-c",
        "credential.interactive=never",
        "-c",
        "core.askPass=/bin/false",
        "fetch",
        "--no-tags",
        "--depth",
        "1",
        "origin",
        "0123456789abcdef0123456789abcdef01234567",
      ],
      ["rm", "-f", "/tmp/.appaloft-workspace-source-credential/credentials"],
      ["rmdir", "/tmp/.appaloft-workspace-source-credential"],
    ]);

    const commandCountBeforeCleanupFailure = executedCommands.length;
    failSourceCredentialCacheExit = true;
    const sourceCleanupFailure = await service.open(context, {
      ...input,
      forceNew: true,
    });
    failSourceCredentialCacheExit = false;
    expect(sourceCleanupFailure._unsafeUnwrapErr().details?.code).toBe(
      "workspace_open_source_credential_cleanup_failed",
    );
    expect(
      executedCommands.slice(commandCountBeforeCleanupFailure).map(({ argv }) => argv),
    ).toContainEqual(["rmdir", "/tmp/.appaloft-workspace-source-credential"]);
    expect(
      executedCommands
        .slice(commandCountBeforeCleanupFailure)
        .some(({ argv }) => argv.includes("checkout")),
    ).toBe(false);
  });

  test("[WS-REMOTE-RESUME-131][WS-REMOTE-RESUME-132][WS-REMOTE-RESUME-133] default occupancy resume keeps preferred Profile", async () => {
    const preferred = {
      workspaceId: "sbx_preferred",
      runtimeId: "sar_preferred",
      commitSha: input.commitSha,
      profileInstallationId: "awpi_preferred",
      status: "ready" as const,
      targetSelection: {
        targetClass: "registered-server" as const,
        source: "explicit" as const,
        reason: "occupancy_registered_server",
      },
      activation: {
        project: { projectId: "prj_web", disposition: "reused" as const },
        repositoryBinding: { bindingId: "rbd_web", disposition: "reused" as const },
        profile: { profileInstallationId: "awpi_preferred", disposition: "reused" as const },
      },
    };
    const begun: Array<{ profileInstallationId: string; forceNew: boolean }> = [];
    const dependencies: WorkspaceOpenDependencies = {
      preflight: {
        resolveContext: async () =>
          ok({
            projectId: "prj_web",
            profileInstallationId: "awpi_default",
            activation: {
              project: { projectId: "prj_web", disposition: "reused" },
              repositoryBinding: { bindingId: "rbd_web", disposition: "reused" },
              profile: { profileInstallationId: "awpi_default", disposition: "reused" },
            },
          }),
        admit: async (_context, resolved) =>
          ok({
            projectId: resolved.projectId,
            profileInstallationId: resolved.profileInstallationId,
            activation: resolved.activation,
            plan: {
              sandbox: {
                source: { kind: "template", templateId: "sbt_agent" },
                requestedIsolation: "gvisor",
                limits: {
                  cpuMillis: 1_000,
                  memoryBytes: 536_870_912,
                  diskBytes: 2_147_483_648,
                  maxProcesses: 32,
                },
                networkPolicy: { mode: "allowlist", rules: [] },
              },
              initialization: [],
              runtime: {
                harnessKey: "custom-agent",
                harnessTemplateId: "aht_custom",
                declarativeHarness: {},
              },
              defaultPorts: [],
              suggestedChecks: [],
              credentialRequirements: [],
              pin: {
                profileInstallationId: resolved.profileInstallationId,
                profileDefinitionDigest: `sha256:${"a".repeat(64)}`,
                profileId: "custom-default",
                profileVersion: "1.0.0",
                adapterInstallationId: "aai_custom",
                adapterDefinitionDigest: `sha256:${"b".repeat(64)}`,
                adapterId: "custom-agent",
                adapterVersion: "1.0.0",
                harnessKey: "custom-agent",
                harnessTemplateId: "aht_custom",
                sandboxTemplateId: "sbt_agent",
                sandboxTemplateVersion: "1",
                sandboxTemplateDigest: `sha256:${"c".repeat(64)}`,
                capabilities: {
                  taskMode: true,
                  interactive: true,
                  backgroundRuns: true,
                  nativeSession: false,
                  persistentPaths: ["/workspace"],
                },
              },
            },
            reservation: {
              reservationId: "res_new",
              targetSelection: preferred.targetSelection,
            },
          }),
      },
      entries: {
        findByWorkspaceIds: async () => new Map(),
        findByWorkspaceId: async () => preferred,
        findPreferred: async () => preferred,
        findLiveProfileInstallationIds: async () => [],
        begin: async (_context, _key, value) => {
          begun.push({
            profileInstallationId: value.profileInstallationId,
            forceNew: value.forceNew,
          });
          return ok({ workspaceId: "sbx_new", created: true });
        },
        complete: async () => ok(undefined),
        fail: async () => ok(undefined),
        markWorkspaceTerminated: async () => ok({ advanced: true }),
      },
      sandboxes: {
        create: async () => ok({ sandboxId: "sbx_new", name: "resonant-silence", status: "ready" }),
        resume: async (_context, workspaceId) =>
          ok({ sandboxId: workspaceId, name: "resonant-silence", status: "ready" }),
        exec: async () => ok({ mode: "foreground", frames: [{ kind: "exit", exitCode: 0 }] }),
        exposePort: async () => ok(undefined),
      },
      agents: {
        showRuntime: async (_context, value) =>
          ok({
            runtimeId: value.runtimeId,
            sandboxId: value.sandboxId,
            harnessKey: "custom-agent",
            harnessTemplateId: "aht_custom",
            status: "ready",
            profilePin: {
              profileInstallationId: preferred.profileInstallationId,
              profileDefinitionDigest: `sha256:${"a".repeat(64)}`,
              profileId: "custom-default",
              profileVersion: "1.0.0",
              adapterInstallationId: "aai_custom",
              adapterDefinitionDigest: `sha256:${"b".repeat(64)}`,
              adapterId: "custom-agent",
              adapterVersion: "1.0.0",
              harnessKey: "custom-agent",
              harnessTemplateId: "aht_custom",
              sandboxTemplateId: "sbt_agent",
              sandboxTemplateVersion: "1",
              sandboxTemplateDigest: `sha256:${"c".repeat(64)}`,
              capabilities: {
                taskMode: true,
                interactive: true,
                backgroundRuns: true,
                nativeSession: false,
                persistentPaths: ["/workspace"],
              },
            },
            capabilities: {
              taskMode: true,
              interactive: true,
              backgroundRuns: true,
              nativeSession: false,
              persistentPaths: ["/workspace"],
            },
            createdAt: "2026-07-28T00:00:00.000Z",
          }),
        createRuntime: async () =>
          ok({
            runtimeId: "sar_new",
            sandboxId: "sbx_new",
            harnessKey: "custom-agent",
            harnessTemplateId: "aht_custom",
            status: "ready",
            capabilities: {
              taskMode: true,
              interactive: true,
              backgroundRuns: true,
              nativeSession: false,
              persistentPaths: ["/workspace"],
            },
            createdAt: "2026-07-28T00:00:00.000Z",
          }),
        ensureRuntime: async () => ok(undefined),
        attach: async () => {
          throw new Error("attach should not run");
        },
      },
      reservations: {
        consume: async () => ok(undefined),
        release: async () => ok(undefined),
      },
      now: () => "2026-07-28T00:00:00.000Z",
    };
    const service = new AgentWorkspaceOpenService(dependencies);
    const context = createExecutionContext({
      requestId: "req_occupancy_resume_profile",
      entrypoint: "cli",
      actor: { kind: "user", id: "usr_1" },
      tenant: { tenantId: "ten_1" },
    });

    const resumed = await service.open(context, input);
    const explicitMismatch = await service.open(context, {
      ...input,
      profile: "awpi_default",
    });
    const isolated = await service.open(context, {
      ...input,
      forceNew: true,
    });

    expect(resumed._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_preferred",
      resumed: true,
      profilePin: { profileInstallationId: "awpi_preferred" },
    });
    expect(explicitMismatch._unsafeUnwrapErr().details?.code).toBe(
      "workspace_open_profile_pin_mismatch",
    );
    expect(isolated._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_new",
      resumed: false,
    });
    expect(begun).toEqual([{ profileInstallationId: "awpi_default", forceNew: true }]);
  });

  test("[FOLDER-ONBOARD-007][WS-REMOTE-PROGRESS-201] folder occupancy occupies without git clone or materialize", async () => {
    const executedCommands: string[][] = [];
    let materialized = 0;
    const { service, sourceCredentials } = createFolderOccupancyOpen({
      executedCommands,
    });
    const opened = await service.open(
      createExecutionContext({
        requestId: "req_folder_occupancy_open",
        entrypoint: "cli",
        actor: { kind: "user", id: "usr_1" },
        tenant: { tenantId: "ten_1" },
      }),
      folderOccupancyInput,
      {
        sourceMaterializer: {
          materialize: async () => {
            materialized += 1;
            return err(
              domainError.conflict("Workspace source materialization failed", {
                code: "workspace_open_source_materialization_failed",
              }),
            );
          },
        },
      },
    );

    expect(opened.isOk()).toBe(true);
    expect(opened._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_notes",
      resumed: false,
      source: { repositoryIdentity: "folder.local/cwd/notes" },
    });
    expect(executedCommands).toEqual([]);
    expect(executedCommands.some((argv) => argv.includes("fetch"))).toBe(false);
    expect(executedCommands.some((argv) => argv.includes("clone"))).toBe(false);
    expect(executedCommands.some((argv) => argv.includes("remote"))).toBe(false);
    expect(materialized).toBe(0);
    expect(sourceCredentials).toEqual([]);
  });

  test("[FOLDER-ONBOARD-007][WS-REMOTE-PROGRESS-201] leftover folder occupancy continues without remote materialize", async () => {
    const executedCommands: string[][] = [];
    let createdSandboxes = 0;
    let materialized = 0;
    const { service } = createFolderOccupancyOpen({
      executedCommands,
      preferred: {
        workspaceId: "sbx_partial",
        commitSha: folderOccupancyInput.commitSha,
        profileInstallationId: "awpi_default",
        status: "partial",
        phase: "workspace-open-source-materialization",
        targetSelection: {
          targetClass: "registered-server",
          source: "explicit",
          reason: "code_target_server",
        },
      },
      createSandbox: async () => {
        createdSandboxes += 1;
        throw new Error("folder occupancy leftover must not create another Sandbox");
      },
    });
    const opened = await service.open(
      createExecutionContext({
        requestId: "req_folder_occupancy_partial",
        entrypoint: "cli",
        actor: { kind: "user", id: "usr_1" },
        tenant: { tenantId: "ten_1" },
      }),
      folderOccupancyInput,
      {
        sourceMaterializer: {
          materialize: async () => {
            materialized += 1;
            return err(
              domainError.conflict("Workspace source materialization failed", {
                code: "workspace_open_source_materialization_failed",
              }),
            );
          },
        },
      },
    );

    expect(opened.isOk()).toBe(true);
    expect(opened._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_partial",
      resumed: true,
      source: { repositoryIdentity: "folder.local/cwd/notes" },
    });
    expect(createdSandboxes).toBe(0);
    expect(materialized).toBe(0);
    expect(executedCommands).toEqual([]);
    expect(opened._unsafeUnwrap().source.repository).toBe("https://folder.local/cwd/notes.git");
  });

  test("[FOLDER-ONBOARD-007][WS-REMOTE-PROGRESS-201] leftover folder occupancy with a different pin still repairs", async () => {
    const { service } = createFolderOccupancyOpen({
      preferred: {
        workspaceId: "sbx_partial",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        profileInstallationId: "awpi_other",
        status: "partial",
        phase: "workspace-open-source-materialization",
        targetSelection: {
          targetClass: "registered-server",
          source: "explicit",
          reason: "code_target_server",
        },
      },
    });
    const opened = await service.open(
      createExecutionContext({
        requestId: "req_folder_occupancy_pin_mismatch",
        entrypoint: "cli",
        actor: { kind: "user", id: "usr_1" },
        tenant: { tenantId: "ten_1" },
      }),
      folderOccupancyInput,
    );

    expect(opened.isOk()).toBe(true);
    expect(opened._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_partial",
      resumed: true,
      source: { repositoryIdentity: "folder.local/cwd/notes" },
    });
  });

  test("[FOLDER-ONBOARD-007][WS-REMOTE-PROGRESS-201] unrepairable leftover folder occupancy replaces without partial_recovery", async () => {
    const executedCommands: string[][] = [];
    let materialized = 0;
    const { service, terminated, begun } = createFolderOccupancyOpen({
      executedCommands,
      preferred: {
        workspaceId: "sbx_partial",
        commitSha: folderOccupancyInput.commitSha,
        profileInstallationId: "awpi_default",
        status: "partial",
        phase: "workspace-open-source-materialization",
        targetSelection: {
          targetClass: "registered-server",
          source: "explicit",
          reason: "code_target_server",
        },
      },
      resumeSandbox: async () =>
        err(
          domainError.conflict("Sandbox resume failed", {
            code: "sandbox_resume_failed",
          }),
        ),
    });
    const opened = await service.open(
      createExecutionContext({
        requestId: "req_folder_occupancy_replace",
        entrypoint: "cli",
        actor: { kind: "user", id: "usr_1" },
        tenant: { tenantId: "ten_1" },
      }),
      folderOccupancyInput,
      {
        sourceMaterializer: {
          materialize: async () => {
            materialized += 1;
            return err(
              domainError.conflict("Workspace source materialization failed", {
                code: "workspace_open_source_materialization_failed",
              }),
            );
          },
        },
      },
    );

    expect(opened.isOk()).toBe(true);
    expect(opened._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_notes",
      resumed: false,
      source: { repositoryIdentity: "folder.local/cwd/notes" },
    });
    expect(terminated).toEqual(["sbx_partial"]);
    expect(begun).toEqual([{ forceNew: true }]);
    expect(materialized).toBe(0);
    expect(executedCommands).toEqual([]);
  });

  test("[FOLDER-ONBOARD-007] folder.local locator skips source materialization without a git remote host", () => {
    expect(
      shouldSkipWorkspaceSourceMaterialization({
        repositoryIdentity: "folder.local/cwd/nux-code-silence-cwd",
        repository: "https://folder.local/cwd/nux-code-silence-cwd.git",
      }),
    ).toBe(true);
    expect(
      shouldSkipWorkspaceSourceMaterialization(
        {
          repositoryIdentity: "github.com/appaloft/examples",
          repository: "https://github.com/appaloft/examples.git",
        },
        { skipSourceMaterialization: true },
      ),
    ).toBe(true);
    expect(
      shouldSkipWorkspaceSourceMaterialization({
        repositoryIdentity: "github.com/appaloft/examples",
        repository: "https://github.com/appaloft/examples.git",
      }),
    ).toBe(false);
  });

  test("[FOLDER-ONBOARD-007][WS-REMOTE-PROGRESS-201] workspaces.open command for folder.local skips materialize on forceNew", async () => {
    const executedCommands: string[][] = [];
    const { service } = createFolderOccupancyOpen({ executedCommands });
    const handler = new AgentWorkspaceOpenCommandHandler(service);
    const command = OpenAgentWorkspaceCommand.create({
      ...folderOccupancyInput,
      forceNew: true,
    });
    expect(command.isOk()).toBe(true);
    expect(command._unsafeUnwrap().input.repository).toBe("https://folder.local/cwd/notes.git");
    expect(command._unsafeUnwrap().input.repository).not.toContain("github.com");
    const opened = await handler.handle(
      createExecutionContext({
        requestId: "req_folder_occupancy_command_force_new",
        entrypoint: "cli",
        actor: { kind: "user", id: "usr_1" },
        tenant: { tenantId: "ten_1" },
      }),
      command._unsafeUnwrap(),
    );

    expect(opened.isOk()).toBe(true);
    expect(opened._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_notes",
      resumed: false,
      source: {
        repositoryIdentity: "folder.local/cwd/notes",
        repository: "https://folder.local/cwd/notes.git",
      },
    });
    expect(executedCommands).toEqual([]);
    expect(executedCommands.some((argv) => argv[0] === "git")).toBe(false);
  });

  test("[WS-OPEN-PARTIAL-017] git remote leftover still fail-closes for partial recovery", async () => {
    const { service } = createFolderOccupancyOpen({
      preferred: {
        workspaceId: "sbx_git_partial",
        commitSha: input.commitSha,
        profileInstallationId: "awpi_default",
        status: "partial",
        phase: "workspace-open-source-materialization",
        targetSelection: {
          targetClass: "registered-server",
          source: "explicit",
          reason: "code_target_server",
        },
      },
    });
    const opened = await service.open(
      createExecutionContext({
        requestId: "req_git_partial",
        entrypoint: "cli",
        actor: { kind: "user", id: "usr_1" },
        tenant: { tenantId: "ten_1" },
      }),
      input,
    );

    expect(opened.isErr()).toBe(true);
    expect(opened._unsafeUnwrapErr().details?.code).toBe(
      "workspace_open_partial_recovery_required",
    );
  });
});

const folderOccupancyInput = {
  repository: "https://folder.local/cwd/notes.git",
  repositoryIdentity: "folder.local/cwd/notes",
  ref: "refs/heads/local",
  branch: "local",
  commitSha: "cafef00d00000000000000000000000000000000",
  attach: false,
};

function createFolderOccupancyOpen(options: {
  readonly executedCommands?: string[][];
  readonly preferred?: {
    readonly workspaceId: string;
    readonly commitSha: string;
    readonly profileInstallationId: string;
    readonly status: "partial" | "ready" | "terminal";
    readonly phase?: string;
    readonly targetSelection: {
      readonly targetClass: "managed" | "registered-server";
      readonly source: "platform-default" | "explicit";
      readonly reason: string;
    };
  };
  readonly createSandbox?: WorkspaceOpenDependencies["sandboxes"]["create"];
  readonly resumeSandbox?: WorkspaceOpenDependencies["sandboxes"]["resume"];
}): {
  readonly service: AgentWorkspaceOpenService;
  readonly sourceCredentials: string[];
  readonly terminated: string[];
  readonly begun: Array<{ forceNew: boolean }>;
} {
  const executedCommands = options.executedCommands ?? [];
  const sourceCredentials: string[] = [];
  const terminated: string[] = [];
  const begun: Array<{ forceNew: boolean }> = [];
  const pin = {
    profileInstallationId: "awpi_default",
    profileDefinitionDigest: `sha256:${"a".repeat(64)}`,
    profileId: "custom-default",
    profileVersion: "1.0.0",
    adapterInstallationId: "aai_custom",
    adapterDefinitionDigest: `sha256:${"b".repeat(64)}`,
    adapterId: "custom-agent",
    adapterVersion: "1.0.0",
    harnessKey: "custom-agent",
    harnessTemplateId: "aht_custom",
    sandboxTemplateId: "sbt_agent",
    sandboxTemplateVersion: "1",
    sandboxTemplateDigest: `sha256:${"c".repeat(64)}`,
    capabilities: {
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: false,
      persistentPaths: ["/workspace"],
    },
  };
  const activation = {
    project: { projectId: "prj_notes", disposition: "created" as const },
    repositoryBinding: { bindingId: "rbd_notes", disposition: "created" as const },
    profile: { profileInstallationId: "awpi_default", disposition: "created" as const },
  };
  const dependencies: WorkspaceOpenDependencies = {
    preflight: {
      resolveContext: async () =>
        ok({
          projectId: "prj_notes",
          profileInstallationId: "awpi_default",
          activation,
        }),
      admit: async (_context, resolved) =>
        ok({
          projectId: resolved.projectId,
          profileInstallationId: resolved.profileInstallationId,
          activation: resolved.activation,
          plan: {
            sandbox: {
              source: { kind: "template", templateId: "sbt_agent" },
              requestedIsolation: "gvisor",
              limits: {
                cpuMillis: 1_000,
                memoryBytes: 536_870_912,
                diskBytes: 2_147_483_648,
                maxProcesses: 32,
              },
              networkPolicy: { mode: "allowlist", rules: [] },
            },
            initialization: [],
            runtime: {
              harnessKey: "custom-agent",
              harnessTemplateId: "aht_custom",
              declarativeHarness: {},
            },
            defaultPorts: [],
            suggestedChecks: [],
            credentialRequirements: [],
            pin,
          },
          reservation: {
            reservationId: "res_notes",
            targetSelection: options.preferred?.targetSelection ?? {
              targetClass: "managed",
              source: "platform-default",
              reason: "managed_entitlement_default",
            },
          },
        }),
    },
    entries: {
      findByWorkspaceIds: async () => new Map(),
      findByWorkspaceId: async () => undefined,
      findPreferred: async () => options.preferred,
      findLiveProfileInstallationIds: async () => [],
      begin: async (_context, _key, value) => {
        begun.push({ forceNew: value.forceNew });
        return ok({ workspaceId: "sbx_notes", created: true });
      },
      complete: async () => ok(undefined),
      fail: async () => ok(undefined),
      markWorkspaceTerminated: async (_context, workspaceId) => {
        terminated.push(workspaceId);
        return ok({ advanced: true });
      },
    },
    sourceCredentials: {
      resolve: async (_context, value) => {
        sourceCredentials.push(value.repositoryIdentity);
        return ok(null);
      },
    },
    sandboxes: {
      create:
        options.createSandbox ??
        (async () => ok({ sandboxId: "sbx_notes", name: "resonant-silence", status: "ready" })),
      resume:
        options.resumeSandbox ??
        (async (_context, workspaceId) =>
          ok({ sandboxId: workspaceId, name: "resonant-silence", status: "ready" })),
      exec: async (_context, _workspaceId, command) => {
        executedCommands.push([...command.argv]);
        return ok({ mode: "foreground", frames: [{ kind: "exit", exitCode: 1 }] });
      },
      exposePort: async () => ok(undefined),
    },
    agents: {
      showRuntime: async (_context, value) =>
        ok({
          runtimeId: value.runtimeId,
          sandboxId: value.sandboxId,
          harnessKey: "custom-agent",
          harnessTemplateId: "aht_custom",
          status: "ready",
          profilePin: pin,
          capabilities: pin.capabilities,
          createdAt: "2026-08-20T00:00:00.000Z",
        }),
      createRuntime: async (_context, value) =>
        ok({
          runtimeId: value.sandboxId === "sbx_partial" ? "sar_partial" : "sar_notes",
          sandboxId: value.sandboxId,
          harnessKey: "custom-agent",
          harnessTemplateId: "aht_custom",
          status: "ready",
          capabilities: pin.capabilities,
          createdAt: "2026-08-20T00:00:00.000Z",
        }),
      ensureRuntime: async () => ok(undefined),
      attach: async () => {
        throw new Error("attach should not run");
      },
    },
    reservations: {
      consume: async () => ok(undefined),
      release: async () => ok(undefined),
    },
    now: () => "2026-08-20T00:00:00.000Z",
  };
  return {
    service: new AgentWorkspaceOpenService(dependencies),
    sourceCredentials,
    terminated,
    begun,
  };
}
