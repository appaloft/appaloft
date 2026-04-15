import { type DomainError, domainError, err, ok, type Result, type RuntimePlan } from "@yundu/core";
import { type ExecutionContext } from "../../execution-context";
import {
  type DefaultAccessDomainProvider,
  type GeneratedAccessDomain,
  type RequestedDeploymentConfig,
  type RuntimePlanResolver,
} from "../../ports";

type RuntimePlanResolverInput = Parameters<RuntimePlanResolver["resolve"]>[1];

function shouldResolveDefaultAccessRoute(requestedDeployment: RequestedDeploymentConfig): boolean {
  return (
    requestedDeployment.accessContext?.routePurpose === "default-resource-access" &&
    requestedDeployment.accessContext.exposureMode === "reverse-proxy" &&
    typeof requestedDeployment.port === "number" &&
    (requestedDeployment.domains?.length ?? 0) === 0
  );
}

function providerMetadata(input: GeneratedAccessDomain): Record<string, string> {
  const metadata: Record<string, string> = {
    "access.routeSource": "generated-default",
    "access.hostname": input.hostname,
    "access.scheme": input.scheme,
    "access.providerKey": input.providerKey,
  };

  if (input.expiresAt) {
    metadata["access.expiresAt"] = input.expiresAt;
  }

  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    metadata[`access.providerMetadata.${key}`] = value;
  }

  return metadata;
}

function edgeProxyKindFor(
  input: RuntimePlanResolverInput,
): Result<NonNullable<RequestedDeploymentConfig["proxyKind"]>> {
  const edgeProxy = input.server.edgeProxy;

  if (!edgeProxy || edgeProxy.kind.value === "none" || edgeProxy.status.value === "disabled") {
    return err(
      domainError.validation("Default access routes require an enabled edge proxy", {
        phase: "proxy-readiness",
        serverId: input.server.id.value,
      }),
    );
  }

  return ok(edgeProxy.kind.value);
}

function enrichRequestedDeployment(
  input: RuntimePlanResolverInput,
  generated: GeneratedAccessDomain,
): Result<RequestedDeploymentConfig> {
  return edgeProxyKindFor(input).map((proxyKind) => ({
    ...input.requestedDeployment,
    proxyKind,
    domains: [generated.hostname],
    pathPrefix: "/",
    tlsMode: generated.scheme === "https" ? "auto" : "disabled",
    accessRouteMetadata: {
      ...(input.requestedDeployment.accessRouteMetadata ?? {}),
      ...providerMetadata(generated),
    },
  }));
}

export class DefaultAccessDomainRuntimePlanResolver implements RuntimePlanResolver {
  constructor(
    private readonly inner: RuntimePlanResolver,
    private readonly provider: DefaultAccessDomainProvider,
  ) {}

  async resolve(
    context: ExecutionContext,
    input: RuntimePlanResolverInput,
  ): Promise<Result<RuntimePlan, DomainError>> {
    if (!shouldResolveDefaultAccessRoute(input.requestedDeployment)) {
      return this.inner.resolve(context, input);
    }

    const accessContext = input.requestedDeployment.accessContext;
    if (!accessContext) {
      return this.inner.resolve(context, input);
    }

    const generatedResult = await this.provider.generate(context, {
      publicAddress: input.server.host.value,
      projectId: accessContext.projectId,
      environmentId: accessContext.environmentId,
      resourceId: accessContext.resourceId,
      resourceSlug: accessContext.resourceSlug,
      serverId: input.server.id.value,
      ...(accessContext.destinationId ? { destinationId: accessContext.destinationId } : {}),
      routePurpose: accessContext.routePurpose,
      correlationId: context.requestId,
    });

    if (generatedResult.isErr()) {
      return err(generatedResult.error);
    }

    const generated = generatedResult.value;
    if (generated.kind === "disabled") {
      return this.inner.resolve(context, {
        ...input,
        requestedDeployment: {
          ...input.requestedDeployment,
          accessRouteMetadata: {
            ...(input.requestedDeployment.accessRouteMetadata ?? {}),
            "access.routeSource": "none",
            "access.policyDisabledReason": generated.reason,
            ...(generated.providerKey ? { "access.providerKey": generated.providerKey } : {}),
          },
        },
      });
    }

    const requestedDeploymentResult = enrichRequestedDeployment(input, generated.domain);
    if (requestedDeploymentResult.isErr()) {
      return err(requestedDeploymentResult.error);
    }

    return this.inner.resolve(context, {
      ...input,
      requestedDeployment: requestedDeploymentResult.value,
    });
  }
}
