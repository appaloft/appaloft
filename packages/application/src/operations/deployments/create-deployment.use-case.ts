import {
  domainError,
  err,
  LatestDeploymentSpec,
  ok,
  type Resource,
  type Result,
  SourceDescriptor,
  safeTry,
  UpsertDeploymentSpec,
} from "@yundu/core";
import { i18nKeys } from "@yundu/i18n";
import { inject, injectable } from "tsyringe";
import { deploymentProgressSteps, reportDeploymentProgress } from "../../deployment-progress";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type DeploymentProgressReporter,
  type DeploymentRepository,
  type EventBus,
  type ExecutionBackend,
  type RequestedDeploymentConfig,
  type RuntimePlanResolver,
  type SourceDetector,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateDeploymentCommandInput } from "./create-deployment.command";
import { type DeploymentFactory } from "./deployment.factory";
import { type DeploymentContextBootstrapService } from "./deployment-config-bootstrap.service";
import { type DeploymentContextResolver } from "./deployment-context.resolver";
import { type DeploymentLifecycleService } from "./deployment-lifecycle.service";
import { type DeploymentSnapshotFactory } from "./deployment-snapshot.factory";
import { type RuntimePlanResolutionInputBuilder } from "./runtime-plan-resolution-input.builder";

function createResourceSourceDescriptor(
  resource: Resource,
): Result<{ source: SourceDescriptor; reasoning: string[] }> {
  const resourceState = resource.toState();
  const sourceBinding = resourceState.sourceBinding;

  if (!sourceBinding) {
    return err(
      domainError.validation("Resource source binding is required for deployment admission", {
        phase: "resource-source-resolution",
        resourceId: resourceState.id.value,
      }),
    );
  }

  const source = SourceDescriptor.rehydrate({
    kind: sourceBinding.kind,
    locator: sourceBinding.locator,
    displayName: sourceBinding.displayName,
    ...(sourceBinding.metadata ? { metadata: { ...sourceBinding.metadata } } : {}),
  });

  return ok({
    source,
    reasoning: [`Resource source binding kind: ${sourceBinding.kind.value}`],
  });
}

function shouldEnrichSourceFromDetector(resource: Resource): boolean {
  const sourceKind = resource.toState().sourceBinding?.kind.value;
  return sourceKind === "local-folder" || sourceKind === "local-git" || sourceKind === "compose";
}

function resourceRequiresInternalPort(resource: Resource): boolean {
  const resourceState = resource.toState();
  return (
    resourceState.kind.value === "application" ||
    resourceState.kind.value === "service" ||
    resourceState.kind.value === "static-site" ||
    resourceState.kind.value === "compose-stack" ||
    resourceState.services.some(
      (service) => service.kind.value === "web" || service.kind.value === "api",
    )
  );
}

function requestedDeploymentFromResource(resource: Resource): Result<RequestedDeploymentConfig> {
  const resourceState = resource.toState();
  const runtimeProfile = resourceState.runtimeProfile;
  const internalPort = resourceState.networkProfile?.internalPort.value;

  if (resourceRequiresInternalPort(resource) && !internalPort) {
    return err(
      domainError.validation("Resource network profile internalPort is required for deployment", {
        phase: "resource-network-resolution",
        resourceId: resourceState.id.value,
        resourceKind: resourceState.kind.value,
      }),
    );
  }

  return ok({
    method: runtimeProfile?.strategy.value ?? "auto",
    ...(runtimeProfile?.installCommand
      ? { installCommand: runtimeProfile.installCommand.value }
      : {}),
    ...(runtimeProfile?.buildCommand ? { buildCommand: runtimeProfile.buildCommand.value } : {}),
    ...(runtimeProfile?.startCommand ? { startCommand: runtimeProfile.startCommand.value } : {}),
    ...(internalPort ? { port: internalPort } : {}),
    ...(runtimeProfile?.healthCheckPath
      ? { healthCheckPath: runtimeProfile.healthCheckPath.value }
      : {}),
  });
}

@injectable()
export class CreateDeploymentUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.deploymentContextResolver)
    private readonly deploymentContextResolver: DeploymentContextResolver,
    @inject(tokens.deploymentContextBootstrapService)
    private readonly deploymentContextBootstrapService: DeploymentContextBootstrapService,
    @inject(tokens.sourceDetector)
    private readonly sourceDetector: SourceDetector,
    @inject(tokens.runtimePlanResolver)
    private readonly runtimePlanResolver: RuntimePlanResolver,
    @inject(tokens.executionBackend)
    private readonly executionBackend: ExecutionBackend,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.deploymentProgressReporter)
    private readonly deploymentProgressReporter: DeploymentProgressReporter,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.deploymentSnapshotFactory)
    private readonly deploymentSnapshotFactory: DeploymentSnapshotFactory,
    @inject(tokens.runtimePlanResolutionInputBuilder)
    private readonly runtimePlanResolutionInputBuilder: RuntimePlanResolutionInputBuilder,
    @inject(tokens.deploymentFactory)
    private readonly deploymentFactory: DeploymentFactory,
    @inject(tokens.deploymentLifecycleService)
    private readonly deploymentLifecycleService: DeploymentLifecycleService,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CreateDeploymentCommandInput,
  ): Promise<Result<{ id: string }>> {
    const {
      deploymentFactory,
      deploymentContextBootstrapService,
      deploymentContextResolver,
      deploymentLifecycleService,
      deploymentRepository,
      deploymentSnapshotFactory,
      eventBus,
      executionBackend,
      logger,
      deploymentProgressReporter,
      runtimePlanResolutionInputBuilder,
      runtimePlanResolver,
      sourceDetector,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      reportDeploymentProgress(deploymentProgressReporter, context, {
        phase: "detect",
        status: "running",
        step: deploymentProgressSteps.detect,
        message: context.t(i18nKeys.backend.deployment.resolveContextAndDetect),
      });
      const effectiveInputResult = await deploymentContextBootstrapService.bootstrap(
        context,
        input,
      );
      const effectiveInput = yield* effectiveInputResult;

      const resolvedContextResult = await deploymentContextResolver.resolve(
        context,
        effectiveInput,
      );
      const { project, server, destination, environment, resource } = yield* resolvedContextResult;
      const latestDeployment = await deploymentRepository.findOne(
        repositoryContext,
        LatestDeploymentSpec.forResource(resource.toState().id),
      );

      if (latestDeployment && !latestDeployment.canStartNewDeployment()) {
        const latestDeploymentState = latestDeployment.toState();
        return err(
          domainError.deploymentNotRedeployable(
            "Latest deployment for this resource must be succeeded or failed before redeploying",
            {
              deploymentId: latestDeploymentState.id.value,
              resourceId: latestDeploymentState.resourceId.value,
              status: latestDeploymentState.status.value,
            },
          ),
        );
      }

      const resourceSourceResult = createResourceSourceDescriptor(resource);
      const resourceSource = yield* resourceSourceResult;
      let detected = resourceSource;
      if (shouldEnrichSourceFromDetector(resource)) {
        const detectedResult = await sourceDetector.detect(context, resourceSource.source.locator);
        detected = yield* detectedResult;
      }
      reportDeploymentProgress(deploymentProgressReporter, context, {
        phase: "detect",
        status: "succeeded",
        step: deploymentProgressSteps.detect,
        message: context.t(i18nKeys.backend.deployment.detectedSource, {
          kind: detected.source.kind,
          displayName: detected.source.displayName,
        }),
      });

      reportDeploymentProgress(deploymentProgressReporter, context, {
        phase: "plan",
        status: "running",
        step: deploymentProgressSteps.plan,
        message: context.t(i18nKeys.backend.deployment.createSnapshotAndPlan),
      });
      const snapshotResult = deploymentSnapshotFactory.create(environment);
      const snapshot = yield* snapshotResult;
      const runtimePlanInputResult = runtimePlanResolutionInputBuilder.build({
        source: detected.source,
        server,
        environmentSnapshot: snapshot,
        detectedReasoning: detected.reasoning,
        requestedDeployment: yield* requestedDeploymentFromResource(resource),
      });
      const runtimePlanInput = yield* runtimePlanInputResult;
      const runtimePlanResult = await runtimePlanResolver.resolve(context, runtimePlanInput);
      const runtimePlan = yield* runtimePlanResult;
      const deploymentResult = deploymentFactory.create({
        project,
        server,
        destination,
        environment,
        resource,
        runtimePlan,
        environmentSnapshot: snapshot,
      });
      const deployment = yield* deploymentResult;
      const deploymentId = deployment.toState().id.value;
      reportDeploymentProgress(deploymentProgressReporter, context, {
        deploymentId,
        phase: "plan",
        status: "succeeded",
        step: deploymentProgressSteps.plan,
        message: context.t(i18nKeys.backend.deployment.selectedRuntimeStrategy, {
          buildStrategy: runtimePlan.buildStrategy,
          executionKind: runtimePlan.execution.kind,
        }),
      });

      const prepareResult = deploymentLifecycleService.prepareForExecution(deployment);
      yield* prepareResult;

      await deploymentRepository.upsert(
        repositoryContext,
        deployment,
        UpsertDeploymentSpec.fromDeployment(deployment),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);

      const startResult = deploymentLifecycleService.startExecution(deployment);
      yield* startResult;

      await deploymentRepository.upsert(
        repositoryContext,
        deployment,
        UpsertDeploymentSpec.fromDeployment(deployment),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);

      const executionResult = await executionBackend.execute(context, deployment);
      const execution = yield* executionResult;

      await deploymentRepository.upsert(
        repositoryContext,
        execution.deployment,
        UpsertDeploymentSpec.fromDeployment(execution.deployment),
      );
      await publishDomainEventsAndReturn(
        context,
        eventBus,
        logger,
        execution.deployment,
        undefined,
      );

      return ok({ id: execution.deployment.toState().id.value });
    });
  }
}
