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
}

export interface WorkspaceOpenSourceMaterializerPort {
  materialize(
    context: ExecutionContext,
    input: {
      readonly workspaceId: string;
      readonly source: WorkspaceOpenInput;
    },
  ): Promise<Result<void>>;
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
  readonly expiresAt?: string;
  readonly sourceMaterializer?: WorkspaceOpenSourceMaterializerPort;
}

export interface WorkspaceOpenReservation {
  readonly reservationId: string;
}

export interface WorkspaceOpenContext {
  readonly projectId: string;
  readonly profileInstallationId: string;
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
}

export interface WorkspaceOpenEntryRepository {
  findPreferred(
    context: ExecutionContext,
    key: WorkspaceOpenKey,
  ): Promise<WorkspaceOpenEntry | undefined>;
  begin(
    context: ExecutionContext,
    key: WorkspaceOpenKey,
    input: {
      commitSha: string;
      profileInstallationId: string;
      forceNew: boolean;
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
  readonly attach?: SandboxAgentAttachDescriptor;
}

export interface SandboxOpenDescriptor {
  readonly sandboxId: string;
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
      >,
    ): Promise<Result<WorkspaceOpenPreflight>>;
  };
  readonly entries: WorkspaceOpenEntryRepository;
  readonly sandboxes: {
    create(
      context: ExecutionContext,
      input: AgentWorkspaceProfileCompiledPlan["sandbox"] & {
        readonly placementReservationId?: string;
        readonly providerKey?: string;
        readonly expiresAt?: string;
      },
    ): Promise<Result<SandboxOpenDescriptor>>;
    resume(context: ExecutionContext, workspaceId: string): Promise<Result<SandboxOpenDescriptor>>;
    exec(
      context: ExecutionContext,
      workspaceId: string,
      input: { argv: readonly string[]; cwd?: string },
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
      : await this.dependencies.entries.findPreferred(context, key);
    if (preferred && preferred.status !== "terminal") {
      if (preferred.commitSha !== input.commitSha) {
        return err(
          domainError.conflict("Preferred Workspace is pinned to another Git commit", {
            code: "workspace_open_source_pin_mismatch",
            workspaceId: preferred.workspaceId,
            requestedCommitSha: input.commitSha,
            workspaceCommitSha: preferred.commitSha,
            guidance: "Use --new to create an isolated Workspace for the new commit.",
          }),
        );
      }
      if (preferred.profileInstallationId !== resolved.value.profileInstallationId) {
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
      if (agent.profilePin?.profileInstallationId !== resolved.value.profileInstallationId) {
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
          attach,
        ),
      );
    }

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
    });
    if (preflight.isErr()) return err(preflight.error);
    const begun = await this.dependencies.entries.begin(context, key, {
      commitSha: input.commitSha,
      profileInstallationId: preflight.value.profileInstallationId,
      forceNew: input.forceNew ?? false,
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
    let phase = "workspace-open-sandbox-create";
    try {
      const sandbox = await this.dependencies.sandboxes.create(context, {
        ...preflight.value.plan.sandbox,
        placementReservationId: preflight.value.reservation.reservationId,
        ...(options.placementProviderKey ? { providerKey: options.placementProviderKey } : {}),
        ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
      });
      if (sandbox.isErr()) {
        await this.dependencies.reservations.release(context, preflight.value.reservation);
        throw sandbox.error;
      }
      workspaceId = sandbox.value.sandboxId;
      await this.dependencies.reservations.release(context, preflight.value.reservation);

      phase = "workspace-open-source-materialization";
      if (options.sourceMaterializer) {
        const materialized = await options.sourceMaterializer.materialize(context, {
          workspaceId,
          source: input,
        });
        if (materialized.isErr()) throw materialized.error;
      } else {
        const sourceCommands: readonly { argv: readonly string[]; cwd?: string }[] = [
          {
            argv: ["git", "clone", "--no-checkout", "--", input.repository, "."],
          },
          {
            argv: ["git", "checkout", "--detach", input.commitSha],
          },
          {
            argv: ["git", "switch", "-c", input.branch],
          },
        ];
        for (const command of sourceCommands) {
          const executed = await this.dependencies.sandboxes.exec(context, workspaceId, command);
          if (executed.isErr() || !executionSucceeded(executed.value)) {
            const failure = executed.isErr()
              ? executed.error
              : domainError.conflict("Workspace source materialization failed", {
                  code: "workspace_open_source_materialization_failed",
                });
            throw failure;
          }
        }
      }
      for (const initialization of preflight.value.plan.initialization) {
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
      for (const port of preflight.value.plan.defaultPorts) {
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
        harnessKey: preflight.value.plan.runtime.harnessKey,
        harnessTemplateId: preflight.value.plan.runtime.harnessTemplateId,
        idempotencyKey: `workspace-open:${key.tenantId}:${key.subjectId}:${key.projectId}:${key.repositoryIdentity}:${key.branch}:${input.commitSha}`,
        projectId: preflight.value.projectId,
        profileInstallationId: preflight.value.profileInstallationId,
        profilePlan: preflight.value.plan,
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
          preflight.value.projectId,
          runtime.value.profilePin ?? preflight.value.plan.pin,
          sandbox.value,
          runtime.value,
          false,
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
    attach?: SandboxAgentAttachDescriptor,
  ): WorkspaceOpenResult {
    return {
      workspaceId: sandbox.sandboxId,
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
      ...(attach ? { attach } : {}),
    };
  }
}
