import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DiagnosticsPort,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type ProxyConfigurationStatus,
  type ProxyConfigurationView,
  type ResourceAccessFailureDiagnostic,
  type ResourceDiagnosticAccess,
  type ResourceDiagnosticContext,
  type ResourceDiagnosticCopyPayload,
  type ResourceDiagnosticDeployment,
  type ResourceDiagnosticLogLine,
  type ResourceDiagnosticLogSection,
  type ResourceDiagnosticProxy,
  type ResourceDiagnosticSectionStatus,
  type ResourceDiagnosticSource,
  type ResourceDiagnosticSourceError,
  type ResourceDiagnosticSummary,
  type ResourceRuntimeLogLine,
  type ResourceRuntimeLogsResult,
  type ResourceSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  currentNonReadyDurableDomainBinding,
  durableDomainBindingNotReadyCategory,
  durableDomainBindingNotReadyMessage,
} from "./durable-domain-observation";
import { type ListResourcesQueryService } from "./list-resources.query-service";
import { type ResourceDiagnosticSummaryQuery } from "./resource-diagnostic-summary.query";
import { ResourceProxyConfigurationPreviewQuery } from "./resource-proxy-configuration-preview.query";
import { type ResourceProxyConfigurationPreviewQueryService } from "./resource-proxy-configuration-preview.query-service";
import { ResourceRuntimeLogsQuery } from "./resource-runtime-logs.query";
import { type ResourceRuntimeLogsQueryService } from "./resource-runtime-logs.query-service";
import { routeIntentStatusDescriptors, selectedRouteIntentStatus } from "./route-intent-status";
import { sanitizeFailureMessage } from "./safe-diagnostic-message";

type DiagnosticSummaryCore = Omit<ResourceDiagnosticSummary, "copy">;

function compareCreatedAtDesc(left: DeploymentSummary, right: DeploymentSummary): number {
  const createdCompare = right.createdAt.localeCompare(left.createdAt);

  if (createdCompare !== 0) {
    return createdCompare;
  }

  return right.id.localeCompare(left.id);
}

function replaceAllText(value: string, search: string, replacement: string): string {
  return value.split(search).join(replacement);
}

function redactionsFromDeployment(deployment: DeploymentSummary | undefined): string[] {
  return (
    deployment?.environmentSnapshot.variables
      .filter((variable) => variable.isSecret)
      .map((variable) => variable.value)
      .filter((value) => value.trim().length > 0) ?? []
  );
}

function redactText(
  value: string,
  redactions: readonly string[],
): {
  value: string;
  masked: boolean;
} {
  let nextValue = value;
  let masked = false;

  for (const redaction of redactions) {
    if (!redaction || !nextValue.includes(redaction)) {
      continue;
    }

    nextValue = replaceAllText(nextValue, redaction, "********");
    masked = true;
  }

  return {
    value: nextValue,
    masked,
  };
}

function sourceError(input: {
  source: ResourceDiagnosticSource;
  code: string;
  category: string;
  phase: string;
  retryable: boolean;
  redactions: readonly string[];
  relatedEntityId?: string;
  relatedState?: string;
  message?: string;
}): ResourceDiagnosticSourceError {
  const redactedMessage = input.message
    ? sanitizeFailureMessage(input.message, input.redactions).value
    : "";

  return {
    source: input.source,
    code: input.code,
    category: input.category,
    phase: input.phase,
    retryable: input.retryable,
    ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
    ...(input.relatedState ? { relatedState: input.relatedState } : {}),
    ...(redactedMessage ? { message: redactedMessage } : {}),
  };
}

function sourceErrorFromDomainError(input: {
  source: ResourceDiagnosticSource;
  phase: string;
  error: DomainError;
  redactions: readonly string[];
  relatedEntityId?: string;
  relatedState?: string;
}): ResourceDiagnosticSourceError {
  return sourceError({
    source: input.source,
    code: input.error.code,
    category: input.error.category,
    phase: input.phase,
    retryable: input.error.retryable,
    redactions: input.redactions,
    ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
    ...(input.relatedState ? { relatedState: input.relatedState } : {}),
    message: input.error.message,
  });
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sourceErrorFromUnknown(input: {
  source: ResourceDiagnosticSource;
  phase: string;
  code: string;
  redactions: readonly string[];
  relatedEntityId?: string;
  relatedState?: string;
  error: unknown;
}): ResourceDiagnosticSourceError {
  return sourceError({
    source: input.source,
    code: input.code,
    category: "infra",
    phase: input.phase,
    retryable: true,
    redactions: input.redactions,
    ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
    ...(input.relatedState ? { relatedState: input.relatedState } : {}),
    message: messageFromUnknown(input.error),
  });
}

function sourceErrorFromAccessFailure(input: {
  diagnostic: ResourceAccessFailureDiagnostic;
  redactions: readonly string[];
}): ResourceDiagnosticSourceError {
  return sourceError({
    source: "access",
    code: input.diagnostic.code,
    category: input.diagnostic.category,
    phase: input.diagnostic.phase,
    retryable: input.diagnostic.retriable,
    redactions: input.redactions,
    ...(input.diagnostic.route?.resourceId
      ? { relatedEntityId: input.diagnostic.route.resourceId }
      : {}),
    relatedState: input.diagnostic.nextAction,
    message: `Latest edge access failure ${input.diagnostic.requestId}`,
  });
}

function accessStatus(
  resource: ResourceSummary,
  domainBindings: DomainBindingSummary[],
): ResourceDiagnosticSectionStatus {
  const access = resource.accessSummary;
  if (currentNonReadyDurableDomainBinding(domainBindings, access)) {
    return "unavailable";
  }

  if (
    access?.latestGeneratedAccessRoute ||
    access?.latestDurableDomainRoute ||
    access?.latestServerAppliedDomainRoute
  ) {
    return "available";
  }

  if (
    access?.plannedGeneratedAccessRoute ||
    resource.networkProfile?.exposureMode === "reverse-proxy"
  ) {
    return "unavailable";
  }

  return "not-configured";
}

function proxyStatus(resource: ResourceSummary): ResourceDiagnosticSectionStatus {
  switch (resource.accessSummary?.proxyRouteStatus) {
    case "ready":
      return "available";
    case "failed":
      return "failed";
    case "not-ready":
      return "unavailable";
    case "unknown":
      return "unknown";
    case undefined:
      return resource.networkProfile?.exposureMode === "reverse-proxy"
        ? "unknown"
        : "not-configured";
  }
}

function proxyConfigurationStatus(
  status: ProxyConfigurationStatus,
): ResourceDiagnosticSectionStatus {
  switch (status) {
    case "applied":
    case "planned":
    case "stale":
      return "available";
    case "failed":
      return "failed";
    case "not-configured":
      return "not-configured";
  }
}

function proxyProviderKey(
  resource: ResourceSummary,
  deployment: DeploymentSummary | undefined,
): string | undefined {
  const proxyKind =
    resource.accessSummary?.latestDurableDomainRoute?.proxyKind ??
    resource.accessSummary?.latestServerAppliedDomainRoute?.proxyKind ??
    resource.accessSummary?.latestGeneratedAccessRoute?.proxyKind ??
    resource.accessSummary?.plannedGeneratedAccessRoute?.proxyKind ??
    deployment?.runtimePlan.execution.accessRoutes?.find((route) => route.proxyKind !== "none")
      ?.proxyKind;

  return proxyKind && proxyKind !== "none" ? proxyKind : undefined;
}

@injectable()
export class ResourceDiagnosticSummaryQueryService {
  constructor(
    @inject(tokens.listResourcesQueryService)
    private readonly listResourcesQueryService: ListResourcesQueryService,
    @inject(tokens.domainBindingReadModel)
    private readonly domainBindingReadModel: DomainBindingReadModel,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.resourceRuntimeLogsQueryService)
    private readonly runtimeLogsQueryService: ResourceRuntimeLogsQueryService,
    @inject(tokens.resourceProxyConfigurationPreviewQueryService)
    private readonly proxyConfigurationQueryService: ResourceProxyConfigurationPreviewQueryService,
    @inject(tokens.diagnostics)
    private readonly diagnostics: DiagnosticsPort,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ResourceDiagnosticSummaryQuery,
  ): Promise<Result<ResourceDiagnosticSummary>> {
    const resourceResult = await this.resolveResource(context, query.resourceId);
    if (resourceResult.isErr()) {
      return err(resourceResult.error);
    }

    const resource = resourceResult.value;
    const domainBindingsResult = await this.resolveDomainBindings(context, resource.id);
    if (domainBindingsResult.isErr()) {
      return err(domainBindingsResult.error);
    }
    const domainBindings = domainBindingsResult.value;
    const deploymentResult = await this.resolveDeployment(context, query, resource);
    if (deploymentResult.isErr()) {
      return err(deploymentResult.error);
    }

    const deployment = deploymentResult.value;
    const redactions = redactionsFromDeployment(deployment);
    const sourceErrors: ResourceDiagnosticSourceError[] = [];
    const deploymentLogs = await this.buildDeploymentLogSection(
      context,
      query,
      deployment,
      redactions,
      sourceErrors,
    );
    const runtimeLogs = await this.buildRuntimeLogSection(
      context,
      query,
      deployment,
      redactions,
      sourceErrors,
    );
    const access = this.buildAccessSection(resource, domainBindings, redactions, sourceErrors);
    const proxy = await this.buildProxySection(
      context,
      query,
      resource,
      deployment,
      redactions,
      sourceErrors,
    );
    const system = await this.buildSystemSection(context, redactions, sourceErrors);
    const summaryCore: DiagnosticSummaryCore = {
      schemaVersion: "resources.diagnostic-summary/v1",
      generatedAt: this.clock.now(),
      focus: {
        resourceId: resource.id,
        ...(query.deploymentId ? { requestedDeploymentId: query.deploymentId } : {}),
        ...(deployment ? { deploymentId: deployment.id } : {}),
      },
      context: this.buildContext(resource, deployment),
      ...(deployment ? { deployment: this.buildDeployment(deployment, redactions) } : {}),
      access,
      proxy,
      deploymentLogs,
      runtimeLogs,
      system,
      sourceErrors,
      redaction: {
        policy: "deployment-environment-secrets",
        masked: [...deploymentLogs.lines, ...runtimeLogs.lines].some((line) => line.masked),
        maskedValueCount: redactions.length,
      },
    };
    const copyResult = this.buildCopyPayload(summaryCore, redactions);
    if (copyResult.isErr()) {
      return err(copyResult.error);
    }

    return ok({
      ...summaryCore,
      copy: copyResult.value,
    });
  }

  private async resolveResource(
    context: ExecutionContext,
    resourceId: string,
  ): Promise<Result<ResourceSummary>> {
    try {
      const listed = await this.listResourcesQueryService.execute(context);
      const resource = listed.items.find((candidate) => candidate.id === resourceId);

      if (!resource) {
        return err(domainError.notFound("resource", resourceId));
      }

      return ok(resource);
    } catch {
      return err(
        domainError.resourceDiagnosticUnavailable("Resource diagnostic summary is unavailable", {
          phase: "resource-resolution",
          resourceId,
        }),
      );
    }
  }

  private async resolveDeployment(
    context: ExecutionContext,
    query: ResourceDiagnosticSummaryQuery,
    resource: ResourceSummary,
  ): Promise<Result<DeploymentSummary | undefined>> {
    try {
      const resourceDeployments = (
        await this.deploymentReadModel.list(toRepositoryContext(context), {
          resourceId: resource.id,
        })
      ).sort(compareCreatedAtDesc);

      if (!query.deploymentId) {
        return ok(resourceDeployments[0]);
      }

      const matchingDeployment = resourceDeployments.find(
        (deployment) => deployment.id === query.deploymentId,
      );
      if (matchingDeployment) {
        return ok(matchingDeployment);
      }

      const allDeployments = await this.deploymentReadModel.list(toRepositoryContext(context));
      const selectedDeployment = allDeployments.find(
        (deployment) => deployment.id === query.deploymentId,
      );

      if (!selectedDeployment) {
        return err(domainError.notFound("deployment", query.deploymentId));
      }

      return err(
        domainError.resourceDiagnosticContextMismatch("Deployment does not belong to resource", {
          phase: "deployment-resolution",
          resourceId: resource.id,
          deploymentId: query.deploymentId,
          relatedEntityId: selectedDeployment.resourceId,
        }),
      );
    } catch {
      return err(
        domainError.resourceDiagnosticUnavailable("Resource diagnostic summary is unavailable", {
          phase: "deployment-resolution",
          resourceId: resource.id,
          deploymentId: query.deploymentId ?? null,
        }),
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
    } catch {
      return err(
        domainError.resourceDiagnosticUnavailable("Resource diagnostic summary is unavailable", {
          phase: "read-model-load",
          resourceId,
        }),
      );
    }
  }

  private buildContext(
    resource: ResourceSummary,
    deployment: DeploymentSummary | undefined,
  ): ResourceDiagnosticContext {
    return {
      projectId: resource.projectId,
      environmentId: resource.environmentId,
      resourceName: resource.name,
      resourceSlug: resource.slug,
      resourceKind: resource.kind,
      ...(resource.destinationId ? { destinationId: resource.destinationId } : {}),
      ...(deployment?.serverId ? { serverId: deployment.serverId } : {}),
      ...(deployment?.runtimePlan.execution.kind
        ? { runtimeStrategy: deployment.runtimePlan.execution.kind }
        : {}),
      ...(deployment?.runtimePlan.buildStrategy
        ? { buildStrategy: deployment.runtimePlan.buildStrategy }
        : {}),
      ...(deployment?.runtimePlan.packagingMode
        ? { packagingMode: deployment.runtimePlan.packagingMode }
        : {}),
      ...(deployment?.runtimePlan.target.kind
        ? { targetKind: deployment.runtimePlan.target.kind }
        : {}),
      ...(deployment?.runtimePlan.target.providerKey
        ? { targetProviderKey: deployment.runtimePlan.target.providerKey }
        : {}),
      services: resource.services,
      ...(resource.networkProfile ? { networkProfile: resource.networkProfile } : {}),
    };
  }

  private buildDeployment(
    deployment: DeploymentSummary,
    redactions: readonly string[],
  ): ResourceDiagnosticDeployment {
    const lastErrorLog = [...deployment.logs].reverse().find((log) => log.level === "error");

    return {
      id: deployment.id,
      status: deployment.status,
      lifecyclePhase: deployment.status,
      runtimePlanId: deployment.runtimePlan.id,
      sourceKind: deployment.runtimePlan.source.kind,
      sourceDisplayName: deployment.runtimePlan.source.displayName,
      serverId: deployment.serverId,
      destinationId: deployment.destinationId,
      createdAt: deployment.createdAt,
      ...(deployment.startedAt ? { startedAt: deployment.startedAt } : {}),
      ...(deployment.finishedAt ? { finishedAt: deployment.finishedAt } : {}),
      logCount: deployment.logCount,
      ...(lastErrorLog
        ? {
            lastError: {
              timestamp: lastErrorLog.timestamp,
              phase: lastErrorLog.phase,
              message: redactText(lastErrorLog.message, redactions).value,
            },
          }
        : {}),
    };
  }

  private buildAccessSection(
    resource: ResourceSummary,
    domainBindings: DomainBindingSummary[],
    redactions: readonly string[],
    sourceErrors: ResourceDiagnosticSourceError[],
  ): ResourceDiagnosticAccess {
    const access = resource.accessSummary;
    const blockingDurableBinding = currentNonReadyDurableDomainBinding(domainBindings, access);
    const status = accessStatus(resource, domainBindings);
    const latestAccessFailure = access?.latestAccessFailureDiagnostic;

    if (latestAccessFailure) {
      sourceErrors.push(
        sourceErrorFromAccessFailure({ diagnostic: latestAccessFailure, redactions }),
      );
    }

    if (blockingDurableBinding) {
      sourceErrors.push(
        sourceError({
          source: "access",
          code: "resource_domain_binding_not_ready",
          category: durableDomainBindingNotReadyCategory(blockingDurableBinding),
          phase: "access-summary",
          retryable: true,
          redactions,
          relatedEntityId: blockingDurableBinding.id,
          relatedState: blockingDurableBinding.status,
          message: durableDomainBindingNotReadyMessage(blockingDurableBinding),
        }),
      );
    } else if (status === "unavailable") {
      sourceErrors.push(
        sourceError({
          source: "access",
          code: "default_access_route_unavailable",
          category: "user",
          phase: "access-summary",
          retryable: false,
          redactions,
          relatedEntityId: resource.id,
          message: "No durable, server-applied, or generated access URL is currently available",
        }),
      );
    }

    const selectedRoute = selectedRouteIntentStatus({
      resourceId: resource.id,
      accessSummary: access,
      domainBindings: blockingDurableBinding ? [blockingDurableBinding] : [],
    });
    const routeIntentStatuses = routeIntentStatusDescriptors({
      resourceId: resource.id,
      accessSummary: access,
    });

    return {
      status: latestAccessFailure ? "failed" : status,
      ...(access?.latestGeneratedAccessRoute?.url
        ? { generatedUrl: access.latestGeneratedAccessRoute.url }
        : {}),
      ...(access?.latestDurableDomainRoute?.url
        ? { durableUrl: access.latestDurableDomainRoute.url }
        : {}),
      ...(access?.latestServerAppliedDomainRoute?.url
        ? { serverAppliedUrl: access.latestServerAppliedDomainRoute.url }
        : {}),
      ...(access?.plannedGeneratedAccessRoute?.url
        ? { plannedUrl: access.plannedGeneratedAccessRoute.url }
        : {}),
      ...(latestAccessFailure ? { latestAccessFailure } : {}),
      ...(selectedRoute ? { selectedRoute } : {}),
      ...(routeIntentStatuses.length > 0 ? { routeIntentStatuses } : {}),
      ...(access?.proxyRouteStatus ? { proxyRouteStatus: access.proxyRouteStatus } : {}),
      ...(access?.lastRouteRealizationDeploymentId
        ? { lastRouteRealizationDeploymentId: access.lastRouteRealizationDeploymentId }
        : {}),
      ...(blockingDurableBinding
        ? { reasonCode: "resource_domain_binding_not_ready", phase: "access-summary" }
        : latestAccessFailure
          ? { reasonCode: latestAccessFailure.code, phase: latestAccessFailure.phase }
          : status === "unavailable"
            ? { reasonCode: "default_access_route_unavailable", phase: "access-summary" }
            : {}),
    };
  }

  private async buildProxySection(
    context: ExecutionContext,
    query: ResourceDiagnosticSummaryQuery,
    resource: ResourceSummary,
    deployment: DeploymentSummary | undefined,
    redactions: readonly string[],
    sourceErrors: ResourceDiagnosticSourceError[],
  ): Promise<ResourceDiagnosticProxy> {
    const providerKey = proxyProviderKey(resource, deployment);
    const base: ResourceDiagnosticProxy = {
      status: proxyStatus(resource),
      configurationIncluded: query.includeProxyConfiguration,
      ...(providerKey ? { providerKey } : {}),
      ...(resource.accessSummary?.proxyRouteStatus
        ? { proxyRouteStatus: resource.accessSummary.proxyRouteStatus }
        : {}),
    };

    if (!query.includeProxyConfiguration) {
      return base;
    }

    const proxyQuery = ResourceProxyConfigurationPreviewQuery.create({
      resourceId: resource.id,
      ...(deployment ? { deploymentId: deployment.id } : {}),
      routeScope: "latest",
      includeDiagnostics: true,
    });
    if (proxyQuery.isErr()) {
      sourceErrors.push(
        sourceErrorFromDomainError({
          source: "proxy",
          phase: "proxy-summary",
          error: proxyQuery.error,
          redactions,
          relatedEntityId: resource.id,
        }),
      );
      return {
        ...base,
        status: "failed",
        reasonCode: proxyQuery.error.code,
        phase: "proxy-summary",
      };
    }

    let result: Result<ProxyConfigurationView>;
    try {
      result = await this.proxyConfigurationQueryService.execute(context, proxyQuery.value);
    } catch (error) {
      sourceErrors.push(
        sourceErrorFromUnknown({
          source: "proxy",
          phase: "proxy-summary",
          code: "proxy_configuration_unavailable",
          redactions,
          relatedEntityId: resource.id,
          error,
        }),
      );
      return {
        ...base,
        status: "unavailable",
        reasonCode: "proxy_configuration_unavailable",
        phase: "proxy-summary",
      };
    }

    if (result.isErr()) {
      sourceErrors.push(
        sourceErrorFromDomainError({
          source: "proxy",
          phase: "proxy-summary",
          error: result.error,
          redactions,
          relatedEntityId: resource.id,
        }),
      );
      return {
        ...base,
        status: result.error.retryable ? "unavailable" : "failed",
        reasonCode: result.error.code,
        phase: "proxy-summary",
      };
    }

    const view = result.value;
    return {
      ...base,
      status: proxyConfigurationStatus(view.status),
      providerKey: view.providerKey,
      configurationStatus: view.status,
      configurationGeneratedAt: view.generatedAt,
      routeCount: view.routes.length,
      sectionCount: view.sections.length,
      sections: view.sections.map((section) => ({
        id: section.id,
        title: section.title,
        format: section.format,
        redacted: section.redacted,
        source: section.source,
      })),
      ...(view.diagnostics?.tlsRoutes
        ? {
            tlsRoutes: view.diagnostics.tlsRoutes.map((route) => ({
              hostname: route.hostname,
              pathPrefix: route.pathPrefix,
              tlsMode: route.tlsMode,
              scheme: route.scheme,
              automation: route.automation,
              certificateSource: route.certificateSource,
              appaloftCertificateManaged: route.appaloftCertificateManaged,
              message: route.message,
            })),
          }
        : {}),
      warnings: view.warnings,
    };
  }

  private async buildDeploymentLogSection(
    context: ExecutionContext,
    query: ResourceDiagnosticSummaryQuery,
    deployment: DeploymentSummary | undefined,
    redactions: readonly string[],
    sourceErrors: ResourceDiagnosticSourceError[],
  ): Promise<ResourceDiagnosticLogSection> {
    if (!query.includeDeploymentLogTail) {
      return this.emptyLogSection("not-requested", query.tailLines);
    }

    if (!deployment) {
      sourceErrors.push(
        sourceError({
          source: "deployment-logs",
          code: "deployment_logs_unavailable",
          category: "user",
          phase: "deployment-log-tail",
          retryable: false,
          redactions,
          message: "No deployment attempt is available for deployment log tail",
        }),
      );
      return this.emptyLogSection("unavailable", query.tailLines, {
        reasonCode: "deployment_logs_unavailable",
        phase: "deployment-log-tail",
      });
    }

    try {
      const logs = await this.deploymentReadModel.findLogs(
        toRepositoryContext(context),
        deployment.id,
      );
      const tail = query.tailLines === 0 ? [] : logs.slice(-query.tailLines);
      const lines = tail.map((line) => this.deploymentLogLine(line, redactions));

      return {
        status: lines.length > 0 ? "available" : "empty",
        tailLimit: query.tailLines,
        lineCount: lines.length,
        lines,
      };
    } catch {
      sourceErrors.push(
        sourceError({
          source: "deployment-logs",
          code: "deployment_logs_unavailable",
          category: "infra",
          phase: "deployment-log-tail",
          retryable: true,
          redactions,
          relatedEntityId: deployment.id,
          relatedState: deployment.status,
          message: "Deployment logs could not be loaded",
        }),
      );
      return this.emptyLogSection("unavailable", query.tailLines, {
        reasonCode: "deployment_logs_unavailable",
        phase: "deployment-log-tail",
      });
    }
  }

  private async buildRuntimeLogSection(
    context: ExecutionContext,
    query: ResourceDiagnosticSummaryQuery,
    deployment: DeploymentSummary | undefined,
    redactions: readonly string[],
    sourceErrors: ResourceDiagnosticSourceError[],
  ): Promise<ResourceDiagnosticLogSection> {
    if (!query.includeRuntimeLogTail) {
      return this.emptyLogSection("not-requested", query.tailLines);
    }

    if (!deployment) {
      sourceErrors.push(
        sourceError({
          source: "runtime-logs",
          code: "resource_runtime_logs_unavailable",
          category: "user",
          phase: "runtime-log-tail",
          retryable: false,
          redactions,
          message: "No deployment attempt is available for runtime log tail",
        }),
      );
      return this.emptyLogSection("unavailable", query.tailLines, {
        reasonCode: "resource_runtime_logs_unavailable",
        phase: "runtime-log-tail",
      });
    }

    const runtimeQuery = ResourceRuntimeLogsQuery.create({
      resourceId: deployment.resourceId,
      deploymentId: deployment.id,
      tailLines: query.tailLines,
      follow: false,
    });
    if (runtimeQuery.isErr()) {
      sourceErrors.push(
        sourceErrorFromDomainError({
          source: "runtime-logs",
          phase: "runtime-log-tail",
          error: runtimeQuery.error,
          redactions,
          relatedEntityId: deployment.id,
          relatedState: deployment.status,
        }),
      );
      return this.emptyLogSection("failed", query.tailLines, {
        reasonCode: runtimeQuery.error.code,
        phase: "runtime-log-tail",
      });
    }

    let result: Result<ResourceRuntimeLogsResult>;
    try {
      result = await this.runtimeLogsQueryService.execute(context, runtimeQuery.value);
    } catch (error) {
      sourceErrors.push(
        sourceErrorFromUnknown({
          source: "runtime-logs",
          phase: "runtime-log-tail",
          code: "resource_runtime_logs_unavailable",
          redactions,
          relatedEntityId: deployment.id,
          relatedState: deployment.status,
          error,
        }),
      );
      return this.emptyLogSection("unavailable", query.tailLines, {
        reasonCode: "resource_runtime_logs_unavailable",
        phase: "runtime-log-tail",
      });
    }

    if (result.isErr()) {
      sourceErrors.push(
        sourceErrorFromDomainError({
          source: "runtime-logs",
          phase: "runtime-log-tail",
          error: result.error,
          redactions,
          relatedEntityId: deployment.id,
          relatedState: deployment.status,
        }),
      );
      return this.emptyLogSection(
        result.error.retryable ? "unavailable" : "failed",
        query.tailLines,
        {
          reasonCode: result.error.code,
          phase: "runtime-log-tail",
        },
      );
    }

    if (result.value.mode !== "bounded") {
      sourceErrors.push(
        sourceError({
          source: "runtime-logs",
          code: "resource_runtime_logs_unavailable",
          category: "infra",
          phase: "runtime-log-tail",
          retryable: true,
          redactions,
          relatedEntityId: deployment.id,
          relatedState: deployment.status,
          message: "Runtime logs returned a stream for a bounded diagnostic request",
        }),
      );
      return this.emptyLogSection("failed", query.tailLines, {
        reasonCode: "resource_runtime_logs_unavailable",
        phase: "runtime-log-tail",
      });
    }

    const lines = result.value.logs.map((line) => this.runtimeLogLine(line, redactions));

    return {
      status: lines.length > 0 ? "available" : "empty",
      tailLimit: query.tailLines,
      lineCount: lines.length,
      lines,
    };
  }

  private emptyLogSection(
    status: ResourceDiagnosticSectionStatus,
    tailLimit: number,
    input?: {
      reasonCode?: string;
      phase?: string;
    },
  ): ResourceDiagnosticLogSection {
    return {
      status,
      tailLimit,
      lineCount: 0,
      lines: [],
      ...(input?.reasonCode ? { reasonCode: input.reasonCode } : {}),
      ...(input?.phase ? { phase: input.phase } : {}),
    };
  }

  private deploymentLogLine(
    line: DeploymentLogSummary,
    redactions: readonly string[],
  ): ResourceDiagnosticLogLine {
    const message = redactText(line.message, redactions);

    return {
      timestamp: line.timestamp,
      source: line.source,
      phase: line.phase,
      level: line.level,
      message: message.value,
      masked: Boolean(line.masked) || message.masked,
    };
  }

  private runtimeLogLine(
    line: ResourceRuntimeLogLine,
    redactions: readonly string[],
  ): ResourceDiagnosticLogLine {
    const message = redactText(line.message, redactions);

    return {
      ...(line.timestamp ? { timestamp: line.timestamp } : {}),
      ...(line.stream ? { stream: line.stream } : {}),
      ...(line.serviceName ? { serviceName: line.serviceName } : {}),
      message: message.value,
      masked: line.masked || message.masked,
    };
  }

  private async buildSystemSection(
    context: ExecutionContext,
    redactions: readonly string[],
    sourceErrors: ResourceDiagnosticSourceError[],
  ): Promise<ResourceDiagnosticSummary["system"]> {
    const base: ResourceDiagnosticSummary["system"] = {
      entrypoint: context.entrypoint,
      requestId: context.requestId,
      locale: context.locale,
    };

    try {
      const readiness = await this.diagnostics.readiness();
      const databaseDriver = readiness.details?.databaseDriver;
      const databaseMode = readiness.details?.databaseMode;

      return {
        ...base,
        readinessStatus: readiness.status,
        ...(databaseDriver ? { databaseDriver } : {}),
        ...(databaseMode ? { databaseMode } : {}),
      };
    } catch {
      sourceErrors.push(
        sourceError({
          source: "system",
          code: "system_context_unavailable",
          category: "infra",
          phase: "system-context",
          retryable: true,
          redactions,
          message: "Safe system diagnostic context could not be loaded",
        }),
      );
      return base;
    }
  }

  private buildCopyPayload(
    summary: DiagnosticSummaryCore,
    redactions: readonly string[],
  ): Result<ResourceDiagnosticCopyPayload> {
    const json = JSON.stringify(summary, null, 2);
    const leaked = redactions.some(
      (redaction) => redaction.length >= 4 && json.includes(redaction),
    );

    if (leaked) {
      return err(
        domainError.resourceDiagnosticRedactionFailed(
          "Resource diagnostic summary contains unredacted sensitive values",
          {
            phase: "redaction",
            resourceId: summary.focus.resourceId,
            deploymentId: summary.focus.deploymentId ?? null,
          },
        ),
      );
    }

    return ok({ json });
  }
}
