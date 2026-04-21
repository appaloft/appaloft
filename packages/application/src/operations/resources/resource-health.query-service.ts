import {
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type ResourceState,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type ResourceAccessSummary,
  type ResourceHealthCheck,
  type ResourceHealthDeploymentContext,
  type ResourceHealthOverall,
  type ResourceHealthPolicySection,
  type ResourceHealthProbeRequest,
  type ResourceHealthProbeResult,
  type ResourceHealthProbeRunner,
  type ResourceHealthSource,
  type ResourceHealthSourceError,
  type ResourceHealthSummary,
  type ResourceProxyHealthSection,
  type ResourcePublicAccessHealthSection,
  type ResourceRepository,
  type ResourceRuntimeHealth,
  type ResourceRuntimeHealthSection,
  type ResourceSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  currentNonReadyDurableDomainBinding,
  durableDomainBindingNotReadyCategory,
  durableDomainBindingNotReadyMessage,
  durableDomainBindingUrl,
} from "./durable-domain-observation";
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
    accessSummary?.latestServerAppliedDomainRoute?.proxyKind ??
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

interface ResolvedHttpHealthPolicy {
  enabled: boolean;
  type: "http";
  method: "GET" | "HEAD" | "POST" | "OPTIONS";
  scheme: "http" | "https";
  host: string;
  path: string;
  port?: number;
  expectedStatusCode: number;
  expectedResponseText?: string;
  intervalSeconds: number;
  timeoutSeconds: number;
  retries: number;
  startPeriodSeconds: number;
}

function httpPolicyFromResourceState(
  resource: ResourceSummary,
  resourceState: ResourceState | undefined,
): ResolvedHttpHealthPolicy | undefined {
  const healthCheck = resourceState?.runtimeProfile?.healthCheck;
  if (!healthCheck) {
    const path = resourceState?.runtimeProfile?.healthCheckPath?.value;
    return path
      ? {
          enabled: true,
          type: "http",
          method: "GET",
          scheme: "http",
          host: "localhost",
          path,
          ...(resource.networkProfile?.internalPort
            ? { port: resource.networkProfile.internalPort }
            : {}),
          expectedStatusCode: 200,
          intervalSeconds: 5,
          timeoutSeconds: 5,
          retries: 10,
          startPeriodSeconds: 5,
        }
      : undefined;
  }

  const http = healthCheck.http;
  if (!healthCheck.enabled || healthCheck.type.value !== "http" || !http) {
    return {
      enabled: healthCheck.enabled,
      type: "http",
      method: "GET",
      scheme: "http",
      host: "localhost",
      path: resourceState?.runtimeProfile?.healthCheckPath?.value ?? "/",
      expectedStatusCode: 200,
      intervalSeconds: healthCheck.intervalSeconds.value,
      timeoutSeconds: healthCheck.timeoutSeconds.value,
      retries: healthCheck.retries.value,
      startPeriodSeconds: healthCheck.startPeriodSeconds.value,
    };
  }

  const port = http.port?.value ?? resource.networkProfile?.internalPort;

  return {
    enabled: healthCheck.enabled,
    type: "http",
    method: http.method.value,
    scheme: http.scheme.value,
    host: http.host.value,
    path: http.path.value,
    ...(port ? { port } : {}),
    expectedStatusCode: http.expectedStatusCode.value,
    ...(http.expectedResponseText ? { expectedResponseText: http.expectedResponseText.value } : {}),
    intervalSeconds: healthCheck.intervalSeconds.value,
    timeoutSeconds: healthCheck.timeoutSeconds.value,
    retries: healthCheck.retries.value,
    startPeriodSeconds: healthCheck.startPeriodSeconds.value,
  };
}

function httpPolicyFromDeployment(
  resource: ResourceSummary,
  deployment: DeploymentSummary | undefined,
): ResolvedHttpHealthPolicy | undefined {
  const healthCheck = deployment?.runtimePlan.execution.healthCheck;
  const http = healthCheck?.http;
  const path = http?.path ?? deployment?.runtimePlan.execution.healthCheckPath;
  if (!healthCheck && !path) {
    return undefined;
  }

  if (healthCheck && (!healthCheck.enabled || healthCheck.type !== "http")) {
    return {
      enabled: healthCheck.enabled,
      type: "http",
      method: "GET",
      scheme: "http",
      host: "localhost",
      path: path ?? "/",
      expectedStatusCode: 200,
      intervalSeconds: healthCheck.intervalSeconds,
      timeoutSeconds: healthCheck.timeoutSeconds,
      retries: healthCheck.retries,
      startPeriodSeconds: healthCheck.startPeriodSeconds,
    };
  }

  const port =
    http?.port ?? resource.networkProfile?.internalPort ?? deployment?.runtimePlan.execution.port;

  return {
    enabled: true,
    type: "http",
    method: http?.method ?? "GET",
    scheme: http?.scheme ?? "http",
    host: http?.host ?? "localhost",
    path: path ?? "/",
    ...(port ? { port } : {}),
    expectedStatusCode: http?.expectedStatusCode ?? 200,
    ...(http?.expectedResponseText ? { expectedResponseText: http.expectedResponseText } : {}),
    intervalSeconds: healthCheck?.intervalSeconds ?? 5,
    timeoutSeconds: healthCheck?.timeoutSeconds ?? 5,
    retries: healthCheck?.retries ?? 10,
    startPeriodSeconds: healthCheck?.startPeriodSeconds ?? 5,
  };
}

function resolvedHttpHealthPolicy(input: {
  resource: ResourceSummary;
  resourceState: ResourceState | undefined;
  deployment: DeploymentSummary | undefined;
}): ResolvedHttpHealthPolicy | undefined {
  return (
    httpPolicyFromResourceState(input.resource, input.resourceState) ??
    httpPolicyFromDeployment(input.resource, input.deployment)
  );
}

function healthPolicySection(
  resource: ResourceSummary,
  resourceState: ResourceState | undefined,
  deployment: DeploymentSummary | undefined,
): ResourceHealthPolicySection {
  const healthCheck = resolvedHttpHealthPolicy({
    resource,
    resourceState,
    deployment,
  });

  if (healthCheck && !healthCheck.enabled) {
    return {
      status: "not-configured" as const,
      enabled: false,
      reasonCode: "resource_health_policy_disabled",
    };
  }

  if (!healthCheck) {
    return {
      status: "not-configured" as const,
      enabled: false,
      reasonCode: "resource_health_policy_not_configured",
    };
  }

  return {
    status: "configured" as const,
    enabled: true,
    type: "http",
    path: healthCheck.path,
    ...(healthCheck.port ? { port: healthCheck.port } : {}),
    expectedStatusCode: healthCheck.expectedStatusCode,
    intervalSeconds: healthCheck.intervalSeconds,
    timeoutSeconds: healthCheck.timeoutSeconds,
    retries: healthCheck.retries,
    startPeriodSeconds: healthCheck.startPeriodSeconds,
    reasonCode: "cached_policy_not_executed",
  };
}

function publicAccessSection(
  resource: ResourceSummary,
  domainBindings: DomainBindingSummary[],
  sourceErrors: ResourceHealthSourceError[],
): ResourcePublicAccessHealthSection {
  const access = resource.accessSummary;
  const nonReadyDurableBinding = currentNonReadyDurableDomainBinding(domainBindings, access);

  if (nonReadyDurableBinding) {
    sourceErrors.push(
      sourceError({
        source: "domain-binding",
        code: "resource_domain_binding_not_ready",
        category: durableDomainBindingNotReadyCategory(nonReadyDurableBinding),
        phase: "public-access-observation",
        retriable: true,
        relatedEntityId: nonReadyDurableBinding.id,
        relatedState: nonReadyDurableBinding.status,
        message: durableDomainBindingNotReadyMessage(nonReadyDurableBinding),
      }),
    );

    return {
      status: "not-ready",
      url: durableDomainBindingUrl(nonReadyDurableBinding),
      kind: "durable-domain",
      reasonCode: "resource_domain_binding_not_ready",
      phase: "public-access-observation",
    };
  }

  const route =
    access?.latestDurableDomainRoute ??
    access?.latestServerAppliedDomainRoute ??
    access?.latestGeneratedAccessRoute ??
    access?.plannedGeneratedAccessRoute;
  const kind: ResourcePublicAccessHealthSection["kind"] | undefined =
    route === access?.latestDurableDomainRoute
      ? "durable-domain"
      : route === access?.latestServerAppliedDomainRoute
        ? "server-applied-domain"
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
  liveChecks?: ResourceHealthCheck[];
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
      target: input.healthPolicy.type === "command" ? "command" : "runtime",
      status:
        input.liveChecks?.find((check) => check.name === "health-policy")?.status ??
        (input.healthPolicy.status === "configured" ? "unknown" : "skipped"),
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

  return checks.map((check) => input.liveChecks?.find((live) => live.name === check.name) ?? check);
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

  if (input.runtime.health === "unhealthy") {
    return "unhealthy";
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

  if (
    input.runtime.lifecycle === "running" &&
    input.runtime.health === "healthy" &&
    input.healthPolicy.status === "configured" &&
    (input.publicAccess.status === "ready" || input.publicAccess.status === "not-configured") &&
    (input.proxy.status === "ready" || input.proxy.status === "not-configured")
  ) {
    return "healthy";
  }

  return "unknown";
}

function positiveIntegerFromString(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function checkFromProbeResult(result: ResourceHealthProbeResult): ResourceHealthCheck {
  return {
    name: result.name,
    target: result.target,
    status: result.status,
    observedAt: result.observedAt,
    durationMs: result.durationMs,
    ...(result.statusCode ? { statusCode: result.statusCode } : {}),
    ...(result.message ? { message: result.message } : {}),
    ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}),
    ...(typeof result.retriable === "boolean" ? { retriable: result.retriable } : {}),
    ...(result.metadata ? { metadata: result.metadata } : {}),
  };
}

function withPolicyPath(rawUrl: string, path: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    url.pathname = path.startsWith("/") ? path : `/${path}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function isRemoteLoopbackUrl(rawUrl: string, deployment: DeploymentSummary): boolean {
  if (deployment.runtimePlan.target.providerKey !== "generic-ssh") {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  } catch {
    return false;
  }
}

function runtimeProbeUrl(input: {
  resource: ResourceSummary;
  deployment: DeploymentSummary;
  policy: ResolvedHttpHealthPolicy;
}): string | undefined {
  const metadata = input.deployment.runtimePlan.execution.metadata;
  const metadataUrl = metadata?.url ?? metadata?.publicUrl;
  if (metadataUrl && !isRemoteLoopbackUrl(metadataUrl, input.deployment)) {
    const url = withPolicyPath(metadataUrl, input.policy.path);
    if (url) {
      return url;
    }
  }

  const publishedPort = positiveIntegerFromString(metadata?.publishedPort);
  if (
    publishedPort &&
    (input.deployment.runtimePlan.target.providerKey === "local-shell" ||
      input.deployment.runtimePlan.target.providerKey === "local")
  ) {
    return `${input.policy.scheme}://127.0.0.1:${publishedPort}${input.policy.path}`;
  }

  if (
    input.deployment.runtimePlan.target.providerKey === "local-shell" &&
    input.deployment.runtimePlan.execution.port
  ) {
    return `${input.policy.scheme}://127.0.0.1:${input.deployment.runtimePlan.execution.port}${input.policy.path}`;
  }

  const publicRoute =
    input.resource.accessSummary?.latestDurableDomainRoute ??
    input.resource.accessSummary?.latestServerAppliedDomainRoute ??
    input.resource.accessSummary?.latestGeneratedAccessRoute;
  return publicRoute ? withPolicyPath(publicRoute.url, input.policy.path) : undefined;
}

function publicAccessProbeUrl(
  publicAccess: ResourcePublicAccessHealthSection,
  policy: ResolvedHttpHealthPolicy,
): string | undefined {
  if (!publicAccess.url) {
    return undefined;
  }

  return withPolicyPath(publicAccess.url, policy.path);
}

@injectable()
export class ResourceHealthQueryService {
  constructor(
    @inject(tokens.listResourcesQueryService)
    private readonly listResourcesQueryService: ListResourcesQueryService,
    @inject(tokens.domainBindingReadModel)
    private readonly domainBindingReadModel: DomainBindingReadModel,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.resourceHealthProbeRunner)
    private readonly probeRunner: ResourceHealthProbeRunner,
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
    const resourceStateResult = await this.resolveResourceState(context, resource.id);
    if (resourceStateResult.isErr()) {
      return err(resourceStateResult.error);
    }
    const resourceState = resourceStateResult.value;
    const domainBindingsResult = await this.resolveDomainBindings(context, resource.id);
    if (domainBindingsResult.isErr()) {
      return err(domainBindingsResult.error);
    }
    const domainBindings = domainBindingsResult.value;
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

    this.recordUnsupportedLiveInspectionRequests(query, resource, sourceErrors);

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

    let healthPolicy = healthPolicySection(resource, resourceState, latestDeployment);
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

    let runtime = runtimeSection(
      observedAt,
      latestDeployment,
      healthPolicy.status === "configured",
    );
    let publicAccess = publicAccessSection(resource, domainBindings, sourceErrors);
    const proxy = proxySection(resource, sourceErrors);
    const liveChecks: ResourceHealthCheck[] = [];

    const resolvedPolicy = resolvedHttpHealthPolicy({
      resource,
      resourceState,
      deployment: latestDeployment,
    });

    if (
      query.mode === "live" &&
      latestDeployment &&
      runtime.lifecycle === "running" &&
      healthPolicy.status === "configured" &&
      resolvedPolicy?.enabled
    ) {
      const request = this.runtimeProbeRequest(resource, latestDeployment, resolvedPolicy);

      if (request) {
        const probeResult = await this.probeRunner.probe(context, request);
        if (probeResult.isOk()) {
          const check = checkFromProbeResult(probeResult.value);
          liveChecks.push(check);

          if (probeResult.value.status === "passed") {
            runtime = {
              ...runtime,
              health: "healthy",
              reasonCode: "resource_health_check_passed",
              observedAt: probeResult.value.observedAt,
            };
            healthPolicy = {
              ...healthPolicy,
              reasonCode: "resource_health_check_passed",
            };
          } else {
            runtime = {
              ...runtime,
              health: "unhealthy",
              reasonCode: probeResult.value.reasonCode ?? "resource_health_check_failed",
              observedAt: probeResult.value.observedAt,
              ...(probeResult.value.message ? { message: probeResult.value.message } : {}),
            };
            sourceErrors.push(
              sourceError({
                source: "health-check",
                code: probeResult.value.reasonCode ?? "resource_health_check_failed",
                category: "infra",
                phase: "health-check-execution",
                retriable: probeResult.value.retriable ?? true,
                relatedEntityId: resource.id,
                ...(probeResult.value.message ? { message: probeResult.value.message } : {}),
              }),
            );
          }
        } else {
          sourceErrors.push(
            sourceError({
              source: "health-check",
              code: probeResult.error.code,
              category: probeResult.error.category,
              phase: "health-check-execution",
              retriable: probeResult.error.retryable,
              relatedEntityId: resource.id,
              message: probeResult.error.message,
            }),
          );
        }
      } else {
        sourceErrors.push(
          sourceError({
            source: "health-check",
            code: "resource_health_check_unavailable",
            category: "infra",
            phase: "health-check-execution",
            retriable: true,
            relatedEntityId: resource.id,
            message: "No safe current runtime URL can be resolved for this resource health policy.",
          }),
        );
      }
    }

    if (
      query.mode === "live" &&
      query.includePublicAccessProbe &&
      resolvedPolicy?.enabled &&
      healthPolicy.status === "configured"
    ) {
      const request = this.publicAccessProbeRequest(publicAccess, resolvedPolicy);
      if (request) {
        const probeResult = await this.probeRunner.probe(context, request);
        if (probeResult.isOk()) {
          const check = checkFromProbeResult(probeResult.value);
          liveChecks.push(check);

          if (probeResult.value.status === "passed") {
            const { phase, reasonCode, ...readyPublicAccess } = publicAccess;
            void phase;
            void reasonCode;
            publicAccess = {
              ...readyPublicAccess,
              status: "ready",
            };
          } else {
            publicAccess = {
              ...publicAccess,
              status: "failed",
              reasonCode: "resource_public_access_probe_failed",
              phase: "public-access-observation",
            };
            sourceErrors.push(
              sourceError({
                source: "public-access",
                code: "resource_public_access_probe_failed",
                category: "infra",
                phase: "public-access-observation",
                retriable: probeResult.value.retriable ?? true,
                relatedEntityId: resource.id,
                ...(probeResult.value.message ? { message: probeResult.value.message } : {}),
              }),
            );
          }
        } else {
          sourceErrors.push(
            sourceError({
              source: "public-access",
              code: "resource_public_access_probe_failed",
              category: probeResult.error.category,
              phase: "public-access-observation",
              retriable: probeResult.error.retryable,
              relatedEntityId: resource.id,
              message: probeResult.error.message,
            }),
          );
        }
      }
    }

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
            liveChecks,
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

  private async resolveResourceState(
    context: ExecutionContext,
    resourceId: string,
  ): Promise<Result<ResourceState | undefined>> {
    try {
      const parsedResourceId = ResourceId.create(resourceId);
      if (parsedResourceId.isErr()) {
        return err(parsedResourceId.error);
      }

      const resource = await this.resourceRepository.findOne(
        toRepositoryContext(context),
        ResourceByIdSpec.create(parsedResourceId.value),
      );

      return ok(resource?.toState());
    } catch (error) {
      return err(
        domainError.resourceHealthUnavailable(
          error instanceof Error ? error.message : "Resource health is unavailable",
          {
            resourceId,
            phase: "resource-resolution",
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

  private async resolveDomainBindings(
    context: ExecutionContext,
    resourceId: string,
  ): Promise<Result<DomainBindingSummary[]>> {
    try {
      return ok(
        await this.domainBindingReadModel.list(toRepositoryContext(context), {
          resourceId,
        }),
      );
    } catch (error) {
      return err(
        domainError.resourceHealthUnavailable(
          error instanceof Error ? error.message : "Resource health is unavailable",
          {
            resourceId,
            phase: "read-model-load",
            source: "domain-binding",
          },
        ),
      );
    }
  }

  private runtimeProbeRequest(
    resource: ResourceSummary,
    deployment: DeploymentSummary,
    policy: ResolvedHttpHealthPolicy,
  ): ResourceHealthProbeRequest | undefined {
    const url = runtimeProbeUrl({ resource, deployment, policy });

    return url
      ? {
          name: "health-policy",
          target: "runtime",
          url,
          method: policy.method,
          expectedStatusCode: policy.expectedStatusCode,
          ...(policy.expectedResponseText
            ? { expectedResponseText: policy.expectedResponseText }
            : {}),
          timeoutSeconds: policy.timeoutSeconds,
        }
      : undefined;
  }

  private publicAccessProbeRequest(
    publicAccess: ResourcePublicAccessHealthSection,
    policy: ResolvedHttpHealthPolicy,
  ): ResourceHealthProbeRequest | undefined {
    const url = publicAccessProbeUrl(publicAccess, policy);

    return url
      ? {
          name: "public-access",
          target: "public-access",
          url,
          method: policy.method,
          expectedStatusCode: policy.expectedStatusCode,
          ...(policy.expectedResponseText
            ? { expectedResponseText: policy.expectedResponseText }
            : {}),
          timeoutSeconds: policy.timeoutSeconds,
        }
      : undefined;
  }

  private recordUnsupportedLiveInspectionRequests(
    query: ResourceHealthQuery,
    resource: ResourceSummary,
    sourceErrors: ResourceHealthSourceError[],
  ): void {
    if (query.mode === "live" && query.includeRuntimeProbe) {
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
