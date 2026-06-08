import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ServerConnectivityChecker,
  type ServerConnectivityResult,
  type ServerRepository,
  type ServerRuntimePreparer,
} from "../../ports";
import { tokens } from "../../tokens";
import { type BootstrapServerProxyUseCase } from "./bootstrap-server-proxy.use-case";
import {
  type ParsedPrepareServerRuntimeCommandInput,
  type PrepareServerRuntimeResult,
  type ServerRuntimePrepareStep,
} from "./prepare-server-runtime.command";

function connectivityStep(input: {
  phase: "connectivity-before" | "connectivity-after";
  connectivity: ServerConnectivityResult;
  durationMs: number;
}): ServerRuntimePrepareStep {
  return {
    phase: input.phase,
    status: input.connectivity.status === "healthy" ? "succeeded" : "failed",
    message:
      input.connectivity.status === "healthy"
        ? "Server deployability checks passed"
        : "Server deployability checks did not pass",
    durationMs: input.durationMs,
    checks: input.connectivity.checks,
    metadata: {
      status: input.connectivity.status,
    },
  };
}

function firstFailedStepMessage(steps: readonly ServerRuntimePrepareStep[]): string {
  return steps.find((step) => step.status === "failed")?.message ?? "Server runtime is not ready";
}

@injectable()
export class PrepareServerRuntimeUseCase {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.serverConnectivityChecker)
    private readonly connectivityChecker: ServerConnectivityChecker,
    @inject(tokens.serverRuntimePreparer)
    private readonly runtimePreparer: ServerRuntimePreparer,
    @inject(tokens.bootstrapServerProxyUseCase)
    private readonly bootstrapServerProxyUseCase: BootstrapServerProxyUseCase,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ParsedPrepareServerRuntimeCommandInput,
  ): Promise<Result<PrepareServerRuntimeResult>> {
    const {
      bootstrapServerProxyUseCase,
      clock,
      connectivityChecker,
      runtimePreparer,
      serverRepository,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const serverId = yield* DeploymentTargetId.create(input.serverId);
      const server = await serverRepository.findOne(
        repositoryContext,
        DeploymentTargetByIdSpec.create(serverId),
      );

      if (!server) {
        return err(domainError.notFound("server", input.serverId));
      }

      const steps: ServerRuntimePrepareStep[] = [];
      const state = server.toState();
      const beforeStartedAt = Date.now();
      const beforeConnectivity = yield* await connectivityChecker.test(context, {
        server: state,
      });
      steps.push(
        connectivityStep({
          phase: "connectivity-before",
          connectivity: beforeConnectivity,
          durationMs: Date.now() - beforeStartedAt,
        }),
      );

      if (beforeConnectivity.status !== "healthy") {
        const prepareResult = yield* await runtimePreparer.prepare(context, {
          server: state,
          mode: input.mode,
        });
        steps.push(...prepareResult.steps);
      } else {
        steps.push({
          phase: "docker",
          status: "skipped",
          message: "Docker is already available",
          durationMs: 0,
        });
      }

      const proxyStartedAt = Date.now();
      const proxyResult = yield* await bootstrapServerProxyUseCase.execute(context, {
        serverId: input.serverId,
        reason: input.mode === "repair" ? "repair" : "post-connect",
      });
      steps.push({
        phase: "edge-proxy",
        status: "succeeded",
        message: "Edge proxy is ready",
        durationMs: Date.now() - proxyStartedAt,
        metadata: {
          attemptId: proxyResult.attemptId,
        },
      });

      const refreshedServer = await serverRepository.findOne(
        repositoryContext,
        DeploymentTargetByIdSpec.create(serverId),
      );
      const afterStartedAt = Date.now();
      const afterConnectivity = yield* await connectivityChecker.test(context, {
        server: refreshedServer?.toState() ?? state,
      });
      steps.push(
        connectivityStep({
          phase: "connectivity-after",
          connectivity: afterConnectivity,
          durationMs: Date.now() - afterStartedAt,
        }),
      );

      const failed = steps.some((step) => step.status === "failed");
      const status: PrepareServerRuntimeResult["status"] = failed ? "failed" : "ready";
      return ok({
        serverId: input.serverId,
        status,
        preparedAt: clock.now(),
        steps: failed
          ? steps.map((step) =>
              step.status === "failed"
                ? {
                    ...step,
                    message: step.message || firstFailedStepMessage(steps),
                  }
                : step,
            )
          : steps,
      });
    });
  }
}
