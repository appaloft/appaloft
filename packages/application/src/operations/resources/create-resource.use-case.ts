import {
  CommandText,
  CreatedAt,
  DescriptionText,
  DestinationByIdSpec,
  DestinationId,
  DisplayNameText,
  DockerImageDigest,
  DockerImageName,
  DockerImageTag,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  GitCommitShaText,
  GitRefText,
  HealthCheckPathText,
  ok,
  PortNumber,
  ProjectByIdSpec,
  ProjectId,
  Resource,
  ResourceByEnvironmentAndSlugSpec,
  ResourceExposureModeValue,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  type ResourceNetworkProfileState,
  ResourceNetworkProtocolValue,
  type ResourceRuntimeProfileState,
  ResourceServiceKindValue,
  ResourceServiceName,
  type ResourceServiceState,
  ResourceSlug,
  type ResourceSourceBindingState,
  type Result,
  RuntimePlanStrategyValue,
  SourceBaseDirectory,
  SourceKindValue,
  SourceLocator,
  SourceOriginalLocator,
  SourceRepositoryFullName,
  SourceRepositoryId,
  safeTry,
  UpsertResourceSpec,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DestinationRepository,
  type EnvironmentRepository,
  type EventBus,
  type IdGenerator,
  type ProjectRepository,
  type ResourceRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateResourceCommandInput } from "./create-resource.command";
import { type CreateResourceSourceBindingInput } from "./create-resource.schema";

const gitSourceInputKinds = [
  "remote-git",
  "git-public",
  "git-github-app",
  "git-deploy-key",
  "local-git",
] as const;

function isGitSourceInputKind(kind: string): boolean {
  return gitSourceInputKinds.some((candidate) => candidate === kind);
}

function parseGitHubTreeLocator(locator: string):
  | {
      repositoryLocator: string;
      treeSegments: string[];
    }
  | undefined {
  try {
    const url = new URL(locator);
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    if (
      (host !== "github.com" && host !== "www.github.com") ||
      segments.length < 4 ||
      segments[2] !== "tree"
    ) {
      return undefined;
    }

    const owner = segments[0];
    const repository = segments[1]?.replace(/\.git$/, "");
    if (!owner || !repository) {
      return undefined;
    }

    return {
      repositoryLocator: `${url.protocol}//github.com/${owner}/${repository}`,
      treeSegments: segments.slice(3),
    };
  } catch {
    return undefined;
  }
}

function baseDirectoryForExplicitRef(treeSegments: string[], gitRef: string): string | undefined {
  const refSegments = gitRef.split("/").filter(Boolean);
  const matchesRef = refSegments.every((segment, index) => treeSegments[index] === segment);
  if (!matchesRef) {
    return undefined;
  }

  const remaining = treeSegments.slice(refSegments.length);
  return remaining.length > 0 ? `/${remaining.join("/")}` : "/";
}

function normalizeResourceSourceInput(
  input: CreateResourceSourceBindingInput,
): Result<CreateResourceSourceBindingInput> {
  if (!isGitSourceInputKind(input.kind)) {
    return ok(input);
  }

  const parsed = parseGitHubTreeLocator(input.locator);
  if (!parsed) {
    return ok(input);
  }

  const explicitGitRef = input.gitRef ?? input.metadata?.gitRef;
  const explicitBaseDirectory = input.baseDirectory ?? input.metadata?.baseDirectory;
  const gitRef = explicitGitRef ?? parsed.treeSegments[0];
  if (!gitRef) {
    return err(
      domainError.validation("GitHub tree URL must include a branch or tag path", {
        phase: "resource-source-resolution",
        sourceLocator: input.locator,
      }),
    );
  }

  const inferredBaseDirectory =
    explicitBaseDirectory ??
    (explicitGitRef
      ? baseDirectoryForExplicitRef(parsed.treeSegments, explicitGitRef)
      : parsed.treeSegments.length > 1
        ? `/${parsed.treeSegments.slice(1).join("/")}`
        : "/");

  if (!inferredBaseDirectory) {
    return err(
      domainError.validation("GitHub tree URL ref does not match the supplied gitRef", {
        phase: "resource-source-resolution",
        sourceLocator: input.locator,
        gitRef,
      }),
    );
  }

  return ok({
    ...input,
    locator: parsed.repositoryLocator,
    gitRef,
    baseDirectory: inferredBaseDirectory,
    originalLocator: input.originalLocator ?? input.locator,
  });
}

@injectable()
export class CreateResourceUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.destinationRepository)
    private readonly destinationRepository: DestinationRepository,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CreateResourceCommandInput,
  ): Promise<Result<{ id: string }>> {
    const {
      clock,
      destinationRepository,
      environmentRepository,
      eventBus,
      idGenerator,
      logger,
      projectRepository,
      resourceRepository,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const name = yield* ResourceName.create(input.name);
      const slug = yield* ResourceSlug.fromName(name);
      const kind = yield* ResourceKindValue.create(input.kind ?? "application");

      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );

      if (!project) {
        return err(domainError.notFound("project", input.projectId));
      }

      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );

      if (!environment) {
        return err(domainError.notFound("environment", input.environmentId));
      }

      const environmentState = environment.toState();
      if (!environmentState.projectId.equals(projectId)) {
        return err(
          domainError.resourceContextMismatch(
            "Environment does not belong to the supplied project",
            {
              phase: "context-resolution",
              projectId: projectId.value,
              environmentId: environmentId.value,
              environmentProjectId: environmentState.projectId.value,
            },
          ),
        );
      }

      const destinationId = input.destinationId
        ? yield* DestinationId.create(input.destinationId)
        : undefined;

      if (destinationId) {
        const destination = await destinationRepository.findOne(
          repositoryContext,
          DestinationByIdSpec.create(destinationId),
        );

        if (!destination) {
          return err(domainError.notFound("destination", input.destinationId ?? ""));
        }
      }

      const existing = await resourceRepository.findOne(
        repositoryContext,
        ResourceByEnvironmentAndSlugSpec.create(projectId, environmentId, slug),
      );

      if (existing) {
        return err(
          domainError.resourceSlugConflict(
            "Resource name already exists for this project environment",
            {
              phase: "resource-admission",
              projectId: projectId.value,
              environmentId: environmentId.value,
              resourceSlug: slug.value,
            },
          ),
        );
      }

      const services: ResourceServiceState[] = [];
      for (const service of input.services ?? []) {
        services.push({
          name: yield* ResourceServiceName.create(service.name),
          kind: yield* ResourceServiceKindValue.create(service.kind),
        });
      }

      if (kind.value !== "compose-stack" && services.length > 1) {
        return err(
          domainError.invariant("Only compose-stack resources can declare multiple services", {
            phase: "resource-admission",
            kind: kind.value,
            serviceCount: services.length,
          }),
        );
      }

      let sourceBinding: ResourceSourceBindingState | undefined;
      if (input.source) {
        const normalizedSourceInput = yield* normalizeResourceSourceInput(input.source);
        const sourceKind = yield* SourceKindValue.create(normalizedSourceInput.kind);
        const sourceLocator = yield* SourceLocator.create(normalizedSourceInput.locator);
        const sourceDisplayName = yield* DisplayNameText.create(
          normalizedSourceInput.displayName ?? normalizedSourceInput.locator,
        );
        const metadata = normalizedSourceInput.metadata;
        const gitRef = normalizedSourceInput.gitRef ?? metadata?.gitRef;
        const commitSha = normalizedSourceInput.commitSha ?? metadata?.commitSha;
        const baseDirectory = normalizedSourceInput.baseDirectory ?? metadata?.baseDirectory;
        const originalLocator = normalizedSourceInput.originalLocator ?? metadata?.originalLocator;
        const repositoryId = normalizedSourceInput.repositoryId ?? metadata?.repositoryId;
        const repositoryFullName =
          normalizedSourceInput.repositoryFullName ?? metadata?.repositoryFullName;
        const defaultBranch = normalizedSourceInput.defaultBranch ?? metadata?.defaultBranch;
        const imageName = normalizedSourceInput.imageName ?? metadata?.imageName;
        const imageTag = normalizedSourceInput.imageTag ?? metadata?.imageTag;
        const imageDigest = normalizedSourceInput.imageDigest ?? metadata?.imageDigest;

        sourceBinding = {
          kind: sourceKind,
          locator: sourceLocator,
          displayName: sourceDisplayName,
          ...(gitRef ? { gitRef: yield* GitRefText.create(gitRef) } : {}),
          ...(commitSha ? { commitSha: yield* GitCommitShaText.create(commitSha) } : {}),
          ...(baseDirectory
            ? { baseDirectory: yield* SourceBaseDirectory.create(baseDirectory) }
            : {}),
          ...(originalLocator
            ? { originalLocator: yield* SourceOriginalLocator.create(originalLocator) }
            : {}),
          ...(repositoryId ? { repositoryId: yield* SourceRepositoryId.create(repositoryId) } : {}),
          ...(repositoryFullName
            ? { repositoryFullName: yield* SourceRepositoryFullName.create(repositoryFullName) }
            : {}),
          ...(defaultBranch ? { defaultBranch: yield* GitRefText.create(defaultBranch) } : {}),
          ...(imageName ? { imageName: yield* DockerImageName.create(imageName) } : {}),
          ...(imageTag ? { imageTag: yield* DockerImageTag.create(imageTag) } : {}),
          ...(imageDigest ? { imageDigest: yield* DockerImageDigest.create(imageDigest) } : {}),
          ...(metadata ? { metadata: { ...metadata } } : {}),
        };
      }

      let runtimeProfile: ResourceRuntimeProfileState | undefined;
      if (input.runtimeProfile) {
        runtimeProfile = {
          strategy: yield* RuntimePlanStrategyValue.create(input.runtimeProfile.strategy ?? "auto"),
          ...(input.runtimeProfile.installCommand
            ? { installCommand: yield* CommandText.create(input.runtimeProfile.installCommand) }
            : {}),
          ...(input.runtimeProfile.buildCommand
            ? { buildCommand: yield* CommandText.create(input.runtimeProfile.buildCommand) }
            : {}),
          ...(input.runtimeProfile.startCommand
            ? { startCommand: yield* CommandText.create(input.runtimeProfile.startCommand) }
            : {}),
          ...(input.runtimeProfile.healthCheckPath
            ? {
                healthCheckPath: yield* HealthCheckPathText.create(
                  input.runtimeProfile.healthCheckPath,
                ),
              }
            : {}),
        };
      }

      const networkProfileInput = input.networkProfile;
      let networkProfile: ResourceNetworkProfileState | undefined;
      if (networkProfileInput) {
        networkProfile = {
          internalPort: yield* PortNumber.create(networkProfileInput.internalPort),
          upstreamProtocol: yield* ResourceNetworkProtocolValue.create(
            networkProfileInput.upstreamProtocol ?? "http",
          ),
          exposureMode: yield* ResourceExposureModeValue.create(
            networkProfileInput.exposureMode ?? "reverse-proxy",
          ),
          ...(networkProfileInput.targetServiceName
            ? {
                targetServiceName: yield* ResourceServiceName.create(
                  networkProfileInput.targetServiceName,
                ),
              }
            : {}),
          ...(networkProfileInput.hostPort
            ? { hostPort: yield* PortNumber.create(networkProfileInput.hostPort) }
            : {}),
        };
      }

      const resourceId = yield* ResourceId.create(idGenerator.next("res"));
      const createdAt = yield* CreatedAt.create(clock.now());
      const description = DescriptionText.fromOptional(input.description);
      const resource = yield* Resource.create({
        id: resourceId,
        projectId,
        environmentId,
        ...(destinationId ? { destinationId } : {}),
        name,
        kind,
        services,
        ...(sourceBinding ? { sourceBinding } : {}),
        ...(runtimeProfile ? { runtimeProfile } : {}),
        ...(networkProfile ? { networkProfile } : {}),
        createdAt,
        ...(description ? { description } : {}),
      });

      await resourceRepository.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, resource, undefined);

      return ok({ id: resource.toState().id.value });
    });
  }
}
