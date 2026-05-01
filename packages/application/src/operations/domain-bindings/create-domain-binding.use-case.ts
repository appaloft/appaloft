import {
  ActiveDomainBindingByOwnerAndRouteSpec,
  CanonicalRedirectStatusCode,
  CertificatePolicyValue,
  CreatedAt,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  DestinationByIdSpec,
  DestinationId,
  DomainBinding,
  DomainBindingByIdempotencyKeySpec,
  DomainBindingId,
  DomainVerificationAttemptId,
  domainError,
  EdgeProxyKindValue,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  IdempotencyKeyValue,
  MessageText,
  ok,
  ProjectByIdSpec,
  ProjectId,
  PublicDomainName,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  RoutePathPrefix,
  safeTry,
  TlsModeValue,
  UpsertDomainBindingSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DestinationRepository,
  type DomainBindingRepository,
  type EnvironmentRepository,
  type EventBus,
  type IdGenerator,
  type ProjectRepository,
  type ResourceRepository,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateDomainBindingCommandInput } from "./create-domain-binding.command";

function contextMismatch(message: string, details: Record<string, string>): Result<never> {
  return err(
    domainError.domainBindingContextMismatch(message, {
      phase: "context-resolution",
      ...details,
    }),
  );
}

@injectable()
export class CreateDomainBindingUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.destinationRepository)
    private readonly destinationRepository: DestinationRepository,
    @inject(tokens.domainBindingRepository)
    private readonly domainBindingRepository: DomainBindingRepository,
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
    input: CreateDomainBindingCommandInput,
  ): Promise<Result<{ id: string }>> {
    const {
      clock,
      destinationRepository,
      domainBindingRepository,
      environmentRepository,
      eventBus,
      idGenerator,
      logger,
      projectRepository,
      resourceRepository,
      serverRepository,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const resourceId = yield* ResourceId.create(input.resourceId);
      const serverId = yield* DeploymentTargetId.create(input.serverId);
      const destinationId = yield* DestinationId.create(input.destinationId);
      const domainName = yield* PublicDomainName.create(input.domainName);
      const pathPrefix = yield* RoutePathPrefix.create(input.pathPrefix ?? "/");
      const proxyKind = yield* EdgeProxyKindValue.create(input.proxyKind);
      const tlsMode = yield* TlsModeValue.create(input.tlsMode ?? "auto");
      if (input.redirectStatus && !input.redirectTo) {
        return err(
          domainError.validation("Canonical redirect status requires redirect target", {
            phase: "domain-binding-admission",
            domainName: domainName.value,
          }),
        );
      }
      const redirectTo = input.redirectTo
        ? yield* PublicDomainName.create(input.redirectTo)
        : undefined;
      const redirectStatus = redirectTo
        ? yield* CanonicalRedirectStatusCode.create(input.redirectStatus ?? 308)
        : undefined;
      const certificatePolicy = input.certificatePolicy
        ? yield* CertificatePolicyValue.create(input.certificatePolicy)
        : undefined;
      const idempotencyKey = yield* IdempotencyKeyValue.fromOptional(input.idempotencyKey);

      if (idempotencyKey) {
        const existingByIdempotencyKey = await domainBindingRepository.findOne(
          repositoryContext,
          DomainBindingByIdempotencyKeySpec.create(idempotencyKey.value),
        );

        if (existingByIdempotencyKey) {
          return ok({ id: existingByIdempotencyKey.toState().id.value });
        }
      }

      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );
      if (!project) {
        return err(domainError.notFound("Project", projectId.value));
      }

      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );
      if (!environment) {
        return err(domainError.notFound("Environment", environmentId.value));
      }
      if (!environment.belongsToProject(projectId)) {
        return contextMismatch("Environment does not belong to project", {
          projectId: projectId.value,
          environmentId: environmentId.value,
        });
      }

      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );
      if (!resource) {
        return err(domainError.notFound("Resource", resourceId.value));
      }
      if (!resource.belongsToProject(projectId)) {
        return contextMismatch("Resource does not belong to project", {
          projectId: projectId.value,
          resourceId: resourceId.value,
        });
      }
      if (!resource.belongsToEnvironment(environmentId)) {
        return contextMismatch("Resource does not belong to environment", {
          environmentId: environmentId.value,
          resourceId: resourceId.value,
        });
      }
      if (!resource.canDeployToDestination(destinationId)) {
        return contextMismatch("Resource default destination does not match binding destination", {
          resourceId: resourceId.value,
          destinationId: destinationId.value,
          resourceDestinationId: resource.defaultDestinationId?.value ?? "",
        });
      }

      const server = await serverRepository.findOne(
        repositoryContext,
        DeploymentTargetByIdSpec.create(serverId),
      );
      if (!server) {
        return err(domainError.notFound("Server", serverId.value));
      }
      const serverState = server.toState();

      const destination = await destinationRepository.findOne(
        repositoryContext,
        DestinationByIdSpec.create(destinationId),
      );
      if (!destination) {
        return err(domainError.notFound("Destination", destinationId.value));
      }
      if (!destination.belongsToServer(serverId)) {
        return contextMismatch("Destination does not belong to server", {
          serverId: serverId.value,
          destinationId: destinationId.value,
        });
      }

      const existing = await domainBindingRepository.findOne(
        repositoryContext,
        ActiveDomainBindingByOwnerAndRouteSpec.create({
          projectId,
          environmentId,
          resourceId,
          domainName,
          pathPrefix,
        }),
      );

      if (existing) {
        return err(
          domainError.conflict("Active domain binding already exists", {
            phase: "domain-binding-admission",
            domainName: domainName.value,
            pathPrefix: pathPrefix.value,
            existingDomainBindingId: existing.toState().id.value,
          }),
        );
      }

      if (redirectTo) {
        const redirectTarget = await domainBindingRepository.findOne(
          repositoryContext,
          ActiveDomainBindingByOwnerAndRouteSpec.create({
            projectId,
            environmentId,
            resourceId,
            domainName: redirectTo,
            pathPrefix,
          }),
        );

        if (!redirectTarget) {
          return err(
            domainError.validation("Canonical redirect target domain binding must exist", {
              phase: "domain-binding-admission",
              domainName: domainName.value,
              redirectTo: redirectTo.value,
              pathPrefix: pathPrefix.value,
            }),
          );
        }

        if (!redirectTarget.canServeCanonicalRedirectTarget()) {
          return err(
            domainError.validation(
              "Canonical redirect target must be a served domain binding, not another redirect",
              {
                phase: "domain-binding-admission",
                domainName: domainName.value,
                redirectTo: redirectTo.value,
                pathPrefix: pathPrefix.value,
              },
            ),
          );
        }
      }

      const createdAt = yield* CreatedAt.create(clock.now());
      const domainBindingId = yield* DomainBindingId.create(idGenerator.next("dmb"));
      const verificationAttemptId = yield* DomainVerificationAttemptId.create(
        idGenerator.next("dva"),
      );
      const verificationExpectedTarget = yield* MessageText.create(
        `Manual verification required for ${domainName.value}`,
      );
      const dnsExpectedTarget = yield* MessageText.create(serverState.host.value);

      const domainBinding = yield* DomainBinding.create({
        id: domainBindingId,
        projectId,
        environmentId,
        resourceId,
        serverId,
        destinationId,
        domainName,
        pathPrefix,
        proxyKind,
        tlsMode,
        ...(redirectTo ? { redirectTo } : {}),
        ...(redirectStatus ? { redirectStatus } : {}),
        ...(certificatePolicy ? { certificatePolicy } : {}),
        verificationAttemptId,
        verificationExpectedTarget,
        dnsExpectedTargets: [dnsExpectedTarget],
        createdAt,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        correlationId: context.requestId,
      });

      await domainBindingRepository.upsert(
        repositoryContext,
        domainBinding,
        UpsertDomainBindingSpec.fromDomainBinding(domainBinding),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, domainBinding, undefined);

      return ok({ id: domainBinding.toState().id.value });
    });
  }
}
