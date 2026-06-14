import {
  type DeploymentProgressEvent,
  type OperatorWorkEventStreamEnvelope,
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

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
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

function operatorWorkLevel(event: OperatorWorkObservedEvent): DeploymentProgressEvent["level"] {
  return operatorWorkStatus(event) === "failed" ? "error" : "info";
}

function operatorWorkMessage(event: OperatorWorkObservedEvent): string {
  const parts = [
    event.message,
    event.step ? `step: ${event.step}` : undefined,
    event.errorCode ? `error: ${event.errorCode}` : undefined,
    ...operatorWorkSafeDetailMessageParts(event.safeDetails),
  ].filter(Boolean);

  return parts.join(" · ") || `Deployment task ${event.kind}`;
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
    "event" in envelope ? [operatorWorkEventToProgressEvent(envelope.event)] : [],
  );
}
