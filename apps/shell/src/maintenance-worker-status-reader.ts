import {
  createDurableWorkTopology,
  type DurableWorkWorkerHeartbeatStore,
  type ExecutionContextFactory,
  type MaintenanceWorkerActivation,
  type MaintenanceWorkerRuntimeHeartbeat,
  type MaintenanceWorkerSafetyMode,
  type MaintenanceWorkerStatus,
  type MaintenanceWorkerStatusReader,
  toRepositoryContext,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";

const DEFAULT_DURABLE_WORKER_HEARTBEAT_STALE_AFTER_SECONDS = 15;

export type DurableWorkerHeartbeatSnapshotProvider = (
  workerGroup: string,
) => Promise<MaintenanceWorkerRuntimeHeartbeat | undefined>;

export function createDurableWorkerHeartbeatSnapshotProvider(input: {
  heartbeatStore: DurableWorkWorkerHeartbeatStore;
  executionContextFactory: ExecutionContextFactory;
  staleAfterSeconds?: number;
  now?: () => string;
}): DurableWorkerHeartbeatSnapshotProvider {
  const staleAfterSeconds =
    input.staleAfterSeconds ?? DEFAULT_DURABLE_WORKER_HEARTBEAT_STALE_AFTER_SECONDS;
  return async (workerGroup) => {
    const context = input.executionContextFactory.create({
      entrypoint: "system",
      actor: {
        kind: "system",
        id: "maintenance-worker-status-reader",
        label: "Maintenance worker status reader",
      },
    });
    const heartbeats = await input.heartbeatStore.listHeartbeats(toRepositoryContext(context), {
      workerGroup,
    });
    if (heartbeats.isErr()) {
      return undefined;
    }

    const nowMs = Date.parse(input.now?.() ?? new Date().toISOString());
    const staleAfterMs = staleAfterSeconds * 1000;
    const workers = heartbeats.value.map((heartbeat) => {
      const lastSeenMs = Date.parse(heartbeat.lastSeenAt);
      const online =
        heartbeat.status === "online" &&
        Number.isFinite(lastSeenMs) &&
        Number.isFinite(nowMs) &&
        nowMs - lastSeenMs <= staleAfterMs;
      return {
        workerId: heartbeat.workerId,
        workerGroup: heartbeat.workerGroup,
        slot: heartbeat.slot,
        status: heartbeat.status,
        online,
        lastSeenAt: heartbeat.lastSeenAt,
      };
    });

    return {
      staleAfterSeconds,
      onlineWorkerCount: workers.filter((worker) => worker.online).length,
      staleWorkerCount: workers.filter((worker) => !worker.online).length,
      ...(workers[0]?.lastSeenAt ? { lastSeenAt: workers[0].lastSeenAt } : {}),
      workers,
    };
  };
}

function activation(enabled: boolean): MaintenanceWorkerActivation {
  return enabled ? "starts-with-backend-service" : "disabled-by-config";
}

function status(input: {
  key: MaintenanceWorkerStatus["key"];
  label: string;
  enabled: boolean;
  safetyMode: MaintenanceWorkerSafetyMode;
  intervalSeconds: number;
  batchSize?: number;
  defaultRetryDelaySeconds?: number;
  rawRetentionHours?: number;
  runtimeTopology?: MaintenanceWorkerStatus["runtimeTopology"];
  observedRuntimeHeartbeats?: MaintenanceWorkerStatus["observedRuntimeHeartbeats"];
  activation?: MaintenanceWorkerActivation;
  configurationKeys: string[];
  operationKeys: string[];
}): MaintenanceWorkerStatus {
  return {
    key: input.key,
    label: input.label,
    enabled: input.enabled,
    activation: input.activation ?? activation(input.enabled),
    safetyMode: input.safetyMode,
    intervalSeconds: input.intervalSeconds,
    ...(input.batchSize !== undefined ? { batchSize: input.batchSize } : {}),
    ...(input.defaultRetryDelaySeconds !== undefined
      ? { defaultRetryDelaySeconds: input.defaultRetryDelaySeconds }
      : {}),
    ...(input.rawRetentionHours !== undefined
      ? { rawRetentionHours: input.rawRetentionHours }
      : {}),
    ...(input.runtimeTopology ? { runtimeTopology: input.runtimeTopology } : {}),
    ...(input.observedRuntimeHeartbeats
      ? { observedRuntimeHeartbeats: input.observedRuntimeHeartbeats }
      : {}),
    configurationKeys: input.configurationKeys,
    operationKeys: input.operationKeys,
  };
}

async function durableWorkerRuntimeStatus(
  config: AppConfig,
  heartbeatProvider?: DurableWorkerHeartbeatSnapshotProvider,
): Promise<MaintenanceWorkerStatus> {
  const { workerRuntime } = config;
  const topology = createDurableWorkTopology(workerRuntime);
  const workerIds = topology.isOk()
    ? topology.value.workers.map((worker) => worker.workerId)
    : Array.from(
        { length: workerRuntime.mode === "disabled" ? 0 : workerRuntime.workerCount },
        (_, index) => `${workerRuntime.workerGroup}-${index + 1}`,
      );
  const enabled = workerRuntime.mode !== "disabled";
  const heartbeat =
    enabled && heartbeatProvider ? await heartbeatProvider(workerRuntime.workerGroup) : undefined;
  const observedRuntimeHeartbeats = heartbeatProvider
    ? (
        await Promise.all(
          config.workerRuntimeObservedGroups.map(async (observed) => ({
            workerGroup: observed.workerGroup,
            workerCount: observed.workerCount,
            workerIds: Array.from(
              { length: observed.workerCount },
              (_, index) => `${observed.workerGroup}-${index + 1}`,
            ),
            heartbeat: await heartbeatProvider(observed.workerGroup),
          })),
        )
      ).map((observed) => ({
        workerGroup: observed.workerGroup,
        workerCount: observed.workerCount,
        workerIds: observed.workerIds,
        ...(observed.heartbeat ? { heartbeat: observed.heartbeat } : {}),
      }))
    : config.workerRuntimeObservedGroups.map((observed) => ({
        workerGroup: observed.workerGroup,
        workerCount: observed.workerCount,
        workerIds: Array.from(
          { length: observed.workerCount },
          (_, index) => `${observed.workerGroup}-${index + 1}`,
        ),
      }));

  return status({
    key: "durable-worker-runtime",
    label: "Durable worker runtime",
    enabled,
    activation:
      workerRuntime.mode === "standalone" ? "starts-as-standalone-process" : activation(enabled),
    safetyMode: "durable-process-delivery",
    intervalSeconds: 0,
    runtimeTopology: {
      mode: workerRuntime.mode,
      queueBackend: workerRuntime.queueBackend,
      workerCount: workerIds.length,
      workerGroup: workerRuntime.workerGroup,
      workerIds,
      coordinationRole: topology.isOk() ? topology.value.coordinationRole : "disabled",
      ...(heartbeat ? { heartbeat } : {}),
      ...(workerRuntime.externalBackendKind
        ? { externalBackendKind: workerRuntime.externalBackendKind }
        : {}),
    },
    ...(observedRuntimeHeartbeats.length > 0 ? { observedRuntimeHeartbeats } : {}),
    configurationKeys: [
      "APPALOFT_WORKER_RUNTIME_MODE",
      "APPALOFT_WORKER_QUEUE_BACKEND",
      "APPALOFT_WORKER_COUNT",
      "APPALOFT_WORKER_GROUP",
      "APPALOFT_WORKER_EXTERNAL_BACKEND_KIND",
      "APPALOFT_WORKER_OBSERVED_GROUPS",
    ],
    operationKeys: [
      "deployments.create",
      "deployments.retry",
      "deployments.rollback",
      "operator-work.*",
    ],
  });
}

export class ConfigMaintenanceWorkerStatusReader implements MaintenanceWorkerStatusReader {
  constructor(
    private readonly config: AppConfig,
    private readonly heartbeatProvider?: DurableWorkerHeartbeatSnapshotProvider,
  ) {}

  async list(): Promise<MaintenanceWorkerStatus[]> {
    const {
      certificateRetryScheduler,
      previewExpiryCleanupScheduler,
      previewCleanupRetryScheduler,
      scheduledTaskRunner,
      scheduledRuntimePruneRunner,
      scheduledHistoryRetentionRunner,
      runtimeMonitoringCollectorRunner,
    } = this.config;

    return [
      await durableWorkerRuntimeStatus(this.config, this.heartbeatProvider),
      status({
        key: "certificate-retry-scheduler",
        label: "Certificate retry scheduler",
        enabled: certificateRetryScheduler.enabled,
        safetyMode: "certificate-retry",
        intervalSeconds: certificateRetryScheduler.intervalSeconds,
        batchSize: certificateRetryScheduler.batchSize,
        defaultRetryDelaySeconds: certificateRetryScheduler.defaultRetryDelaySeconds,
        configurationKeys: [
          "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_ENABLED",
          "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_INTERVAL_SECONDS",
          "APPALOFT_CERTIFICATE_RETRY_DEFAULT_DELAY_SECONDS",
          "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_BATCH_SIZE",
        ],
        operationKeys: ["certificates.issue-or-renew"],
      }),
      status({
        key: "preview-cleanup-retry-scheduler",
        label: "Preview cleanup retry scheduler",
        enabled: previewCleanupRetryScheduler.enabled,
        safetyMode: "preview-cleanup-retry",
        intervalSeconds: previewCleanupRetryScheduler.intervalSeconds,
        batchSize: previewCleanupRetryScheduler.batchSize,
        configurationKeys: [
          "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_ENABLED",
          "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_INTERVAL_SECONDS",
          "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_BATCH_SIZE",
        ],
        operationKeys: ["deployments.cleanup-preview"],
      }),
      status({
        key: "preview-expiry-cleanup-scheduler",
        label: "Preview expiry cleanup scheduler",
        enabled: previewExpiryCleanupScheduler.enabled,
        safetyMode: "preview-expiry-cleanup",
        intervalSeconds: previewExpiryCleanupScheduler.intervalSeconds,
        batchSize: previewExpiryCleanupScheduler.batchSize,
        configurationKeys: [
          "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_ENABLED",
          "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_INTERVAL_SECONDS",
          "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_BATCH_SIZE",
        ],
        operationKeys: ["preview-environments.delete", "deployments.cleanup-preview"],
      }),
      status({
        key: "scheduled-task-runner",
        label: "Scheduled task runner",
        enabled: scheduledTaskRunner.enabled,
        safetyMode: "runtime-execution",
        intervalSeconds: scheduledTaskRunner.intervalSeconds,
        batchSize: scheduledTaskRunner.batchSize,
        configurationKeys: [
          "APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED",
          "APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS",
          "APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE",
        ],
        operationKeys: ["scheduled-tasks.run-now", "scheduled-task-runs.run-due"],
      }),
      status({
        key: "scheduled-runtime-prune-runner",
        label: "Scheduled runtime prune runner",
        enabled: scheduledRuntimePruneRunner.enabled,
        safetyMode: "policy-gated-prune",
        intervalSeconds: scheduledRuntimePruneRunner.intervalSeconds,
        batchSize: scheduledRuntimePruneRunner.batchSize,
        configurationKeys: [
          "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_ENABLED",
          "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_INTERVAL_SECONDS",
          "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_BATCH_SIZE",
        ],
        operationKeys: ["servers.capacity.prune"],
      }),
      status({
        key: "scheduled-history-retention-runner",
        label: "Scheduled history retention runner",
        enabled: scheduledHistoryRetentionRunner.enabled,
        safetyMode: "policy-gated-retention",
        intervalSeconds: scheduledHistoryRetentionRunner.intervalSeconds,
        batchSize: scheduledHistoryRetentionRunner.batchSize,
        configurationKeys: [
          "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED",
          "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS",
          "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_BATCH_SIZE",
        ],
        operationKeys: [
          "audit-events.prune",
          "deployments.logs.prune",
          "domain-events.prune",
          "operator-work.prune",
          "provider-job-logs.prune",
          "resources.runtime-log-archives.prune",
          "runtime-monitoring.samples.prune",
        ],
      }),
      status({
        key: "runtime-monitoring-collector-runner",
        label: "Runtime monitoring collector runner",
        enabled: runtimeMonitoringCollectorRunner.enabled,
        safetyMode: "read-only-collection",
        intervalSeconds: runtimeMonitoringCollectorRunner.intervalSeconds,
        batchSize: runtimeMonitoringCollectorRunner.batchSize,
        rawRetentionHours: runtimeMonitoringCollectorRunner.rawRetentionHours,
        configurationKeys: [
          "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED",
          "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_INTERVAL_SECONDS",
          "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_BATCH_SIZE",
          "APPALOFT_RUNTIME_MONITORING_RAW_RETENTION_HOURS",
        ],
        operationKeys: ["runtime-monitoring.collect"],
      }),
    ];
  }
}
