import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  DestinationByIdSpec,
  DestinationId,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type DefaultAccessDomainProvider,
  type DestinationRepository,
  type PlannedResourceAccessRouteSummary,
  type ResourceReadModel,
  type ResourceStaticArtifactAccessRouteSummary,
  type ResourceSummary,
  type ServerRepository,
  type StaticArtifactPublicationReadModelPort,
  type StaticArtifactPublicationSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { boundedListLimit } from "../shared-schema";

@injectable()
export class ListResourcesQueryService {
  constructor(
    @inject(tokens.resourceReadModel) private readonly readModel: ResourceReadModel,
    @inject(tokens.destinationRepository)
    private readonly destinationRepository: DestinationRepository,
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.defaultAccessDomainProvider)
    private readonly defaultAccessDomainProvider: DefaultAccessDomainProvider,
    @inject(tokens.staticArtifactPublicationReadModelPort, { isOptional: true })
    private readonly staticArtifactPublicationReadModel?: StaticArtifactPublicationReadModelPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      includePreviewResources?: boolean;
      limit?: number;
    },
  ): Promise<{ items: Awaited<ReturnType<ResourceReadModel["list"]>> }> {
    const repositoryContext = toRepositoryContext(context);
    const resources = await this.readModel.list(repositoryContext, {
      ...(input?.projectId ? { projectId: input.projectId } : {}),
      ...(input?.environmentId ? { environmentId: input.environmentId } : {}),
      ...(input?.includePreviewResources !== undefined
        ? { includePreviewResources: input.includePreviewResources }
        : {}),
      limit: boundedListLimit(input?.limit),
    });
    const items = await Promise.all(
      resources.map(async (resource) => {
        const accessSummary = {
          ...(resource.accessSummary ?? {}),
          ...(await this.latestStaticArtifactRoute(context, resource)),
          ...(await this.plannedGeneratedAccessRoute(context, resource)),
        };

        if (Object.keys(accessSummary).length === 0) {
          const { accessSummary: _accessSummary, ...resourceWithoutAccessSummary } = resource;
          return resourceWithoutAccessSummary;
        }

        return {
          ...resource,
          accessSummary,
        };
      }),
    );

    return { items };
  }

  private async plannedGeneratedAccessRoute(
    context: ExecutionContext,
    resource: ResourceSummary,
  ): Promise<
    | {
        plannedGeneratedAccessRoute: PlannedResourceAccessRouteSummary;
      }
    | Record<string, never>
  > {
    if (
      resource.accessProfile?.generatedAccessMode === "disabled" ||
      resource.deploymentCount > 0 ||
      !resource.destinationId ||
      resource.networkProfile?.exposureMode !== "reverse-proxy" ||
      !resource.networkProfile.internalPort
    ) {
      return {};
    }

    const repositoryContext = toRepositoryContext(context);
    const destination = await this.destinationRepository.findOne(
      repositoryContext,
      DestinationByIdSpec.create(DestinationId.rehydrate(resource.destinationId)),
    );
    if (!destination) {
      return {};
    }

    const destinationState = destination.toState();
    const server = await this.serverRepository.findOne(
      repositoryContext,
      DeploymentTargetByIdSpec.create(
        DeploymentTargetId.rehydrate(destinationState.serverId.value),
      ),
    );
    if (!server) {
      return {};
    }

    const serverState = server.toState();
    const edgeProxy = serverState.edgeProxy;
    if (!edgeProxy || edgeProxy.kind.value === "none" || edgeProxy.status.value === "disabled") {
      return {};
    }

    const generatedResult = await this.defaultAccessDomainProvider.generate(context, {
      publicAddress: serverState.host.value,
      projectId: resource.projectId,
      environmentId: resource.environmentId,
      resourceId: resource.id,
      resourceSlug: resource.slug,
      serverId: serverState.id.value,
      destinationId: destinationState.id.value,
      routePurpose: "default-resource-access",
      correlationId: context.requestId,
    });
    if (generatedResult.isErr() || generatedResult.value.kind === "disabled") {
      return {};
    }

    const generated = generatedResult.value.domain;
    const pathPrefix = resource.accessProfile?.pathPrefix ?? "/";
    return {
      plannedGeneratedAccessRoute: {
        url: routeUrl({
          hostname: generated.hostname,
          scheme: generated.scheme,
          pathPrefix,
        }),
        hostname: generated.hostname,
        scheme: generated.scheme,
        providerKey: generated.providerKey,
        pathPrefix,
        proxyKind: edgeProxy.kind.value,
        targetPort: resource.networkProfile.internalPort,
      },
    };
  }

  private async latestStaticArtifactRoute(
    context: ExecutionContext,
    resource: ResourceSummary,
  ): Promise<
    | {
        latestStaticArtifactRoute: ResourceStaticArtifactAccessRouteSummary;
      }
    | Record<string, never>
  > {
    if (!this.staticArtifactPublicationReadModel) {
      return {};
    }

    const publicationsResult = await this.staticArtifactPublicationReadModel.listPublications(
      context,
      {
        projectId: resource.projectId,
        resourceId: resource.id,
        limit: 1,
      },
    );
    if (publicationsResult.isErr()) {
      return {};
    }

    const publication = publicationsResult.value.items.find((item) => item.routeUrl);
    if (!publication?.routeUrl) {
      return {};
    }

    const route = staticArtifactRouteSummary(publication);
    return route ? { latestStaticArtifactRoute: route } : {};
  }
}

function routeUrl(input: {
  hostname: string;
  scheme: "http" | "https";
  pathPrefix: string;
}): string {
  const path = input.pathPrefix === "/" ? "" : input.pathPrefix;
  return `${input.scheme}://${input.hostname}${path}`;
}

function staticArtifactRouteSummary(
  publication: StaticArtifactPublicationSummary,
): ResourceStaticArtifactAccessRouteSummary | undefined {
  if (!publication.routeUrl) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(publication.routeUrl);
  } catch {
    return undefined;
  }

  const scheme = parsed.protocol === "https:" ? "https" : "http";
  const pathPrefix = parsed.pathname || "/";
  return {
    url: publication.routeUrl,
    hostname: parsed.hostname,
    scheme,
    ...(publication.routeProviderKey ? { providerKey: publication.routeProviderKey } : {}),
    publicationId: publication.publicationId,
    artifactId: publication.artifactId,
    pathPrefix,
    fileCount: publication.fileCount,
    totalBytes: publication.totalBytes,
    ...(publication.publishedAt ? { updatedAt: publication.publishedAt } : {}),
  };
}
