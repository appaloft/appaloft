import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok } from "@appaloft/core";

import {
  AgentWorkspaceOpenService,
  createExecutionContext,
  type WorkspaceOpenDependencies,
} from "../src";

const input = {
  repository: "https://github.com/Acme/Web.git",
  repositoryIdentity: "github.com/Acme/Web",
  ref: "refs/heads/feature/open",
  branch: "feature/open",
  commitSha: "0123456789abcdef0123456789abcdef01234567",
  attach: false,
};

describe("Agent Workspace open application workflow", () => {
  test("[WS-OPEN-CRED-007][WS-OPEN-ADMIT-008][WS-OPEN-CREATE-010][WS-OPEN-RESUME-011][WS-OPEN-SHA-013][WS-OPEN-PARTIAL-017][WS-OPEN-REMOTE-018] preflights before effects, preserves source pins, resumes, and releases failed placement", async () => {
    const phases: string[] = [];
    let failSandboxCreate = false;
    let failSourceCredential = false;
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
    let preferred:
      | {
          workspaceId: string;
          runtimeId: string;
          commitSha: string;
          profileInstallationId: string;
          status: "ready";
        }
      | undefined;
    const dependencies: WorkspaceOpenDependencies = {
      preflight: {
        resolveContext: async () => {
          phases.push("context");
          return ok({
            projectId: "prj_web",
            profileInstallationId: "awpi_default",
          });
        },
        admit: async (_context, _resolved, options) => {
          phases.push("preflight");
          admittedCredentials.push(options?.credentialReferences);
          admittedScopes.push(options);
          return ok({
            projectId: "prj_web",
            profileInstallationId: "awpi_default",
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
            reservation: { reservationId: "res_1" },
          });
        },
      },
      entries: {
        findPreferred: async () => preferred,
        begin: async () => ok({ workspaceId: "sbx_1", created: true }),
        complete: async (_context, value) => {
          preferred = {
            workspaceId: value.workspaceId,
            runtimeId: value.runtimeId,
            commitSha: value.commitSha,
            profileInstallationId: "awpi_default",
            status: "ready",
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
          return ok({ sandboxId: "sbx_1", status: "ready" });
        },
        resume: async (_context, workspaceId) => {
          phases.push("sandbox-resume");
          return ok({ sandboxId: workspaceId, status: "ready" });
        },
        exec: async (_context, _workspaceId, command) => {
          executedCommands.push({
            argv: [...command.argv],
            ...(command.stdin ? { stdin: command.stdin.slice() } : {}),
          });
          return ok({ mode: "foreground", frames: [{ kind: "exit", exitCode: 0 }] });
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
    });
    expect(resumed._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_1",
      resumed: true,
      agent: { runtimeId: "sar_1" },
    });
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
      [
        "git",
        "-c",
        "credential.helper=",
        "-c",
        "credential.interactive=never",
        "-c",
        "core.askPass=/bin/false",
        "-c",
        "include.path=/dev/stdin",
        "fetch",
        "--no-tags",
        "--depth",
        "1",
        "origin",
        "refs/heads/feature/open",
      ],
      ["git", "checkout", "--detach", "0123456789abcdef0123456789abcdef01234567"],
      ["git", "switch", "-c", "feature/open"],
    ]);
    expect(JSON.stringify(executedCommands.map(({ argv }) => argv))).not.toContain(
      "source-token-must-not-enter-argv",
    );
    expect(new TextDecoder().decode(executedCommands[2]?.stdin)).toBe(
      `[http "https://github.com/"]\n\textraHeader = Authorization: Basic ${Buffer.from(
        "x-access-token:source-token-must-not-enter-argv",
        "utf8",
      ).toString("base64")}\n`,
    );
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
      "source-credential",
      "context",
      "source-credential",
      "preflight",
      "sandbox-create",
    ]);
  });
});
