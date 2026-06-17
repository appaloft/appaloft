import { describe, expect, test } from "vitest";

import {
  type BlueprintInstallProgressSnapshot,
  operatorWorkReadableFailure,
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
      } as BlueprintInstallProgressSnapshot["progress"],
    };

    expect(summarizeBlueprintInstallProgress(snapshot)).toMatchObject({
      applicationId: "cia_demo",
      executionStatus: "installing",
      userStatus: "running",
      terminalStatus: "running",
      deploymentIds: [],
      deploymentId: "",
      currentStep: "queued",
      message: "Application install was accepted and is waiting for the worker.",
      failureReason: "",
    });
  });

  test("[CLOUD-BLUEPRINT-QD-034] maps operator work show terminal failure into readable diagnostics", () => {
    const work = {
      id: "dw_blueprint_install_cia_failed",
      kind: "blueprint-install" as const,
      status: "failed" as const,
      operationKey: "blueprints.install",
      phase: "install-execution",
      step: "rollback-required",
      updatedAt: "2026-06-14T07:05:54.923Z",
      errorCode: "execution_failed",
      errorCategory: "infra",
      retriable: false,
      nextActions: ["no-action" as const],
      safeDetails: {
        failure_code: "resource_slug_conflict",
        failure_phase: "resource-admission",
        failure_operation: "CreateResourceCommand",
      },
    };

    expect(operatorWorkReadableFailure(work)).toMatchObject({
      title: "资源名称冲突",
      detail: "资源名称已经被占用，创建资源时失败。",
      recovery: "请换一个资源名称，或选择复用已有资源后重新安装。",
      code: "resource_slug_conflict",
      phase: "resource-admission",
      operation: "CreateResourceCommand",
    });
  });

  test("[CLOUD-BLUEPRINT-QD-035] reads the primary timeline handle from monitoring deploymentId", () => {
    const snapshot: BlueprintInstallProgressSnapshot = {
      schemaVersion: "appaloft.cloud.installed-application.command-result/v1",
      applicationId: "cia_timeline",
      executionStatus: "installing",
      monitoring: {
        workId: "dw_blueprint_install_cia_timeline",
        deploymentId: "dep_timeline_primary",
        deploymentIds: [],
      },
      installedApplication: {
        applicationId: "cia_timeline",
        status: "installing",
        components: [
          {
            resource: { resourceId: "res_timeline" },
            deployment: { status: "planned", reason: "blueprint-install" },
            endpoints: [],
          },
        ],
      },
      progress: {
        status: "installing",
        userStatus: "running",
        currentStep: "deploying-components",
        message: "Application components are being deployed.",
        deploymentIds: [],
      },
    };

    expect(summarizeBlueprintInstallProgress(snapshot)).toMatchObject({
      deploymentId: "dep_timeline_primary",
      deploymentIds: ["dep_timeline_primary"],
      currentStep: "deploying-components",
      terminalStatus: "running",
    });
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
      },
    };

    expect(summarizeBlueprintInstallProgress(snapshot)).toMatchObject({
      applicationId: "cia_failed",
      executionStatus: "rollback-required",
      userStatus: "failed",
      terminalStatus: "failed",
      deploymentIds: [],
      deploymentId: "",
      resourceId: "res_failed",
      currentStep: "rollback-required",
      failureReason: "rollback-required",
    });
  });

  test("[CLOUD-BLUEPRINT-QD-033] treats failed component deployment readback as install failure", () => {
    const snapshot: BlueprintInstallProgressSnapshot = {
      schemaVersion: "appaloft.cloud.installed-application.command-result/v1",
      applicationId: "cia_component_failed",
      executionStatus: "installing",
      monitoring: {
        workId: "dw_blueprint_install_cia_component_failed",
        deploymentIds: ["dep_component_failed"],
      },
      installedApplication: {
        applicationId: "cia_component_failed",
        status: "installing",
        components: [
          {
            resource: { resourceId: "res_component_failed" },
            deployment: {
              deploymentId: "dep_component_failed",
              status: "failed",
              reason: "deploy failed",
            },
            endpoints: [],
          },
        ],
      },
      progress: {
        status: "installing",
        userStatus: "running",
        currentStep: "deploy-component-readback",
        deploymentIds: ["dep_component_failed"],
      },
    };

    expect(summarizeBlueprintInstallProgress(snapshot)).toMatchObject({
      applicationId: "cia_component_failed",
      executionStatus: "installing",
      userStatus: "running",
      terminalStatus: "failed",
      deploymentId: "dep_component_failed",
      resourceId: "res_component_failed",
      currentStep: "deploy-component-readback",
      failureReason: "deploy failed",
    });
  });
});
