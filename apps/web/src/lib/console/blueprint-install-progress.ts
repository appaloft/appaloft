import { type OperatorWorkItem } from "@appaloft/contracts";

export type BlueprintInstallExecutionStatus =
  | "accepted"
  | "installing"
  | "ready"
  | "failed"
  | "rollback-required"
  | "rolled-back"
  | string;

export type BlueprintInstallProgressSnapshot = {
  schemaVersion?: string;
  applicationId?: string;
  executionStatus?: BlueprintInstallExecutionStatus;
  monitoring?: {
    workId?: string;
    workIds?: readonly string[];
    deploymentId?: string;
    deploymentIds?: readonly string[];
    commands?: {
      showWork?: string;
    };
  };
  installedApplication?: {
    applicationId?: string;
    status?: BlueprintInstallExecutionStatus;
    components?: readonly {
      resource?: { resourceId?: string };
      deployment?: { deploymentId?: string; status?: string; reason?: string };
      endpoints?: readonly { url?: string }[];
    }[];
    executionFailure?: {
      code?: string;
      reason?: string;
      details?: Record<string, unknown>;
    };
  };
  progress?: {
    status?: BlueprintInstallExecutionStatus;
    userStatus?: "running" | "succeeded" | "failed" | string;
    currentStep?: string;
    message?: string;
    deploymentIds?: readonly string[];
    failure?: {
      code?: string;
      reason?: string;
      message?: string;
    };
  };
};

export type BlueprintInstallStatusSummary = {
  applicationId: string;
  executionStatus: BlueprintInstallExecutionStatus;
  userStatus: "running" | "succeeded" | "failed" | "unknown";
  terminalStatus: "running" | "succeeded" | "failed";
  deploymentIds: string[];
  deploymentId: string;
  resourceId: string;
  accessUrl: string;
  currentStep: string;
  message: string;
  failureReason: string;
};

const blueprintInstallTerminalSuccessStatuses = new Set(["ready", "succeeded"]);
const blueprintInstallTerminalFailureStatuses = new Set([
  "failed",
  "rollback-required",
  "rolled-back",
  "canceled",
  "dead-lettered",
]);

type OperatorWorkDisplaySource = Pick<
  OperatorWorkItem,
  | "id"
  | "kind"
  | "status"
  | "operationKey"
  | "phase"
  | "step"
  | "deploymentId"
  | "updatedAt"
  | "finishedAt"
  | "errorCode"
  | "safeDetails"
>;

export type OperatorWorkReadableFailure = {
  title: string;
  detail: string;
  recovery: string;
  code: string;
  phase: string;
  operation: string;
};

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function safeDetailString(
  details: Record<string, string | number | boolean | null> | undefined,
  key: string,
): string {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value : "";
}

function firstComponentDeploymentId(snapshot: BlueprintInstallProgressSnapshot): string {
  return (
    snapshot.installedApplication?.components?.find(
      (component) => component.deployment?.deploymentId,
    )?.deployment?.deploymentId ?? ""
  );
}

export function summarizeBlueprintInstallProgress(
  snapshot: BlueprintInstallProgressSnapshot | null | undefined,
): BlueprintInstallStatusSummary {
  const components = snapshot?.installedApplication?.components ?? [];
  const failedComponentDeployment = components.find((component) =>
    ["failed", "canceled"].includes(String(component.deployment?.status ?? "")),
  )?.deployment;
  const executionStatus =
    snapshot?.progress?.status ??
    snapshot?.executionStatus ??
    snapshot?.installedApplication?.status ??
    "accepted";
  const normalizedExecutionStatus = String(executionStatus);
  const userStatus =
    snapshot?.progress?.userStatus === "running" ||
    snapshot?.progress?.userStatus === "succeeded" ||
    snapshot?.progress?.userStatus === "failed"
      ? snapshot.progress.userStatus
      : "unknown";
  const deploymentIds = uniqueStrings([
    snapshot?.monitoring?.deploymentId,
    ...(snapshot?.monitoring?.deploymentIds ?? []),
    ...(snapshot?.progress?.deploymentIds ?? []),
    ...components.map((component) => component.deployment?.deploymentId),
  ]);
  const failureReason =
    snapshot?.progress?.failure?.reason ??
    snapshot?.progress?.failure?.message ??
    snapshot?.progress?.failure?.code ??
    snapshot?.installedApplication?.executionFailure?.reason ??
    snapshot?.installedApplication?.executionFailure?.code ??
    failedComponentDeployment?.reason ??
    failedComponentDeployment?.status ??
    (blueprintInstallTerminalFailureStatuses.has(normalizedExecutionStatus)
      ? normalizedExecutionStatus
      : "") ??
    "";
  const terminalStatus =
    failureReason ||
    userStatus === "failed" ||
    blueprintInstallTerminalFailureStatuses.has(normalizedExecutionStatus)
      ? "failed"
      : userStatus === "succeeded" ||
          blueprintInstallTerminalSuccessStatuses.has(normalizedExecutionStatus)
        ? "succeeded"
        : "running";

  return {
    applicationId: snapshot?.applicationId ?? snapshot?.installedApplication?.applicationId ?? "",
    executionStatus: normalizedExecutionStatus,
    userStatus,
    terminalStatus,
    deploymentIds,
    deploymentId: deploymentIds[0] ?? firstComponentDeploymentId(snapshot ?? {}) ?? "",
    resourceId:
      components.find((component) => component.resource?.resourceId)?.resource?.resourceId ?? "",
    accessUrl:
      components.flatMap((component) => component.endpoints ?? []).find((endpoint) => endpoint.url)
        ?.url ?? "",
    currentStep: snapshot?.progress?.currentStep ?? "",
    message: snapshot?.progress?.message ?? "",
    failureReason,
  };
}

export function operatorWorkReadableFailure(
  work: OperatorWorkDisplaySource,
): OperatorWorkReadableFailure {
  const code =
    safeDetailString(work.safeDetails, "failure_code") ||
    safeDetailString(work.safeDetails, "code") ||
    work.errorCode ||
    (work.status === "failed" || work.status === "dead-lettered" ? work.status : "");
  const phase =
    safeDetailString(work.safeDetails, "failure_phase") || work.phase || work.step || "";
  const operation = safeDetailString(work.safeDetails, "failure_operation") || work.operationKey;

  if (code === "resource_slug_conflict") {
    return {
      title: "资源名称冲突",
      detail: "资源名称已经被占用，创建资源时失败。",
      recovery: "请换一个资源名称，或选择复用已有资源后重新安装。",
      code,
      phase,
      operation,
    };
  }

  if (phase === "deploy-component-readback") {
    return {
      title: "部署结果回读失败",
      detail: "部署任务已经结束，但 Appaloft 没有读到成功的资源状态。",
      recovery: "请打开资源诊断或重新部署；如果 Supabase/控制面不可用，不要绕过，需要先修复连接。",
      code: code || "execution_failed",
      phase,
      operation,
    };
  }

  return {
    title: work.kind === "blueprint-install" ? "蓝图安装失败" : "后台任务失败",
    detail: code ? `失败原因: ${code}` : "后台任务进入失败状态。",
    recovery:
      work.status === "dead-lettered"
        ? "任务已进入死信状态，需要检查失败原因后手动恢复或重试。"
        : "请查看失败阶段和操作后修正配置，再重新尝试。",
    code,
    phase,
    operation,
  };
}
