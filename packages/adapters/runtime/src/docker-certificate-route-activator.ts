import {
  type CertificateRouteActivationInput,
  type CertificateRouteActivationResult,
  type CertificateRouteActivator,
  type CertificateRouteFinalizationInput,
  type DeploymentRepository,
  type EdgeProxyProviderRegistry,
  type EdgeProxyEnsurePlan,
  type EdgeProxyRouteInput,
  type ExecutionContext,
  type MaterializedCertificate,
  type ProxyReloadPlan,
  type ProxyRouteRealizationPlan,
  type ServerRepository,
  toRepositoryContext,
} from "@appaloft/application";
import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DeploymentTargetState,
  type DomainError,
  domainError,
  err,
  LatestRuntimeOwningDeploymentSpec,
  ok,
  ResourceId,
  type Result,
} from "@appaloft/core";

import { proxyBootstrapOptionsFromEnv, routeInputsFromAccessRoutes } from "./edge-proxy-plans";

export interface CertificateRouteRuntimeActivationInput {
  domainBindingId: string;
  proxyKind: "traefik" | "caddy";
  server: DeploymentTargetState;
  material: MaterializedCertificate;
  ensurePlan?: EdgeProxyEnsurePlan;
  routePlan: ProxyRouteRealizationPlan;
  reloadPlan: ProxyReloadPlan | null;
}

export interface CertificateRouteRuntimeRollbackInput {
  server: DeploymentTargetState;
  domainBindingId: string;
  proxyKind: "traefik" | "caddy";
  activationId: string;
  previousActivationId?: string;
}

export interface CertificateRouteRuntime {
  activate(
    input: CertificateRouteRuntimeActivationInput,
  ): Promise<Result<CertificateRouteActivationResult, DomainError>>;
  rollback(input: CertificateRouteRuntimeRollbackInput): Promise<Result<void, DomainError>>;
  finalize(input: CertificateRouteRuntimeRollbackInput): Promise<Result<void, DomainError>>;
}

function reconciliationError(message: string, details: Record<string, string>): DomainError {
  return domainError.certificateRouteReconciliationFailed(message, {
    phase: "certificate-route-activation",
    ...details,
  });
}

export class DockerCertificateRouteActivator implements CertificateRouteActivator {
  constructor(
    private readonly deployments: DeploymentRepository,
    private readonly servers: ServerRepository,
    private readonly providers: EdgeProxyProviderRegistry,
    private readonly runtime: CertificateRouteRuntime,
  ) {}

  async activate(
    context: ExecutionContext,
    input: CertificateRouteActivationInput,
  ): Promise<Result<CertificateRouteActivationResult, DomainError>> {
    if (input.proxyKind !== "traefik" && input.proxyKind !== "caddy") {
      return err(
        reconciliationError("Certificate route activation requires a supported edge proxy", {
          proxyKind: input.proxyKind,
        }),
      );
    }
    const resourceId = ResourceId.create(input.resourceId);
    if (resourceId.isErr()) return err(resourceId.error);
    const serverId = input.serverId ? DeploymentTargetId.create(input.serverId) : null;
    if (!serverId || serverId.isErr()) {
      return err(
        reconciliationError("Certificate route activation requires a deployment target", {
          domainBindingId: input.domainBindingId,
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);
    const deployment = await this.deployments.findOne(
      repositoryContext,
      LatestRuntimeOwningDeploymentSpec.forResource(resourceId.value),
    );
    if (!deployment) {
      return err(
        reconciliationError("No serving deployment is available for certificate activation", {
          resourceId: input.resourceId,
        }),
      );
    }
    const state = deployment.toState();
    const targetState = state.target.toState();
    if (
      state.projectId.value !== input.projectId ||
      state.environmentId.value !== input.environmentId ||
      targetState.kind !== "server-backed" ||
      targetState.serverId.value !== serverId.value.value ||
      (input.destinationId && targetState.destinationId.value !== input.destinationId)
    ) {
      return err(
        reconciliationError("Serving deployment does not match the bound route target", {
          deploymentId: state.id.value,
          domainBindingId: input.domainBindingId,
        }),
      );
    }

    const server = await this.servers.findOne(
      repositoryContext,
      DeploymentTargetByIdSpec.create(serverId.value),
    );
    if (!server) return err(domainError.notFound("Deployment target", serverId.value.value));

    const accessRoutes = routeInputsFromAccessRoutes(state.runtimePlan.execution.accessRoutes);
    const matchingIndex = accessRoutes.findIndex(
      (route) =>
        route.proxyKind === input.proxyKind &&
        route.pathPrefix === input.pathPrefix &&
        route.domains.includes(input.domainName) &&
        (input.targetServiceName === undefined ||
          route.targetServiceName === input.targetServiceName),
    );
    if (matchingIndex < 0) {
      return err(
        reconciliationError("Serving deployment does not contain the bound certificate route", {
          deploymentId: state.id.value,
          domainBindingId: input.domainBindingId,
        }),
      );
    }
    const matchingRoute = accessRoutes[matchingIndex];
    if (!matchingRoute) {
      return err(
        reconciliationError("Serving deployment route selection failed", {
          deploymentId: state.id.value,
        }),
      );
    }
    accessRoutes[matchingIndex] = {
      ...matchingRoute,
      source: "domain-binding",
      certificate: {
        source:
          input.certificateSource === "managed" ? "appaloft-managed" : "appaloft-imported",
        certificateId: input.certificateId,
        domainBindingId: input.domainBindingId,
      },
    };
    const accessRoutesForTarget = accessRoutes.filter(
      (route) => route.targetServiceName === matchingRoute.targetServiceName,
    );

    const providerResult = this.providers.resolve(input.proxyKind);
    if (providerResult.isErr()) return err(providerResult.error);
    const port = matchingRoute.targetPort ?? state.runtimePlan.execution.port;
    if (!port) {
      return err(
        reconciliationError("Serving deployment route does not declare a target port", {
          deploymentId: state.id.value,
        }),
      );
    }
    const providerContext = { correlationId: context.requestId, server: server.toState() };
    const ensurePlan = await providerResult.value.ensureProxy(providerContext, {
      proxyKind: input.proxyKind,
      ...proxyBootstrapOptionsFromEnv(process.env),
    });
    if (ensurePlan.isErr()) return err(ensurePlan.error);
    const routePlan = await providerResult.value.realizeRoutes(providerContext, {
      deploymentId: state.id.value,
      port,
      accessRoutes: accessRoutesForTarget,
    });
    if (routePlan.isErr()) return err(routePlan.error);
    const reloadPlan = await providerResult.value.reloadProxy(providerContext, {
      proxyKind: input.proxyKind,
      deploymentId: state.id.value,
      accessRoutes: accessRoutesForTarget,
      routePlan: routePlan.value,
      reason: input.certificateSource === "managed" ? "certificate-issued" : "certificate-imported",
    });
    if (reloadPlan.isErr()) return err(reloadPlan.error);

    return this.runtime.activate({
      domainBindingId: input.domainBindingId,
      proxyKind: input.proxyKind,
      server: server.toState(),
      material: input.material,
      ensurePlan: ensurePlan.value,
      routePlan: routePlan.value,
      reloadPlan: reloadPlan.value,
    });
  }

  async rollback(
    context: ExecutionContext,
    input: CertificateRouteActivationInput & CertificateRouteActivationResult,
  ): Promise<Result<void, DomainError>> {
    if (!input.serverId) {
      return err(
        reconciliationError("Certificate route rollback requires a deployment target", {
          activationId: input.activationId,
        }),
      );
    }
    const serverId = DeploymentTargetId.create(input.serverId);
    if (serverId.isErr()) return err(serverId.error);
    const server = await this.servers.findOne(
      toRepositoryContext(context),
      DeploymentTargetByIdSpec.create(serverId.value),
    );
    if (!server) return err(domainError.notFound("Deployment target", input.serverId));
    return this.runtime.rollback({
      server: server.toState(),
      domainBindingId: input.domainBindingId,
      proxyKind: input.proxyKind === "caddy" ? "caddy" : "traefik",
      activationId: input.activationId,
      ...(input.previousActivationId
        ? { previousActivationId: input.previousActivationId }
        : {}),
    });
  }

  async finalize(
    context: ExecutionContext,
    input: CertificateRouteFinalizationInput,
  ): Promise<Result<void, DomainError>> {
    if (!input.serverId) {
      return err(
        reconciliationError("Certificate route finalization requires a deployment target", {
          activationId: input.activationId,
        }),
      );
    }
    const serverId = DeploymentTargetId.create(input.serverId);
    if (serverId.isErr()) return err(serverId.error);
    const server = await this.servers.findOne(
      toRepositoryContext(context),
      DeploymentTargetByIdSpec.create(serverId.value),
    );
    if (!server) return err(domainError.notFound("Deployment target", input.serverId));
    return this.runtime.finalize({
      server: server.toState(),
      domainBindingId: input.domainBindingId,
      proxyKind: input.proxyKind === "caddy" ? "caddy" : "traefik",
      activationId: input.activationId,
    });
  }
}
