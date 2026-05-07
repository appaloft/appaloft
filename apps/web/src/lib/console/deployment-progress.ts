import {
  type CreateDeploymentInput,
  type CreateDeploymentResponse,
  type DeploymentEventStreamEnvelope,
  type DeploymentProgressEvent,
  type DeploymentSummary,
} from "@appaloft/contracts";

import { API_BASE, readErrorMessage, request } from "$lib/api/client";
import { i18nKeys, translate } from "$lib/i18n";
import { orpcClient } from "$lib/orpc";

export type DeploymentProgressDialogStatus = "idle" | "running" | "succeeded" | "failed";

export type DeploymentProgressSection = {
  phase: DeploymentProgressEvent["phase"];
  events: DeploymentProgressEvent[];
  step: DeploymentProgressEvent["step"] | undefined;
  status: DeploymentProgressEvent["status"] | undefined;
};

const deploymentProgressPhases = [
  "detect",
  "plan",
  "package",
  "deploy",
  "verify",
  "rollback",
] as const;

const deploymentStatusPhase = {
  created: "detect",
  planning: "plan",
  planned: "plan",
  running: "deploy",
  "cancel-requested": "deploy",
  succeeded: "verify",
  failed: "verify",
  canceled: "deploy",
  "rolled-back": "rollback",
} as const satisfies Record<DeploymentSummary["status"], DeploymentProgressEvent["phase"]>;

const deploymentStatusProgressStatus = {
  created: "running",
  planning: "running",
  planned: "succeeded",
  running: "running",
  "cancel-requested": "running",
  succeeded: "succeeded",
  failed: "failed",
  canceled: "failed",
  "rolled-back": "succeeded",
} as const satisfies Record<
  DeploymentSummary["status"],
  NonNullable<DeploymentProgressEvent["status"]>
>;

const deploymentEventPhaseFallback = {
  "deployment-requested": "detect",
  "build-requested": "plan",
  "deployment-started": "deploy",
  "deployment-succeeded": "verify",
  "deployment-failed": "verify",
  "deployment-progress": "deploy",
} as const satisfies Record<
  Extract<DeploymentEventStreamEnvelope, { kind: "event" }>["event"]["eventType"],
  DeploymentProgressEvent["phase"]
>;

export function createDeploymentRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `deploy_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

type CreateDeploymentProgressStreamOptions = {
  requestId?: string;
  onRequestId?: (requestId: string) => void;
  onStreamError?: (message: string) => void;
};

export function groupDeploymentProgressEvents(
  events: DeploymentProgressEvent[],
): DeploymentProgressSection[] {
  return deploymentProgressPhases
    .map((phase) => {
      const phaseEvents = events.filter((event) => event.phase === phase);
      return {
        phase,
        events: phaseEvents,
        step: phaseEvents.at(-1)?.step,
        status: phaseEvents.findLast((event) => event.status)?.status,
      };
    })
    .filter((section) => section.events.length > 0);
}

export function deploymentCanRedeploy(deployment: DeploymentSummary): boolean {
  return (
    deployment.status === "succeeded" ||
    deployment.status === "failed" ||
    deployment.status === "canceled"
  );
}

export function latestDeploymentForResource(
  deployments: DeploymentSummary[],
  resourceId: string,
): DeploymentSummary | null {
  let latestDeployment: DeploymentSummary | null = null;

  for (const deployment of deployments) {
    if (deployment.resourceId !== resourceId) {
      continue;
    }

    if (!latestDeployment || deploymentIsNewer(deployment, latestDeployment)) {
      latestDeployment = deployment;
    }
  }

  return latestDeployment;
}

export async function createDeploymentWithProgress(
  input: CreateDeploymentInput,
  onEvent: (event: DeploymentProgressEvent) => void,
  options: CreateDeploymentProgressStreamOptions = {},
): Promise<CreateDeploymentResponse> {
  const seenEventFingerprints = new Set<string>();
  let deploymentTerminalObserved = false;
  const emitEvent = (event: DeploymentProgressEvent) => {
    const fingerprint = deploymentProgressEventFingerprint(event);
    if (seenEventFingerprints.has(fingerprint)) {
      return;
    }

    seenEventFingerprints.add(fingerprint);
    const status = progressDialogStatusFromProgressEvent(event);
    deploymentTerminalObserved = status === "succeeded" || status === "failed";
    onEvent(event);
  };
  const stream = createDeploymentProgressStream(input, options);
  let result = await stream.next();

  while (!result.done) {
    emitEvent(result.value);
    result = await stream.next();
  }

  if (!deploymentTerminalObserved) {
    await observeDeploymentProgressAfterAcceptance(result.value.id, emitEvent, options);
  }

  return result.value;
}

export async function* createDeploymentProgressStream(
  input: CreateDeploymentInput,
  options: CreateDeploymentProgressStreamOptions = {},
): AsyncGenerator<DeploymentProgressEvent, CreateDeploymentResponse, void> {
  const requestId = options.requestId ?? createDeploymentRequestId();
  options.onRequestId?.(requestId);

  if (typeof EventSource === "undefined") {
    return await createDeploymentRequest(input, requestId);
  }

  const source = new EventSource(
    `${API_BASE}/api/deployment-progress/${encodeURIComponent(requestId)}`,
    { withCredentials: true },
  );
  const events: DeploymentProgressEvent[] = [];
  let wake: (() => void) | undefined;
  let commandDone = false;

  const notify = () => {
    const currentWake = wake;
    wake = undefined;
    currentWake?.();
  };

  const waitForEventOrCommand = () =>
    new Promise<void>((resolve) => {
      wake = resolve;
      if (commandDone || events.length > 0) {
        notify();
      }
    });

  const progressListener = (message: Event) => {
    try {
      events.push(JSON.parse((message as MessageEvent<string>).data) as DeploymentProgressEvent);
      notify();
    } catch {
      options.onStreamError?.(translate(i18nKeys.console.deployments.progressParseError));
    }
  };

  source.addEventListener("progress", progressListener);

  try {
    source.onerror = () => {
      options.onStreamError?.(translate(i18nKeys.console.deployments.progressStreamDisconnected));
      source.close();
    };

    const command = createDeploymentRequest(input, requestId).finally(() => {
      commandDone = true;
      notify();
    });

    while (!commandDone || events.length > 0) {
      const event = events.shift();

      if (event) {
        yield event;
        continue;
      }

      await waitForEventOrCommand();
    }

    return await command;
  } finally {
    source.removeEventListener("progress", progressListener);
    source.close();
  }
}

function createDeploymentRequest(
  input: CreateDeploymentInput,
  requestId: string,
): Promise<CreateDeploymentResponse> {
  return request<CreateDeploymentResponse>("/api/deployments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify(input),
  });
}

function deploymentIsNewer(candidate: DeploymentSummary, current: DeploymentSummary): boolean {
  const candidateCreatedAt = Date.parse(candidate.createdAt);
  const currentCreatedAt = Date.parse(current.createdAt);

  if (candidateCreatedAt !== currentCreatedAt) {
    return candidateCreatedAt > currentCreatedAt;
  }

  return candidate.id > current.id;
}

type DeploymentProgressSource = Pick<
  DeploymentSummary,
  "id" | "status" | "createdAt" | "startedAt" | "finishedAt"
> & {
  logs?: DeploymentSummary["logs"];
};

export function progressEventsFromDeployment(
  deployment: DeploymentProgressSource,
  logs: DeploymentSummary["logs"] = deployment.logs ?? [],
): DeploymentProgressEvent[] {
  const logEvents = logs.map((log) => {
    return {
      timestamp: log.timestamp,
      source: log.source,
      phase: log.phase,
      level: log.level,
      message: log.message,
      deploymentId: deployment.id,
      step: progressStepForPhase(log.phase),
    } satisfies DeploymentProgressEvent;
  });
  const statusPhase = deploymentStatusPhase[deployment.status];

  return [
    ...logEvents,
    {
      timestamp: deployment.finishedAt ?? deployment.startedAt ?? deployment.createdAt,
      source: "appaloft",
      phase: statusPhase,
      level:
        deployment.status === "failed"
          ? "error"
          : deployment.status === "canceled" || deployment.status === "cancel-requested"
            ? "warn"
            : "info",
      message: deployment.status,
      deploymentId: deployment.id,
      status: deploymentStatusProgressStatus[deployment.status],
      step: progressStepForPhase(statusPhase),
    },
  ];
}

export function deploymentEventEnvelopeCursor(
  envelope: DeploymentEventStreamEnvelope,
): string | undefined {
  switch (envelope.kind) {
    case "event":
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

export function latestDeploymentEventCursor(
  envelopes: DeploymentEventStreamEnvelope[],
): string | undefined {
  const cursors = envelopes
    .map((envelope) => deploymentEventEnvelopeCursor(envelope))
    .filter((cursor) => typeof cursor === "string");

  return cursors.at(-1);
}

export function mergeDeploymentEventEnvelopes(
  currentEnvelopes: DeploymentEventStreamEnvelope[],
  incomingEnvelopes: DeploymentEventStreamEnvelope[],
): DeploymentEventStreamEnvelope[] {
  const merged = new Map<string, DeploymentEventStreamEnvelope>();

  for (const envelope of [...currentEnvelopes, ...incomingEnvelopes]) {
    const key =
      envelope.kind === "event"
        ? `event:${envelope.event.cursor}`
        : envelope.kind === "heartbeat"
          ? `heartbeat:${envelope.cursor ?? envelope.at}`
          : envelope.kind === "gap"
            ? `gap:${envelope.gap.cursor ?? envelope.gap.code}:${envelope.gap.phase}`
            : envelope.kind === "closed"
              ? `closed:${envelope.cursor ?? envelope.reason}`
              : `error:${envelope.error.code}:${envelope.error.message}`;

    merged.set(key, envelope);
  }

  return [...merged.values()].sort((left, right) => {
    if (left.kind === "event" && right.kind === "event") {
      if (left.event.sequence !== right.event.sequence) {
        return left.event.sequence - right.event.sequence;
      }

      return left.event.cursor.localeCompare(right.event.cursor);
    }

    if (left.kind === "event") {
      return -1;
    }

    if (right.kind === "event") {
      return 1;
    }

    const leftCursor = deploymentEventEnvelopeCursor(left) ?? "";
    const rightCursor = deploymentEventEnvelopeCursor(right) ?? "";
    return leftCursor.localeCompare(rightCursor);
  });
}

export function deploymentEventProgressEvents(
  envelopes: DeploymentEventStreamEnvelope[],
): DeploymentProgressEvent[] {
  return envelopes.flatMap((envelope) => {
    if (envelope.kind !== "event") {
      return [];
    }

    const phase = envelope.event.phase ?? deploymentEventPhaseFallback[envelope.event.eventType];
    const status = deploymentEventStatus(envelope.event);

    return [
      {
        timestamp: envelope.event.emittedAt,
        source: envelope.event.source === "process-observation" ? "application" : "appaloft",
        phase,
        level: deploymentEventLevel(envelope.event),
        message: envelope.event.summary ?? envelope.event.eventType,
        deploymentId: envelope.event.deploymentId,
        ...(status ? { status } : {}),
        step: {
          ...progressStepForPhase(phase),
          label: envelope.event.summary ?? envelope.event.eventType,
        },
      } satisfies DeploymentProgressEvent,
    ];
  });
}

export function deploymentEventProgressStatus(
  envelopes: DeploymentEventStreamEnvelope[],
  fallbackStatus: DeploymentSummary["status"] | null | undefined,
): DeploymentProgressDialogStatus {
  const lastEvent = [...envelopes].reverse().find((envelope) => envelope.kind === "event");
  if (lastEvent?.kind === "event") {
    const status = deploymentEventStatus(lastEvent.event);
    if (status) {
      return status;
    }
  }

  if (!fallbackStatus) {
    return "idle";
  }

  switch (fallbackStatus) {
    case "succeeded":
    case "rolled-back":
      return "succeeded";
    case "failed":
    case "canceled":
      return "failed";
    case "created":
    case "planning":
    case "planned":
    case "running":
    case "cancel-requested":
      return "running";
  }
}

export function isTerminalDeploymentStatus(
  status: DeploymentSummary["status"] | null | undefined,
): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "canceled" ||
    status === "rolled-back"
  );
}

function progressStepForPhase(
  phase: DeploymentProgressEvent["phase"],
): DeploymentProgressEvent["step"] {
  if (phase === "rollback") {
    return {
      current: 1,
      total: 1,
      label: phase,
    };
  }

  const phaseIndex = deploymentProgressPhases.indexOf(phase);
  return {
    current: phaseIndex >= 0 ? phaseIndex + 1 : 1,
    total: deploymentProgressPhases.length - 1,
    label: phase,
  };
}

export function openDeploymentProgressStream(
  requestId: string,
  input: {
    onEvent: (event: DeploymentProgressEvent) => void;
    onError: (message: string) => void;
    parseErrorMessage: string;
    streamDisconnectedMessage: string;
  },
): EventSource | null {
  if (typeof EventSource === "undefined") {
    return null;
  }

  const source = new EventSource(
    `${API_BASE}/api/deployment-progress/${encodeURIComponent(requestId)}`,
    { withCredentials: true },
  );

  source.addEventListener("progress", (message) => {
    try {
      input.onEvent(JSON.parse((message as MessageEvent<string>).data) as DeploymentProgressEvent);
    } catch {
      input.onError(input.parseErrorMessage);
    }
  });

  source.onerror = () => {
    input.onError(input.streamDisconnectedMessage);
  };

  return source;
}

export function progressStatusVariant(
  status?: DeploymentProgressEvent["status"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "succeeded":
      return "default";
    case "failed":
      return "destructive";
    case "running":
      return "secondary";
    default:
      return "outline";
  }
}

export function progressSourceLabel(event: DeploymentProgressEvent): string {
  const source = event.source === "application" ? "app" : "appaloft";
  return event.stream ? `${source}:${event.stream}` : source;
}

export async function observeDeploymentProgressAfterAcceptance(
  deploymentId: string,
  onEvent: (event: DeploymentProgressEvent) => void,
  options: CreateDeploymentProgressStreamOptions,
): Promise<void> {
  try {
    const replay = await orpcClient.deployments.events({
      deploymentId,
      historyLimit: 100,
      includeHistory: true,
      follow: false,
      untilTerminal: true,
    });

    for (const event of deploymentEventProgressEvents(replay.envelopes)) {
      onEvent(event);
    }

    if (deploymentEventProgressStatus(replay.envelopes, "running") !== "running") {
      return;
    }

    const cursor = latestDeploymentEventCursor(replay.envelopes);
    const stream = await orpcClient.deployments.eventsStream({
      deploymentId,
      historyLimit: 0,
      includeHistory: false,
      follow: true,
      untilTerminal: true,
      ...(cursor ? { cursor } : {}),
    });

    try {
      let result = await stream.next();

      while (!result.done) {
        const envelope = result.value;

        switch (envelope.kind) {
          case "event":
            for (const event of deploymentEventProgressEvents([envelope])) {
              onEvent(event);
            }
            break;
          case "gap":
            options.onStreamError?.(
              translate(i18nKeys.console.deployments.progressStreamDisconnected),
            );
            return;
          case "error":
            options.onStreamError?.(envelope.error.message);
            return;
          case "closed":
            return;
          case "heartbeat":
            break;
        }

        result = await stream.next();
      }
    } finally {
      await stream.return?.();
    }
  } catch (error) {
    options.onStreamError?.(readErrorMessage(error));
  }
}

function deploymentProgressEventFingerprint(event: DeploymentProgressEvent): string {
  return [
    event.timestamp,
    event.deploymentId ?? "",
    event.source,
    event.phase,
    event.level,
    event.message,
    event.status ?? "",
  ].join("|");
}

function progressDialogStatusFromProgressEvent(
  event: DeploymentProgressEvent,
): DeploymentProgressDialogStatus {
  switch (event.status) {
    case "failed":
      return "failed";
    case "succeeded":
      return "succeeded";
    case "running":
      return "running";
    default:
      return "running";
  }
}

function deploymentEventLevel(
  event: Extract<DeploymentEventStreamEnvelope, { kind: "event" }>["event"],
): DeploymentProgressEvent["level"] {
  const status = deploymentEventStatus(event);
  if (status === "failed") {
    return "error";
  }

  if (event.source === "process-observation") {
    return "info";
  }

  return "info";
}

function deploymentEventStatus(
  event: Extract<DeploymentEventStreamEnvelope, { kind: "event" }>["event"],
): DeploymentProgressEvent["status"] | undefined {
  switch (event.status) {
    case "running":
    case "succeeded":
    case "failed":
      return event.status;
  }

  switch (event.eventType) {
    case "deployment-succeeded":
      return "succeeded";
    case "deployment-failed":
      return "failed";
    case "deployment-requested":
    case "build-requested":
    case "deployment-started":
    case "deployment-progress":
      return "running";
  }
}

export function redeployInputFromDeployment(deployment: DeploymentSummary): CreateDeploymentInput {
  return {
    projectId: deployment.projectId,
    serverId: deployment.serverId,
    destinationId: deployment.destinationId,
    environmentId: deployment.environmentId,
    resourceId: deployment.resourceId,
  };
}
