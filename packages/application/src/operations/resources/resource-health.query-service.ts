import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentReadModel,
  type DeploymentSummary,
  type ResourceAccessSummary,
  type ResourceHealthCheck,
  type ResourceHealthDeploymentContext,
  type ResourceHealthOverall,
  type ResourceHealthPolicySection,
  type ResourceHealthSource,
  type ResourceHealthSourceError,
  type ResourceHealthSummary,
  type ResourceProxyHealthSection,
  type ResourcePublicAccessHealthSection,
  type ResourceRuntimeHealth,
  type ResourceRuntimeHealthSection,
  type ResourceSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListResourcesQueryService } from "./list-resources.query-service";
import { type ResourceHealthQuery } from "./resource-health.query";

type DeploymentTerminalStatus = "succeeded" | "failed" | "canceled" | "rolled-back";

const nonTerminalDeploymentStatuses = new Set<DeploymentSummary["status"]>([
  "created",
  "planning",
  "planned",
  "running",
]);

function compareCreatedAtDesc(left: DeploymentSummary, right: DeploymentSummary): number {
  const createdCompare = right.createdAt.localeCompare(left.createdAt);

  if (createdCompare !== 0) {
    return createdCompare;
  }

  return right.id.localeCompare(left.id);
}

function deploymentLastError(
  deployment: DeploymentSummary,
): ResourceHealthDeploymentContext["lastError"] {
  const lastError = [...deployment.logs].reverse().find((log) => log.level === "error");

  return lastError
    ? {
        timestamp: lastError.timestamp,
        phase: lastError.phase,
        message: lastError.message,
      }
    : undefined;
}

function isTerminalDeploymentStatus(
  status: DeploymentSummary["status"],
): status is DeploymentTerminalStatus {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "canceled" ||
    status === "rolled-back"
  );
}

function sourceError(input: {
  source: ResourceHealthSource;
  code: string;
  category: string;
  phase: string;
  retriable: boolean;
  relatedEntityId?: string;
  relatedState?: string;
  message?: string;
}): ResourceHealthSourceError {
  return {
    source: input.source,
    code: input.code,
    category: input.category,
    phase: input.phase,
    retriable: input.retriable,
    ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
    ...(input.relatedState ? { relatedState: input.relatedState } : {}),
    ...(input.message ? { message: input.message } : {}),
  };
}

function proxyProviderKey(accessSummary: ResourceAccessSummary | undefined): string | undefined {
  return (
    accessSummary?.latestDurableDomainRoute?.proxyKind ??
    accessSummary?.latestGeneratedAccessRoute?.proxyKind ??
    accessSummary?.plannedGeneratedAccessRoute?.proxyKind
  );
}

function latestDeploymentContext(
  deployment: DeploymentSummary | undefined,
): ResourceHealthDeploymentContext | undefined {
  if (!deployment) {
    return undefined;
  }

  const lastError = deploymentLastError(deployment);

  return {
    id: deployment.id,
    status: deployment.status,
    createdAt: deployment.createdAt,
    serverId: deployment.serverId,
    destinationId: deployment.destinationId,
    ...(deployment.startedAt ? { startedAt: deployment.startedAt } : {}),
    ...(deployment.finishedAt ? { finishedAt: deployment.finishedAt } : {}),
    ...(lastError ? { lastError } : {}),
  };
}

function runtimeSection(
  observedAt: string,
  deployment: DeploymentSummary | undefined,
  policyConfigured: boolean,
): ResourceRuntimeHealthSection {
  if (!deployment) {
    return {
      lifecycle: "not-deployed",
      health: "unknown",
      observedAt,
      reasonCode: "resource_latest_deployment_unavailable",
    };
  }

  if (nonTerminalDeploymentStatuses.has(deployment.status)) {
    return {
      lifecycle: "starting",
      health: "unknown",
      observedAt,
      runtimeKind: deployment.runtimePlan.execution.kind,
      reasonCode: "deployment_not_terminal",
    };
  }

  if (isTerminalDeploymentStatus(deployment.status) && deployment.status !== "succeeded") {
    return {
      lifecycle: "stopped",
      health: "unknown",
      observedAt,
      runtimeKind: deployment.runtimePlan.execution.kind,
      reasonCode: "latest_deployment_not_running",
    };
  }

  const health: ResourceRuntimeHealth = policyConfigured ? "unknown" : "not-configured";

  return {
    lifecycle: "running",
    health,
    observedAt,
    runtimeKind: deployment.runtimePlan.execution.kind,
    reasonCode: policyConfigured
      ? "runtime_probe_not_available"
      : "resource_health_policy_not_configured",
  };
}

function healthPolicySection(
  resource: ResourceSummary,
  deployment: DeploymentSummary | undefined,
): ResourceHealthPolicySection {
  const healthCheck = deployment?.runtimePlan.execution.healthCheck;
  const httpHealthCheck = healthCheck?.http;
  const healthCheckPath =
    httpHealthCheck?.path ?? deployment?.runtimePlan.execution.healthCheckPath;
  const port =
    httpHealthCheck?.port ??
    resource.networkProfile?.internalPort ??
    deployment?.runtimePlan.execution.port;

  if (healthCheck && !healthCheck.enabled) {
    return {
      status: "not-configured" as const,
      enabled: false,
      reasonCode: "resource_health_policy_disabled",
    };
  }

  if (!healthCheckPath && !healthCheck) {
    return {
      status: "not-configured" as const,
      enabled: false,
      reasonCode: "resource_health_policy_not_configured",
    };
  }

  return {
    status: "configured" as const,
    enabled: true,
    type: healthCheck?.type ?? "http",
    ...(healthCheckPath ? { path: healthCheckPath } : {}),
    ...(port ? { port } : {}),
    expectedStatusCode: httpHealthCheck?.expectedStatusCode ?? 200,
    ...(healthCheck
      ? {
          intervalSeconds: healthCheck.intervalSeconds,
          timeoutSeconds: healthCheck.timeoutSeconds,
          retries: healthCheck.retries,
          startPeriodSeconds: healthCheck.startPeriodSeconds,
        }
      : {}),
    reasonCode: "cached_policy_not_executed",
  };
}

function publicAccessSection(
  resource: ResourceSummary,
  sourceErrors: ResourceHealthSourceError[],
): ResourcePublicAccessHealthSection {
  const access = resource.accessSummary;
  const route =
    access?.latestDurableDomainRoute ??
    access?.latestGeneratedAccessRoute ??
    access?.plannedGeneratedAccessRoute;
  const kind: ResourcePublicAccessHealthSection["kind"] | undefined =
    route === access?.latestDurableDomainRoute
      ? "durable-domain"
      : route === access?.latestGeneratedAccessRoute
        ? "generated-latest"
        : route === access?.plannedGeneratedAccessRoute
          ? "generated-planned"
          : undefined;

  if (!route) {
    if (resource.networkProfile?.exposureMode === "reverse-proxy") {
      sourceErrors.push(
        sourceError({
          source: "public-access",
          code: "resource_public_access_unavailable",
          category: "infra",
          phase: "public-access-observation",
          retriable: true,
          relatedEntityId: resource.id,
          message: "No durable or generated public route is available for this resource.",
        }),
      );

      return {
        status: "not-ready",
        reasonCode: "resource_public_access_unavailable",
        phase: "public-access-observation",
      };
    }

    return {
      status: "not-configured",
      reasonCode: "resource_public_access_not_configured",
    };
  }

  switch (access?.proxyRouteStatus) {
    case "ready":
      return {
        status: "ready",
        url: route.url,
        ...(kind ? { kind } : {}),
      };
    case "failed":
      sourceErrors.push(
        sourceError({
          source: "public-access",
          code: "resource_public_access_probe_failed",
          category: "infra",
          phase: "public-access-observation",
          retriable: true,
          relatedEntityId: resource.id,
          relatedState: "failed",
          message: "The resource has a public route but its proxy route is failing.",
        }),
      );

      return {
        status: "failed",
        url: route.url,
        ...(kind ? { kind } : {}),
        reasonCode: "resource_public_access_probe_failed",
        phase: "public-access-observation",
      };
    case "not-ready":
      return {
        status: "not-ready",
        url: route.url,
        ...(kind ? { kind } : {}),
        reasonCode: "resource_public_access_not_ready",
        phase: "public-access-observation",
      };
    case "unknown":
    case undefined:
      return {
        status: "unknown",
        url: route.url,
        ...(kind ? { kind } : {}),
        reasonCode: "resource_public_access_not_observed",
      };
  }
}

function proxySection(
  resource: ResourceSummary,
  sourceErrors: ResourceHealthSourceError[],
): ResourceProxyHealthSection {
  if (resource.networkProfile?.exposureMode !== "reverse-proxy") {
    return {
      status: "not-configured",
      reasonCode: "resource_proxy_not_configured",
    };
  }

  const access = resource.accessSummary;
  const status = access?.proxyRouteStatus ?? "unknown";
  const providerKey = proxyProviderKey(access);

  if (status === "failed" || status === "not-ready") {
    sourceErrors.push(
      sourceError({
        source: "proxy",
        code: "resource_proxy_route_unavailable",
        category: "infra",
        phase: "proxy-route-observation",
        retriable: true,
        relatedEntityId: resource.id,
        relatedState: status,
        message: "The resource proxy route is not ready.",
      }),
    );
  }

  return {
    status,
    ...(providerKey ? { providerKey } : {}),
    ...(access?.lastRouteRealizationDeploymentId
      ? { lastRouteRealizationDeploymentId: access.lastRouteRealizationDeploymentId }
      : {}),
    ...(status === "unknown" ? { reasonCode: "resource_proxy_route_not_observed" } : {}),
    ...(status === "not-ready" ? { reasonCode: "resource_proxy_route_unavailable" } : {}),
    ...(status === "failed" ? { reasonCode: "resource_proxy_route_unavailable" } : {}),
  };
}

function checkRecords(input: {
  observedAt: string;
  runtime: ResourceRuntimeHealthSection;
  healthPolicy: ResourceHealthPolicySection;
  publicAccess: ResourcePublicAccessHealthSection;
  proxy: ResourceProxyHealthSection;
}): ResourceHealthCheck[] {
  const checks: ResourceHealthCheck[] = [
    {
      name: "runtime-lifecycle",
      target: "runtime",
      status:
        input.runtime.lifecycle === "running"
          ? "passed"
          : input.runtime.lifecycle === "not-deployed"
            ? "skipped"
            : input.runtime.lifecycle === "starting"
              ? "unknown"
              : "failed",
      observedAt: input.observedAt,
      ...(input.runtime.reasonCode ? { reasonCode: input.runtime.reasonCode } : {}),
    },
    {
      name: "health-policy",
      target: input.healthPolicy.type === "command" ? "command" : "container",
      status: input.healthPolicy.status === "configured" ? "unknown" : "skipped",
      observedAt: input.observedAt,
      ...(input.healthPolicy.reasonCode ? { reasonCode: input.healthPolicy.reasonCode } : {}),
      ...(input.healthPolicy.path ? { metadata: { path: input.healthPolicy.path } } : {}),
    },
    {
      name: "public-access",
      target: "public-access",
      status:
        input.publicAccess.status === "ready"
          ? "passed"
          : input.publicAccess.status === "failed" || input.publicAccess.status === "not-ready"
            ? "failed"
            : input.publicAccess.status === "not-configured"
              ? "skipped"
              : "unknown",
      observedAt: input.observedAt,
      ...(input.publicAccess.reasonCode ? { reasonCode: input.publicAccess.reasonCode } : {}),
      ...(input.publicAccess.phase ? { phase: input.publicAccess.phase } : {}),
    },
    {
      name: "proxy-route",
      target: "proxy-route",
      status:
        input.proxy.status === "ready"
          ? "passed"
          : input.proxy.status === "failed" || input.proxy.status === "not-ready"
            ? "failed"
            : input.proxy.status === "not-configured"
              ? "skipped"
              : "unknown",
      observedAt: input.observedAt,
      ...(input.proxy.reasonCode ? { reasonCode: input.proxy.reasonCode } : {}),
    },
  ];

  return checks;
}

function overallStatus(input: {
  deployment: DeploymentSummary | undefined;
  runtime: ResourceRuntimeHealthSection;
  healthPolicy: ResourceHealthPolicySection;
  publicAccess: ResourcePublicAccessHealthSection;
  proxy: ResourceProxyHealthSection;
}): ResourceHealthOverall {
  if (!input.deployment) {
    return "not-deployed";
  }

  if (input.runtime.lifecycle === "starting" || input.runtime.lifecycle === "restarting") {
    return "starting";
  }

  if (input.runtime.lifecycle === "stopped" || input.runtime.lifecycle === "exited") {
    return "stopped";
  }

  if (
    input.publicAccess.status === "failed" ||
    input.publicAccess.status === "not-ready" ||
    input.proxy.status === "failed" ||
    input.proxy.status === "not-ready"
  ) {
    return "degraded";
  }

  if (input.healthPolicy.status !== "configured") {
    return "unknown";
  }

  return "unknown";
}

@injectable()
export class ResourceHealthQueryService {
  constructor(
    @inject(tokens.listResourcesQueryService)
    private readonly listResourcesQueryService: ListResourcesQueryService,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ResourceHealthQuery,
  ): Promise<Result<ResourceHealthSummary>> {
    const resourceResult = await this.resolveResource(context, query.resourceId);
    if (resourceResult.isErr()) {
      return err(resourceResult.error);
    }

    const resource = resourceResult.value;
    const deploymentsResult = await this.resolveDeployments(context, resource.id);
    if (deploymentsResult.isErr()) {
      return err(deploymentsResult.error);
    }

    const deployments = deploymentsResult.value;
    const latestDeployment = this.latestDeployment(resource, deployments);
    const generatedAt = this.clock.now();
    const observedAt = generatedAt;
    const sourceErrors: ResourceHealthSourceError[] = [];
    const latestDeploymentHealthContext = latestDeploymentContext(latestDeployment);

    this.recordUnsupportedLiveProbeRequests(query, resource, sourceErrors);

    if (!latestDeployment) {
      sourceErrors.push(
        sourceError({
          source: "deployment",
          code: "resource_latest_deployment_unavailable",
          category: "user",
          phase: "latest-deployment-resolution",
          retriable: false,
          relatedEntityId: resource.id,
          message: "No latest deployment context exists for this resource.",
        }),
      );
    }

    const healthPolicy = healthPolicySection(resource, latestDeployment);
    if (healthPolicy.status === "not-configured" && latestDeployment?.status === "succeeded") {
      sourceErrors.push(
        sourceError({
          source: "health-policy",
          code: "resource_health_policy_not_configured",
          category: "user",
          phase: "health-policy-resolution",
          retriable: false,
          relatedEntityId: resource.id,
          message: "No resource health policy is configured.",
        }),
      );
    }

    const runtime = runtimeSection(
      observedAt,
      latestDeployment,
      healthPolicy.status === "configured",
    );
    const publicAccess = publicAccessSection(resource, sourceErrors);
    const proxy = proxySection(resource, sourceErrors);
    const overall = overallStatus({
      deployment: latestDeployment,
      runtime,
      healthPolicy,
      publicAccess,
      proxy,
    });

    return ok({
      schemaVersion: "resources.health/v1",
      resourceId: resource.id,
      generatedAt,
      observedAt,
      overall,
      ...(latestDeploymentHealthContext ? { latestDeployment: latestDeploymentHealthContext } : {}),
      runtime,
      healthPolicy,
      publicAccess,
      proxy,
      checks: query.includeChecks
        ? checkRecords({
            observedAt,
            runtime,
            healthPolicy,
            publicAccess,
            proxy,
          })
        : [],
      sourceErrors,
    });
  }

  private async resolveResource(
    context: ExecutionContext,
    resourceId: string,
  ): Promise<Result<ResourceSummary>> {
    try {
      const resources = await this.listResourcesQueryService.execute(context);
      const resource = resources.items.find((candidate) => candidate.id === resourceId);

      return resource ? ok(resource) : err(domainError.notFound("resource", resourceId));
    } catch (error) {
      return err(
        domainError.resourceHealthUnavailable(
          error instanceof Error ? error.message : "Resource health is unavailable",
          {
            resourceId,
            phase: "read-model-load",
          },
        ),
      );
    }
  }

  private async resolveDeployments(
    context: ExecutionContext,
    resourceId: string,
  ): Promise<Result<DeploymentSummary[]>> {
    try {
      return ok(
        await this.deploymentReadModel.list(toRepositoryContext(context), {
          resourceId,
        }),
      );
    } catch (error) {
      return err(
        domainError.resourceHealthUnavailable(
          error instanceof Error ? error.message : "Resource health is unavailable",
          {
            resourceId,
            phase: "latest-deployment-read",
          },
        ),
      );
    }
  }

  private recordUnsupportedLiveProbeRequests(
    query: ResourceHealthQuery,
    resource: ResourceSummary,
    sourceErrors: ResourceHealthSourceError[],
  ): void {
    if (query.mode === "live") {
      sourceErrors.push(
        sourceError({
          source: "health-check",
          code: "resource_health_live_probe_unavailable",
          category: "infra",
          phase: "live-probe",
          retriable: true,
          relatedEntityId: resource.id,
          message: "Live resource health probes are not available in this implementation slice.",
        }),
      );
    }

    if (query.includePublicAccessProbe) {
      sourceErrors.push(
        sourceError({
          source: "public-access",
          code: "resource_public_access_live_probe_unavailable",
          category: "infra",
          phase: "public-access-live-probe",
          retriable: true,
          relatedEntityId: resource.id,
          message: "Live public access probes are not available in this implementation slice.",
        }),
      );
    }

    if (query.includeRuntimeProbe) {
      sourceErrors.push(
        sourceError({
          source: "runtime",
          code: "resource_runtime_live_probe_unavailable",
          category: "infra",
          phase: "runtime-live-probe",
          retriable: true,
          relatedEntityId: resource.id,
          message: "Live runtime probes are not available in this implementation slice.",
        }),
      );
    }
  }

  private latestDeployment(
    resource: ResourceSummary,
    deployments: DeploymentSummary[],
  ): DeploymentSummary | undefined {
    if (resource.lastDeploymentId) {
      const matchingDeployment = deployments.find(
        (deployment) => deployment.id === resource.lastDeploymentId,
      );

      if (matchingDeployment) {
        return matchingDeployment;
      }
    }

    return [...deployments].sort(compareCreatedAtDesc)[0];
  }
}
