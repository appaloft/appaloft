import {
  type EdgeProxyDiagnosticsPlan,
  type EdgeProxyEnsurePlan,
  type EdgeProxyExecutionContext,
  type EdgeProxyProviderRegistry,
  type EdgeProxyRouteInput,
  type ProxyRouteRealizationPlan,
} from "@yundu/application";
import { type AccessRoute, type DomainError, err, ok, type Result } from "@yundu/core";

export interface ProxyBootstrapOptions {
  httpPort?: number;
  httpsPort?: number;
}

function portFromEnv(env: Record<string, string | undefined>, key: string): number | undefined {
  const value = env[key];
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : undefined;
}

export function proxyBootstrapOptionsFromEnv(
  env: Record<string, string | undefined>,
): ProxyBootstrapOptions {
  const httpPort = portFromEnv(env, "YUNDU_EDGE_HTTP_PORT");
  const httpsPort = portFromEnv(env, "YUNDU_EDGE_HTTPS_PORT");

  return {
    ...(httpPort === undefined ? {} : { httpPort }),
    ...(httpsPort === undefined ? {} : { httpsPort }),
  };
}

export function routeInputsFromAccessRoutes(accessRoutes: AccessRoute[]): EdgeProxyRouteInput[] {
  return accessRoutes.map((route) => ({
    proxyKind: route.proxyKind,
    domains: route.domains,
    pathPrefix: route.pathPrefix,
    tlsMode: route.tlsMode,
    ...(route.targetPort === undefined ? {} : { targetPort: route.targetPort }),
  }));
}

function firstProviderRoute(routes: EdgeProxyRouteInput[]): EdgeProxyRouteInput | undefined {
  return routes.find((route) => route.proxyKind !== "none" && route.domains.length > 0);
}

export async function createEdgeProxyEnsurePlan(input: {
  providerRegistry: EdgeProxyProviderRegistry;
  context: EdgeProxyExecutionContext;
  accessRoutes: AccessRoute[];
  options?: ProxyBootstrapOptions;
}): Promise<Result<EdgeProxyEnsurePlan | null, DomainError>> {
  const routes = routeInputsFromAccessRoutes(input.accessRoutes);
  const route = firstProviderRoute(routes);
  if (!route) {
    return ok(null);
  }

  return createEdgeProxyEnsurePlanForSelection({
    providerRegistry: input.providerRegistry,
    context: input.context,
    proxyKind: route.proxyKind,
    ...(route.providerKey ? { providerKey: route.providerKey } : {}),
    ...(input.options ? { options: input.options } : {}),
  });
}

export async function createEdgeProxyEnsurePlanForSelection(input: {
  providerRegistry: EdgeProxyProviderRegistry;
  context: EdgeProxyExecutionContext;
  proxyKind: EdgeProxyRouteInput["proxyKind"];
  providerKey?: string;
  options?: ProxyBootstrapOptions;
}): Promise<Result<EdgeProxyEnsurePlan | null, DomainError>> {
  if (input.proxyKind === "none") {
    return ok(null);
  }

  const providerResult = input.providerRegistry.defaultFor({
    proxyKind: input.proxyKind,
    ...(input.providerKey ? { providerKey: input.providerKey } : {}),
  });
  if (providerResult.isErr()) {
    return err(providerResult.error);
  }

  const provider = providerResult.value;
  if (!provider) {
    return ok(null);
  }

  const planResult = await provider.ensureProxy(input.context, {
    proxyKind: input.proxyKind,
    ...(input.options?.httpPort === undefined ? {} : { httpPort: input.options.httpPort }),
    ...(input.options?.httpsPort === undefined ? {} : { httpsPort: input.options.httpsPort }),
  });
  if (planResult.isErr()) {
    return err(planResult.error);
  }

  return ok(planResult.value);
}

export async function createEdgeProxyDiagnosticsPlanForSelection(input: {
  providerRegistry: EdgeProxyProviderRegistry;
  context: EdgeProxyExecutionContext;
  proxyKind: EdgeProxyRouteInput["proxyKind"];
  providerKey?: string;
  options?: ProxyBootstrapOptions;
}): Promise<Result<EdgeProxyDiagnosticsPlan | null, DomainError>> {
  if (input.proxyKind === "none") {
    return ok(null);
  }

  const providerResult = input.providerRegistry.defaultFor({
    proxyKind: input.proxyKind,
    ...(input.providerKey ? { providerKey: input.providerKey } : {}),
  });
  if (providerResult.isErr()) {
    return err(providerResult.error);
  }

  const provider = providerResult.value;
  if (!provider) {
    return ok(null);
  }

  const planResult = await provider.diagnoseProxy(input.context, {
    proxyKind: input.proxyKind,
    ...(input.options?.httpPort === undefined ? {} : { httpPort: input.options.httpPort }),
    ...(input.options?.httpsPort === undefined ? {} : { httpsPort: input.options.httpsPort }),
  });
  if (planResult.isErr()) {
    return err(planResult.error);
  }

  return ok(planResult.value);
}

export async function createProxyRouteRealizationPlan(input: {
  providerRegistry: EdgeProxyProviderRegistry;
  context: EdgeProxyExecutionContext;
  deploymentId: string;
  port: number;
  accessRoutes: AccessRoute[];
}): Promise<Result<ProxyRouteRealizationPlan | null, DomainError>> {
  const routes = routeInputsFromAccessRoutes(input.accessRoutes);
  const route = firstProviderRoute(routes);
  if (!route) {
    return ok(null);
  }

  const providerResult = input.providerRegistry.defaultFor({
    proxyKind: route.proxyKind,
    ...(route.providerKey ? { providerKey: route.providerKey } : {}),
  });
  if (providerResult.isErr()) {
    return err(providerResult.error);
  }

  const provider = providerResult.value;
  if (!provider) {
    return ok(null);
  }

  const planResult = await provider.realizeRoutes(input.context, {
    deploymentId: input.deploymentId,
    port: input.port,
    accessRoutes: routes,
  });
  if (planResult.isErr()) {
    return err(planResult.error);
  }

  return ok(planResult.value);
}

export function dockerNetworkFlagForProxyPlan(plan: ProxyRouteRealizationPlan | null): string {
  return plan?.networkName ? `--network ${plan.networkName}` : "";
}

export function dockerLabelFlagsForProxyPlan(input: {
  plan: ProxyRouteRealizationPlan | null;
  quote: (value: string) => string;
}): string {
  return (input.plan?.labels ?? [])
    .map((label) => `--label ${input.quote(label)}`)
    .join(" ");
}
