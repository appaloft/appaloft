import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import {
  type DurableWorkEventRecord,
  type DurableWorkItemRecord,
  type DurableWorkItemStatus,
  type DurableWorkLedger,
} from "../../durable-work";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type CertificateReadModel,
  type CertificateSummary,
  type Clock,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type OperatorWorkDetail,
  type OperatorWorkEvent,
  type OperatorWorkItem,
  type OperatorWorkKind,
  type OperatorWorkList,
  type OperatorWorkNextAction,
  type OperatorWorkStatus,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type RemoteStateWorkReadModel,
  type RemoteStateWorkSummary,
  type RouteRealizationWorkReadModel,
  type RouteRealizationWorkSummary,
  type ServerReadModel,
  type ServerSummary,
  type SourceLinkReadModel,
  type SourceLinkRecord,
} from "../../ports";
import {
  EmptyProcessAttemptReadModel,
  EmptyRemoteStateWorkReadModel,
  EmptyRouteRealizationWorkReadModel,
  EmptySourceLinkReadModel,
} from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import { ListOperatorWorkQuery } from "./list-operator-work.query";
import { type ShowOperatorWorkQuery } from "./show-operator-work.query";

type OperatorWorkFilter = {
  kind?: OperatorWorkKind;
  status?: OperatorWorkStatus;
  resourceId?: string;
  serverId?: string;
  deploymentId?: string;
  limit?: number;
};

const defaultLimit = 50;
const unsafeDetailKeyPattern =
  /secret|password|passphrase|private[_-]?key|ssh[_-]?key|identity[_-]?file|token|credential|command[_-]?line|commandline/i;
const unsafeDetailValuePattern =
  /(BEGIN .*PRIVATE KEY|PRIVATE_KEY|SECRET_|PASSWORD=|TOKEN=|PASS=)/i;

function deploymentStatusToOperatorWorkStatus(
  status: DeploymentSummary["status"],
): OperatorWorkStatus {
  switch (status) {
    case "created":
    case "planning":
    case "planned":
      return "pending";
    case "running":
    case "cancel-requested":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    case "rolled-back":
      return "succeeded";
    default:
      return "unknown";
  }
}

function deploymentPhase(status: DeploymentSummary["status"]): string {
  switch (status) {
    case "created":
      return "command-accepted";
    case "planning":
    case "planned":
      return "runtime-plan-resolution";
    case "running":
    case "cancel-requested":
      return "runtime-execution";
    case "succeeded":
    case "failed":
    case "canceled":
    case "rolled-back":
      return "runtime-verification";
    default:
      return "unknown";
  }
}

function deploymentNextActions(status: OperatorWorkStatus): OperatorWorkNextAction[] {
  return status === "failed" ? ["diagnostic", "manual-review"] : ["no-action"];
}

function deploymentToWorkItem(deployment: DeploymentSummary): OperatorWorkItem {
  const status = deploymentStatusToOperatorWorkStatus(deployment.status);
  const latestErrorLog = [...deployment.logs].reverse().find((entry) => entry.level === "error");

  return {
    id: deployment.id,
    kind: "deployment",
    status,
    operationKey: "deployments.create",
    phase: latestErrorLog?.phase ?? deploymentPhase(deployment.status),
    step: deployment.status,
    projectId: deployment.projectId,
    resourceId: deployment.resourceId,
    deploymentId: deployment.id,
    ...(deployment.serverId ? { serverId: deployment.serverId } : {}),
    startedAt: deployment.startedAt ?? deployment.createdAt,
    updatedAt: deployment.finishedAt ?? deployment.startedAt ?? deployment.createdAt,
    ...(deployment.finishedAt ? { finishedAt: deployment.finishedAt } : {}),
    ...(status === "failed"
      ? {
          errorCategory: "async-processing",
          retriable: false,
        }
      : {}),
    nextActions: deploymentNextActions(status),
    safeDetails: {
      ...(deployment.destinationId ? { destinationId: deployment.destinationId } : {}),
      runtimeTargetKind: deployment.runtimePlan.target.kind,
      runtimeTargetProviderKey: deployment.runtimePlan.target.providerKey,
      buildStrategy: deployment.runtimePlan.buildStrategy,
      packagingMode: deployment.runtimePlan.packagingMode,
      logCount: deployment.logCount,
    },
  };
}

function isProxyFailureRetriable(errorCode?: string): boolean | undefined {
  if (!errorCode) {
    return undefined;
  }

  switch (errorCode) {
    case "edge_proxy_kind_unsupported":
    case "edge_proxy_provider_unsupported":
      return false;
    case "proxy_provider_unavailable":
    case "edge_proxy_network_failed":
    case "edge_proxy_start_failed":
    case "edge_proxy_host_port_conflict":
      return true;
    default:
      return undefined;
  }
}

function proxyStatusToOperatorWorkStatus(
  status: NonNullable<ServerSummary["edgeProxy"]>["status"],
): OperatorWorkStatus {
  switch (status) {
    case "pending":
      return "pending";
    case "starting":
      return "running";
    case "ready":
      return "succeeded";
    case "failed":
      return "failed";
    case "disabled":
      return "succeeded";
    default:
      return "unknown";
  }
}

function serverProxyToWorkItem(server: ServerSummary): OperatorWorkItem | null {
  const edgeProxy = server.edgeProxy;
  if (!edgeProxy || edgeProxy.status === "disabled" || edgeProxy.kind === "none") {
    return null;
  }

  const status = proxyStatusToOperatorWorkStatus(edgeProxy.status);
  const retriable = isProxyFailureRetriable(edgeProxy.lastErrorCode);

  return {
    id: `proxy-bootstrap:${server.id}`,
    kind: "proxy-bootstrap",
    status,
    operationKey: "servers.bootstrap-proxy",
    phase:
      edgeProxy.status === "failed"
        ? "proxy-bootstrap"
        : edgeProxy.status === "ready"
          ? "server-ready"
          : "proxy-bootstrap",
    step: edgeProxy.status,
    serverId: server.id,
    startedAt: edgeProxy.lastAttemptAt ?? server.createdAt,
    updatedAt: edgeProxy.lastSucceededAt ?? edgeProxy.lastAttemptAt ?? server.createdAt,
    ...(edgeProxy.status === "ready" && edgeProxy.lastSucceededAt
      ? { finishedAt: edgeProxy.lastSucceededAt }
      : {}),
    ...(edgeProxy.status === "failed" && edgeProxy.lastAttemptAt
      ? { finishedAt: edgeProxy.lastAttemptAt }
      : {}),
    ...(edgeProxy.lastErrorCode ? { errorCode: edgeProxy.lastErrorCode } : {}),
    ...(edgeProxy.lastErrorCode
      ? {
          errorCategory: "async-processing",
        }
      : {}),
    ...(retriable === undefined ? {} : { retriable }),
    nextActions: status === "failed" ? ["diagnostic", "manual-review"] : ["no-action"],
    safeDetails: {
      proxyKind: edgeProxy.kind,
      providerKey: server.providerKey,
    },
  };
}

function certificateStatusToOperatorWorkStatus(
  status: NonNullable<CertificateSummary["latestAttempt"]>["status"],
): OperatorWorkStatus {
  switch (status) {
    case "requested":
      return "pending";
    case "issuing":
      return "running";
    case "retry_scheduled":
      return "retry-scheduled";
    case "issued":
      return "succeeded";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

function certificateToWorkItem(
  certificate: CertificateSummary,
  binding?: DomainBindingSummary,
): OperatorWorkItem | null {
  const attempt = certificate.latestAttempt;
  if (!attempt) {
    return null;
  }

  const status = certificateStatusToOperatorWorkStatus(attempt.status);

  return {
    id: attempt.id,
    kind: "certificate",
    status,
    operationKey:
      certificate.source === "imported" ? "certificates.import" : "certificates.issue-or-renew",
    phase: attempt.failurePhase ?? "certificate-request",
    step: attempt.status,
    ...(binding?.projectId ? { projectId: binding.projectId } : {}),
    ...(binding?.resourceId ? { resourceId: binding.resourceId } : {}),
    ...(binding?.serverId ? { serverId: binding.serverId } : {}),
    domainBindingId: certificate.domainBindingId,
    certificateId: certificate.id,
    startedAt: attempt.requestedAt,
    updatedAt:
      attempt.retryAfter ??
      attempt.failedAt ??
      attempt.issuedAt ??
      attempt.expiresAt ??
      attempt.requestedAt,
    ...(attempt.failedAt ? { finishedAt: attempt.failedAt } : {}),
    ...(attempt.issuedAt ? { finishedAt: attempt.issuedAt } : {}),
    ...(attempt.errorCode ? { errorCode: attempt.errorCode } : {}),
    ...(attempt.errorCode ? { errorCategory: "async-processing" } : {}),
    ...(attempt.retriable === undefined ? {} : { retriable: attempt.retriable }),
    nextActions:
      status === "failed" || status === "retry-scheduled"
        ? ["diagnostic", "manual-review"]
        : ["no-action"],
    safeDetails: {
      providerKey: attempt.providerKey,
      challengeType: attempt.challengeType,
      reason: attempt.reason,
      domainName: certificate.domainName,
      certificateSource: certificate.source,
    },
  };
}

function sanitizeSafeDetails(
  details?: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> | undefined {
  if (!details) {
    return undefined;
  }

  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (unsafeDetailKeyPattern.test(key)) {
      continue;
    }

    if (typeof value === "string" && unsafeDetailValuePattern.test(value)) {
      continue;
    }

    sanitized[key] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sourceLinkToWorkItem(sourceLink: SourceLinkRecord): OperatorWorkItem {
  return {
    id: `source-link:${sourceLink.sourceFingerprint}`,
    kind: "system",
    status: "succeeded",
    operationKey: "source-links.relink",
    phase: "source-link-state",
    step: sourceLink.reason ?? "linked",
    projectId: sourceLink.projectId,
    resourceId: sourceLink.resourceId,
    ...(sourceLink.serverId ? { serverId: sourceLink.serverId } : {}),
    updatedAt: sourceLink.updatedAt,
    finishedAt: sourceLink.updatedAt,
    nextActions: ["no-action"],
    safeDetails: {
      sourceFingerprint: sourceLink.sourceFingerprint,
      environmentId: sourceLink.environmentId,
      ...(sourceLink.destinationId ? { destinationId: sourceLink.destinationId } : {}),
      ...(sourceLink.reason ? { reason: sourceLink.reason } : {}),
    },
  };
}

function routeRealizationToWorkItem(route: RouteRealizationWorkSummary): OperatorWorkItem {
  const safeDetails = sanitizeSafeDetails(route.safeDetails);

  return {
    id: `route-realization:${route.id}`,
    kind: "route-realization",
    status: route.status,
    operationKey: route.operationKey,
    ...(route.phase ? { phase: route.phase } : {}),
    ...(route.step ? { step: route.step } : {}),
    ...(route.projectId ? { projectId: route.projectId } : {}),
    ...(route.resourceId ? { resourceId: route.resourceId } : {}),
    ...(route.deploymentId ? { deploymentId: route.deploymentId } : {}),
    ...(route.serverId ? { serverId: route.serverId } : {}),
    ...(route.domainBindingId ? { domainBindingId: route.domainBindingId } : {}),
    ...(route.startedAt ? { startedAt: route.startedAt } : {}),
    updatedAt: route.updatedAt,
    ...(route.finishedAt ? { finishedAt: route.finishedAt } : {}),
    ...(route.errorCode ? { errorCode: route.errorCode } : {}),
    ...(route.errorCategory ? { errorCategory: route.errorCategory } : {}),
    ...(route.retriable === undefined ? {} : { retriable: route.retriable }),
    nextActions: route.nextActions,
    ...(safeDetails ? { safeDetails } : {}),
  };
}

function remoteStateToWorkItem(remoteState: RemoteStateWorkSummary): OperatorWorkItem {
  const safeDetails = sanitizeSafeDetails(remoteState.safeDetails);

  return {
    id: `remote-state:${remoteState.id}`,
    kind: "remote-state",
    status: remoteState.status,
    operationKey: remoteState.operationKey,
    phase: remoteState.phase,
    ...(remoteState.step ? { step: remoteState.step } : {}),
    ...(remoteState.serverId ? { serverId: remoteState.serverId } : {}),
    ...(remoteState.startedAt ? { startedAt: remoteState.startedAt } : {}),
    updatedAt: remoteState.updatedAt,
    ...(remoteState.finishedAt ? { finishedAt: remoteState.finishedAt } : {}),
    ...(remoteState.errorCode ? { errorCode: remoteState.errorCode } : {}),
    ...(remoteState.errorCategory ? { errorCategory: remoteState.errorCategory } : {}),
    ...(remoteState.retriable === undefined ? {} : { retriable: remoteState.retriable }),
    nextActions: remoteState.nextActions,
    ...(safeDetails ? { safeDetails } : {}),
  };
}

function processAttemptToWorkItem(attempt: ProcessAttemptRecord): OperatorWorkItem {
  const safeDetails = sanitizeSafeDetails(attempt.safeDetails);

  return {
    id: attempt.id,
    kind: attempt.kind,
    status: attempt.status,
    operationKey: attempt.operationKey,
    ...(attempt.phase ? { phase: attempt.phase } : {}),
    ...(attempt.step ? { step: attempt.step } : {}),
    ...(attempt.projectId ? { projectId: attempt.projectId } : {}),
    ...(attempt.resourceId ? { resourceId: attempt.resourceId } : {}),
    ...(attempt.deploymentId ? { deploymentId: attempt.deploymentId } : {}),
    ...(attempt.serverId ? { serverId: attempt.serverId } : {}),
    ...(attempt.domainBindingId ? { domainBindingId: attempt.domainBindingId } : {}),
    ...(attempt.certificateId ? { certificateId: attempt.certificateId } : {}),
    ...(attempt.startedAt ? { startedAt: attempt.startedAt } : {}),
    updatedAt: attempt.updatedAt,
    ...(attempt.finishedAt ? { finishedAt: attempt.finishedAt } : {}),
    ...(attempt.errorCode ? { errorCode: attempt.errorCode } : {}),
    ...(attempt.errorCategory ? { errorCategory: attempt.errorCategory } : {}),
    ...(attempt.retriable === undefined ? {} : { retriable: attempt.retriable }),
    nextActions: attempt.nextActions,
    ...(safeDetails ? { safeDetails } : {}),
  };
}

function durableKindToOperatorKind(kind: string): OperatorWorkKind {
  switch (kind) {
    case "deployment":
    case "quick-deploy":
    case "blueprint-install":
    case "runtime-maintenance":
    case "system":
      return kind;
    default:
      return "system";
  }
}

function isDurableWorkItemStatus(status?: OperatorWorkStatus): status is DurableWorkItemStatus {
  return status !== undefined && status !== "unknown";
}

function durableStatusToOperatorStatus(
  status: DurableWorkItemRecord["status"],
): OperatorWorkStatus {
  return status;
}

function durableNextActions(item: DurableWorkItemRecord): OperatorWorkNextAction[] {
  if (item.status === "failed" || item.status === "dead-lettered") {
    return item.retriable
      ? ["diagnostic", "retry", "manual-review"]
      : ["diagnostic", "manual-review"];
  }

  if (item.status === "retry-scheduled") {
    return ["diagnostic", "retry", "manual-review"];
  }

  return ["no-action"];
}

function durableWorkToWorkItem(item: DurableWorkItemRecord): OperatorWorkItem {
  const safeDetails = sanitizeSafeDetails(item.safeDetails);

  return {
    id: item.id,
    kind: durableKindToOperatorKind(item.kind),
    status: durableStatusToOperatorStatus(item.status),
    operationKey: item.operationKey,
    ...(item.phase ? { phase: item.phase } : {}),
    ...(item.step ? { step: item.step } : {}),
    ...(item.projectId ? { projectId: item.projectId } : {}),
    ...(item.resourceId ? { resourceId: item.resourceId } : {}),
    ...(item.deploymentId ? { deploymentId: item.deploymentId } : {}),
    ...(item.serverId ? { serverId: item.serverId } : {}),
    ...(item.startedAt ? { startedAt: item.startedAt } : {}),
    updatedAt: item.updatedAt,
    ...(item.finishedAt ? { finishedAt: item.finishedAt } : {}),
    ...(item.errorCode ? { errorCode: item.errorCode } : {}),
    ...(item.errorCategory ? { errorCategory: item.errorCategory } : {}),
    ...(item.retriable === undefined ? {} : { retriable: item.retriable }),
    nextActions: durableNextActions(item),
    ...(safeDetails ? { safeDetails } : {}),
  };
}

function durableEventToOperatorEvent(event: DurableWorkEventRecord): OperatorWorkEvent {
  const safeDetails = sanitizeSafeDetails(event.safeDetails);

  return {
    id: event.id,
    sequence: event.sequence,
    kind: event.kind,
    ...(event.status ? { status: durableStatusToOperatorStatus(event.status) } : {}),
    ...(event.phase ? { phase: event.phase } : {}),
    ...(event.step ? { step: event.step } : {}),
    ...(event.message ? { message: event.message } : {}),
    ...(event.workerId ? { workerId: event.workerId } : {}),
    ...(event.workerGroup ? { workerGroup: event.workerGroup } : {}),
    occurredAt: event.occurredAt,
    ...(safeDetails ? { safeDetails } : {}),
  };
}

function matchesFilter(item: OperatorWorkItem, filter: OperatorWorkFilter): boolean {
  return (
    (!filter.kind || item.kind === filter.kind) &&
    (!filter.status || item.status === filter.status) &&
    (!filter.resourceId || item.resourceId === filter.resourceId) &&
    (!filter.serverId || item.serverId === filter.serverId) &&
    (!filter.deploymentId || item.deploymentId === filter.deploymentId)
  );
}

function compareByUpdatedAtDesc(left: OperatorWorkItem, right: OperatorWorkItem): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function hasDurableSameProxyScope(
  durableItems: OperatorWorkItem[],
  candidate: OperatorWorkItem,
): boolean {
  return (
    candidate.kind === "proxy-bootstrap" &&
    durableItems.some(
      (item) =>
        item.kind === "proxy-bootstrap" &&
        item.serverId !== undefined &&
        item.serverId === candidate.serverId,
    )
  );
}

@injectable()
export class OperatorWorkQueryService {
  constructor(
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.serverReadModel)
    private readonly serverReadModel: ServerReadModel,
    @inject(tokens.certificateReadModel)
    private readonly certificateReadModel: CertificateReadModel,
    @inject(tokens.domainBindingReadModel)
    private readonly domainBindingReadModel: DomainBindingReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.processAttemptReadModel)
    private readonly processAttemptReadModel: ProcessAttemptReadModel = new EmptyProcessAttemptReadModel(),
    @inject(tokens.remoteStateWorkReadModel)
    private readonly remoteStateWorkReadModel: RemoteStateWorkReadModel = new EmptyRemoteStateWorkReadModel(),
    @inject(tokens.sourceLinkReadModel)
    private readonly sourceLinkReadModel: SourceLinkReadModel = new EmptySourceLinkReadModel(),
    @inject(tokens.routeRealizationWorkReadModel)
    private readonly routeRealizationWorkReadModel: RouteRealizationWorkReadModel = new EmptyRouteRealizationWorkReadModel(),
    @inject(tokens.durableWorkQueueAdapter, { isOptional: true })
    private readonly durableWorkLedger?: DurableWorkLedger,
  ) {}

  async list(context: ExecutionContext, query: ListOperatorWorkQuery): Promise<OperatorWorkList> {
    const repositoryContext = toRepositoryContext(context);
    const filter: OperatorWorkFilter = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.serverId ? { serverId: query.serverId } : {}),
      ...(query.deploymentId ? { deploymentId: query.deploymentId } : {}),
      limit: query.limit ?? defaultLimit,
    };
    const bindings = await this.domainBindingReadModel.list(repositoryContext, {
      ...(filter.resourceId ? { resourceId: filter.resourceId } : {}),
    });
    const bindingsById = new Map(bindings.map((binding) => [binding.id, binding]));
    const processAttempts = await this.processAttemptReadModel.list(repositoryContext, filter);
    const durableWorkItems = this.durableWorkLedger
      ? (
          await this.durableWorkLedger.listItems(repositoryContext, {
            ...(filter.kind ? { kind: filter.kind } : {}),
            ...(isDurableWorkItemStatus(filter.status) ? { status: filter.status } : {}),
            ...(filter.resourceId ? { resourceId: filter.resourceId } : {}),
            ...(filter.serverId ? { serverId: filter.serverId } : {}),
            ...(filter.deploymentId ? { deploymentId: filter.deploymentId } : {}),
            ...(filter.limit ? { limit: filter.limit } : {}),
          })
        ).match(
          (items) => items,
          () => [],
        )
      : [];
    const deployments =
      filter.kind && filter.kind !== "deployment"
        ? []
        : await this.deploymentReadModel.list(repositoryContext, {
            ...(filter.resourceId ? { resourceId: filter.resourceId } : {}),
          });
    const servers =
      filter.kind && filter.kind !== "proxy-bootstrap"
        ? []
        : await this.serverReadModel.list(repositoryContext);
    const certificates =
      filter.kind && filter.kind !== "certificate"
        ? []
        : await this.certificateReadModel.list(repositoryContext);
    const remoteStates =
      filter.kind && filter.kind !== "remote-state"
        ? []
        : await this.remoteStateWorkReadModel.list(repositoryContext, {
            ...(filter.serverId ? { serverId: filter.serverId } : {}),
            ...(filter.limit ? { limit: filter.limit } : {}),
          });
    const sourceLinks =
      filter.kind && filter.kind !== "system"
        ? []
        : await this.sourceLinkReadModel.list(repositoryContext, {
            ...(filter.resourceId ? { resourceId: filter.resourceId } : {}),
            ...(filter.serverId ? { serverId: filter.serverId } : {}),
            ...(filter.limit ? { limit: filter.limit } : {}),
          });
    const routeRealizations =
      filter.kind && filter.kind !== "route-realization"
        ? []
        : await this.routeRealizationWorkReadModel.list(repositoryContext, {
            ...(filter.resourceId ? { resourceId: filter.resourceId } : {}),
            ...(filter.serverId ? { serverId: filter.serverId } : {}),
            ...(filter.deploymentId ? { deploymentId: filter.deploymentId } : {}),
            ...(filter.limit ? { limit: filter.limit } : {}),
          });

    const deploymentItems = deployments.map(deploymentToWorkItem);
    const serverItems = servers
      .map(serverProxyToWorkItem)
      .filter((item): item is OperatorWorkItem => item !== null);
    const certificateItems = certificates
      .map((certificate) =>
        certificateToWorkItem(certificate, bindingsById.get(certificate.domainBindingId)),
      )
      .filter((item): item is OperatorWorkItem => item !== null);
    const remoteStateItems = remoteStates.map(remoteStateToWorkItem);
    const sourceLinkItems = sourceLinks.map(sourceLinkToWorkItem);
    const routeRealizationItems = routeRealizations.map(routeRealizationToWorkItem);
    const processAttemptItems = processAttempts.map(processAttemptToWorkItem);
    const durableItems = durableWorkItems.map(durableWorkToWorkItem);

    const itemsById = new Map<string, OperatorWorkItem>();
    for (const item of [...processAttemptItems, ...durableItems]) {
      itemsById.set(item.id, item);
    }
    for (const item of [
      ...deploymentItems,
      ...serverItems,
      ...certificateItems,
      ...remoteStateItems,
      ...sourceLinkItems,
      ...routeRealizationItems,
    ]) {
      if (
        !itemsById.has(item.id) &&
        !hasDurableSameProxyScope([...processAttemptItems, ...durableItems], item)
      ) {
        itemsById.set(item.id, item);
      }
    }

    const items = [...itemsById.values()]
      .filter((item) => matchesFilter(item, filter))
      .sort(compareByUpdatedAtDesc)
      .slice(0, filter.limit);

    return {
      schemaVersion: "operator-work.list/v1",
      items,
      generatedAt: this.clock.now(),
    };
  }

  async show(
    context: ExecutionContext,
    query: ShowOperatorWorkQuery,
  ): Promise<Result<OperatorWorkDetail>> {
    const repositoryContext = toRepositoryContext(context);
    const processAttempt = await this.processAttemptReadModel.findOne(
      repositoryContext,
      query.workId,
    );

    if (processAttempt) {
      return ok({
        schemaVersion: "operator-work.show/v1",
        item: processAttemptToWorkItem(processAttempt),
        generatedAt: this.clock.now(),
      });
    }

    if (this.durableWorkLedger) {
      const durableWork = await this.durableWorkLedger.findItem(repositoryContext, query.workId);
      if (durableWork.isOk() && durableWork.value) {
        const events = await this.durableWorkLedger.listEvents(repositoryContext, query.workId);
        return ok({
          schemaVersion: "operator-work.show/v1",
          item: durableWorkToWorkItem(durableWork.value),
          ...(events.isOk() ? { events: events.value.map(durableEventToOperatorEvent) } : {}),
          generatedAt: this.clock.now(),
        });
      }
    }

    const list = await this.list(
      context,
      new ListOperatorWorkQuery(undefined, undefined, undefined, undefined, undefined, 200),
    );
    const item = list.items.find((candidate) => candidate.id === query.workId);

    if (!item) {
      return err(domainError.notFound("operator work item", query.workId));
    }

    return ok({
      schemaVersion: "operator-work.show/v1",
      item,
      generatedAt: list.generatedAt,
    });
  }
}
