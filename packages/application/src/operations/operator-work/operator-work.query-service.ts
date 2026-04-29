import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

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
  type OperatorWorkItem,
  type OperatorWorkKind,
  type OperatorWorkList,
  type OperatorWorkNextAction,
  type OperatorWorkStatus,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type ServerReadModel,
  type ServerSummary,
} from "../../ports";
import { EmptyProcessAttemptReadModel } from "../../process-attempt-journal";
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
  /secret|password|passphrase|private[_-]?key|token|credential|command[_-]?line|commandline/i;
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
    serverId: deployment.serverId,
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
      destinationId: deployment.destinationId,
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

    const deploymentItems = deployments.map(deploymentToWorkItem);
    const serverItems = servers
      .map(serverProxyToWorkItem)
      .filter((item): item is OperatorWorkItem => item !== null);
    const certificateItems = certificates
      .map((certificate) =>
        certificateToWorkItem(certificate, bindingsById.get(certificate.domainBindingId)),
      )
      .filter((item): item is OperatorWorkItem => item !== null);
    const durableItems = processAttempts.map(processAttemptToWorkItem);

    const itemsById = new Map<string, OperatorWorkItem>();
    for (const item of durableItems) {
      itemsById.set(item.id, item);
    }
    for (const item of [...deploymentItems, ...serverItems, ...certificateItems]) {
      if (!itemsById.has(item.id) && !hasDurableSameProxyScope(durableItems, item)) {
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
