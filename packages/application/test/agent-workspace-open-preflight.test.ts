import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  AgentWorkspaceProfileCanonicalManifest,
  AgentWorkspaceProfileDefinition,
  AgentWorkspaceProfileDefinitionDigest,
  AgentWorkspaceProfileDisplayName,
  AgentWorkspaceProfileId,
  AgentWorkspaceProfileInstallation,
  AgentWorkspaceProfileInstallationId,
  AgentWorkspaceProfileVersion,
  CreatedAt,
  domainError,
  err,
  ok,
  Project,
  ProjectId,
  ProjectName,
  ProjectRepositoryBinding,
  ProjectRepositoryBindingId,
  RepositoryIdentity,
  UpdatedAt,
} from "@appaloft/core";

import {
  AgentWorkspaceOpenPreflightService,
  createExecutionContext,
  InMemoryAgentWorkspaceProfileRegistryRepository,
  InMemoryRepositoryBindingRepository,
  type ProjectRepository,
  toRepositoryContext,
  type WorkspaceActivationContextInitializerPort,
  type WorkspaceOpenCredentialAdmissionPort,
  type WorkspaceOpenMcpAdmissionPort,
  type WorkspaceOpenPlacementPort,
  type WorkspaceOpenReservation,
} from "../src";

const context = createExecutionContext({
  entrypoint: "cli",
  requestId: "req_workspace_preflight",
  actor: { kind: "user", id: "usr_1" },
  tenant: { tenantId: "tenant_1", subjectId: "usr_1" },
});

const input = {
  repository: "https://github.com/Acme/Web.git",
  repositoryIdentity: "github.com/Acme/Web",
  ref: "refs/heads/main",
  branch: "main",
  commitSha: "a".repeat(40),
};

const plan = {
  sandbox: {
    source: { kind: "template" as const, templateId: "sbt_agent" },
    requestedIsolation: "gvisor" as const,
    limits: {
      cpuMillis: 1_000,
      memoryBytes: 1_048_576,
      diskBytes: 10_485_760,
      maxProcesses: 32,
    },
    networkPolicy: { mode: "deny" as const },
  },
  initialization: [],
  runtime: {
    harnessKey: "agent",
    harnessTemplateId: "aht_agent",
    declarativeHarness: {},
  },
  defaultPorts: [],
  suggestedChecks: [],
  credentialRequirements: [
    {
      id: "model-api",
      kind: "model-api" as const,
      required: true,
      purpose: "Model access",
      delivery: {
        kind: "process-environment" as const,
        variable: "MODEL_API_KEY",
      },
    },
  ],
  credentialBindings: [
    {
      requirementId: "model-api",
      kind: "model-api" as const,
      purpose: "Model access",
      delivery: {
        kind: "process-environment" as const,
        variable: "MODEL_API_KEY",
      },
      connectionReference: "model-default",
    },
  ],
  pin: {
    profileInstallationId: "awpi_default",
    profileDefinitionDigest: `sha256:${"1".repeat(64)}`,
    profileId: "agent-default",
    profileVersion: "1.0.0",
    adapterInstallationId: "aai_agent",
    adapterDefinitionDigest: `sha256:${"2".repeat(64)}`,
    adapterId: "agent",
    adapterVersion: "1.0.0",
    harnessKey: "agent",
    harnessTemplateId: "aht_agent",
    sandboxTemplateId: "sbt_agent",
    sandboxTemplateVersion: "1.0.0",
    sandboxTemplateDigest: `sha256:${"3".repeat(64)}`,
    capabilities: {
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: false,
      persistentPaths: ["/workspace"],
    },
  },
};

async function fixture(
  options: {
    admission?: WorkspaceOpenCredentialAdmissionPort;
    mcpAdmission?: WorkspaceOpenMcpAdmissionPort;
    staleProfile?: boolean;
    omitBinding?: boolean;
    omitDefaultProfile?: boolean;
    placement?: WorkspaceOpenPlacementPort;
    initializerFactory?: (state: {
      project: Project;
      binding: ProjectRepositoryBinding;
      repositoryBindings: InMemoryRepositoryBindingRepository;
    }) => WorkspaceActivationContextInitializerPort;
  } = {},
) {
  const profiles = new InMemoryAgentWorkspaceProfileRegistryRepository();
  const definitionDigest = `sha256:${"1".repeat(64)}`;
  const definition = AgentWorkspaceProfileDefinition.register({
    id: AgentWorkspaceProfileDefinitionDigest.rehydrate(definitionDigest),
    profileId: AgentWorkspaceProfileId.rehydrate("agent-default"),
    profileVersion: AgentWorkspaceProfileVersion.rehydrate("1.0.0"),
    displayName: AgentWorkspaceProfileDisplayName.rehydrate("Agent Default"),
    canonicalManifest: AgentWorkspaceProfileCanonicalManifest.rehydrate("{}"),
    registeredAt: CreatedAt.rehydrate("2026-07-28T00:00:00.000Z"),
  })._unsafeUnwrap();
  await profiles.saveDefinition(definition);
  const installation = AgentWorkspaceProfileInstallation.install({
    id: AgentWorkspaceProfileInstallationId.rehydrate("awpi_default"),
    definitionDigest: AgentWorkspaceProfileDefinitionDigest.rehydrate(definitionDigest),
    profileId: AgentWorkspaceProfileId.rehydrate("agent-default"),
    profileVersion: AgentWorkspaceProfileVersion.rehydrate("1.0.0"),
    installedAt: CreatedAt.rehydrate("2026-07-28T00:00:00.000Z"),
  })._unsafeUnwrap();
  await profiles.saveInstallation(toRepositoryContext(context), installation, null);
  const project = Project.create({
    id: ProjectId.rehydrate("prj_web"),
    name: ProjectName.rehydrate("Web"),
    createdAt: CreatedAt.rehydrate("2026-07-28T00:00:00.000Z"),
  })._unsafeUnwrap();
  if (!options.omitDefaultProfile) {
    project
      .configureWorkspaceProfile({
        profileInstallationId: AgentWorkspaceProfileInstallationId.rehydrate("awpi_default"),
        configuredAt: UpdatedAt.rehydrate("2026-07-28T00:00:01.000Z"),
      })
      ._unsafeUnwrap();
  }
  const projects: ProjectRepository = {
    findOne: async () => project,
    upsert: async () => undefined,
  };
  const repositoryBindings = new InMemoryRepositoryBindingRepository();
  const binding = ProjectRepositoryBinding.bind({
    id: ProjectRepositoryBindingId.rehydrate("rbd_web"),
    repositoryIdentity: RepositoryIdentity.rehydrate("github.com/Acme/Web"),
    projectId: ProjectId.rehydrate("prj_web"),
    createdAt: CreatedAt.rehydrate("2026-07-28T00:00:00.000Z"),
  })._unsafeUnwrap();
  if (!options.omitBinding) {
    await repositoryBindings.save(toRepositoryContext(context), binding);
  }
  const compiled: string[] = [];
  const compiledCredentialReferences: Array<
    readonly { requirementId: string; connectionReference: string }[] | undefined
  > = [];
  const reserved: string[] = [];
  const reservedProviderKeys: (string | undefined)[] = [];
  const admittedScopes: Array<
    Parameters<WorkspaceOpenCredentialAdmissionPort["admit"]>[1]["scope"]
  > = [];
  const placement: WorkspaceOpenPlacementPort = options.placement ?? {
    reserve: async (_context, value) => {
      reserved.push(value.profileInstallationId);
      reservedProviderKeys.push(value.providerKey);
      return ok({
        reservationId: "wres_1",
        targetSelection: {
          targetClass: "local",
          source: "explicit",
          reason: "local_composition",
        },
      });
    },
    consume: async () => ok(undefined),
    release: async () => ok(undefined),
  };
  const contextInitializer = options.initializerFactory?.({
    project,
    binding,
    repositoryBindings,
  });
  const service = new AgentWorkspaceOpenPreflightService({
    repositoryBindings,
    projects,
    profiles,
    profileCompiler: {
      compileForNewWorkspace: async (_context, installationId, compileInput) => {
        compiled.push(installationId);
        compiledCredentialReferences.push(compileInput?.credentialReferences);
        if (options.staleProfile) {
          return err(
            domainError.conflict("Workspace Profile installation is stale", {
              code: "agent_workspace_profile_installation_stale",
            }),
          );
        }
        return ok({
          ...plan,
          pin: { ...plan.pin, profileInstallationId: installationId },
        });
      },
    },
    credentialAdmission:
      options.admission ??
      ({
        admit: async (_context, admission) => {
          admittedScopes.push(admission.scope);
          return ok(undefined);
        },
      } satisfies WorkspaceOpenCredentialAdmissionPort),
    mcpAdmission:
      options.mcpAdmission ??
      ({
        admit: async () => ok(undefined),
      } satisfies WorkspaceOpenMcpAdmissionPort),
    placement,
    ...(contextInitializer ? { contextInitializer } : {}),
  });
  return {
    compiled,
    compiledCredentialReferences,
    admittedScopes,
    installation,
    profiles,
    reserved,
    reservedProviderKeys,
    service,
  };
}

describe("Agent Workspace open preflight", () => {
  test("[WS-OPEN-PROFILE-006][WS-OPEN-ADMIT-008] resolves installation id, profile id, and display name before placement", async () => {
    const { compiled, reserved, service } = await fixture();
    for (const selector of ["awpi_default", "agent-default", "Agent Default"]) {
      expect(
        (
          await service.resolve(context, {
            ...input,
            profile: selector,
          })
        )._unsafeUnwrap(),
      ).toMatchObject({
        projectId: "prj_web",
        profileInstallationId: "awpi_default",
      });
    }
    expect(compiled).toEqual(["awpi_default", "awpi_default", "awpi_default"]);
    expect(reserved).toEqual(["awpi_default", "awpi_default", "awpi_default"]);
  });

  test("[WS-OPEN-CRED-007] rejects missing Credential custody before placement or Sandbox effects", async () => {
    const { reserved, service } = await fixture({
      admission: {
        admit: async () =>
          err(
            domainError.conflict("Credential Connection is missing", {
              code: "workspace_open_credential_connection_missing",
              guidance: "appaloft connection start",
            }),
          ),
      },
    });
    const result = await service.resolve(context, {
      ...input,
      profile: "awpi_default",
    });
    expect(result.isErr()).toBe(true);
    expect(reserved).toEqual([]);
  });

  test("[MCP-ACCESS-BIND-003] rejects unavailable MCP bindings before placement or Sandbox effects", async () => {
    const { reserved, service } = await fixture({
      mcpAdmission: {
        admit: async () =>
          err(
            domainError.conflict("Remote MCP Connection is unavailable", {
              code: "workspace_open_mcp_connection_unavailable",
            }),
          ),
      },
    });
    const resolved = await service.resolveContext(context, input);
    const result = await service.admit(context, resolved._unsafeUnwrap(), {
      precompiledProfilePlan: {
        ...plan,
        mcpBindings: [
          {
            requirementId: "docs",
            connectionReference: "mcpconn_docs",
            required: true,
            purpose: "Documentation",
            requestedTools: ["docs.search"],
          },
        ],
      },
    });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details?.code).toBe(
      "workspace_open_mcp_connection_unavailable",
    );
    expect(reserved).toEqual([]);
  });

  test("[GH-AUTO-BOUNDARY-021][GH-AUTO-CREDENTIAL-006][GH-AUTO-TASK-009] admits task-scoped credentials and requested placement through the authoritative preflight", async () => {
    const { admittedScopes, compiledCredentialReferences, reservedProviderKeys, service } =
      await fixture();
    const resolved = await service.resolveContext(context, input);
    expect(resolved.isOk()).toBe(true);
    const admitted = await service.admit(context, resolved._unsafeUnwrap(), {
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
    });

    expect(admitted.isOk()).toBe(true);
    expect(compiledCredentialReferences).toEqual([
      [
        {
          requirementId: "model-api",
          connectionReference: "agent-credential://tenant_1/agentcred_1",
        },
      ],
    ]);
    expect(admittedScopes).toEqual([
      {
        owner: { kind: "organization", id: "org_1" },
        agentProfileId: "agp_1",
        use: "automation",
        untrustedCode: false,
        serverPoolId: "server-pool-1",
      },
    ]);
    expect(reservedProviderKeys).toEqual(["server-pool-1"]);
  });

  test("[GH-AUTO-BOUNDARY-021] admits one immutable precompiled Profile plan without recompiling it", async () => {
    const { compiled, reservedProviderKeys, service } = await fixture();
    const resolved = await service.resolveContext(context, input);
    const admitted = await service.admit(context, resolved._unsafeUnwrap(), {
      precompiledProfilePlan: plan,
      credentialAdmissionScope: {
        owner: { kind: "user", id: "usr_1" },
        agentProfileId: "agp_1",
        use: "interactive",
        untrustedCode: false,
        serverPoolId: "server-pool-1",
      },
      placementProviderKey: "server-pool-1",
    });

    expect(admitted._unsafeUnwrap().plan).toEqual(plan);
    expect(compiled).toEqual([]);
    expect(reservedProviderKeys).toEqual(["server-pool-1"]);
  });

  test("[WS-OPEN-BIND-005] rejects a source that does not match the bound Repository identity", async () => {
    const { compiled, reserved, service } = await fixture();

    const mismatch = await service.resolve(context, {
      ...input,
      repository: "https://github.com/Other/Repo.git",
      profile: "awpi_default",
    });
    const credentialBearing = await service.resolve(context, {
      ...input,
      repository: "https://token@github.com/Acme/Web.git",
      profile: "awpi_default",
    });

    expect(mismatch.isErr()).toBe(true);
    expect(mismatch._unsafeUnwrapErr().details?.code).toBe(
      "workspace_open_repository_identity_mismatch",
    );
    expect(credentialBearing.isErr()).toBe(true);
    expect(credentialBearing._unsafeUnwrapErr().details?.code).toBe(
      "workspace_open_repository_https_required",
    );
    expect(compiled).toEqual([]);
    expect(reserved).toEqual([]);
  });

  test("[WS-OPEN-PROFILE-006] fails missing, disabled, and stale Profile selectors before admission", async () => {
    const { compiled, installation, profiles, reserved, service } = await fixture();
    const staleFixture = await fixture({ staleProfile: true });
    const missing = await service.resolve(context, {
      ...input,
      profile: "missing-profile",
    });
    const stale = await staleFixture.service.resolve(context, {
      ...input,
      profile: "awpi_default",
    });
    const expectedRevision = installation.toState().revision.value;
    installation.disable(UpdatedAt.rehydrate("2026-07-28T00:00:02.000Z"))._unsafeUnwrap();
    expect(
      (
        await profiles.saveInstallation(
          toRepositoryContext(context),
          installation,
          expectedRevision,
        )
      ).isOk(),
    ).toBe(true);
    const disabled = await service.resolve(context, {
      ...input,
      profile: "awpi_default",
    });

    expect(missing.isErr()).toBe(true);
    expect(disabled.isErr()).toBe(true);
    expect(stale.isErr()).toBe(true);
    expect(stale._unsafeUnwrapErr().details?.code).toBe(
      "agent_workspace_profile_installation_stale",
    );
    expect(compiled).toEqual([]);
    expect(reserved).toEqual([]);
    expect(staleFixture.reserved).toEqual([]);
  });

  test("[WS-ACT-CONTEXT-001] initializes a missing Binding/default Profile once and re-reads canonical public state", async () => {
    const calls: string[] = [];
    const { service } = await fixture({
      omitBinding: true,
      omitDefaultProfile: true,
      initializerFactory: ({ binding, project, repositoryBindings }) => ({
        ensure: async (_context, initializeInput) => {
          calls.push(initializeInput.missing);
          project
            .configureWorkspaceProfile({
              profileInstallationId: AgentWorkspaceProfileInstallationId.rehydrate("awpi_default"),
              configuredAt: UpdatedAt.rehydrate("2026-07-28T00:00:02.000Z"),
            })
            ._unsafeUnwrap();
          await repositoryBindings.save(toRepositoryContext(context), binding);
          return ok({ project: "reused", repositoryBinding: "created", profile: "created" });
        },
        ensureLocalEnvironment: async () => ok(undefined),
      }),
    });

    expect((await service.resolveContext(context, input))._unsafeUnwrap()).toEqual({
      projectId: "prj_web",
      profileInstallationId: "awpi_default",
      activation: {
        project: { projectId: "prj_web", disposition: "reused" },
        repositoryBinding: { bindingId: "rbd_web", disposition: "created" },
        profile: { profileInstallationId: "awpi_default", disposition: "created" },
      },
    });
    expect(calls).toEqual(["repository-binding"]);
  });

  test("[WS-ACT-CONTEXT-002] reuses existing context, preserves fail-closed defaults, and rejects an initializer that does not repair canonical state", async () => {
    let existingCalls = 0;
    const existing = await fixture({
      initializerFactory: () => ({
        ensure: async () => {
          existingCalls += 1;
          return ok({ project: "created", repositoryBinding: "created", profile: "created" });
        },
        ensureLocalEnvironment: async () => ok(undefined),
      }),
    });
    expect(
      (await existing.service.resolveContext(context, input))._unsafeUnwrap().activation,
    ).toEqual({
      project: { projectId: "prj_web", disposition: "reused" },
      repositoryBinding: { bindingId: "rbd_web", disposition: "reused" },
      profile: { profileInstallationId: "awpi_default", disposition: "reused" },
    });
    expect(existingCalls).toBe(0);

    const defaultFailClosed = await fixture({ omitBinding: true });
    const missing = await defaultFailClosed.service.resolveContext(context, input);
    expect(missing._unsafeUnwrapErr().details?.code).toBe("workspace_open_repository_not_bound");

    let conflictCalls = 0;
    const conflict = await fixture({
      omitBinding: true,
      initializerFactory: () => ({
        ensure: async () => {
          conflictCalls += 1;
          return ok({ project: "reused", repositoryBinding: "created", profile: "reused" });
        },
        ensureLocalEnvironment: async () => ok(undefined),
      }),
    });
    const conflicted = await conflict.service.resolveContext(context, input);
    expect(conflicted._unsafeUnwrapErr().details?.code).toBe(
      "workspace_activation_context_conflict",
    );
    expect(conflictCalls).toBe(1);
  });

  test("[WS-ACT-TARGET-003][WS-ACT-SAFE-007] rejects malformed or legacy placement evidence and releases the reservation", async () => {
    const released: string[] = [];
    const invalidPlacement: WorkspaceOpenPlacementPort = {
      reserve: async () =>
        ok({
          reservationId: "wres_invalid",
          targetSelection: {
            targetClass: "managed",
            source: "legacy",
            reason: "raw_provider_handle",
          } as unknown as WorkspaceOpenReservation["targetSelection"],
        }),
      consume: async () => ok(undefined),
      release: async (_context, reservation) => {
        released.push(reservation.reservationId);
        return ok(undefined);
      },
    };
    const { service } = await fixture({ placement: invalidPlacement });
    const result = await service.resolve(context, input);
    expect(result._unsafeUnwrapErr().details?.code).toBe(
      "workspace_target_selection_evidence_invalid",
    );
    expect(released).toEqual(["wres_invalid"]);
  });
});
