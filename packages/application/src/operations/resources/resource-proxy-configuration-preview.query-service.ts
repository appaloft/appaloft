import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentReadModel,
  type DeploymentSummary,
  type EdgeProxyProviderRegistry,
  type EdgeProxyRouteInput,
  type PlannedResourceAccessRouteSummary,
  type ProxyConfigurationStatus,
  type ProxyConfigurationView,
  type ResourceSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListResourcesQueryService } from "./list-resources.query-service";
import { type ResourceProxyConfigurationPreviewQuery } from "./resource-proxy-configuration-preview.query";

function compareCreatedAtDesc(left: DeploymentSummary, right: DeploymentSummary): number {
  const createdCompare = right.createdAt.localeCompare(left.createdAt);

  if (createdCompare !== 0) {
    return createdCompare;
  }

  return right.id.localeCompare(left.id);
}

function proxyConfigurationStatusFromDeployment(
  deployment: DeploymentSummary,
): ProxyConfigurationStatus {
  switch (deployment.status) {
    case "succeeded":
    case "rolled-back":
      return "applied";
    case "failed":
    case "canceled":
      return "failed";
    case "created":
    case "planning":
    case "planned":
    case "running":
      return "planned";
  }
}

function routesFromDeployment(deployment: DeploymentSummary): EdgeProxyRouteInput[] {
  return (deployment.runtimePlan.execution.accessRoutes ?? []).map((route) => ({
    proxyKind: route.proxyKind,
    domains: route.domains,
    pathPrefix: route.pathPrefix,
    tlsMode: route.tlsMode,
    ...(route.targetPort === undefined ? {} : { targetPort: route.targetPort }),
    ...(route.routeBehavior ? { routeBehavior: route.routeBehavior } : {}),
    ...(route.redirectTo ? { redirectTo: route.redirectTo } : {}),
    ...(route.redirectStatus ? { redirectStatus: route.redirectStatus } : {}),
  }));
}

function routeFromPlannedSummary(route: PlannedResourceAccessRouteSummary): EdgeProxyRouteInput {
  return {
    proxyKind: route.proxyKind,
    domains: [route.hostname],
    pathPrefix: route.pathPrefix,
    tlsMode: route.scheme === "https" ? "auto" : "disabled",
    targetPort: route.targetPort,
  };
}

function routeRequiresProvider(route: EdgeProxyRouteInput): boolean {
  return route.proxyKind !== "none" && route.domains.length > 0;
}

function portFromRoutes(
  resource: ResourceSummary,
  deployment: DeploymentSummary | undefined,
  routes: EdgeProxyRouteInput[],
): Result<number, DomainError> {
  const routePort = routes.find((route) => typeof route.targetPort === "number")?.targetPort;
  if (routePort) {
    return ok(routePort);
  }

  const deploymentPort = deployment?.runtimePlan.execution.port;
  if (deploymentPort) {
    return ok(deploymentPort);
  }

  const resourcePort = resource.networkProfile?.internalPort;
  if (resourcePort) {
    return ok(resourcePort);
  }

  return err(
    domainError.resourceNetworkProfileMissing("Resource network profile is required", {
      phase: "resource-network-resolution",
      resourceId: resource.id,
    }),
  );
}

@injectable()
export class ResourceProxyConfigurationPreviewQueryService {
  constructor(
    @inject(tokens.listResourcesQueryService)
    private readonly listResourcesQueryService: ListResourcesQueryService,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.edgeProxyProviderRegistry)
    private readonly edgeProxyProviderRegistry: EdgeProxyProviderRegistry,
    @inject(tokens.clock) private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ResourceProxyConfigurationPreviewQuery,
  ): Promise<Result<ProxyConfigurationView>> {
    const listed = await this.listResourcesQueryService.execute(context);
    const resource = listed.items.find((candidate) => candidate.id === query.resourceId);

    if (!resource) {
      return err(domainError.notFound("resource", query.resourceId));
    }

    const deployments = (
      await this.deploymentReadModel.list(toRepositoryContext(context), {
        resourceId: resource.id,
      })
    ).sort(compareCreatedAtDesc);
    const selectedDeploymentResult = this.selectDeployment(query.deploymentId, deployments);
    if (selectedDeploymentResult.isErr()) {
      return err(selectedDeploymentResult.error);
    }

    const selectedDeployment = selectedDeploymentResult.value;
    const routeStateResult = this.resolveRouteState(resource, query, selectedDeployment);
    if (routeStateResult.isErr()) {
      return err(routeStateResult.error);
    }

    const routeState = routeStateResult.value;
    const providerRoute = routeState.routes.find(routeRequiresProvider);

    if (!providerRoute) {
      return ok({
        resourceId: resource.id,
        ...(routeState.deployment?.id ? { deploymentId: routeState.deployment.id } : {}),
        providerKey: "none",
        routeScope: query.routeScope,
        status: "not-configured",
        generatedAt: this.clock.now(),
        stale: false,
        routes: [],
        sections: [],
        warnings: [],
      });
    }

    const providerResult = this.edgeProxyProviderRegistry.defaultFor({
      proxyKind: providerRoute.proxyKind,
      ...(providerRoute.providerKey ? { providerKey: providerRoute.providerKey } : {}),
    });
    if (providerResult.isErr()) {
      return err(providerResult.error);
    }

    const provider = providerResult.value;
    if (!provider) {
      return err(
        domainError.proxyProviderUnavailable("Edge proxy provider could not be resolved", {
          phase: "proxy-provider-resolution",
          resourceId: resource.id,
          proxyKind: providerRoute.proxyKind,
        }),
      );
    }

    const portResult = portFromRoutes(resource, routeState.deployment, routeState.routes);
    if (portResult.isErr()) {
      return err(portResult.error);
    }

    return provider.renderConfigurationView(
      {
        correlationId: context.requestId,
        resource,
        ...(routeState.deployment ? { deployment: routeState.deployment } : {}),
      },
      {
        resourceId: resource.id,
        ...(routeState.deployment?.id ? { deploymentId: routeState.deployment.id } : {}),
        routeScope: query.routeScope,
        status: routeState.status,
        generatedAt: this.clock.now(),
        ...(resource.accessSummary?.lastRouteRealizationDeploymentId
          ? { lastAppliedDeploymentId: resource.accessSummary.lastRouteRealizationDeploymentId }
          : {}),
        stale: routeState.stale,
        accessRoutes: routeState.routes,
        port: portResult.value,
        includeDiagnostics: query.includeDiagnostics,
      },
    );
  }

  private selectDeployment(
    deploymentId: string | undefined,
    deployments: DeploymentSummary[],
  ): Result<DeploymentSummary | undefined, DomainError> {
    if (!deploymentId) {
      return ok(deployments[0]);
    }

    const deployment = deployments.find((candidate) => candidate.id === deploymentId);
    if (!deployment) {
      return err(domainError.notFound("deployment", deploymentId));
    }

    return ok(deployment);
  }

  private resolveRouteState(
    resource: ResourceSummary,
    query: ResourceProxyConfigurationPreviewQuery,
    selectedDeployment: DeploymentSummary | undefined,
  ): Result<
    {
      routes: EdgeProxyRouteInput[];
      status: ProxyConfigurationStatus;
      stale: boolean;
      deployment?: DeploymentSummary;
    },
    DomainError
  > {
    if (query.routeScope === "deployment-snapshot") {
      if (!selectedDeployment) {
        return err(
          domainError.proxyRouteNotResolved("Deployment snapshot route was not found", {
            phase: "route-snapshot-resolution",
            resourceId: resource.id,
            deploymentId: query.deploymentId ?? null,
          }),
        );
      }

      return ok({
        deployment: selectedDeployment,
        routes: routesFromDeployment(selectedDeployment),
        status: proxyConfigurationStatusFromDeployment(selectedDeployment),
        stale: false,
      });
    }

    if (query.routeScope === "latest" && selectedDeployment) {
      const deploymentRoutes = routesFromDeployment(selectedDeployment);
      if (deploymentRoutes.some(routeRequiresProvider)) {
        return ok({
          deployment: selectedDeployment,
          routes: deploymentRoutes,
          status: proxyConfigurationStatusFromDeployment(selectedDeployment),
          stale:
            Boolean(resource.accessSummary?.lastRouteRealizationDeploymentId) &&
            resource.accessSummary?.lastRouteRealizationDeploymentId !== selectedDeployment.id,
        });
      }
    }

    const planned = resource.accessSummary?.plannedGeneratedAccessRoute;
    if (planned) {
      return ok({
        routes: [routeFromPlannedSummary(planned)],
        status: "planned",
        stale: false,
      });
    }

    return ok({
      routes: [],
      status: "not-configured",
      stale: false,
    });
  }
}
