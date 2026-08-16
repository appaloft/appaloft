import {
  domainError,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  RepositoryIdentity,
  type Result,
} from "@appaloft/core";
import {
  validateWorkspaceTargetSelectionEvidence,
  type WorkspaceActivationContextDisposition,
  type WorkspaceOpenContext,
  type WorkspaceOpenInput,
  type WorkspaceOpenOptions,
  type WorkspaceOpenPreflight,
  type WorkspaceOpenReservation,
} from "./agent-workspace-open";
import {
  type AgentWorkspaceCredentialBinding,
  type AgentWorkspaceMcpBinding,
  type AgentWorkspaceProfileInstallationService,
  type AgentWorkspaceProfileRegistryRepository,
} from "./agent-workspace-profile";
import { type ExecutionContext, toRepositoryContext } from "./execution-context";
import { type ProjectRepository } from "./ports";
import { type RepositoryBindingRepository } from "./repository-binding";

export interface WorkspaceOpenCredentialAdmissionPort {
  admit(
    context: ExecutionContext,
    input: {
      readonly projectId: string;
      readonly profileInstallationId: string;
      readonly bindings: readonly AgentWorkspaceCredentialBinding[];
      readonly scope?: NonNullable<WorkspaceOpenOptions["credentialAdmissionScope"]>;
    },
  ): Promise<Result<void>>;
}

export interface WorkspaceOpenMcpAdmissionPort {
  admit(
    context: ExecutionContext,
    input: {
      readonly projectId: string;
      readonly profileInstallationId: string;
      readonly bindings: readonly AgentWorkspaceMcpBinding[];
    },
  ): Promise<Result<void>>;
}

export interface WorkspaceOpenPlacementPort {
  reserve(
    context: ExecutionContext,
    input: {
      readonly projectId: string;
      readonly profileInstallationId: string;
      readonly sandbox: WorkspaceOpenPreflight["plan"]["sandbox"];
      readonly providerKey?: string;
      readonly targetServerId?: string;
    },
  ): Promise<Result<WorkspaceOpenReservation>>;
  consume(context: ExecutionContext, reservation: WorkspaceOpenReservation): Promise<Result<void>>;
  release(context: ExecutionContext, reservation: WorkspaceOpenReservation): Promise<Result<void>>;
}

export interface WorkspaceActivationContextInitializerPort {
  ensure(
    context: ExecutionContext,
    input: {
      readonly repository: string;
      readonly repositoryIdentity: string;
      readonly missing: "repository-binding" | "default-profile";
    },
  ): Promise<
    Result<{
      readonly project: WorkspaceActivationContextDisposition;
      readonly repositoryBinding: WorkspaceActivationContextDisposition;
      readonly profile: WorkspaceActivationContextDisposition;
    }>
  >;
  ensureLocalEnvironment(context: ExecutionContext, projectId: string): Promise<Result<void>>;
  ensureDefaultResource(
    context: ExecutionContext,
    projectId: string,
    repository: string,
  ): Promise<Result<void>>;
}

export class FailClosedWorkspaceOpenCredentialAdmission
  implements WorkspaceOpenCredentialAdmissionPort
{
  async admit(
    _context: ExecutionContext,
    input: {
      bindings: readonly AgentWorkspaceCredentialBinding[];
    },
  ): Promise<Result<void>> {
    if (input.bindings.length === 0) return ok(undefined);
    return err(
      domainError.conflict("Credential Connection custody admission is unavailable", {
        code: "workspace_open_credential_admission_unavailable",
        guidance: "Connect the required Credential and retry workspace open.",
      }),
    );
  }
}

export class FailClosedWorkspaceOpenMcpAdmission implements WorkspaceOpenMcpAdmissionPort {
  async admit(
    _context: ExecutionContext,
    input: { bindings: readonly AgentWorkspaceMcpBinding[] },
  ): Promise<Result<void>> {
    if (input.bindings.length === 0) return ok(undefined);
    return err(
      domainError.conflict("Remote MCP Connection admission is unavailable", {
        code: "workspace_open_mcp_admission_unavailable",
        guidance: "Enable and bind the required Remote MCP Connection, then retry workspace open.",
      }),
    );
  }
}

export class InMemoryWorkspaceOpenPlacementPort implements WorkspaceOpenPlacementPort {
  private sequence = 0;
  private readonly reservations = new Map<string, "reserved" | "consumed" | "released">();

  async reserve(
    _context: ExecutionContext,
    input: Parameters<WorkspaceOpenPlacementPort["reserve"]>[1],
  ): Promise<Result<WorkspaceOpenReservation>> {
    const reservationId = `wres_${++this.sequence}`;
    this.reservations.set(reservationId, "reserved");
    return ok({
      reservationId,
      targetSelection: input.targetServerId
        ? {
            targetClass: "registered-server",
            source: "explicit",
            reason: "code_target_server",
          }
        : {
            targetClass: "local",
            source: "explicit",
            reason: "local_composition",
          },
    });
  }

  async consume(
    _context: ExecutionContext,
    reservation: WorkspaceOpenReservation,
  ): Promise<Result<void>> {
    const status = this.reservations.get(reservation.reservationId);
    if (status !== "reserved") {
      return err(
        domainError.conflict("Workspace placement reservation is unavailable", {
          code: "workspace_open_placement_reservation_unavailable",
          reservationId: reservation.reservationId,
        }),
      );
    }
    this.reservations.set(reservation.reservationId, "consumed");
    return ok(undefined);
  }

  async release(
    _context: ExecutionContext,
    reservation: WorkspaceOpenReservation,
  ): Promise<Result<void>> {
    if (this.reservations.has(reservation.reservationId)) {
      this.reservations.set(reservation.reservationId, "released");
    }
    return ok(undefined);
  }
}

export class AgentWorkspaceOpenPreflightService {
  constructor(
    private readonly dependencies: {
      readonly repositoryBindings: RepositoryBindingRepository;
      readonly projects: ProjectRepository;
      readonly profiles: AgentWorkspaceProfileRegistryRepository;
      readonly profileCompiler: Pick<
        AgentWorkspaceProfileInstallationService,
        "compileForNewWorkspace"
      >;
      readonly credentialAdmission: WorkspaceOpenCredentialAdmissionPort;
      readonly mcpAdmission: WorkspaceOpenMcpAdmissionPort;
      readonly placement: WorkspaceOpenPlacementPort;
      readonly contextInitializer?: WorkspaceActivationContextInitializerPort;
    },
  ) {}

  async resolveContext(
    context: ExecutionContext,
    input: WorkspaceOpenInput,
  ): Promise<Result<WorkspaceOpenContext>> {
    const sourceIdentity = repositoryIdentityFromSource(input.repository);
    if (sourceIdentity.isErr()) return err(sourceIdentity.error);
    const requestedIdentity = RepositoryIdentity.create(input.repositoryIdentity);
    if (requestedIdentity.isErr() || requestedIdentity.value.value !== sourceIdentity.value) {
      return err(
        domainError.resourceContextMismatch(
          "Workspace Repository identity does not match its credential-free HTTPS source",
          {
            code: "workspace_open_repository_identity_mismatch",
          },
        ),
      );
    }
    const initial = await this.resolveCanonicalContext(context, input, {
      project: "reused",
      repositoryBinding: "reused",
      profile: "reused",
    });
    if (initial.isOk() || !this.dependencies.contextInitializer) return initial;
    const missing = missingActivationContext(initial.error);
    if (!missing) return initial;
    const initialized = await this.dependencies.contextInitializer.ensure(context, {
      repository: input.repository,
      repositoryIdentity: input.repositoryIdentity,
      missing,
    });
    if (initialized.isErr()) return err(initialized.error);
    if (!validActivationDispositions(initialized.value)) {
      return err(
        domainError.validation("Workspace activation initializer returned invalid evidence", {
          code: "workspace_activation_context_evidence_invalid",
        }),
      );
    }
    const reread = await this.resolveCanonicalContext(context, input, initialized.value);
    if (reread.isErr()) {
      return err(
        domainError.conflict(
          "Workspace activation context is still unavailable after initialization",
          {
            code: "workspace_activation_context_conflict",
            causeCode: reread.error.details?.code ?? reread.error.code,
          },
        ),
      );
    }
    return reread;
  }

  private async resolveCanonicalContext(
    context: ExecutionContext,
    input: WorkspaceOpenInput,
    dispositions: {
      readonly project: WorkspaceActivationContextDisposition;
      readonly repositoryBinding: WorkspaceActivationContextDisposition;
      readonly profile: WorkspaceActivationContextDisposition;
    },
  ): Promise<Result<WorkspaceOpenContext>> {
    const repositoryContext = toRepositoryContext(context);
    const binding = await this.dependencies.repositoryBindings.findByIdentity(
      repositoryContext,
      input.repositoryIdentity,
    );
    if (binding?.binding.toState().status !== "active") {
      return err(domainError.notFound("RepositoryBinding", input.repositoryIdentity)).mapErr(
        (error) => ({
          ...error,
          details: {
            ...error.details,
            code: "workspace_open_repository_not_bound",
            guidance: `appaloft repository-binding bind --repository ${input.repositoryIdentity} --project <projectId>`,
          },
        }),
      );
    }
    const projectId = binding.binding.toState().projectId.value;
    const project = await this.dependencies.projects.findOne(
      repositoryContext,
      ProjectByIdSpec.create(ProjectId.rehydrate(projectId)),
    );
    if (project?.toState().lifecycleStatus.value !== "active") {
      return err(
        domainError.conflict("Repository Binding Project is unavailable", {
          code: "workspace_open_project_unavailable",
          projectId,
        }),
      );
    }
    if (this.dependencies.contextInitializer) {
      const environment = await this.dependencies.contextInitializer.ensureLocalEnvironment(
        context,
        projectId,
      );
      if (environment.isErr()) return err(environment.error);
      const resource = await this.dependencies.contextInitializer.ensureDefaultResource(
        context,
        projectId,
        input.repository,
      );
      if (resource.isErr()) return err(resource.error);
    }
    const selector =
      input.profile ?? project.toState().defaultWorkspaceProfileInstallationId?.value;
    if (!selector) {
      return err(
        domainError.conflict("Project does not have a default Agent Workspace Profile", {
          code: "workspace_open_profile_required",
          projectId,
          guidance: `appaloft project configure-workspace-profile ${projectId} --profile <installationId>`,
        }),
      );
    }
    const resolvedProfile = await this.resolveProfile(context, selector);
    if (resolvedProfile.isErr()) return err(resolvedProfile.error);
    return ok({
      projectId,
      profileInstallationId: resolvedProfile.value,
      activation: {
        project: { projectId, disposition: dispositions.project },
        repositoryBinding: {
          bindingId: binding.binding.id.value,
          disposition: dispositions.repositoryBinding,
        },
        profile: {
          profileInstallationId: resolvedProfile.value,
          disposition: dispositions.profile,
        },
      },
    });
  }

  async admit(
    context: ExecutionContext,
    resolved: WorkspaceOpenContext,
    options: Pick<
      WorkspaceOpenOptions,
      | "credentialReferences"
      | "precompiledProfilePlan"
      | "credentialAdmissionScope"
      | "placementProviderKey"
      | "targetServerId"
    > = {},
  ): Promise<Result<WorkspaceOpenPreflight>> {
    if (options.precompiledProfilePlan && options.credentialReferences) {
      return err(
        domainError.validation(
          "Workspace open accepts either a precompiled Profile plan or credential references",
        ),
      );
    }
    if (
      options.precompiledProfilePlan &&
      options.precompiledProfilePlan.pin.profileInstallationId !== resolved.profileInstallationId
    ) {
      return err(
        domainError.conflict("Precompiled Workspace Profile plan does not match the resolution", {
          code: "workspace_open_precompiled_profile_mismatch",
          requestedProfileInstallationId: resolved.profileInstallationId,
          planProfileInstallationId: options.precompiledProfilePlan.pin.profileInstallationId,
        }),
      );
    }
    const plan = options.precompiledProfilePlan
      ? ok(options.precompiledProfilePlan)
      : await this.dependencies.profileCompiler.compileForNewWorkspace(
          context,
          resolved.profileInstallationId,
          {
            ...(options.credentialReferences
              ? { credentialReferences: options.credentialReferences }
              : {}),
          },
        );
    if (plan.isErr()) return err(plan.error);
    const admitted = await this.dependencies.credentialAdmission.admit(context, {
      projectId: resolved.projectId,
      profileInstallationId: resolved.profileInstallationId,
      bindings: plan.value.credentialBindings ?? [],
      ...(options.credentialAdmissionScope ? { scope: options.credentialAdmissionScope } : {}),
    });
    if (admitted.isErr()) return err(admitted.error);
    const mcpAdmitted = await this.dependencies.mcpAdmission.admit(context, {
      projectId: resolved.projectId,
      profileInstallationId: resolved.profileInstallationId,
      bindings: plan.value.mcpBindings ?? [],
    });
    if (mcpAdmitted.isErr()) return err(mcpAdmitted.error);
    const reservation = await this.dependencies.placement.reserve(context, {
      projectId: resolved.projectId,
      profileInstallationId: resolved.profileInstallationId,
      sandbox: plan.value.sandbox,
      ...(options.placementProviderKey ? { providerKey: options.placementProviderKey } : {}),
      ...(options.targetServerId ? { targetServerId: options.targetServerId } : {}),
    });
    if (reservation.isErr()) return err(reservation.error);
    const targetSelection = validateWorkspaceTargetSelectionEvidence(
      reservation.value.targetSelection,
    );
    if (targetSelection.isErr() || targetSelection.value.targetClass === "legacy-unclassified") {
      await this.dependencies.placement.release(context, reservation.value);
      return targetSelection.isErr()
        ? err(targetSelection.error)
        : err(
            domainError.validation("New Workspace placement requires canonical target evidence", {
              code: "workspace_target_selection_evidence_invalid",
            }),
          );
    }
    return ok({
      projectId: resolved.projectId,
      profileInstallationId: resolved.profileInstallationId,
      activation: resolved.activation,
      plan: plan.value,
      reservation: reservation.value,
    });
  }

  async resolve(
    context: ExecutionContext,
    input: WorkspaceOpenInput,
  ): Promise<Result<WorkspaceOpenPreflight>> {
    const resolved = await this.resolveContext(context, input);
    return resolved.isErr() ? err(resolved.error) : this.admit(context, resolved.value);
  }

  private async resolveProfile(
    context: ExecutionContext,
    selector: string,
  ): Promise<Result<string>> {
    const repositoryContext = toRepositoryContext(context);
    const installation = await this.dependencies.profiles.findInstallation(
      repositoryContext,
      selector,
    );
    if (installation) {
      const available = installation.assertAvailableForNewWorkspace();
      return available.isErr() ? err(available.error) : ok(installation.id.value);
    }
    const installations = await this.dependencies.profiles.listInstallations(
      repositoryContext,
      200,
    );
    const available = installations.filter(
      (candidate) => candidate.toState().status.value === "enabled",
    );
    const byProfileId = available.filter(
      (candidate) => candidate.toState().profileId.value === selector,
    );
    const candidates =
      byProfileId.length > 0
        ? byProfileId
        : (
            await Promise.all(
              available.map(async (candidate) => ({
                candidate,
                definition: await this.dependencies.profiles.findDefinition(
                  candidate.toState().definitionDigest.value,
                ),
              })),
            )
          )
            .filter(({ definition }) => definition?.toState().displayName.value === selector)
            .map(({ candidate }) => candidate);
    if (candidates.length === 0) {
      return err(domainError.notFound("AgentWorkspaceProfileInstallation", selector));
    }
    if (candidates.length > 1) {
      return err(
        domainError.conflict("Agent Workspace Profile selector is ambiguous", {
          code: "workspace_open_profile_ambiguous",
          selector,
          installationIds: candidates.map((candidate) => candidate.id.value),
        }),
      );
    }
    const [candidate] = candidates;
    return candidate
      ? ok(candidate.id.value)
      : err(domainError.notFound("AgentWorkspaceProfileInstallation", selector));
  }
}

function missingActivationContext(error: {
  readonly details?: Readonly<Record<string, unknown>>;
}): "repository-binding" | "default-profile" | undefined {
  const code = error.details?.code;
  return code === "workspace_open_repository_not_bound"
    ? "repository-binding"
    : code === "workspace_open_profile_required"
      ? "default-profile"
      : undefined;
}

function validActivationDispositions(value: {
  readonly project: WorkspaceActivationContextDisposition;
  readonly repositoryBinding: WorkspaceActivationContextDisposition;
  readonly profile: WorkspaceActivationContextDisposition;
}): boolean {
  return [value.project, value.repositoryBinding, value.profile].every(
    (candidate) => candidate === "created" || candidate === "reused",
  );
}

function repositoryIdentityFromSource(repository: string): Result<string> {
  let source: URL;
  try {
    source = new URL(repository.trim());
  } catch {
    return err(
      domainError.validation("Workspace repository must use credential-free HTTPS", {
        code: "workspace_open_repository_https_required",
      }),
    );
  }
  const path = source.pathname
    .replace(/^\/+/u, "")
    .replace(/\/+$/u, "")
    .replace(/\.git$/u, "");
  if (
    source.protocol !== "https:" ||
    source.username ||
    source.password ||
    source.search ||
    source.hash
  ) {
    return err(
      domainError.validation("Workspace repository must use credential-free HTTPS", {
        code: "workspace_open_repository_https_required",
      }),
    );
  }
  const identity = RepositoryIdentity.create(
    `${source.hostname.toLowerCase()}${source.port ? `:${source.port}` : ""}/${path}`,
  );
  return identity.isErr() ? err(identity.error) : ok(identity.value.value);
}
