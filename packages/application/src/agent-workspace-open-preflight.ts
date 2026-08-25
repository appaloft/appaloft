import {
  type DomainError,
  domainError,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  RepositoryIdentity,
  type Result,
  UpdatedAt,
} from "@appaloft/core";
import {
  validateWorkspaceTargetSelectionEvidence,
  type WorkspaceActivationContextDisposition,
  type WorkspaceOpenContext,
  type WorkspaceOpenEntryRepository,
  type WorkspaceOpenInput,
  type WorkspaceOpenOptions,
  type WorkspaceOpenPreflight,
  type WorkspaceOpenReservation,
} from "./agent-workspace-open";
import {
  type AgentWorkspaceCredentialBinding,
  type AgentWorkspaceMcpBinding,
  type AgentWorkspaceProfileCompiledPlan,
  type AgentWorkspaceProfileInstallationService,
  type AgentWorkspaceProfileRegistryRepository,
} from "./agent-workspace-profile";
import { selectWorkspaceProfileInstallation } from "./agent-workspace-profile-selector";
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
      readonly profile?: string;
      readonly projectId?: string;
    },
  ): Promise<
    Result<{
      readonly project: WorkspaceActivationContextDisposition;
      readonly repositoryBinding: WorkspaceActivationContextDisposition;
      readonly profile: WorkspaceActivationContextDisposition;
      readonly projectId?: string;
      readonly createdProfileInstallationId?: string;
    }>
  >;
  ensureLocalEnvironment(context: ExecutionContext, projectId: string): Promise<Result<void>>;
  ensureDefaultResource(
    context: ExecutionContext,
    projectId: string,
    repository: string,
    repositoryIdentity: string,
  ): Promise<Result<void>>;
}

export class FailClosedWorkspaceOpenCredentialAdmission implements WorkspaceOpenCredentialAdmissionPort {
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
      readonly occupancies?: Pick<WorkspaceOpenEntryRepository, "findLiveProfileInstallationIds">;
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
    if (initial.isOk()) return initial;
    if (!this.dependencies.contextInitializer) {
      return err(surfaceWorkspaceOpenFailure(initial.error, input.repositoryIdentity));
    }
    const missing = missingActivationContext(initial.error, input.profile);
    if (!missing) {
      return err(surfaceWorkspaceOpenFailure(initial.error, input.repositoryIdentity));
    }
    const initialized = await this.dependencies.contextInitializer.ensure(context, {
      repository: input.repository,
      repositoryIdentity: input.repositoryIdentity,
      missing,
      ...(input.profile ? { profile: input.profile } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
    });
    if (initialized.isErr()) {
      return err(surfaceWorkspaceOpenFailure(initialized.error, input.repositoryIdentity));
    }
    if (!validActivationDispositions(initialized.value)) {
      return err(
        surfaceWorkspaceOpenFailure(
          domainError.validation("Workspace activation initializer returned invalid evidence", {
            code: "workspace_activation_context_evidence_invalid",
          }),
          input.repositoryIdentity,
        ),
      );
    }
    const reread = await this.resolveCanonicalContext(
      context,
      initialized.value.projectId
        ? { ...input, projectId: initialized.value.projectId }
        : input,
      initialized.value,
    );
    if (reread.isOk()) return reread;
    if (initialized.value.createdProfileInstallationId) {
      await disableCreatedProfileInstallation(
        this.dependencies.profiles,
        context,
        initialized.value.createdProfileInstallationId,
      );
    }
    return err(surfaceWorkspaceOpenFailure(reread.error, input.repositoryIdentity));
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
    const binding = input.projectId
      ? await this.dependencies.repositoryBindings.findByIdentityAndProject(
          repositoryContext,
          input.repositoryIdentity,
          input.projectId,
        )
      : await this.dependencies.repositoryBindings.findByIdentity(
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
            repositoryIdentity: input.repositoryIdentity,
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
        input.repositoryIdentity,
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
          repositoryIdentity: input.repositoryIdentity,
          guidance: `appaloft project configure-workspace-profile ${projectId} --profile <installationId>`,
        }),
      );
    }
    const projectDefaultInstallationId =
      project.toState().defaultWorkspaceProfileInstallationId?.value;
    const resolvedProfile = await this.resolveProfile(context, selector, {
      explicit: Boolean(input.profile),
      ...(projectDefaultInstallationId ? { projectDefaultInstallationId } : {}),
    });
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
    const compiled = options.precompiledProfilePlan
      ? ok(options.precompiledProfilePlan)
      : await this.compileProfileForOpen(context, resolved.profileInstallationId, options);
    if (compiled.isErr()) return err(compiled.error);
    const plan = compiled.value;
    const profileInstallationId = plan.pin.profileInstallationId;
    const admitted = await this.dependencies.credentialAdmission.admit(context, {
      projectId: resolved.projectId,
      profileInstallationId,
      bindings: plan.credentialBindings ?? [],
      ...(options.credentialAdmissionScope ? { scope: options.credentialAdmissionScope } : {}),
    });
    if (admitted.isErr()) return err(admitted.error);
    const mcpAdmitted = await this.dependencies.mcpAdmission.admit(context, {
      projectId: resolved.projectId,
      profileInstallationId,
      bindings: plan.mcpBindings ?? [],
    });
    if (mcpAdmitted.isErr()) return err(mcpAdmitted.error);
    const reservation = await this.dependencies.placement.reserve(context, {
      projectId: resolved.projectId,
      profileInstallationId,
      sandbox: plan.sandbox,
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
      profileInstallationId,
      activation: resolved.activation,
      plan,
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
    options: {
      readonly explicit: boolean;
      readonly projectDefaultInstallationId?: string;
    },
  ): Promise<Result<string>> {
    const repositoryContext = toRepositoryContext(context);
    const installation = await this.dependencies.profiles.findInstallation(
      repositoryContext,
      selector,
    );
    if (installation && options.explicit) {
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
    const siblings = installation
      ? available.filter(
          (candidate) =>
            candidate.toState().profileId.value === installation.toState().profileId.value,
        )
      : [];
    const byProfileId = available.filter(
      (candidate) => candidate.toState().profileId.value === selector,
    );
    const candidates =
      siblings.length > 0
        ? siblings
        : byProfileId.length > 0
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
    if (candidates.length === 0 && installation) {
      const availableInstallation = installation.assertAvailableForNewWorkspace();
      return availableInstallation.isErr()
        ? err(availableInstallation.error)
        : ok(installation.id.value);
    }
    const liveInstallationIds = this.dependencies.occupancies
      ? await this.dependencies.occupancies.findLiveProfileInstallationIds(
          context,
          candidates.map((candidate) => candidate.id.value),
        )
      : [];
    return selectWorkspaceProfileInstallation({
      selector,
      candidates: candidates.map((candidate) => ({
        id: candidate.id.value,
        installedAt: candidate.toState().installedAt.value,
      })),
      onMultipleLive: options.explicit ? "ambiguous" : "prefer-default-or-oldest",
      ...(options.projectDefaultInstallationId
        ? { projectDefaultInstallationId: options.projectDefaultInstallationId }
        : {}),
      ...(liveInstallationIds.length > 0 ? { liveInstallationIds } : {}),
    });
  }

  private async compileProfileForOpen(
    context: ExecutionContext,
    profileInstallationId: string,
    options: Pick<WorkspaceOpenOptions, "credentialReferences">,
  ): Promise<Result<AgentWorkspaceProfileCompiledPlan>> {
    const compile = (installationId: string) =>
      this.dependencies.profileCompiler.compileForNewWorkspace(context, installationId, {
        ...(options.credentialReferences
          ? { credentialReferences: options.credentialReferences }
          : {}),
      });
    const first = await compile(profileInstallationId);
    if (first.isOk() || !isAgentWorkspaceProfileValidationError(first.error)) {
      return first;
    }
    const selected = await this.dependencies.profiles.findInstallation(
      toRepositoryContext(context),
      profileInstallationId,
    );
    if (!selected) return first;
    const siblings = (
      await this.dependencies.profiles.listInstallations(toRepositoryContext(context), 200)
    )
      .filter(
        (candidate) =>
          candidate.id.value !== profileInstallationId &&
          candidate.toState().status.value === "enabled" &&
          candidate.toState().profileId.value === selected.toState().profileId.value,
      )
      .sort((left, right) =>
        right.toState().installedAt.value.localeCompare(left.toState().installedAt.value),
      );
    for (const sibling of siblings) {
      const retried = await compile(sibling.id.value);
      if (retried.isOk()) return retried;
    }
    return first;
  }
}

function isAgentWorkspaceProfileValidationError(error: DomainError): boolean {
  return error.message === "Agent Workspace Profile validation failed";
}

const SWALLOWED_WORKSPACE_OPEN_MESSAGES = [
  "Workspace activation context is still unavailable after initialization",
  "Workspace could not finish opening after setup",
] as const;

const WORKSPACE_OPEN_MISSING_LABEL: Record<string, string> = {
  workspace_open_repository_not_bound: "Repository Binding",
  workspace_open_profile_required: "default Agent Workspace Profile",
  workspace_open_project_unavailable: "an active Project",
  workspace_activation_profile_unavailable: "a registered occupancy Profile",
};

function workspaceOpenCauseCode(error: {
  readonly code?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}): string {
  if (typeof error.details?.causeCode === "string" && error.details.causeCode.length > 0) {
    return error.details.causeCode;
  }
  if (typeof error.details?.code === "string" && error.details.code.length > 0) {
    return error.details.code;
  }
  return error.code ?? "conflict";
}

function workspaceOpenHumanMessage(
  error: { readonly message: string },
  repositoryIdentity: string,
  causeCode: string,
): string {
  const missing = WORKSPACE_OPEN_MISSING_LABEL[causeCode];
  if (missing) return `${missing} is missing for ${repositoryIdentity}`;
  const original = error.message.trim();
  if (
    !original ||
    SWALLOWED_WORKSPACE_OPEN_MESSAGES.includes(
      original as (typeof SWALLOWED_WORKSPACE_OPEN_MESSAGES)[number],
    )
  ) {
    return `Could not finish opening ${repositoryIdentity}. A Repository Binding or default Agent Workspace Profile is still missing after setup.`;
  }
  return original.includes(repositoryIdentity)
    ? original
    : `${original} (opening ${repositoryIdentity})`;
}

function workspaceOpenGuidance(
  error: { readonly details?: Readonly<Record<string, unknown>> },
  repositoryIdentity: string,
  causeCode: string,
): string | undefined {
  if (typeof error.details?.guidance === "string" && error.details.guidance.trim()) {
    return error.details.guidance;
  }
  if (causeCode === "workspace_open_repository_not_bound") {
    return `appaloft repository-binding bind --repository ${repositoryIdentity} --project <projectId>`;
  }
  if (causeCode === "workspace_open_profile_required") {
    return "Set a default Agent Workspace Profile on the Project, or retry appaloft code --profile <installationId>.";
  }
  if (causeCode === "workspace_open_profile_ambiguous") {
    return `Installations are ambiguous. Retry with appaloft code --profile <installationId> for ${repositoryIdentity}.`;
  }
  return `Cloud activation/placement could not finish for ${repositoryIdentity}. The CLI cannot invent a Workspace.`;
}

function isUserFacingWorkspaceOpenError(error: {
  readonly code?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}): boolean {
  const code = error.details?.code;
  return (
    code === "workspace_open_profile_ambiguous" ||
    code === "workspace_open_profile_required" ||
    code === "workspace_open_repository_not_bound" ||
    code === "workspace_open_repository_https_required" ||
    code === "workspace_open_repository_identity_mismatch" ||
    code === "workspace_open_project_unavailable" ||
    code === "workspace_activation_profile_unavailable" ||
    error.code === "not_found"
  );
}

function surfaceWorkspaceOpenFailure(error: DomainError, repositoryIdentity: string): DomainError {
  const causeCode = workspaceOpenCauseCode(error);
  const message = workspaceOpenHumanMessage(error, repositoryIdentity, causeCode);
  const guidance = workspaceOpenGuidance(error, repositoryIdentity, causeCode);
  if (isUserFacingWorkspaceOpenError(error)) {
    return {
      ...error,
      message,
      details: {
        ...error.details,
        causeCode,
        repositoryIdentity,
        ...(guidance ? { guidance } : {}),
      },
    };
  }
  return domainError.conflict(message, {
    code: "workspace_activation_context_conflict",
    causeCode,
    repositoryIdentity,
    ...(guidance ? { guidance } : {}),
  });
}

async function disableCreatedProfileInstallation(
  profiles: AgentWorkspaceProfileRegistryRepository,
  context: ExecutionContext,
  installationId: string,
): Promise<void> {
  const repositoryContext = toRepositoryContext(context);
  const installation = await profiles.findInstallation(repositoryContext, installationId);
  if (!installation) return;
  const expectedRevision = installation.toState().revision.value;
  const disabled = installation.disable(UpdatedAt.rehydrate(new Date().toISOString()));
  if (disabled.isErr()) return;
  await profiles.saveInstallation(repositoryContext, installation, expectedRevision);
}

function missingActivationContext(
  error: {
    readonly code?: string;
    readonly details?: Readonly<Record<string, unknown>>;
  },
  requestedProfile?: string,
): "repository-binding" | "default-profile" | undefined {
  const code = error.details?.code;
  if (code === "workspace_open_repository_not_bound") return "repository-binding";
  if (code === "workspace_open_project_unavailable") return "repository-binding";
  if (code === "workspace_open_profile_required") return "default-profile";
  if (
    requestedProfile &&
    error.code === "not_found" &&
    error.details?.entity === "AgentWorkspaceProfileInstallation"
  ) {
    return "default-profile";
  }
  return undefined;
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
