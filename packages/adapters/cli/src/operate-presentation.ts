import { randomUUID } from "node:crypto";

import {
  type Command,
  ControlPlanePortabilityExportPlanQuery,
  CreateStorageVolumeBackupCommand,
  CreateStorageVolumeRestorePlanQuery,
  DeploymentProofQuery,
  DeploymentRecoveryReadinessQuery,
  DeploymentTimelineQuery,
  ListControlPlanePortabilityArtifactsQuery,
  ListResourcesQuery,
  ListStorageVolumeBackupPoliciesQuery,
  ListStorageVolumeBackupsQuery,
  ListStorageVolumesQuery,
  type Query,
  RedeployDeploymentCommand,
  type ResourceDetail,
  ResourceDiagnosticSummaryQuery,
  ResourceHealthQuery,
  ResourceRuntimeLogsQuery,
  RestoreStorageVolumeBackupCommand,
  RetryDeploymentCommand,
  RollbackDeploymentCommand,
  RuntimeMonitoringRollupQuery,
  ShowResourceQuery,
  ShowRuntimeMonitoringThresholdsQuery,
  ShowStorageVolumeBackupPolicyQuery,
} from "@appaloft/application";
import { type DomainError, type Result } from "@appaloft/core";

export interface OperatePresentationContext {
  executeCommand<T>(message: Command<T>): Promise<Result<T>>;
  executeQuery<T>(message: Query<T>): Promise<Result<T>>;
}

export type OperateHeadlessResult =
  | {
      readonly protocol: "operate/v1";
      readonly state: "empty" | "selection-required";
      readonly resources: readonly Record<string, unknown>[];
    }
  | {
      readonly protocol: "operate/v1";
      readonly state: "selected";
      readonly snapshot: OperateSnapshot | Record<string, unknown>;
    };

export interface OperatePresentation {
  start(
    context: OperatePresentationContext,
    input: { readonly resourceId?: string; readonly deploymentId?: string },
  ): Promise<void>;
  headless(
    context: OperatePresentationContext,
    input: { readonly resourceId?: string; readonly deploymentId?: string },
  ): Promise<OperateHeadlessResult>;
}

export type OperateRendererMessage =
  | {
      readonly type: "operate-resources";
      readonly protocol: "operate/v1";
      readonly resources: readonly Record<string, unknown>[];
      readonly selectedResourceId?: string;
    }
  | { readonly type: "operate-snapshot"; readonly snapshot: OperateSnapshot }
  | {
      readonly type: "operate-confirmation";
      readonly confirmation: OperateActionConfirmation;
    }
  | {
      readonly type: "operate-action-result";
      readonly action: OperateAction;
      readonly result: unknown;
    }
  | { readonly type: "operate-error"; readonly error: OperateSafeError };

export type OperateRendererEvent =
  | { readonly type: "operate-select"; readonly resourceId: string }
  | { readonly type: "operate-refresh" }
  | { readonly type: "operate-preview-action"; readonly action: OperateAction }
  | {
      readonly type: "operate-confirm-action";
      readonly token: string;
      readonly action: OperateAction;
    }
  | { readonly type: "operate-quit" };

export interface OperateRendererSession {
  send(message: OperateRendererMessage): Promise<void>;
  events(): AsyncIterable<OperateRendererEvent>;
  close(): Promise<void>;
}

export interface CreateBoundedOperatePresentationInput {
  readonly openRenderer: () => Promise<OperateRendererSession>;
  readonly coordinator?: OperateCoordinator;
}

export interface OperateSafeError {
  readonly code: string;
  readonly category: string;
  readonly phase: string;
  readonly retryable: boolean;
  readonly message: string;
}

export type OperateSection<T = unknown> =
  | { readonly availability: "available"; readonly observedAt: string; readonly value: T }
  | {
      readonly availability: "unavailable";
      readonly observedAt: string;
      readonly error: OperateSafeError;
    };

export interface OperateStorageEvidence {
  readonly volumes: readonly unknown[];
  readonly backups: Readonly<Record<string, readonly unknown[]>>;
  readonly policies: Readonly<Record<string, readonly unknown[]>>;
}

export interface OperatePortabilityEvidence {
  readonly plan: unknown;
  readonly artifacts: unknown;
  readonly handoff: "appaloft instance portability export-plan";
}

export interface OperateSnapshot {
  readonly protocol: "operate/v1";
  readonly observedAt: string;
  readonly target: {
    readonly resourceId: string;
    readonly deploymentId?: string;
  };
  readonly resource: ResourceDetail;
  readonly sections: {
    readonly health: OperateSection;
    readonly diagnostics: OperateSection;
    readonly logs: OperateSection;
    readonly monitoring: OperateSection;
    readonly timeline: OperateSection;
    readonly recovery: OperateSection;
    readonly proof: OperateSection;
    readonly storage: OperateSection<OperateStorageEvidence>;
    readonly notifications: OperateSection;
    readonly portability: OperateSection<OperatePortabilityEvidence>;
  };
}

export interface OperateCoordinator {
  snapshot(
    context: OperatePresentationContext,
    input: { readonly resourceId: string; readonly deploymentId?: string },
  ): Promise<OperateSnapshot>;
  previewAction(
    context: OperatePresentationContext,
    action: OperateAction,
  ): Promise<OperateActionConfirmation>;
  confirmAction(
    context: OperatePresentationContext,
    input: { readonly token: string; readonly action: OperateAction },
  ): Promise<{ readonly accepted: true; readonly result: unknown }>;
}

export interface CreateOperateCoordinatorInput {
  readonly now?: () => string;
  readonly confirmationId?: () => string;
}

export type OperateAction =
  | {
      readonly kind: "retry";
      readonly resourceId: string;
      readonly deploymentId: string;
    }
  | {
      readonly kind: "redeploy";
      readonly resourceId: string;
      readonly deploymentId: string;
    }
  | {
      readonly kind: "rollback";
      readonly resourceId: string;
      readonly deploymentId: string;
      readonly candidateDeploymentId: string;
    }
  | {
      readonly kind: "backup-create";
      readonly resourceId: string;
      readonly storageVolumeId: string;
      readonly policyId: string;
    }
  | {
      readonly kind: "restore-independent";
      readonly resourceId: string;
      readonly backupId: string;
      readonly restoredVolumeName?: string;
    };

export interface OperateActionConfirmation {
  readonly token: string;
  readonly action: OperateAction;
  readonly readinessGeneratedAt: string;
  readonly consequence: string;
}

export type OperateTargetResolution =
  | { readonly state: "empty"; readonly resources: readonly Record<string, unknown>[] }
  | {
      readonly state: "selection-required";
      readonly resources: readonly Record<string, unknown>[];
    }
  | {
      readonly state: "selected";
      readonly resourceId: string;
      readonly resources: readonly Record<string, unknown>[];
    };

function operateError(
  code: string,
  message: string,
  details: Record<string, string> = {},
): DomainError {
  const contract =
    code === "operate_snapshot_unavailable"
      ? { category: "infra" as const, phase: "operate-observation", retryable: true }
      : code === "operate_action_not_ready"
        ? { category: "user" as const, phase: "operate-admission", retryable: false }
        : code === "operate_action_confirmation_required"
          ? { category: "user" as const, phase: "operate-confirmation", retryable: false }
          : { category: "user" as const, phase: "operate-selection", retryable: false };
  return {
    code,
    category: contract.category,
    message,
    retryable: contract.retryable,
    details: { phase: contract.phase, ...details },
  };
}

function operationValue<T>(result: Result<T>): T {
  if (result.isErr()) throw result.error;
  return result.value;
}

function phaseOf(error: DomainError): string {
  const phase = error.details?.phase;
  return typeof phase === "string" && phase.length > 0 ? phase : "operate-presentation";
}

function safeError(error: unknown): OperateSafeError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "category" in error &&
    "message" in error &&
    "retryable" in error
  ) {
    const domain = error as DomainError;
    return {
      code: domain.code,
      category: domain.category,
      phase: phaseOf(domain),
      retryable: domain.retryable,
      message: domain.message,
    };
  }
  return {
    code: "operate_snapshot_unavailable",
    category: "infra",
    phase: "operate-presentation",
    retryable: true,
    message: "Operate evidence is unavailable",
  };
}

async function querySection<T>(
  context: OperatePresentationContext,
  query: Result<Query<T>>,
  observedAt: string,
): Promise<OperateSection<T>> {
  try {
    const message = operationValue(query);
    const result = await context.executeQuery(message);
    if (result.isErr()) throw result.error;
    return { availability: "available", observedAt, value: result.value };
  } catch (error) {
    return { availability: "unavailable", observedAt, error: safeError(error) };
  }
}

function unavailableSection<T>(observedAt: string, message: string): OperateSection<T> {
  return {
    availability: "unavailable",
    observedAt,
    error: safeError(operateError("operate_snapshot_unavailable", message)),
  };
}

async function storageSection(
  context: OperatePresentationContext,
  resource: ResourceDetail,
  observedAt: string,
): Promise<OperateSection<OperateStorageEvidence>> {
  const listed = await querySection(
    context,
    ListStorageVolumesQuery.create({
      projectId: resource.resource.projectId,
      environmentId: resource.resource.environmentId,
    }),
    observedAt,
  );
  if (listed.availability === "unavailable") return listed;
  const volumes = listed.value.items
    .filter((volume) =>
      volume.attachments.some((attachment) => attachment.resourceId === resource.resource.id),
    )
    .slice(0, 16);
  const entries = await Promise.all(
    volumes.map(async (volume) => {
      const [backups, policies] = await Promise.all([
        querySection(
          context,
          ListStorageVolumeBackupsQuery.create({ storageVolumeId: volume.id }),
          observedAt,
        ),
        querySection(
          context,
          ListStorageVolumeBackupPoliciesQuery.create({ storageVolumeId: volume.id }),
          observedAt,
        ),
      ]);
      return {
        volume,
        backups: backups.availability === "available" ? backups.value.items.slice(0, 32) : [],
        policies: policies.availability === "available" ? policies.value.items.slice(0, 8) : [],
      };
    }),
  );
  return {
    availability: "available",
    observedAt,
    value: {
      volumes: entries.map((entry) => entry.volume),
      backups: Object.fromEntries(entries.map((entry) => [entry.volume.id, entry.backups])),
      policies: Object.fromEntries(entries.map((entry) => [entry.volume.id, entry.policies])),
    },
  };
}

export function createOperateCoordinator(
  input: CreateOperateCoordinatorInput = {},
): OperateCoordinator {
  const now = input.now ?? (() => new Date().toISOString());
  const confirmationId = input.confirmationId ?? randomUUID;
  const confirmations = new Map<string, { action: OperateAction; signature: string }>();
  const readRecovery = async (context: OperatePresentationContext, action: OperateAction) => {
    if (action.kind === "backup-create" || action.kind === "restore-independent") {
      throw operateError(
        "operate_action_not_ready",
        "Data recovery action has no Deployment readiness",
      );
    }
    const result = await context.executeQuery(
      operationValue(
        DeploymentRecoveryReadinessQuery.create({
          deploymentId: action.deploymentId,
          resourceId: action.resourceId,
          includeCandidates: true,
          maxCandidates: 8,
        }),
      ),
    );
    if (result.isErr()) throw result.error;
    const readiness = result.value;
    const allowed =
      action.kind === "retry"
        ? readiness.retry.allowed && readiness.retry.commandActive
        : action.kind === "redeploy"
          ? readiness.redeploy.allowed && readiness.redeploy.commandActive
          : readiness.rollback.allowed &&
            readiness.rollback.commandActive &&
            readiness.rollback.candidates.some(
              (candidate) =>
                candidate.deploymentId === action.candidateDeploymentId && candidate.rollbackReady,
            );
    if (!allowed) {
      throw operateError(
        "operate_action_not_ready",
        "Operate action is not admitted by fresh recovery readiness",
        {
          resourceId: action.resourceId,
          deploymentId: action.deploymentId,
          action: action.kind,
        },
      );
    }
    return readiness;
  };
  const readBackupPolicy = async (
    context: OperatePresentationContext,
    action: Extract<OperateAction, { kind: "backup-create" }>,
  ) => {
    const result = await context.executeQuery(
      operationValue(ShowStorageVolumeBackupPolicyQuery.create({ policyId: action.policyId })),
    );
    if (result.isErr()) throw result.error;
    if (result.value.policy.storageVolumeId !== action.storageVolumeId) {
      throw operateError(
        "operate_action_not_ready",
        "Backup policy does not own the selected StorageVolume",
        {
          policyId: action.policyId,
          storageVolumeId: action.storageVolumeId,
        },
      );
    }
    return result.value.policy;
  };
  const readRestorePlan = async (
    context: OperatePresentationContext,
    action: Extract<OperateAction, { kind: "restore-independent" }>,
  ) => {
    const result = await context.executeQuery(
      operationValue(
        CreateStorageVolumeRestorePlanQuery.create({
          backupId: action.backupId,
          targetMode: "new-volume",
          acknowledgeDestructiveRestore: false,
        }),
      ),
    );
    if (result.isErr()) throw result.error;
    if (
      result.value.destructive ||
      result.value.targetMode !== "new-volume" ||
      result.value.blockers.length > 0
    ) {
      throw operateError("operate_action_not_ready", "Independent restore plan is blocked", {
        backupId: action.backupId,
      });
    }
    return result.value;
  };
  return {
    async previewAction(context, action) {
      const readinessGeneratedAt =
        action.kind === "backup-create"
          ? ((await readBackupPolicy(context, action)).updatedAt ?? now())
          : action.kind === "restore-independent"
            ? now()
            : (await readRecovery(context, action)).generatedAt;
      if (action.kind === "restore-independent") await readRestorePlan(context, action);
      const token = confirmationId();
      confirmations.set(token, { action, signature: JSON.stringify(action) });
      return {
        token,
        action,
        readinessGeneratedAt,
        consequence:
          action.kind === "rollback"
            ? `Create a rollback attempt from ${action.candidateDeploymentId}; data is not restored`
            : action.kind === "backup-create"
              ? `Create a backup of ${action.storageVolumeId} with policy ${action.policyId}`
              : action.kind === "restore-independent"
                ? `Restore ${action.backupId} to an independent StorageVolume; live data is not overwritten`
                : `Create a ${action.kind} attempt for ${action.deploymentId}`,
      };
    },
    async confirmAction(context, confirmation) {
      const pending = confirmations.get(confirmation.token);
      if (!pending || pending.signature !== JSON.stringify(confirmation.action)) {
        throw operateError(
          "operate_action_confirmation_required",
          "Operate action requires an exact second confirmation",
        );
      }
      confirmations.delete(confirmation.token);
      const action = confirmation.action;
      const restorePlan =
        action.kind === "restore-independent" ? await readRestorePlan(context, action) : undefined;
      const execute = async <T>(command: Result<Command<T>>): Promise<T> =>
        operationValue(await context.executeCommand(operationValue(command)));
      const result =
        action.kind === "backup-create"
          ? await execute(
              CreateStorageVolumeBackupCommand.create({
                storageVolumeId: action.storageVolumeId,
                planRequest: (await readBackupPolicy(context, action)).planRequest,
              }),
            )
          : action.kind === "restore-independent"
            ? await execute(
                RestoreStorageVolumeBackupCommand.create({
                  backupId: action.backupId,
                  targetMode: "new-volume",
                  restoredVolumeName:
                    action.restoredVolumeName ?? restorePlan?.defaultRestoredVolumeName,
                  acknowledgeDestructiveRestore: false,
                }),
              )
            : action.kind === "retry"
              ? await execute(
                  RetryDeploymentCommand.create({
                    deploymentId: action.deploymentId,
                    resourceId: action.resourceId,
                    readinessGeneratedAt: (await readRecovery(context, action)).generatedAt,
                  }),
                )
              : action.kind === "redeploy"
                ? await execute(
                    RedeployDeploymentCommand.create({
                      sourceDeploymentId: action.deploymentId,
                      resourceId: action.resourceId,
                      readinessGeneratedAt: (await readRecovery(context, action)).generatedAt,
                    }),
                  )
                : await execute(
                    RollbackDeploymentCommand.create({
                      deploymentId: action.deploymentId,
                      rollbackCandidateDeploymentId: action.candidateDeploymentId,
                      resourceId: action.resourceId,
                      readinessGeneratedAt: (await readRecovery(context, action)).generatedAt,
                    }),
                  );
      return { accepted: true, result };
    },
    async snapshot(context, target) {
      const observedAt = now();
      const resource = operationValue(
        await context.executeQuery(
          operationValue(
            ShowResourceQuery.create({
              resourceId: target.resourceId,
              includeLatestDeployment: true,
              includeAccessSummary: true,
              includeProfileDiagnostics: true,
            }),
          ),
        ),
      );
      const deploymentId = target.deploymentId ?? resource.latestDeployment?.id;
      const from = new Date(Date.parse(observedAt) - 60 * 60 * 1_000).toISOString();
      const deploymentUnavailable = unavailableSection(
        observedAt,
        "Resource has no relevant Deployment",
      );
      const [
        health,
        diagnostics,
        logs,
        monitoring,
        timeline,
        recovery,
        proof,
        storage,
        notifications,
        portabilityPlan,
        portabilityArtifacts,
      ] = await Promise.all([
        querySection(
          context,
          ResourceHealthQuery.create({
            resourceId: target.resourceId,
            mode: "cached",
            includeChecks: true,
          }),
          observedAt,
        ),
        querySection(
          context,
          ResourceDiagnosticSummaryQuery.create({
            resourceId: target.resourceId,
            deploymentId,
            includeDeploymentTimelineTail: true,
            includeRuntimeLogTail: true,
            tailLines: 50,
          }),
          observedAt,
        ),
        querySection(
          context,
          ResourceRuntimeLogsQuery.create({
            resourceId: target.resourceId,
            deploymentId,
            tailLines: 200,
            follow: false,
          }),
          observedAt,
        ),
        querySection(
          context,
          RuntimeMonitoringRollupQuery.create({
            scope: { kind: "resource", resourceId: target.resourceId },
            window: { from, to: observedAt },
            bucket: "five-minute",
          }),
          observedAt,
        ),
        deploymentId
          ? querySection(
              context,
              DeploymentTimelineQuery.create({ deploymentId, limit: 100 }),
              observedAt,
            )
          : Promise.resolve(deploymentUnavailable),
        deploymentId
          ? querySection(
              context,
              DeploymentRecoveryReadinessQuery.create({
                deploymentId,
                resourceId: target.resourceId,
                includeCandidates: true,
                maxCandidates: 8,
              }),
              observedAt,
            )
          : Promise.resolve(deploymentUnavailable),
        deploymentId
          ? querySection(
              context,
              DeploymentProofQuery.create({ deploymentId, resourceId: target.resourceId }),
              observedAt,
            )
          : Promise.resolve(deploymentUnavailable),
        storageSection(context, resource, observedAt),
        querySection(
          context,
          ShowRuntimeMonitoringThresholdsQuery.create({
            scope: { kind: "resource", resourceId: target.resourceId },
            window: { from, to: observedAt },
          }),
          observedAt,
        ),
        querySection(context, ControlPlanePortabilityExportPlanQuery.create({}), observedAt),
        querySection(context, ListControlPlanePortabilityArtifactsQuery.create({}), observedAt),
      ]);
      const portability: OperateSection<OperatePortabilityEvidence> =
        portabilityPlan.availability === "available" &&
        portabilityArtifacts.availability === "available"
          ? {
              availability: "available",
              observedAt,
              value: {
                plan: portabilityPlan.value,
                artifacts: portabilityArtifacts.value,
                handoff: "appaloft instance portability export-plan",
              },
            }
          : {
              availability: "unavailable",
              observedAt,
              error:
                portabilityPlan.availability === "unavailable"
                  ? portabilityPlan.error
                  : portabilityArtifacts.availability === "unavailable"
                    ? portabilityArtifacts.error
                    : safeError(undefined),
            };
      return {
        protocol: "operate/v1",
        observedAt,
        target: {
          resourceId: target.resourceId,
          ...(deploymentId ? { deploymentId } : {}),
        },
        resource,
        sections: {
          health,
          diagnostics,
          logs,
          monitoring,
          timeline,
          recovery,
          proof,
          storage,
          notifications,
          portability,
        },
      };
    },
  };
}

export async function listOperateResources(
  context: OperatePresentationContext,
): Promise<readonly Record<string, unknown>[]> {
  const result = await context.executeQuery(
    operationValue(ListResourcesQuery.create({ limit: 100 })),
  );
  return operationValue(result).items as unknown as readonly Record<string, unknown>[];
}

export async function resolveOperateTarget(
  context: OperatePresentationContext,
  input: { readonly resourceId?: string },
): Promise<OperateTargetResolution> {
  if (input.resourceId) {
    const query = operationValue(
      ShowResourceQuery.create({
        resourceId: input.resourceId,
        includeLatestDeployment: false,
        includeAccessSummary: false,
        includeProfileDiagnostics: false,
      }),
    );
    const result = await context.executeQuery(query);
    if (result.isErr()) {
      throw operateError(
        "operate_target_not_found",
        `Resource ${input.resourceId} is not available to this profile`,
        { resourceId: input.resourceId },
      );
    }
    return {
      state: "selected",
      resourceId: result.value.resource.id,
      resources: [result.value.resource as unknown as Record<string, unknown>],
    };
  }
  const resources = await listOperateResources(context);
  if (resources.length === 0) return { state: "empty", resources };
  if (resources.length === 1) {
    const resourceId = resources[0]?.id;
    if (typeof resourceId !== "string" || resourceId.length === 0) {
      throw operateError(
        "operate_snapshot_unavailable",
        "Resource list returned an invalid target",
      );
    }
    return { state: "selected", resourceId, resources };
  }
  return { state: "selection-required", resources };
}

export function createBoundedOperatePresentation(
  input: CreateBoundedOperatePresentationInput,
): OperatePresentation {
  const coordinator = input.coordinator ?? createOperateCoordinator();
  return {
    async headless(context, target) {
      const resolution = await resolveOperateTarget(context, target);
      if (resolution.state !== "selected") {
        return {
          protocol: "operate/v1",
          state: resolution.state,
          resources: resolution.resources,
        };
      }
      return {
        protocol: "operate/v1",
        state: "selected",
        snapshot: await coordinator.snapshot(context, {
          resourceId: resolution.resourceId,
          ...(target.deploymentId ? { deploymentId: target.deploymentId } : {}),
        }),
      };
    },
    async start(context, target) {
      const renderer = await input.openRenderer();
      let selectedResourceId: string | undefined;
      let selectedDeploymentId = target.deploymentId;
      try {
        const resolution = await resolveOperateTarget(context, target);
        selectedResourceId = resolution.state === "selected" ? resolution.resourceId : undefined;
        await renderer.send({
          type: "operate-resources",
          protocol: "operate/v1",
          resources: resolution.resources,
          ...(selectedResourceId ? { selectedResourceId } : {}),
        });
        if (selectedResourceId) {
          await renderer.send({
            type: "operate-snapshot",
            snapshot: await coordinator.snapshot(context, {
              resourceId: selectedResourceId,
              ...(selectedDeploymentId ? { deploymentId: selectedDeploymentId } : {}),
            }),
          });
        }
        const visible = new Set(
          resolution.resources
            .map((resource) => resource.id)
            .filter((resourceId): resourceId is string => typeof resourceId === "string"),
        );
        for await (const event of renderer.events()) {
          if (event.type === "operate-quit") break;
          try {
            if (event.type === "operate-select") {
              if (!visible.has(event.resourceId)) {
                throw operateError("operate_target_not_found", "Selected Resource is not visible", {
                  resourceId: event.resourceId,
                });
              }
              selectedResourceId = event.resourceId;
              selectedDeploymentId = undefined;
              await renderer.send({
                type: "operate-snapshot",
                snapshot: await coordinator.snapshot(context, { resourceId: event.resourceId }),
              });
              continue;
            }
            if (event.type === "operate-refresh") {
              if (!selectedResourceId) {
                throw operateError(
                  "operate_target_selection_required",
                  "Select one Resource before refreshing",
                );
              }
              await renderer.send({
                type: "operate-snapshot",
                snapshot: await coordinator.snapshot(context, {
                  resourceId: selectedResourceId,
                  ...(selectedDeploymentId ? { deploymentId: selectedDeploymentId } : {}),
                }),
              });
              continue;
            }
            if (event.type === "operate-preview-action") {
              await renderer.send({
                type: "operate-confirmation",
                confirmation: await coordinator.previewAction(context, event.action),
              });
              continue;
            }
            const accepted = await coordinator.confirmAction(context, {
              token: event.token,
              action: event.action,
            });
            await renderer.send({
              type: "operate-action-result",
              action: event.action,
              result: accepted.result,
            });
            selectedResourceId = event.action.resourceId;
            selectedDeploymentId = undefined;
            await renderer.send({
              type: "operate-snapshot",
              snapshot: await coordinator.snapshot(context, {
                resourceId: event.action.resourceId,
              }),
            });
          } catch (error) {
            await renderer.send({ type: "operate-error", error: safeError(error) });
          }
        }
      } finally {
        await renderer.close();
      }
    },
  };
}
