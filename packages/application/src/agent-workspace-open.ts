import {
  type DomainError,
  type DomainErrorDetails,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";

import {
  type AgentWorkspaceCredentialReference,
  type AgentWorkspaceProfileCompiledPlan,
} from "./agent-workspace-profile";
import { type ExecutionContext } from "./execution-context";
import {
  type SandboxAgentAttachDescriptor,
  type SandboxAgentRuntimeDescriptor,
} from "./sandbox-agent-runtime";

export interface WorkspaceOpenInput {
  readonly repository: string;
  readonly repositoryIdentity: string;
  readonly ref: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly profile?: string;
  readonly forceNew?: boolean;
  readonly attach?: boolean;
  readonly targetServerId?: string;
}

export interface WorkspaceOpenSourceMaterializerPort {
  materialize(
    context: ExecutionContext,
    input: {
      readonly workspaceId: string;
      readonly source: WorkspaceOpenInput;
      readonly credential?: WorkspaceOpenSourceHttpBasicCredential;
    },
  ): Promise<Result<void>>;
}

export interface WorkspaceOpenSourceHttpBasicCredential {
  readonly kind: "http-basic";
  readonly username: string;
  readonly password: string;
}

export interface WorkspaceOpenSourceCredentialProviderPort {
  resolve(
    context: ExecutionContext,
    input: {
      readonly projectId: string;
      readonly repository: string;
      readonly repositoryIdentity: string;
    },
  ): Promise<Result<WorkspaceOpenSourceHttpBasicCredential | null>>;
}

export interface WorkspaceOpenOptions {
  readonly credentialReferences?: readonly AgentWorkspaceCredentialReference[];
  readonly precompiledProfilePlan?: AgentWorkspaceProfileCompiledPlan;
  readonly credentialAdmissionScope?: {
    readonly owner: { readonly kind: "user" | "organization"; readonly id: string };
    readonly agentProfileId: string;
    readonly use: "interactive" | "automation";
    readonly untrustedCode: boolean;
    readonly serverPoolId: string;
  };
  readonly placementProviderKey?: string;
  readonly targetServerId?: string;
  readonly expiresAt?: string;
  readonly sourceMaterializer?: WorkspaceOpenSourceMaterializerPort;
  readonly skipSourceMaterialization?: boolean;
}

export interface WorkspaceOpenReservation {
  readonly reservationId: string;
  readonly targetSelection: WorkspaceTargetSelectionEvidence;
}

export type WorkspaceActivationContextDisposition = "created" | "reused";

export interface WorkspaceActivationContextEvidence {
  readonly project: {
    readonly projectId: string;
    readonly disposition: WorkspaceActivationContextDisposition;
  };
  readonly repositoryBinding: {
    readonly bindingId: string;
    readonly disposition: WorkspaceActivationContextDisposition;
  };
  readonly profile: {
    readonly profileInstallationId: string;
    readonly disposition: WorkspaceActivationContextDisposition;
  };
}

export type WorkspaceTargetSelectionEvidence =
  | {
      readonly targetClass: "managed" | "registered-server" | "local";
      readonly source: "platform-default" | "saved-policy" | "explicit";
      readonly reason: string;
    }
  | {
      readonly targetClass: "legacy-unclassified";
      readonly source: "legacy";
      readonly reason: "workspace_target_legacy_unclassified";
    };

const workspaceTargetSelectionReason = /^[a-z][a-z0-9_]{2,95}$/u;

export function validateWorkspaceTargetSelectionEvidence(
  value: unknown,
): Result<WorkspaceTargetSelectionEvidence> {
  if (!value || typeof value !== "object") {
    return invalidWorkspaceTargetSelectionEvidence();
  }
  const candidate = value as Record<string, unknown>;
  const targetClass = candidate.targetClass;
  const source = candidate.source;
  const reason = candidate.reason;
  if (
    typeof reason !== "string" ||
    !workspaceTargetSelectionReason.test(reason) ||
    (targetClass === "legacy-unclassified"
      ? source !== "legacy" || reason !== "workspace_target_legacy_unclassified"
      : (targetClass !== "managed" &&
          targetClass !== "registered-server" &&
          targetClass !== "local") ||
        (source !== "platform-default" && source !== "saved-policy" && source !== "explicit"))
  ) {
    return invalidWorkspaceTargetSelectionEvidence();
  }
  return ok(candidate as unknown as WorkspaceTargetSelectionEvidence);
}

function invalidWorkspaceTargetSelectionEvidence(): Result<never> {
  return err(
    domainError.validation("Workspace target selection evidence is invalid", {
      code: "workspace_target_selection_evidence_invalid",
    }),
  );
}

export function validateWorkspaceActivationContextEvidence(
  value: unknown,
): Result<WorkspaceActivationContextEvidence> {
  if (!value || typeof value !== "object") return invalidWorkspaceActivationContextEvidence();
  const candidate = value as Record<string, unknown>;
  const project = candidate.project;
  const repositoryBinding = candidate.repositoryBinding;
  const profile = candidate.profile;
  if (
    !activationItem(project, "projectId") ||
    !activationItem(repositoryBinding, "bindingId") ||
    !activationItem(profile, "profileInstallationId")
  ) {
    return invalidWorkspaceActivationContextEvidence();
  }
  return ok(candidate as unknown as WorkspaceActivationContextEvidence);
}

function activationItem(value: unknown, idKey: string): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item[idKey] === "string" &&
    item[idKey].length > 0 &&
    (item.disposition === "created" || item.disposition === "reused")
  );
}

function invalidWorkspaceActivationContextEvidence(): Result<never> {
  return err(
    domainError.validation("Workspace activation context evidence is invalid", {
      code: "workspace_activation_context_evidence_invalid",
    }),
  );
}

export interface WorkspaceOpenContext {
  readonly projectId: string;
  readonly profileInstallationId: string;
  readonly activation: WorkspaceActivationContextEvidence;
}

export interface WorkspaceOpenPreflight extends WorkspaceOpenContext {
  readonly plan: AgentWorkspaceProfileCompiledPlan;
  readonly reservation: WorkspaceOpenReservation;
}

export interface WorkspaceOpenEntry {
  readonly workspaceId: string;
  readonly runtimeId?: string;
  readonly commitSha: string;
  readonly profileInstallationId: string;
  readonly status: "partial" | "ready" | "terminal";
  readonly phase?: string;
  readonly repositoryIdentity?: string;
  readonly branch?: string;
  readonly targetSelection: WorkspaceTargetSelectionEvidence;
  readonly activation?: WorkspaceActivationContextEvidence;
}

export interface WorkspaceOpenEntryRepository {
  findByWorkspaceIds(
    context: ExecutionContext,
    workspaceIds: readonly string[],
  ): Promise<ReadonlyMap<string, WorkspaceOpenEntry>>;
  findByWorkspaceId(
    context: ExecutionContext,
    workspaceId: string,
  ): Promise<WorkspaceOpenEntry | undefined>;
  findPreferred(
    context: ExecutionContext,
    key: WorkspaceOpenKey,
    selection?: {
      readonly profileInstallationId?: string;
    },
  ): Promise<WorkspaceOpenEntry | undefined>;
  findLiveProfileInstallationIds(
    context: ExecutionContext,
    installationIds: readonly string[],
  ): Promise<readonly string[]>;
  begin(
    context: ExecutionContext,
    key: WorkspaceOpenKey,
    input: {
      commitSha: string;
      profileInstallationId: string;
      forceNew: boolean;
      targetSelection: WorkspaceTargetSelectionEvidence;
      activation: WorkspaceActivationContextEvidence;
    },
  ): Promise<Result<{ workspaceId?: string; created: boolean }>>;
  complete(
    context: ExecutionContext,
    input: WorkspaceOpenKey & {
      workspaceId: string;
      runtimeId: string;
      commitSha: string;
    },
  ): Promise<Result<void>>;
  fail(
    context: ExecutionContext,
    input: WorkspaceOpenKey & {
      workspaceId?: string;
      runtimeId?: string;
      commitSha: string;
      phase: string;
      code: string;
    },
  ): Promise<Result<void>>;
  markWorkspaceTerminated(
    context: ExecutionContext,
    workspaceId: string,
  ): Promise<Result<{ advanced: boolean }>>;
}

export interface WorkspaceOpenKey {
  readonly tenantId: string;
  readonly subjectId: string;
  readonly projectId: string;
  readonly repositoryIdentity: string;
  readonly branch: string;
}

export interface WorkspaceOpenResult {
  readonly workspaceId: string;
  readonly name: string;
  readonly resumed: boolean;
  readonly projectId: string;
  readonly source: {
    readonly repositoryIdentity: string;
    readonly repository: string;
    readonly ref: string;
    readonly branch: string;
    readonly commitSha: string;
  };
  readonly profilePin: AgentWorkspaceProfileCompiledPlan["pin"];
  readonly sandbox: SandboxOpenDescriptor;
  readonly agent: SandboxAgentRuntimeDescriptor;
  readonly activation: WorkspaceActivationContextEvidence;
  readonly targetSelection: WorkspaceTargetSelectionEvidence;
  readonly attach?: SandboxAgentAttachDescriptor;
}

export interface SandboxOpenDescriptor {
  readonly sandboxId: string;
  readonly name: string;
  readonly status: string;
}

type ForegroundExecution = {
  readonly mode: "foreground";
  readonly frames: readonly {
    readonly kind: "stdout" | "stderr" | "exit" | "error";
    readonly data?: string;
    readonly exitCode?: number;
  }[];
};

export interface WorkspaceOpenDependencies {
  readonly preflight: {
    resolveContext(
      context: ExecutionContext,
      input: WorkspaceOpenInput,
    ): Promise<Result<WorkspaceOpenContext>>;
    admit(
      context: ExecutionContext,
      resolved: WorkspaceOpenContext,
      options?: Pick<
        WorkspaceOpenOptions,
        | "credentialReferences"
        | "precompiledProfilePlan"
        | "credentialAdmissionScope"
        | "placementProviderKey"
        | "targetServerId"
      >,
    ): Promise<Result<WorkspaceOpenPreflight>>;
  };
  readonly entries: WorkspaceOpenEntryRepository;
  readonly sourceCredentials?: WorkspaceOpenSourceCredentialProviderPort;
  readonly sandboxes: {
    create(
      context: ExecutionContext,
      input: AgentWorkspaceProfileCompiledPlan["sandbox"] & {
        readonly placementReservationId?: string;
        readonly providerKey?: string;
        readonly expiresAt?: string;
        readonly name?: string;
        readonly directoryName?: string;
        readonly repositoryIdentity?: string;
        readonly commitSha?: string;
      },
    ): Promise<Result<SandboxOpenDescriptor>>;
    resume(context: ExecutionContext, workspaceId: string): Promise<Result<SandboxOpenDescriptor>>;
    exec(
      context: ExecutionContext,
      workspaceId: string,
      input: { argv: readonly string[]; cwd?: string; stdin?: Uint8Array },
    ): Promise<Result<ForegroundExecution>>;
    exposePort(
      context: ExecutionContext,
      workspaceId: string,
      input: {
        port: number;
        visibility: "private" | "organization" | "public";
        expiresAt: string;
      },
    ): Promise<Result<void>>;
  };
  readonly agents: {
    showRuntime(
      context: ExecutionContext,
      input: { sandboxId: string; runtimeId: string },
    ): Promise<Result<SandboxAgentRuntimeDescriptor>>;
    createRuntime(
      context: ExecutionContext,
      input: {
        sandboxId: string;
        harnessKey: string;
        harnessTemplateId: string;
        idempotencyKey: string;
        projectId: string;
        profileInstallationId: string;
        profilePlan: AgentWorkspaceProfileCompiledPlan;
      },
    ): Promise<Result<SandboxAgentRuntimeDescriptor>>;
    ensureRuntime(
      context: ExecutionContext,
      input: { sandboxId: string; runtimeId: string },
    ): Promise<Result<void>>;
    attach(
      context: ExecutionContext,
      input: { sandboxId: string; runtimeId: string; expiresAt: string },
    ): Promise<Result<SandboxAgentAttachDescriptor>>;
  };
  readonly reservations: {
    consume(
      context: ExecutionContext,
      reservation: WorkspaceOpenReservation,
    ): Promise<Result<void>>;
    release(
      context: ExecutionContext,
      reservation: WorkspaceOpenReservation,
    ): Promise<Result<void>>;
  };
  readonly now: () => string;
}

function subjectId(context: ExecutionContext): string {
  return (
    context.tenant?.subjectId ??
    context.principal?.userId ??
    context.principal?.actorId ??
    context.actor?.id ??
    "subject_instance"
  );
}

function executionSucceeded(result: ForegroundExecution): boolean {
  return result.frames.some((frame) => frame.kind === "exit" && frame.exitCode === 0);
}

function validateSourceCredential(
  credential: WorkspaceOpenSourceHttpBasicCredential | null,
): Result<WorkspaceOpenSourceHttpBasicCredential | null> {
  if (!credential) return ok(null);
  if (
    credential.kind !== "http-basic" ||
    !credential.username ||
    credential.username.length > 256 ||
    /[:\r\n\0]/u.test(credential.username) ||
    !credential.password ||
    credential.password.length > 4_096 ||
    /[\r\n\0]/u.test(credential.password)
  ) {
    return err(
      domainError.validation("Workspace source credential is invalid", {
        code: "workspace_open_source_credential_invalid",
      }),
    );
  }
  return ok(credential);
}

export type WorkspaceSourceCommand = {
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly stdin?: Uint8Array;
};

export type WorkspaceSourceGitCredentialCommands = {
  readonly prepare: WorkspaceSourceCommand;
  readonly approve: WorkspaceSourceCommand;
  readonly fetch: WorkspaceSourceCommand;
  readonly cleanup: readonly WorkspaceSourceCommand[];
};

const workspaceSourceCredentialCacheDirectory = "/tmp/.appaloft-workspace-source-credential";
const workspaceSourceCredentialCacheSocket = `${workspaceSourceCredentialCacheDirectory}/credential-cache.sock`;
const workspaceSourceCredentialHelper = `cache --timeout=60 --socket=${workspaceSourceCredentialCacheSocket}`;

export function createWorkspaceSourceGitCredentialCommands(
  repository: string,
  credential: WorkspaceOpenSourceHttpBasicCredential,
  argv: readonly string[],
): WorkspaceSourceGitCredentialCommands {
  const repositoryUrl = new URL(repository);
  const credentialHelperArguments = [
    "-c",
    "credential.helper=",
    "-c",
    `credential.helper=${workspaceSourceCredentialHelper}`,
  ] as const;
  return {
    prepare: {
      argv: ["mkdir", "-m", "700", workspaceSourceCredentialCacheDirectory],
    },
    approve: {
      argv: ["git", ...credentialHelperArguments, "credential", "approve"],
      stdin: new TextEncoder().encode(
        [
          `protocol=${repositoryUrl.protocol.slice(0, -1)}`,
          `host=${repositoryUrl.host}`,
          `username=${credential.username}`,
          `password=${credential.password}`,
          "",
          "",
        ].join("\n"),
      ),
    },
    fetch: {
      argv: [
        "git",
        ...credentialHelperArguments,
        "-c",
        "credential.interactive=never",
        "-c",
        "core.askPass=/bin/false",
        ...argv.slice(1),
      ],
    },
    cleanup: [
      {
        argv: [
          "git",
          "credential-cache",
          `--socket=${workspaceSourceCredentialCacheSocket}`,
          "exit",
        ],
      },
      {
        argv: ["rmdir", workspaceSourceCredentialCacheDirectory],
      },
    ],
  };
}

function withPartialEvidence(
  error: DomainError,
  input: {
    workspaceId?: string;
    runtimeId?: string;
    phase: string;
  },
): DomainError {
  const details: DomainErrorDetails = {
    ...error.details,
    phase: input.phase,
    ...(input.workspaceId
      ? {
          workspaceId: input.workspaceId,
          sandboxId: input.workspaceId,
          recovery: `appaloft workspace show ${input.workspaceId}`,
          retry: "After inspection or cleanup, run appaloft workspace open . --new --no-attach",
          terminate: `appaloft workspace terminate ${input.workspaceId}`,
        }
      : {}),
    ...(input.runtimeId ? { runtimeId: input.runtimeId } : {}),
  };
  return {
    ...error,
    details,
  };
}

function isDomainError(value: unknown): value is DomainError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "category" in value &&
    "message" in value &&
    "retryable" in value
  );
}

const FOLDER_OCCUPANCY_HOST = "folder.local";

export function isFolderOccupancyIdentity(repositoryIdentity: string): boolean {
  const identity = repositoryIdentity.trim().toLowerCase();
  return (
    identity === FOLDER_OCCUPANCY_HOST ||
    identity.startsWith(`${FOLDER_OCCUPANCY_HOST}/`) ||
    identity.includes(`/${FOLDER_OCCUPANCY_HOST}/`)
  );
}

export function isFolderOccupancyRepository(repository: string): boolean {
  try {
    const hostname = new URL(repository.trim()).hostname.toLowerCase();
    return hostname === FOLDER_OCCUPANCY_HOST || hostname.endsWith(`.${FOLDER_OCCUPANCY_HOST}`);
  } catch {
    return repository.includes(FOLDER_OCCUPANCY_HOST);
  }
}

export function isFolderOccupancyOpen(input: {
  readonly repositoryIdentity: string;
  readonly repository: string;
  readonly preferredIdentity?: string;
}): boolean {
  if (isFolderOccupancyIdentity(input.repositoryIdentity)) return true;
  if (input.preferredIdentity && isFolderOccupancyIdentity(input.preferredIdentity)) return true;
  return isFolderOccupancyRepository(input.repository);
}

export function shouldSkipWorkspaceSourceMaterialization(
  input: Pick<WorkspaceOpenInput, "repositoryIdentity" | "repository">,
  options: Pick<WorkspaceOpenOptions, "skipSourceMaterialization"> = {},
): boolean {
  return Boolean(options.skipSourceMaterialization) || isFolderOccupancyOpen(input);
}

export class AgentWorkspaceOpenService {
  constructor(private readonly dependencies: WorkspaceOpenDependencies) {}

  async open(
    context: ExecutionContext,
    input: WorkspaceOpenInput,
    options: WorkspaceOpenOptions = {},
  ): Promise<Result<WorkspaceOpenResult>> {
    const resolved = await this.dependencies.preflight.resolveContext(context, input);
    if (resolved.isErr()) return err(resolved.error);
    const key: WorkspaceOpenKey = {
      tenantId: context.tenant?.tenantId ?? "tenant_instance",
      subjectId: subjectId(context),
      projectId: resolved.value.projectId,
      repositoryIdentity: input.repositoryIdentity,
      branch: input.branch,
    };

    const preferred = input.forceNew
      ? undefined
      : await this.dependencies.entries.findPreferred(
          context,
          key,
          input.profile
            ? { profileInstallationId: resolved.value.profileInstallationId }
            : undefined,
        );
    if (preferred && preferred.status !== "terminal") {
      if (
        !preferred.runtimeId &&
        isFolderOccupancyOpen({
          repositoryIdentity: input.repositoryIdentity,
          repository: input.repository,
          ...(preferred.repositoryIdentity
            ? { preferredIdentity: preferred.repositoryIdentity }
            : {}),
        })
      ) {
        return this.continueOrReplaceFolderOccupancy(
          context,
          input,
          options,
          key,
          resolved.value,
          preferred,
        );
      }
      if (
        preferred.commitSha !== input.commitSha &&
        !isFolderOccupancyOpen({
          repositoryIdentity: input.repositoryIdentity,
          repository: input.repository,
          ...(preferred.repositoryIdentity
            ? { preferredIdentity: preferred.repositoryIdentity }
            : {}),
        })
      ) {
        return err(
          domainError.conflict("Preferred Workspace is pinned to another Git commit", {
            code: "workspace_open_source_pin_mismatch",
            workspaceId: preferred.workspaceId,
            requestedCommitSha: input.commitSha,
            workspaceCommitSha: preferred.commitSha,
            guidance:
              "Use appaloft code --new or workspace open --new to create an isolated Workspace for the new commit.",
          }),
        );
      }
      if (
        input.profile &&
        preferred.profileInstallationId !== resolved.value.profileInstallationId
      ) {
        return err(
          domainError.conflict("Preferred Workspace is pinned to another Agent Profile", {
            code: "workspace_open_profile_pin_mismatch",
            workspaceId: preferred.workspaceId,
            requestedProfileInstallationId: resolved.value.profileInstallationId,
            workspaceProfileInstallationId: preferred.profileInstallationId,
            guidance: "Use --new to create an isolated Workspace with the selected Profile.",
          }),
        );
      }
      if (!preferred.runtimeId) {
        return err(
          domainError.conflict("Preferred Workspace is partially created", {
            code: "workspace_open_partial_recovery_required",
            workspaceId: preferred.workspaceId,
            phase: preferred.phase ?? "unknown",
            recovery: `appaloft workspace show ${preferred.workspaceId}`,
            terminate: `appaloft workspace terminate ${preferred.workspaceId}`,
            guidance:
              "Inspect or terminate the partial Workspace, then use --new to create an isolated replacement.",
          }),
        );
      }
      const sandbox = await this.dependencies.sandboxes.resume(context, preferred.workspaceId);
      if (sandbox.isErr()) return err(sandbox.error);
      const shownRuntime = await this.dependencies.agents.showRuntime(context, {
        sandboxId: preferred.workspaceId,
        runtimeId: preferred.runtimeId,
      });
      if (shownRuntime.isErr()) return err(shownRuntime.error);
      const agent = shownRuntime.value;
      const ensured = await this.dependencies.agents.ensureRuntime(context, {
        sandboxId: preferred.workspaceId,
        runtimeId: preferred.runtimeId,
      });
      if (ensured.isErr()) return err(ensured.error);
      const expectedProfileInstallationId = input.profile
        ? resolved.value.profileInstallationId
        : preferred.profileInstallationId;
      if (agent.profilePin?.profileInstallationId !== expectedProfileInstallationId) {
        return err(
          domainError.conflict("Preferred Workspace Runtime Profile pin is inconsistent", {
            code: "workspace_open_runtime_profile_pin_mismatch",
            workspaceId: preferred.workspaceId,
            runtimeId: preferred.runtimeId,
          }),
        );
      }
      let attach: SandboxAgentAttachDescriptor | undefined;
      if (input.attach) {
        const attached = await this.dependencies.agents.attach(context, {
          sandboxId: preferred.workspaceId,
          runtimeId: preferred.runtimeId,
          expiresAt: new Date(Date.parse(this.dependencies.now()) + 60 * 60_000).toISOString(),
        });
        if (attached.isErr()) return err(attached.error);
        attach = attached.value;
      }
      return ok(
        this.result(
          input,
          resolved.value.projectId,
          agent.profilePin,
          sandbox.value,
          agent,
          true,
          preferred.activation ?? resolved.value.activation,
          preferred.targetSelection,
          attach,
        ),
      );
    }

    const sourceCredentialResult =
      !shouldSkipWorkspaceSourceMaterialization(input, options) &&
      this.dependencies.sourceCredentials
        ? await this.dependencies.sourceCredentials.resolve(context, {
            projectId: resolved.value.projectId,
            repository: input.repository,
            repositoryIdentity: input.repositoryIdentity,
          })
        : ok(null);
    if (sourceCredentialResult.isErr()) return err(sourceCredentialResult.error);
    const sourceCredential = validateSourceCredential(sourceCredentialResult.value);
    if (sourceCredential.isErr()) return err(sourceCredential.error);
    const preflight = await this.dependencies.preflight.admit(context, resolved.value, {
      ...(options.credentialReferences
        ? { credentialReferences: options.credentialReferences }
        : {}),
      ...(options.precompiledProfilePlan
        ? { precompiledProfilePlan: options.precompiledProfilePlan }
        : {}),
      ...(options.credentialAdmissionScope
        ? { credentialAdmissionScope: options.credentialAdmissionScope }
        : {}),
      ...(options.placementProviderKey
        ? { placementProviderKey: options.placementProviderKey }
        : {}),
      ...(input.targetServerId ? { targetServerId: input.targetServerId } : {}),
    });
    if (preflight.isErr()) return err(preflight.error);
    const begun = await this.dependencies.entries.begin(context, key, {
      commitSha: input.commitSha,
      profileInstallationId: preflight.value.profileInstallationId,
      forceNew: input.forceNew ?? false,
      targetSelection: preflight.value.reservation.targetSelection,
      activation: preflight.value.activation,
    });
    if (begun.isErr()) {
      await this.dependencies.reservations.release(context, preflight.value.reservation);
      return err(begun.error);
    }
    if (!begun.value.created) {
      await this.dependencies.reservations.release(context, preflight.value.reservation);
      return err(
        domainError.conflict("Workspace open is already in progress", {
          code: "workspace_open_concurrent_request",
          ...(begun.value.workspaceId ? { workspaceId: begun.value.workspaceId } : {}),
        }),
      );
    }
    const consumed = await this.dependencies.reservations.consume(
      context,
      preflight.value.reservation,
    );
    if (consumed.isErr()) {
      await this.dependencies.reservations.release(context, preflight.value.reservation);
      return err(consumed.error);
    }

    let workspaceId = begun.value.workspaceId;
    let runtimeId: string | undefined;
    const phase = "workspace-open-sandbox-create";
    try {
      const sandbox = await this.dependencies.sandboxes.create(context, {
        ...preflight.value.plan.sandbox,
        placementReservationId: preflight.value.reservation.reservationId,
        repositoryIdentity: input.repositoryIdentity,
        commitSha: input.commitSha,
        ...(options.placementProviderKey ? { providerKey: options.placementProviderKey } : {}),
        ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
      });
      if (sandbox.isErr()) {
        await this.dependencies.reservations.release(context, preflight.value.reservation);
        throw sandbox.error;
      }
      const createdWorkspaceId = sandbox.value.sandboxId;
      workspaceId = createdWorkspaceId;
      await this.dependencies.reservations.release(context, preflight.value.reservation);

      return await this.finishOpen(
        context,
        input,
        options,
        key,
        workspaceId,
        sandbox.value,
        preflight.value,
        sourceCredential.value,
        false,
      );
    } catch (cause) {
      const failure = isDomainError(cause)
        ? cause
        : domainError.infra("Workspace open failed", { code: "workspace_open_failed" });
      await this.dependencies.entries.fail(context, {
        ...key,
        ...(workspaceId ? { workspaceId } : {}),
        ...(runtimeId ? { runtimeId } : {}),
        commitSha: input.commitSha,
        phase,
        code: failure.code,
      });
      return err(
        withPartialEvidence(failure, {
          ...(workspaceId ? { workspaceId } : {}),
          ...(runtimeId ? { runtimeId } : {}),
          phase,
        }),
      );
    }
  }

  private async continueOrReplaceFolderOccupancy(
    context: ExecutionContext,
    input: WorkspaceOpenInput,
    options: WorkspaceOpenOptions,
    key: WorkspaceOpenKey,
    resolved: WorkspaceOpenContext,
    preferred: WorkspaceOpenEntry,
  ): Promise<Result<WorkspaceOpenResult>> {
    const repaired = await this.repairFolderOccupancy(
      context,
      input,
      options,
      key,
      resolved,
      preferred,
    );
    if (repaired.isOk()) return repaired;
    await this.dependencies.entries.markWorkspaceTerminated(context, preferred.workspaceId);
    return this.open(context, { ...input, forceNew: true }, options);
  }

  private async repairFolderOccupancy(
    context: ExecutionContext,
    input: WorkspaceOpenInput,
    options: WorkspaceOpenOptions,
    key: WorkspaceOpenKey,
    resolved: WorkspaceOpenContext,
    preferred: WorkspaceOpenEntry,
  ): Promise<Result<WorkspaceOpenResult>> {
    const preflight = await this.dependencies.preflight.admit(context, resolved, {
      ...(options.credentialReferences
        ? { credentialReferences: options.credentialReferences }
        : {}),
      ...(options.precompiledProfilePlan
        ? { precompiledProfilePlan: options.precompiledProfilePlan }
        : {}),
      ...(options.credentialAdmissionScope
        ? { credentialAdmissionScope: options.credentialAdmissionScope }
        : {}),
      ...(options.placementProviderKey
        ? { placementProviderKey: options.placementProviderKey }
        : {}),
      ...(input.targetServerId ? { targetServerId: input.targetServerId } : {}),
    });
    if (preflight.isErr()) return err(preflight.error);
    await this.dependencies.reservations.release(context, preflight.value.reservation);
    const sandbox = await this.dependencies.sandboxes.resume(context, preferred.workspaceId);
    if (sandbox.isErr()) return err(sandbox.error);
    return this.finishOpen(
      context,
      input,
      options,
      key,
      preferred.workspaceId,
      sandbox.value,
      preflight.value,
      null,
      true,
    );
  }

  private async materializeSource(
    context: ExecutionContext,
    input: WorkspaceOpenInput,
    options: WorkspaceOpenOptions,
    workspaceId: string,
    sourceCredential: WorkspaceOpenSourceHttpBasicCredential | null,
  ): Promise<Result<void>> {
    if (shouldSkipWorkspaceSourceMaterialization(input, options)) {
      return ok(undefined);
    }
    if (options.sourceMaterializer) {
      return options.sourceMaterializer.materialize(context, {
        workspaceId,
        source: input,
        ...(sourceCredential ? { credential: sourceCredential } : {}),
      });
    }
    const executeSourceCommand = async (command: WorkspaceSourceCommand): Promise<Result<void>> => {
      const executed = await this.dependencies.sandboxes.exec(context, workspaceId, command);
      if (executed.isErr()) return err(executed.error);
      if (!executionSucceeded(executed.value)) {
        return err(
          domainError.conflict("Workspace source materialization failed", {
            code: "workspace_open_source_materialization_failed",
          }),
        );
      }
      return ok(undefined);
    };
    const requireSourceCommand = async (command: WorkspaceSourceCommand): Promise<void> => {
      const executed = await executeSourceCommand(command);
      if (executed.isErr()) throw executed.error;
    };

    const fetchArgv = ["git", "fetch", "--no-tags", "--depth", "1", "origin", input.ref];
    await requireSourceCommand({ argv: ["git", "init", "."] });
    await requireSourceCommand({
      argv: ["git", "remote", "add", "origin", input.repository],
    });
    if (sourceCredential) {
      const authenticated = createWorkspaceSourceGitCredentialCommands(
        input.repository,
        sourceCredential,
        fetchArgv,
      );
      await requireSourceCommand(authenticated.prepare);
      let sourceFailure: unknown;
      try {
        await requireSourceCommand(authenticated.approve);
        await requireSourceCommand(authenticated.fetch);
      } catch (error) {
        sourceFailure = error;
      }

      let cleanupFailure: DomainError | undefined;
      for (const cleanupCommand of authenticated.cleanup) {
        const cleaned = await executeSourceCommand(cleanupCommand);
        if (cleaned.isErr() && !cleanupFailure) cleanupFailure = cleaned.error;
      }
      if (cleanupFailure) {
        throw domainError.conflict("Workspace source credential cleanup failed", {
          code: "workspace_open_source_credential_cleanup_failed",
          cleanupFailureCode:
            cleanupFailure.details?.code ?? cleanupFailure.code ?? "source_cleanup_failed",
          ...(isDomainError(sourceFailure)
            ? {
                sourceFailureCode:
                  sourceFailure.details?.code ?? sourceFailure.code ?? "source_fetch_failed",
              }
            : {}),
        });
      }
      if (sourceFailure) throw sourceFailure;
    } else {
      await requireSourceCommand({ argv: fetchArgv });
    }
    await requireSourceCommand({
      argv: ["git", "checkout", "--detach", input.commitSha],
    });
    await requireSourceCommand({ argv: ["git", "switch", "-c", input.branch] });
    return ok(undefined);
  }

  private async finishOpen(
    context: ExecutionContext,
    input: WorkspaceOpenInput,
    options: WorkspaceOpenOptions,
    key: WorkspaceOpenKey,
    workspaceId: string,
    sandbox: SandboxOpenDescriptor,
    preflight: WorkspaceOpenPreflight,
    sourceCredential: WorkspaceOpenSourceHttpBasicCredential | null,
    resumed: boolean,
  ): Promise<Result<WorkspaceOpenResult>> {
    let runtimeId: string | undefined;
    let phase = "workspace-open-source-materialization";
    try {
      const materialized = await this.materializeSource(
        context,
        input,
        options,
        workspaceId,
        sourceCredential,
      );
      if (materialized.isErr()) throw materialized.error;
      for (const initialization of preflight.plan.initialization) {
        phase = `workspace-open-initialization:${initialization.id}`;
        const executed = await this.dependencies.sandboxes.exec(context, workspaceId, {
          argv: initialization.argv,
          ...(initialization.cwd ? { cwd: initialization.cwd } : {}),
        });
        if (executed.isErr() || !executionSucceeded(executed.value)) {
          throw executed.isErr()
            ? executed.error
            : domainError.conflict("Workspace Profile initialization failed", {
                code: "workspace_open_initialization_failed",
                initializationId: initialization.id,
              });
        }
      }
      for (const port of preflight.plan.defaultPorts) {
        phase = `workspace-open-default-port:${port.name}`;
        const exposed = await this.dependencies.sandboxes.exposePort(context, workspaceId, {
          port: port.port,
          visibility: port.visibility,
          expiresAt: new Date(
            Date.parse(this.dependencies.now()) + port.ttlSeconds * 1_000,
          ).toISOString(),
        });
        if (exposed.isErr()) throw exposed.error;
      }

      phase = "workspace-open-runtime-create";
      const runtime = await this.dependencies.agents.createRuntime(context, {
        sandboxId: workspaceId,
        harnessKey: preflight.plan.runtime.harnessKey,
        harnessTemplateId: preflight.plan.runtime.harnessTemplateId,
        idempotencyKey: `workspace-open:${key.tenantId}:${key.subjectId}:${key.projectId}:${key.repositoryIdentity}:${key.branch}:${input.commitSha}`,
        projectId: preflight.projectId,
        profileInstallationId: preflight.profileInstallationId,
        profilePlan: preflight.plan,
      });
      if (runtime.isErr()) throw runtime.error;
      runtimeId = runtime.value.runtimeId;
      const completed = await this.dependencies.entries.complete(context, {
        ...key,
        workspaceId,
        runtimeId,
        commitSha: input.commitSha,
      });
      if (completed.isErr()) throw completed.error;
      let attach: SandboxAgentAttachDescriptor | undefined;
      if (input.attach) {
        const attached = await this.dependencies.agents.attach(context, {
          sandboxId: workspaceId,
          runtimeId,
          expiresAt: new Date(Date.parse(this.dependencies.now()) + 60 * 60_000).toISOString(),
        });
        if (attached.isErr()) throw attached.error;
        attach = attached.value;
      }
      return ok(
        this.result(
          input,
          preflight.projectId,
          runtime.value.profilePin ?? preflight.plan.pin,
          sandbox,
          runtime.value,
          resumed,
          preflight.activation,
          preflight.reservation.targetSelection,
          attach,
        ),
      );
    } catch (cause) {
      const failure = isDomainError(cause)
        ? cause
        : domainError.infra("Workspace open failed", { code: "workspace_open_failed" });
      await this.dependencies.entries.fail(context, {
        ...key,
        ...(workspaceId ? { workspaceId } : {}),
        ...(runtimeId ? { runtimeId } : {}),
        commitSha: input.commitSha,
        phase,
        code: failure.code,
      });
      return err(
        withPartialEvidence(failure, {
          ...(workspaceId ? { workspaceId } : {}),
          ...(runtimeId ? { runtimeId } : {}),
          phase,
        }),
      );
    }
  }

  private result(
    input: WorkspaceOpenInput,
    projectId: string,
    profilePin: AgentWorkspaceProfileCompiledPlan["pin"],
    sandbox: SandboxOpenDescriptor,
    agent: SandboxAgentRuntimeDescriptor,
    resumed: boolean,
    activation: WorkspaceActivationContextEvidence,
    targetSelection: WorkspaceTargetSelectionEvidence,
    attach?: SandboxAgentAttachDescriptor,
  ): WorkspaceOpenResult {
    return {
      workspaceId: sandbox.sandboxId,
      name: sandbox.name,
      resumed,
      projectId,
      source: {
        repositoryIdentity: input.repositoryIdentity,
        repository: input.repository,
        ref: input.ref,
        branch: input.branch,
        commitSha: input.commitSha,
      },
      profilePin,
      sandbox,
      agent,
      activation,
      targetSelection,
      ...(attach ? { attach } : {}),
    };
  }
}
