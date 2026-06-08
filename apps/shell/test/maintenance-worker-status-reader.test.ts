import "../../../packages/application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolveConfig } from "@appaloft/config";

import { ConfigMaintenanceWorkerStatusReader } from "../src/maintenance-worker-status-reader";

describe("ConfigMaintenanceWorkerStatusReader", () => {
  test("[SCHED-MAINT-WORKER-001] exposes scheduled maintenance worker defaults to doctor", () => {
    const reader = new ConfigMaintenanceWorkerStatusReader(resolveConfig());

    expect(reader.list()).toMatchObject([
      {
        key: "durable-worker-runtime",
        enabled: true,
        activation: "starts-with-backend-service",
        intervalSeconds: 0,
        safetyMode: "durable-process-delivery",
        runtimeTopology: {
          mode: "embedded",
          queueBackend: "database",
          workerCount: 1,
          workerGroup: "appaloft-worker",
          workerIds: ["appaloft-worker-1"],
          coordinationRole: "coordinator",
        },
        configurationKeys: [
          "APPALOFT_WORKER_RUNTIME_MODE",
          "APPALOFT_WORKER_QUEUE_BACKEND",
          "APPALOFT_WORKER_COUNT",
          "APPALOFT_WORKER_GROUP",
          "APPALOFT_WORKER_EXTERNAL_BACKEND_KIND",
        ],
        operationKeys: [
          "deployments.create",
          "deployments.retry",
          "deployments.rollback",
          "operator-work.*",
        ],
      },
      {
        key: "certificate-retry-scheduler",
        enabled: true,
        activation: "starts-with-backend-service",
        intervalSeconds: 300,
        batchSize: 25,
        defaultRetryDelaySeconds: 300,
        safetyMode: "certificate-retry",
        configurationKeys: [
          "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_ENABLED",
          "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_INTERVAL_SECONDS",
          "APPALOFT_CERTIFICATE_RETRY_DEFAULT_DELAY_SECONDS",
          "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_BATCH_SIZE",
        ],
        operationKeys: ["certificates.issue-or-renew"],
      },
      {
        key: "preview-cleanup-retry-scheduler",
        enabled: false,
        activation: "disabled-by-config",
        intervalSeconds: 300,
        batchSize: 25,
        safetyMode: "preview-cleanup-retry",
        configurationKeys: [
          "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_ENABLED",
          "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_INTERVAL_SECONDS",
          "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_BATCH_SIZE",
        ],
        operationKeys: ["deployments.cleanup-preview"],
      },
      {
        key: "preview-expiry-cleanup-scheduler",
        enabled: false,
        activation: "disabled-by-config",
        intervalSeconds: 300,
        batchSize: 25,
        safetyMode: "preview-expiry-cleanup",
        configurationKeys: [
          "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_ENABLED",
          "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_INTERVAL_SECONDS",
          "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_BATCH_SIZE",
        ],
        operationKeys: ["preview-environments.delete", "deployments.cleanup-preview"],
      },
      {
        key: "scheduled-task-runner",
        enabled: false,
        activation: "disabled-by-config",
        intervalSeconds: 60,
        batchSize: 25,
        safetyMode: "runtime-execution",
        configurationKeys: [
          "APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED",
          "APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS",
          "APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE",
        ],
        operationKeys: ["scheduled-tasks.run-now", "scheduled-task-runs.run-due"],
      },
      {
        key: "scheduled-runtime-prune-runner",
        enabled: false,
        activation: "disabled-by-config",
        intervalSeconds: 3600,
        batchSize: 25,
        safetyMode: "policy-gated-prune",
        configurationKeys: [
          "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_ENABLED",
          "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_INTERVAL_SECONDS",
          "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_BATCH_SIZE",
        ],
        operationKeys: ["servers.capacity.prune"],
      },
      {
        key: "scheduled-history-retention-runner",
        enabled: false,
        activation: "disabled-by-config",
        intervalSeconds: 3600,
        safetyMode: "policy-gated-retention",
        configurationKeys: [
          "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED",
          "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS",
          "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_BATCH_SIZE",
        ],
      },
      {
        key: "runtime-monitoring-collector-runner",
        enabled: false,
        activation: "disabled-by-config",
        intervalSeconds: 60,
        batchSize: 25,
        rawRetentionHours: 24,
        safetyMode: "read-only-collection",
        configurationKeys: [
          "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED",
          "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_INTERVAL_SECONDS",
          "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_BATCH_SIZE",
          "APPALOFT_RUNTIME_MONITORING_RAW_RETENTION_HOURS",
        ],
        operationKeys: ["runtime-monitoring.collect"],
      },
    ]);
    const certificateRetryScheduler = reader
      .list()
      .find((entry) => entry.key === "certificate-retry-scheduler");
    expect(certificateRetryScheduler?.operationKeys).not.toContain("certificates.retry");
  });

  test("[SCHED-MAINT-WORKER-002] reflects environment-enabled runner status", () => {
    const reader = new ConfigMaintenanceWorkerStatusReader(
      resolveConfig({
        env: {
          APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED: "true",
          APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS: "15",
          APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE: "3",
          APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED: "true",
          APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_INTERVAL_SECONDS: "90",
          APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_BATCH_SIZE: "4",
          APPALOFT_RUNTIME_MONITORING_RAW_RETENTION_HOURS: "6",
          APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_ENABLED: "true",
          APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_INTERVAL_SECONDS: "45",
          APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_BATCH_SIZE: "8",
          APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED: "true",
          APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS: "120",
          APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_BATCH_SIZE: "5",
          APPALOFT_WORKER_RUNTIME_MODE: "standalone",
          APPALOFT_WORKER_QUEUE_BACKEND: "database",
          APPALOFT_WORKER_COUNT: "3",
          APPALOFT_WORKER_GROUP: "cloud-deployment-worker",
        },
      }),
    );

    const statuses = new Map(reader.list().map((entry) => [entry.key, entry]));

    expect(statuses.get("durable-worker-runtime")).toMatchObject({
      enabled: true,
      activation: "starts-as-standalone-process",
      intervalSeconds: 0,
      safetyMode: "durable-process-delivery",
      runtimeTopology: {
        mode: "standalone",
        queueBackend: "database",
        workerCount: 3,
        workerGroup: "cloud-deployment-worker",
        workerIds: [
          "cloud-deployment-worker-1",
          "cloud-deployment-worker-2",
          "cloud-deployment-worker-3",
        ],
        coordinationRole: "coordinator",
      },
    });
    expect(statuses.get("scheduled-task-runner")).toMatchObject({
      enabled: true,
      activation: "starts-with-backend-service",
      intervalSeconds: 15,
      batchSize: 3,
      configurationKeys: [
        "APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED",
        "APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS",
        "APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE",
      ],
    });
    expect(statuses.get("runtime-monitoring-collector-runner")).toMatchObject({
      enabled: true,
      activation: "starts-with-backend-service",
      intervalSeconds: 90,
      batchSize: 4,
      rawRetentionHours: 6,
    });
    expect(statuses.get("preview-expiry-cleanup-scheduler")).toMatchObject({
      enabled: true,
      activation: "starts-with-backend-service",
      intervalSeconds: 45,
      batchSize: 8,
    });
    expect(statuses.get("scheduled-history-retention-runner")).toMatchObject({
      enabled: true,
      activation: "starts-with-backend-service",
      intervalSeconds: 120,
      batchSize: 5,
      configurationKeys: [
        "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED",
        "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS",
        "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_BATCH_SIZE",
      ],
    });
  });

  test("[PROC-DELIVERY-WORKER-012] reports disabled durable runtime without worker slots", () => {
    const reader = new ConfigMaintenanceWorkerStatusReader(
      resolveConfig({
        env: {
          APPALOFT_WORKER_RUNTIME_MODE: "disabled",
          APPALOFT_WORKER_COUNT: "0",
        },
      }),
    );

    expect(reader.list().find((entry) => entry.key === "durable-worker-runtime")).toMatchObject({
      enabled: false,
      activation: "disabled-by-config",
      safetyMode: "durable-process-delivery",
      runtimeTopology: {
        mode: "disabled",
        queueBackend: "database",
        workerCount: 0,
        workerGroup: "appaloft-worker",
        workerIds: [],
        coordinationRole: "disabled",
      },
    });
  });

  test("[SCHED-MAINT-WORKER-001] public docs identify the default-on worker exception", () => {
    const englishDocs = readFileSync(
      "apps/docs/src/content/docs/en/reference/configuration.md",
      "utf8",
    );
    const defaultDocs = readFileSync(
      "apps/docs/src/content/docs/reference/configuration.md",
      "utf8",
    );

    expect(englishDocs).toContain("certificate retry scheduler is the default-on exception");
    expect(englishDocs).toContain("Durable worker runtime");
    expect(englishDocs).toContain("appaloft worker");
    expect(englishDocs).toContain("runtime prune");
    expect(englishDocs).toContain("preview cleanup workers stay disabled");
    expect(defaultDocs).toContain("certificate retry scheduler 是默认开启的例外");
    expect(defaultDocs).toContain("Durable worker runtime");
    expect(defaultDocs).toContain("appaloft worker");
    expect(defaultDocs).toContain("preview cleanup worker 都保持默认关闭");
  });
});
