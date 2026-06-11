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
          errorCode: "blueprint_install_failed",
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
        message: "step: rollback-required · error: blueprint_install_failed",
      },
    ]);
  });
});
