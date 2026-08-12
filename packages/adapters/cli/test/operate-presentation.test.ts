import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
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
import { domainError, err, ok } from "@appaloft/core";
import {
  createBoundedOperatePresentation,
  createOperateCoordinator,
  type OperateRendererEvent,
  type OperateRendererMessage,
  resolveOperateTarget,
} from "../src/operate-presentation";

describe("Operate and recover presentation", () => {
  test("[OPR-TUI-004][OPR-REFRESH-006][OPR-CLEANUP-017] drives target selection and atomic refresh over operate/v1 then closes the renderer", async () => {
    const messages: OperateRendererMessage[] = [];
    let closed = 0;
    const events: OperateRendererEvent[] = [
      { type: "operate-select", resourceId: "res_api" },
      { type: "operate-refresh" },
      { type: "operate-quit" },
    ];
    let snapshots = 0;
    const presentation = createBoundedOperatePresentation({
      coordinator: {
        snapshot: async (_context, input) =>
          ({
            protocol: "operate/v1",
            observedAt: `2026-08-13T00:00:0${++snapshots}.000Z`,
            target: { resourceId: input.resourceId },
            resource: { resource: { id: input.resourceId } },
            sections: {},
          }) as never,
        previewAction: async () => {
          throw new Error("not used");
        },
        confirmAction: async () => {
          throw new Error("not used");
        },
      },
      openRenderer: async () => ({
        send: async (message) => {
          messages.push(message);
        },
        async *events() {
          for (const event of events) yield event;
        },
        close: async () => {
          closed += 1;
        },
      }),
    });
    await presentation.start(
      {
        executeCommand: async () => ok({}),
        executeQuery: async <T>(query: Query<T>) => {
          if (query instanceof ListResourcesQuery) {
            return ok({
              items: [
                { id: "res_api", name: "api" },
                { id: "res_web", name: "web" },
              ],
            } as T);
          }
          throw new Error(`unexpected query ${query.constructor.name}`);
        },
      },
      {},
    );
    expect(messages.map((message) => message.type)).toEqual([
      "operate-resources",
      "operate-snapshot",
      "operate-snapshot",
    ]);
    expect(messages[1]).toMatchObject({
      type: "operate-snapshot",
      snapshot: { observedAt: "2026-08-13T00:00:01.000Z" },
    });
    expect(messages[2]).toMatchObject({
      type: "operate-snapshot",
      snapshot: { observedAt: "2026-08-13T00:00:02.000Z" },
    });
    expect(closed).toBe(1);
  });

  test("[OPR-BACKUP-011][OPR-RESTORE-012] reuses a configured backup plan and defaults restore to an independent volume", async () => {
    const commands: Command<unknown>[] = [];
    let policyReads = 0;
    let restorePlanReads = 0;
    let confirmation = 0;
    const planRequest = {
      source: { storageVolumeId: "vol_data", resourceId: "res_api" },
      requestedConsistency: "crash-consistent" as const,
      target: { providerKey: "local-filesystem" as const, targetRef: "/backup" },
      retention: { maxCount: 3 },
    };
    const coordinator = createOperateCoordinator({
      confirmationId: () => `confirm_${++confirmation}`,
    });
    const context = {
      executeCommand: async <T>(command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok(
          (command instanceof RestoreStorageVolumeBackupCommand
            ? { id: "restore_1", restoredStorageVolumeId: "vol_restored" }
            : { id: "backup_1" }) as T,
        );
      },
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ShowStorageVolumeBackupPolicyQuery) {
          policyReads += 1;
          return ok({
            schemaVersion: "storage-volume-backup-policies.policy/v1",
            policy: { id: "policy_1", storageVolumeId: "vol_data", planRequest },
          } as T);
        }
        if (query instanceof CreateStorageVolumeRestorePlanQuery) {
          restorePlanReads += 1;
          return ok({
            schemaVersion: "storage-volumes.restore-plan/v1",
            backupId: "backup_1",
            sourceStorageVolumeId: "vol_data",
            targetMode: "new-volume",
            destructive: false,
            defaultRestoredVolumeName: "data-restored",
            blockers: [],
          } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    };

    const backup = await coordinator.previewAction(context, {
      kind: "backup-create",
      resourceId: "res_api",
      storageVolumeId: "vol_data",
      policyId: "policy_1",
    });
    await coordinator.confirmAction(context, { token: backup.token, action: backup.action });
    const restore = await coordinator.previewAction(context, {
      kind: "restore-independent",
      resourceId: "res_api",
      backupId: "backup_1",
      restoredVolumeName: "data-restored",
    });
    expect(restore.consequence).toContain("independent");
    await coordinator.confirmAction(context, { token: restore.token, action: restore.action });

    expect(policyReads).toBe(2);
    expect(restorePlanReads).toBe(2);
    expect(commands[0]).toBeInstanceOf(CreateStorageVolumeBackupCommand);
    expect(commands[0]).toMatchObject({ storageVolumeId: "vol_data", planRequest });
    expect(commands[1]).toBeInstanceOf(RestoreStorageVolumeBackupCommand);
    expect(commands[1]).toMatchObject({
      backupId: "backup_1",
      targetMode: "new-volume",
      restoredVolumeName: "data-restored",
      acknowledgeDestructiveRestore: false,
    });
  });

  test("[OPR-READINESS-007][OPR-CONFIRM-008][OPR-ROLLBACK-010] re-reads fresh readiness and dispatches only the exact confirmed rollback", async () => {
    const commands: Command<unknown>[] = [];
    let readinessReads = 0;
    const coordinator = createOperateCoordinator({
      now: () => "2026-08-13T00:00:00.000Z",
      confirmationId: () => "confirm_rollback",
    });
    const context = {
      executeCommand: async <T>(command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({ id: "dep_recovery" } as T);
      },
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof DeploymentRecoveryReadinessQuery) {
          readinessReads += 1;
          return ok({
            schemaVersion: "deployments.recovery-readiness/v1",
            deploymentId: "dep_failed",
            resourceId: "res_api",
            generatedAt: `2026-08-13T00:00:0${readinessReads}.000Z`,
            stateVersion: `v${readinessReads}`,
            recoverable: true,
            retryable: true,
            redeployable: true,
            rollbackReady: true,
            rollbackCandidateCount: 1,
            retry: {
              allowed: true,
              commandActive: true,
              reasons: [],
              targetOperation: "deployments.retry",
            },
            redeploy: {
              allowed: true,
              commandActive: true,
              reasons: [],
              targetOperation: "deployments.redeploy",
            },
            rollback: {
              allowed: true,
              commandActive: true,
              reasons: [],
              recommendedCandidateId: "dep_good",
              candidates: [
                {
                  deploymentId: "dep_good",
                  finishedAt: "2026-08-12T00:00:00.000Z",
                  status: "succeeded",
                  rollbackReady: true,
                  reasons: [],
                },
              ],
            },
            recommendedActions: [],
          } as T);
        }
        throw new Error(`unexpected query ${query.constructor.name}`);
      },
    };

    const confirmation = await coordinator.previewAction(context, {
      kind: "rollback",
      resourceId: "res_api",
      deploymentId: "dep_failed",
      candidateDeploymentId: "dep_good",
    });
    expect(confirmation).toMatchObject({
      token: "confirm_rollback",
      action: {
        kind: "rollback",
        resourceId: "res_api",
        deploymentId: "dep_failed",
        candidateDeploymentId: "dep_good",
      },
      readinessGeneratedAt: "2026-08-13T00:00:01.000Z",
    });
    await expect(
      coordinator.confirmAction(context, { token: "wrong", action: confirmation.action }),
    ).rejects.toMatchObject({
      code: "operate_action_confirmation_required",
      details: { phase: "operate-confirmation" },
    });
    const accepted = await coordinator.confirmAction(context, {
      token: confirmation.token,
      action: confirmation.action,
    });
    expect(readinessReads).toBe(2);
    expect(accepted).toEqual({ accepted: true, result: { id: "dep_recovery" } });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(RollbackDeploymentCommand);
    expect(commands[0]).toMatchObject({
      deploymentId: "dep_failed",
      rollbackCandidateDeploymentId: "dep_good",
      resourceId: "res_api",
      readinessGeneratedAt: "2026-08-13T00:00:02.000Z",
    });
    await expect(
      coordinator.confirmAction(context, {
        token: confirmation.token,
        action: confirmation.action,
      }),
    ).rejects.toMatchObject({ code: "operate_action_confirmation_required" });
  });

  test("[OPR-READINESS-007][OPR-RETRY-009] dispatches retry and redeploy only after fresh readiness", async () => {
    const commands: Command<unknown>[] = [];
    let readinessReads = 0;
    let confirmationIds = 0;
    const coordinator = createOperateCoordinator({
      confirmationId: () => `confirm_${++confirmationIds}`,
    });
    const context = {
      executeCommand: async <T>(command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({ id: `dep_recovery_${commands.length}` } as T);
      },
      executeQuery: async <T>(query: Query<T>) => {
        if (!(query instanceof DeploymentRecoveryReadinessQuery)) {
          throw new Error(`unexpected query ${query.constructor.name}`);
        }
        readinessReads += 1;
        return ok({
          schemaVersion: "deployments.recovery-readiness/v1",
          deploymentId: "dep_failed",
          resourceId: "res_api",
          generatedAt: `2026-08-13T00:00:0${readinessReads}.000Z`,
          stateVersion: `v${readinessReads}`,
          recoverable: true,
          retryable: true,
          redeployable: true,
          rollbackReady: false,
          rollbackCandidateCount: 0,
          retry: {
            allowed: true,
            commandActive: true,
            reasons: [],
            targetOperation: "deployments.retry",
          },
          redeploy: {
            allowed: true,
            commandActive: true,
            reasons: [],
            targetOperation: "deployments.redeploy",
          },
          rollback: {
            allowed: false,
            commandActive: true,
            reasons: [],
            candidates: [],
          },
          recommendedActions: [],
        } as T);
      },
    };

    for (const kind of ["retry", "redeploy"] as const) {
      const confirmation = await coordinator.previewAction(context, {
        kind,
        resourceId: "res_api",
        deploymentId: "dep_failed",
      });
      await coordinator.confirmAction(context, {
        token: confirmation.token,
        action: confirmation.action,
      });
    }

    expect(readinessReads).toBe(4);
    expect(commands[0]).toBeInstanceOf(RetryDeploymentCommand);
    expect(commands[0]).toMatchObject({
      deploymentId: "dep_failed",
      resourceId: "res_api",
      readinessGeneratedAt: "2026-08-13T00:00:02.000Z",
    });
    expect(commands[1]).toBeInstanceOf(RedeployDeploymentCommand);
    expect(commands[1]).toMatchObject({
      sourceDeploymentId: "dep_failed",
      resourceId: "res_api",
      readinessGeneratedAt: "2026-08-13T00:00:04.000Z",
    });
  });

  test("[OPR-SELECT-001] resolves zero, one, many and explicit Resource targets without guessing", async () => {
    const resources = [
      { id: "res_api", name: "api", projectId: "prj_1", environmentId: "env_prod" },
      { id: "res_web", name: "web", projectId: "prj_1", environmentId: "env_prod" },
    ];
    const context = (visible: readonly Record<string, unknown>[]) => ({
      executeCommand: async () => ok({}),
      executeQuery: async <T>(query: Query<T>) => {
        if (query instanceof ListResourcesQuery) return ok({ items: visible } as T);
        if (query instanceof ShowResourceQuery && query.resourceId === "res_web") {
          return ok({ resource: resources[1] } as T);
        }
        return err(domainError.notFound("resource", "res_missing"));
      },
    });

    expect(await resolveOperateTarget(context([]), {})).toEqual({
      state: "empty",
      resources: [],
    });
    expect(
      await resolveOperateTarget(context([resources[0] as Record<string, unknown>]), {}),
    ).toEqual({
      state: "selected",
      resourceId: "res_api",
      resources: [resources[0]],
    });
    expect(await resolveOperateTarget(context(resources), {})).toEqual({
      state: "selection-required",
      resources,
    });
    expect(await resolveOperateTarget(context(resources), { resourceId: "res_web" })).toEqual({
      state: "selected",
      resourceId: "res_web",
      resources: [resources[1]],
    });
    await expect(
      resolveOperateTarget(context(resources), { resourceId: "res_missing" }),
    ).rejects.toMatchObject({
      code: "operate_target_not_found",
      retryable: false,
      details: { phase: "operate-selection" },
    });
  });

  test("[OPR-SNAPSHOT-002][OPR-PARTIAL-003][OPR-NOTIFY-014][OPR-PORTABILITY-015] composes one bounded snapshot from existing operation owners", async () => {
    const observedAt = "2026-08-13T00:00:00.000Z";
    const queries: Query<unknown>[] = [];
    const coordinator = createOperateCoordinator({ now: () => observedAt });
    const snapshot = await coordinator.snapshot(
      {
        executeCommand: async () => ok({}),
        executeQuery: async <T>(query: Query<T>) => {
          queries.push(query as Query<unknown>);
          if (query instanceof ShowResourceQuery) {
            return ok({
              schemaVersion: "resources.show/v1",
              resource: {
                id: "res_api",
                projectId: "prj_1",
                environmentId: "env_prod",
                name: "api",
                slug: "api",
                kind: "application",
                createdAt: observedAt,
                services: [],
                deploymentCount: 1,
                lastDeploymentId: "dep_failed",
                lastDeploymentStatus: "failed",
              },
              latestDeployment: {
                id: "dep_failed",
                status: "failed",
                createdAt: observedAt,
              },
              lifecycle: { status: "active" },
              diagnostics: [],
              generatedAt: observedAt,
            } as T);
          }
          if (query instanceof ResourceHealthQuery) {
            return err(
              domainError.providerCapabilityUnsupported("Health provider unavailable", {
                phase: "resource-health",
                secret: "must-not-render",
              }),
            );
          }
          if (query instanceof ResourceDiagnosticSummaryQuery) {
            return ok({ schemaVersion: "resources.diagnostic-summary/v1", status: "failed" } as T);
          }
          if (query instanceof ResourceRuntimeLogsQuery) {
            return ok({
              schemaVersion: "resources.runtime-logs/v1",
              lines: [{ timestamp: observedAt, stream: "stderr", message: "boot failed" }],
            } as T);
          }
          if (query instanceof RuntimeMonitoringRollupQuery) {
            return ok({ schemaVersion: "runtime-monitoring.rollup/v1", partial: false } as T);
          }
          if (query instanceof DeploymentTimelineQuery) {
            return ok({ schemaVersion: "deployments.timeline/v1", items: [] } as T);
          }
          if (query instanceof DeploymentRecoveryReadinessQuery) {
            return ok({
              schemaVersion: "deployments.recovery-readiness/v1",
              deploymentId: "dep_failed",
              resourceId: "res_api",
              generatedAt: observedAt,
              stateVersion: "v1",
              recoverable: true,
              retryable: true,
              redeployable: true,
              rollbackReady: true,
              rollbackCandidateCount: 1,
              retry: {
                allowed: true,
                commandActive: true,
                reasons: [],
                targetOperation: "deployments.retry",
              },
              redeploy: {
                allowed: true,
                commandActive: true,
                reasons: [],
                targetOperation: "deployments.redeploy",
              },
              rollback: {
                allowed: true,
                commandActive: true,
                reasons: [],
                recommendedCandidateId: "dep_good",
                candidates: [
                  {
                    deploymentId: "dep_good",
                    finishedAt: observedAt,
                    status: "succeeded",
                    rollbackReady: true,
                    reasons: [],
                  },
                ],
              },
              recommendedActions: [],
            } as T);
          }
          if (query instanceof DeploymentProofQuery) {
            return ok({ schemaVersion: "deployments.proof/v1", verdict: "failed" } as T);
          }
          if (query instanceof ListStorageVolumesQuery) {
            return ok({
              schemaVersion: "storage-volumes.list/v1",
              generatedAt: observedAt,
              items: [
                {
                  id: "vol_data",
                  projectId: "prj_1",
                  environmentId: "env_prod",
                  name: "data",
                  slug: "data",
                  kind: "directory",
                  lifecycleStatus: "active",
                  attachmentCount: 1,
                  attachments: [
                    {
                      attachmentId: "att_1",
                      resourceId: "res_api",
                      destinationPath: "/data",
                      mountMode: "read-write",
                      attachedAt: observedAt,
                    },
                  ],
                  createdAt: observedAt,
                },
              ],
            } as T);
          }
          if (query instanceof ListStorageVolumeBackupsQuery) {
            return ok({
              schemaVersion: "storage-volumes.backups.list/v1",
              generatedAt: observedAt,
              items: [],
            } as T);
          }
          if (query instanceof ListStorageVolumeBackupPoliciesQuery) {
            return ok({ schemaVersion: "storage-volume-backup-policies.list/v1", items: [] } as T);
          }
          if (query instanceof ShowRuntimeMonitoringThresholdsQuery) {
            return ok({
              schemaVersion: "runtime-monitoring-thresholds.read/v1",
              state: "not-configured",
            } as T);
          }
          if (query instanceof ControlPlanePortabilityExportPlanQuery) {
            return ok({
              schemaVersion: "control-plane.portability.export-plan/v1",
              ready: true,
            } as T);
          }
          if (query instanceof ListControlPlanePortabilityArtifactsQuery) {
            return ok({
              schemaVersion: "control-plane.portability.artifacts.list/v1",
              items: [],
            } as T);
          }
          throw new Error(`unexpected query ${query.constructor.name}`);
        },
      },
      { resourceId: "res_api" },
    );

    expect(snapshot).toMatchObject({
      protocol: "operate/v1",
      observedAt,
      target: { resourceId: "res_api", deploymentId: "dep_failed" },
      sections: {
        health: {
          availability: "unavailable",
          error: {
            code: "provider_capability_unsupported",
            phase: "resource-health",
            retryable: false,
          },
        },
        diagnostics: { availability: "available" },
        logs: { availability: "available" },
        monitoring: { availability: "available" },
        recovery: { availability: "available" },
        storage: { availability: "available" },
        notifications: { availability: "available" },
        portability: {
          availability: "available",
          value: { handoff: "appaloft instance portability export-plan" },
        },
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain("must-not-render");
    expect(queries.some((query) => query instanceof ListResourcesQuery)).toBe(false);
    const monitoring = queries.find(
      (query): query is RuntimeMonitoringRollupQuery =>
        query instanceof RuntimeMonitoringRollupQuery,
    );
    expect(monitoring?.input.scope).toEqual({ kind: "resource", resourceId: "res_api" });
  });
});
