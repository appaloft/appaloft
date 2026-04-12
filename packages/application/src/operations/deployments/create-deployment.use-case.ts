import { ok, type Result, safeTry, UpsertDeploymentSpec } from "@yundu/core";
import { inject, injectable } from "tsyringe";
import { deploymentProgressSteps, reportDeploymentProgress } from "../../deployment-progress";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type DeploymentProgressReporter,
  type DeploymentRepository,
  type EventBus,
  type ExecutionBackend,
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
        message: "Resolve deployment context and inspect source",
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

      const detectedResult = await sourceDetector.detect(context, effectiveInput.sourceLocator);
      const detected = yield* detectedResult;
      reportDeploymentProgress(deploymentProgressReporter, context, {
        phase: "detect",
        status: "succeeded",
        step: deploymentProgressSteps.detect,
        message: `Detected ${detected.source.kind} source ${detected.source.displayName}`,
      });

      reportDeploymentProgress(deploymentProgressReporter, context, {
        phase: "plan",
        status: "running",
        step: deploymentProgressSteps.plan,
        message: "Create environment snapshot and runtime plan",
      });
      const snapshotResult = deploymentSnapshotFactory.create(environment);
      const snapshot = yield* snapshotResult;
      const runtimePlanInputResult = runtimePlanResolutionInputBuilder.build({
        source: detected.source,
        server,
        environmentSnapshot: snapshot,
        detectedReasoning: detected.reasoning,
        command: effectiveInput,
      });
      const runtimePlanInput = yield* runtimePlanInputResult;
      const runtimePlanResult = await runtimePlanResolver.resolve(context, runtimePlanInput);
      const runtimePlan = yield* runtimePlanResult;
      reportDeploymentProgress(deploymentProgressReporter, context, {
        phase: "plan",
        status: "succeeded",
        step: deploymentProgressSteps.plan,
        message: `Selected ${runtimePlan.buildStrategy} strategy for ${runtimePlan.execution.kind}`,
      });
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
