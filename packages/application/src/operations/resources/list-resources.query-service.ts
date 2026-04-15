import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  DestinationByIdSpec,
  DestinationId,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type DefaultAccessDomainProvider,
  type DestinationRepository,
  type PlannedResourceAccessRouteSummary,
  type ResourceReadModel,
  type ResourceSummary,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";

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
  ) {}

  async execute(
    context: ExecutionContext,
    input?: {
      projectId?: string;
      environmentId?: string;
    },
  ): Promise<{ items: Awaited<ReturnType<ResourceReadModel["list"]>> }> {
    const repositoryContext = toRepositoryContext(context);
    const resources = await this.readModel.list(repositoryContext, input);
    const items = await Promise.all(
      resources.map(async (resource) => ({
        ...resource,
        accessSummary: {
          ...(resource.accessSummary ?? {}),
          ...(await this.plannedGeneratedAccessRoute(context, resource)),
        },
      })),
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
    return {
      plannedGeneratedAccessRoute: {
        url: `${generated.scheme}://${generated.hostname}`,
        hostname: generated.hostname,
        scheme: generated.scheme,
        providerKey: generated.providerKey,
        pathPrefix: "/",
        proxyKind: edgeProxy.kind.value,
        targetPort: resource.networkProfile.internalPort,
      },
    };
  }
}
