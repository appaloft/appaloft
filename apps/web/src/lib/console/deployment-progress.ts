import {
  type CreateDeploymentInput,
  type CreateDeploymentResponse,
  type DeploymentProgressEvent,
  type DeploymentSummary,
} from "@appaloft/contracts";

import { API_BASE, request } from "$lib/api/client";
import { i18nKeys, translate } from "$lib/i18n";

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
  const stream = createDeploymentProgressStream(input, options);
  let result = await stream.next();

  while (!result.done) {
    onEvent(result.value);
    result = await stream.next();
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

export function progressEventsFromDeployment(
  deployment: DeploymentSummary,
): DeploymentProgressEvent[] {
  const logEvents = deployment.logs.map((log) => {
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

export function redeployInputFromDeployment(deployment: DeploymentSummary): CreateDeploymentInput {
  return {
    projectId: deployment.projectId,
    serverId: deployment.serverId,
    destinationId: deployment.destinationId,
    environmentId: deployment.environmentId,
    resourceId: deployment.resourceId,
  };
}
