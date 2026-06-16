import {
  type DeploymentProgressEvent,
  type OperatorWorkEventStreamEnvelope,
  type OperatorWorkEventStreamResponse,
  type OperatorWorkItem,
  type OperatorWorkObservedEvent,
} from "@appaloft/contracts";

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
    operatorWorkId?: string;
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
  operatorWorkId: string;
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

const operatorWorkEventStreamStatusKinds = new Set([
  "accepted",
  "running",
  "progress",
  "retry-scheduled",
  "succeeded",
  "failed",
  "canceled",
  "dead-lettered",
]);

const operatorWorkEventStreamEnvelopeKinds = new Set([
  ...operatorWorkEventStreamStatusKinds,
  "heartbeat",
  "gap",
  "closed",
  "error",
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

function isOperatorWorkEventStreamEnvelopeKind(
  kind: unknown,
): kind is OperatorWorkEventStreamEnvelope["kind"] {
  return typeof kind === "string" && operatorWorkEventStreamEnvelopeKinds.has(kind);
}

export function operatorWorkEventStreamEnvelope(
  envelope: OperatorWorkEventStreamEnvelope | null | undefined,
): OperatorWorkEventStreamEnvelope | null {
  if (!envelope) {
    return null;
  }

  if (envelope.schemaVersion !== "operator-work.stream-events/v1") {
    throw new Error("Expected operator-work.stream-events/v1 envelope");
  }

  if (!isOperatorWorkEventStreamEnvelopeKind(envelope.kind)) {
    throw new Error("Expected operator work stream envelope kind");
  }

  return envelope;
}

export function operatorWorkEventStreamEnvelopes(
  envelopes: readonly OperatorWorkEventStreamEnvelope[],
): OperatorWorkEventStreamEnvelope[] {
  return envelopes.flatMap((envelope) => {
    const normalized = operatorWorkEventStreamEnvelope(envelope);
    return normalized ? [normalized] : [];
  });
}

export function operatorWorkEventResponseEnvelopes(
  response: OperatorWorkEventStreamResponse | null | undefined,
): OperatorWorkEventStreamEnvelope[] {
  return operatorWorkEventStreamEnvelopes(response?.envelopes ?? []);
}

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
    operatorWorkId:
      snapshot?.progress?.operatorWorkId ??
      snapshot?.monitoring?.workId ??
      snapshot?.monitoring?.workIds?.[0] ??
      "",
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

function operatorWorkStatus(event: OperatorWorkObservedEvent): DeploymentProgressEvent["status"] {
  switch (event.status) {
    case "succeeded":
      return "succeeded";
    case "failed":
    case "canceled":
    case "dead-lettered":
      return "failed";
    default:
      return "running";
  }
}

function operatorWorkPhase(event: OperatorWorkObservedEvent): DeploymentProgressEvent["phase"] {
  switch (event.kind) {
    case "accepted":
      return "detect";
    case "succeeded":
    case "failed":
    case "canceled":
    case "dead-lettered":
      return "verify";
    default:
      return "deploy";
  }
}

function operatorWorkItemProgressPhase(
  work: OperatorWorkDisplaySource,
): DeploymentProgressEvent["phase"] {
  const failurePhase = safeDetailString(work.safeDetails, "failure_phase") || work.phase || "";
  const normalizedPhase = failurePhase.toLowerCase();

  if (normalizedPhase.includes("rollback")) {
    return "rollback";
  }

  if (
    normalizedPhase.includes("readback") ||
    normalizedPhase.includes("verify") ||
    normalizedPhase.includes("health")
  ) {
    return "verify";
  }

  if (normalizedPhase.includes("deploy") || normalizedPhase.includes("execution")) {
    return "deploy";
  }

  if (normalizedPhase.includes("admission") || normalizedPhase.includes("resource")) {
    return "plan";
  }

  return work.status === "failed" || work.status === "dead-lettered" ? "verify" : "deploy";
}

function operatorWorkDisplayStatus(
  status: OperatorWorkItem["status"],
): DeploymentProgressEvent["status"] {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "failed":
    case "canceled":
    case "dead-lettered":
      return "failed";
    default:
      return "running";
  }
}

function operatorWorkLevel(event: OperatorWorkObservedEvent): DeploymentProgressEvent["level"] {
  return operatorWorkStatus(event) === "failed" ? "error" : "info";
}

function operatorWorkMessage(event: OperatorWorkObservedEvent): string {
  const readableFailure = operatorWorkReadableFailure({
    id: event.workId,
    kind: event.workKind,
    status: event.status,
    operationKey: event.operationKey,
    phase: event.phase,
    step: event.step,
    updatedAt: event.emittedAt,
    finishedAt: event.emittedAt,
    errorCode: event.errorCode,
    safeDetails: event.safeDetails,
  });
  if (operatorWorkStatus(event) === "failed") {
    return [
      readableFailure.title,
      readableFailure.detail,
      readableFailure.recovery,
      readableFailure.phase ? `阶段: ${readableFailure.phase}` : undefined,
      readableFailure.operation ? `操作: ${readableFailure.operation}` : undefined,
      readableFailure.code ? `错误: ${readableFailure.code}` : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const parts = [
    event.message,
    event.step ? `step: ${event.step}` : undefined,
    event.errorCode ? `error: ${event.errorCode}` : undefined,
    ...operatorWorkSafeDetailMessageParts(event.safeDetails),
  ].filter(Boolean);

  return parts.join(" · ") || `Deployment task ${event.kind}`;
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

export function operatorWorkItemToProgressEvent(
  work: OperatorWorkDisplaySource,
): DeploymentProgressEvent {
  const status = operatorWorkDisplayStatus(work.status);
  const readableFailure = operatorWorkReadableFailure(work);
  const failed = status === "failed";

  return {
    timestamp: work.finishedAt ?? work.updatedAt,
    source: "appaloft",
    phase: operatorWorkItemProgressPhase(work),
    level: failed ? "error" : "info",
    message: failed
      ? [
          readableFailure.title,
          readableFailure.detail,
          readableFailure.recovery,
          readableFailure.phase ? `阶段: ${readableFailure.phase}` : undefined,
          readableFailure.operation ? `操作: ${readableFailure.operation}` : undefined,
          readableFailure.code ? `错误: ${readableFailure.code}` : undefined,
        ]
          .filter(Boolean)
          .join(" · ")
      : `部署任务${work.status === "succeeded" ? "已完成" : "正在执行"}${work.step ? ` · ${work.step}` : ""}`,
    status,
    ...(work.deploymentId ? { deploymentId: work.deploymentId } : {}),
    step: {
      current: failed || status === "succeeded" ? 1 : 0,
      total: failed || status === "succeeded" ? 1 : 2,
      label: work.step ?? work.phase ?? work.status,
    },
  };
}

function operatorWorkSafeDetailMessageParts(
  safeDetails: OperatorWorkObservedEvent["safeDetails"],
): string[] {
  if (!safeDetails) {
    return [];
  }

  return [
    ["failure_code", "failure"],
    ["failure_phase", "phase"],
    ["failure_failurePhase", "deployment phase"],
    ["failure_componentId", "component"],
    ["failure_deploymentStatus", "deployment"],
    ["failure_operation", "operation"],
    ["resourceSlug", "resource"],
  ].flatMap(([key, label]) => {
    const value = safeDetails[key];
    return typeof value === "string" && value.trim() ? [`${label}: ${value}`] : [];
  });
}

export function operatorWorkEventToProgressEvent(
  event: OperatorWorkObservedEvent,
): DeploymentProgressEvent {
  return {
    timestamp: event.emittedAt,
    source: "appaloft",
    phase: operatorWorkPhase(event),
    level: operatorWorkLevel(event),
    message: operatorWorkMessage(event),
    ...(event.deploymentId ? { deploymentId: event.deploymentId } : {}),
    status: operatorWorkStatus(event),
    step: {
      current: event.sequence,
      total:
        event.status === "pending" || event.status === "running"
          ? event.sequence + 1
          : event.sequence,
      label: event.step ?? event.kind,
    },
  };
}

function operatorWorkEventEnvelopeCursor(
  envelope: OperatorWorkEventStreamEnvelope,
): string | undefined {
  switch (envelope.kind) {
    case "accepted":
    case "running":
    case "progress":
    case "retry-scheduled":
    case "succeeded":
    case "failed":
    case "canceled":
    case "dead-lettered":
      return envelope.event.cursor;
    case "heartbeat":
      return envelope.cursor;
    case "gap":
      return envelope.gap.cursor;
    case "closed":
      return envelope.cursor;
    case "error":
      return undefined;
  }
}

export function latestOperatorWorkEventCursor(
  envelopes: readonly OperatorWorkEventStreamEnvelope[],
): string | undefined {
  const cursors = envelopes
    .map((envelope) => operatorWorkEventEnvelopeCursor(envelope))
    .filter((cursor) => typeof cursor === "string");

  return cursors.at(-1);
}

export function operatorWorkEventProgressStatus(
  envelopes: readonly OperatorWorkEventStreamEnvelope[],
): "running" | "succeeded" | "failed" {
  const lastEvent = [...envelopes].reverse().find((envelope) => "event" in envelope);
  return lastEvent?.kind === "succeeded"
    ? "succeeded"
    : lastEvent?.kind === "failed" ||
        lastEvent?.kind === "canceled" ||
        lastEvent?.kind === "dead-lettered"
      ? "failed"
      : "running";
}

export function operatorWorkEnvelopeProgressEvents(
  envelopes: readonly OperatorWorkEventStreamEnvelope[],
): DeploymentProgressEvent[] {
  return envelopes.flatMap((envelope) =>
    "event" in envelope && shouldShowOperatorWorkProgressEvent(envelope.event)
      ? [operatorWorkEventToProgressEvent(envelope.event)]
      : [],
  );
}

function shouldShowOperatorWorkProgressEvent(event: OperatorWorkObservedEvent): boolean {
  if (event.deploymentId) {
    return true;
  }

  if (
    event.message &&
    (event.kind === "running" ||
      event.kind === "progress" ||
      event.kind === "retry-scheduled" ||
      event.kind === "succeeded")
  ) {
    return true;
  }

  return (
    event.kind === "failed" ||
    event.kind === "canceled" ||
    event.kind === "dead-lettered" ||
    event.status === "failed"
  );
}
