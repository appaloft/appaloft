import { describe, expect, test } from "vitest";

import {
  type BlueprintInstallProgressSnapshot,
  operatorWorkEnvelopeProgressEvents,
  summarizeBlueprintInstallProgress,
} from "./blueprint-install-progress";

describe("Blueprint install progress helpers", () => {
  test("[CLOUD-BLUEPRINT-QD-030] treats accepted queued install as running, not deployment success", () => {
    const snapshot: BlueprintInstallProgressSnapshot = {
      schemaVersion: "appaloft.cloud.installed-application.command-result/v1",
      applicationId: "cia_demo",
      executionStatus: "installing",
      monitoring: {
        workId: "dw_blueprint_install_cia_demo",
        workIds: ["dw_blueprint_install_cia_demo"],
        deploymentIds: [],
        commands: {
          showWork: "appaloft work show dw_blueprint_install_cia_demo",
        },
      },
      installedApplication: {
        applicationId: "cia_demo",
        status: "installing",
        components: [
          {
            resource: { status: "planned" } as { resourceId?: string },
            deployment: { status: "planned", reason: "blueprint-install" },
            endpoints: [],
          },
        ],
      },
      progress: {
        applicationId: "cia_demo",
        status: "installing",
        userStatus: "running",
        currentStep: "queued",
        message: "Application install was accepted and is waiting for the worker.",
        componentDeployments: [],
        deploymentIds: [],
        operatorWorkId: "dw_blueprint_install_cia_demo",
      } as BlueprintInstallProgressSnapshot["progress"],
    };

    expect(summarizeBlueprintInstallProgress(snapshot)).toMatchObject({
      applicationId: "cia_demo",
      executionStatus: "installing",
      userStatus: "running",
      terminalStatus: "running",
      operatorWorkId: "dw_blueprint_install_cia_demo",
      deploymentIds: [],
      deploymentId: "",
      currentStep: "queued",
      message: "Application install was accepted and is waiting for the worker.",
      failureReason: "",
    });
  });

  test("[CLOUD-BLUEPRINT-QD-031] maps operator work events into progress rows", () => {
    const progressEvents = operatorWorkEnvelopeProgressEvents([
      {
        schemaVersion: "operator-work.stream-events/v1",
        kind: "accepted",
        event: {
          workId: "dw_blueprint_install_cia_demo",
          sequence: 1,
          cursor: "dw_blueprint_install_cia_demo:1",
          emittedAt: "2026-06-11T01:55:49.517Z",
          kind: "accepted",
          status: "pending",
          operationKey: "blueprints.install",
          workKind: "blueprint-install",
          phase: "install-execution",
          step: "queued",
          message: "Blueprint install accepted",
        },
      },
      {
        schemaVersion: "operator-work.stream-events/v1",
        kind: "failed",
        event: {
          workId: "dw_blueprint_install_cia_demo",
          sequence: 2,
          cursor: "dw_blueprint_install_cia_demo:2",
          emittedAt: "2026-06-11T01:55:59.517Z",
          kind: "failed",
          status: "failed",
          operationKey: "blueprints.install",
          workKind: "blueprint-install",
          phase: "install-execution",
          step: "rollback-required",
          workerGroup: "appaloft-cloud-production-worker",
          workerId: "appaloft-cloud-production-worker-replica-2",
          errorCode: "blueprint_install_failed",
          safeDetails: {
            failure_code: "resource_slug_conflict",
            failure_phase: "resource-admission",
            failure_operation: "CreateResourceCommand",
          },
        },
      },
    ]);

    expect(progressEvents).toMatchObject([
      {
        phase: "detect",
        status: "running",
        level: "info",
        message: "Blueprint install accepted · step: queued",
      },
      {
        phase: "verify",
        status: "failed",
        level: "error",
        message:
          "step: rollback-required · worker: appaloft-cloud-production-worker/appaloft-cloud-production-worker-replica-2 · error: blueprint_install_failed · failure: resource_slug_conflict · phase: resource-admission · operation: CreateResourceCommand",
      },
    ]);
  });

  test("[CLOUD-BLUEPRINT-QD-032] treats rollback-required install readback as failed even without deployment ids", () => {
    const snapshot: BlueprintInstallProgressSnapshot = {
      schemaVersion: "appaloft.cloud.installed-application.command-result/v1",
      applicationId: "cia_failed",
      executionStatus: "rollback-required",
      monitoring: {
        workId: "dw_blueprint_install_cia_failed",
        deploymentIds: [],
      },
      installedApplication: {
        applicationId: "cia_failed",
        status: "rollback-required",
        components: [
          {
            resource: { resourceId: "res_failed" },
            deployment: { status: "planned", reason: "blueprint-install" },
            endpoints: [],
          },
        ],
      },
      progress: {
        status: "rollback-required",
        userStatus: "failed",
        currentStep: "rollback-required",
        message: "Blueprint install failed before deployment creation.",
        deploymentIds: [],
        operatorWorkId: "dw_blueprint_install_cia_failed",
      },
    };

    expect(summarizeBlueprintInstallProgress(snapshot)).toMatchObject({
      applicationId: "cia_failed",
      executionStatus: "rollback-required",
      userStatus: "failed",
      terminalStatus: "failed",
      operatorWorkId: "dw_blueprint_install_cia_failed",
      deploymentIds: [],
      deploymentId: "",
      resourceId: "res_failed",
      currentStep: "rollback-required",
      failureReason: "rollback-required",
    });
  });
});
