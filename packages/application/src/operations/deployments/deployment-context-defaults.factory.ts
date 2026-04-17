import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetByProviderAndHostSpec,
  DeploymentTargetId,
  DeploymentTargetName,
  DescriptionText,
  Destination,
  DestinationByServerAndNameSpec,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  EdgeProxyKindValue,
  EnvironmentByProjectAndNameSpec,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  HostAddress,
  ok,
  PortNumber,
  Project,
  ProjectBySlugSpec,
  ProjectId,
  ProjectName,
  ProjectSlug,
  ProviderKey,
  Resource,
  ResourceByEnvironmentAndSlugSpec,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceSlug,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import {
  type Clock,
  type DeploymentContextDefaultsFactoryPort,
  type IdGenerator,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class DeploymentContextDefaultsFactory implements DeploymentContextDefaultsFactoryPort {
  constructor(
    @inject(tokens.clock) private readonly clock: Clock,
    @inject(tokens.idGenerator) private readonly idGenerator: IdGenerator,
  ) {}

  localProjectSelection(): Result<ProjectBySlugSpec> {
    return safeTry(function* () {
      const name = yield* ProjectName.create("Local Workspace");
      const slug = yield* ProjectSlug.fromName(name);
      return ok(ProjectBySlugSpec.create(slug));
    });
  }

  createLocalProject(): Result<Project> {
    const { clock, idGenerator } = this;

    return safeTry(function* () {
      const id = yield* ProjectId.create(idGenerator.next("prj"));
      const name = yield* ProjectName.create("Local Workspace");
      const createdAt = yield* CreatedAt.create(clock.now());
      const description = DescriptionText.fromOptional(
        "Auto-created default project for self-hosted local deployments.",
      );

      const project = yield* Project.create({
        id,
        name,
        createdAt,
        ...(description ? { description } : {}),
      });
      return ok(project);
    });
  }

  localServerSelection(): Result<DeploymentTargetByProviderAndHostSpec> {
    return safeTry(function* () {
      const providerKey = yield* ProviderKey.create("local-shell");
      const host = yield* HostAddress.create("127.0.0.1");

      return ok(DeploymentTargetByProviderAndHostSpec.create(providerKey, host));
    });
  }

  createLocalServer(): Result<DeploymentTarget> {
    const { clock, idGenerator } = this;

    return safeTry(function* () {
      const id = yield* DeploymentTargetId.create(idGenerator.next("srv"));
      const name = yield* DeploymentTargetName.create("Local Machine");
      const createdAt = yield* CreatedAt.create(clock.now());
      const providerKey = yield* ProviderKey.create("local-shell");
      const host = yield* HostAddress.create("127.0.0.1");
      const port = yield* PortNumber.create(22);

      const server = yield* DeploymentTarget.register({
        id,
        name,
        host,
        providerKey,
        createdAt,
        port,
        edgeProxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      });
      return ok(server);
    });
  }

  localDestinationSelection(server: DeploymentTarget): Result<DestinationByServerAndNameSpec> {
    return safeTry(function* () {
      const name = yield* DestinationName.create("default");
      return ok(DestinationByServerAndNameSpec.create(server.toState().id, name));
    });
  }

  createLocalDestination(server: DeploymentTarget): Result<Destination> {
    const { clock, idGenerator } = this;

    return safeTry(function* () {
      const id = yield* DestinationId.create(idGenerator.next("dst"));
      const name = yield* DestinationName.create("default");
      const kind = yield* DestinationKindValue.create("host-process");
      const createdAt = yield* CreatedAt.create(clock.now());

      const destination = yield* Destination.register({
        id,
        serverId: server.toState().id,
        name,
        kind,
        createdAt,
      });
      return ok(destination);
    });
  }

  localEnvironmentSelection(project: Project): Result<EnvironmentByProjectAndNameSpec> {
    return safeTry(function* () {
      const name = yield* EnvironmentName.create("local");
      return ok(EnvironmentByProjectAndNameSpec.create(project.toState().id, name));
    });
  }

  createLocalEnvironment(project: Project): Result<EnvironmentProfile> {
    const { clock, idGenerator } = this;

    return safeTry(function* () {
      const id = yield* EnvironmentId.create(idGenerator.next("env"));
      const name = yield* EnvironmentName.create("local");
      const kind = yield* EnvironmentKindValue.create("local");
      const createdAt = yield* CreatedAt.create(clock.now());

      const environment = yield* EnvironmentProfile.create({
        id,
        projectId: project.toState().id,
        name,
        kind,
        createdAt,
      });
      return ok(environment);
    });
  }

  localResourceSelection(
    project: Project,
    environment: EnvironmentProfile,
  ): Result<ResourceByEnvironmentAndSlugSpec> {
    return safeTry(function* () {
      const name = yield* ResourceName.create("app");
      const slug = yield* ResourceSlug.fromName(name);
      return ok(
        ResourceByEnvironmentAndSlugSpec.create(
          project.toState().id,
          environment.toState().id,
          slug,
        ),
      );
    });
  }

  createLocalResource(
    project: Project,
    environment: EnvironmentProfile,
    destination: Destination,
  ): Result<Resource> {
    const { clock, idGenerator } = this;

    return safeTry(function* () {
      const id = yield* ResourceId.create(idGenerator.next("res"));
      const name = yield* ResourceName.create("app");
      const kind = yield* ResourceKindValue.create("application");
      const createdAt = yield* CreatedAt.create(clock.now());

      const resource = yield* Resource.create({
        id,
        projectId: project.toState().id,
        environmentId: environment.toState().id,
        destinationId: destination.toState().id,
        name,
        kind,
        createdAt,
      });
      return ok(resource);
    });
  }
}
