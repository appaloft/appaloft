import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DomainEvent,
  ErrorCodeText,
  MessageText,
  ok,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertDeploymentTargetSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { EventHandler, type EventHandlerContract } from "../../cqrs";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type IdGenerator,
  type ProcessAttemptRecorder,
  type ServerEdgeProxyBootstrapper,
  type ServerRepository,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
import { tokens } from "../../tokens";

function isProxyFailureRetriable(errorCode: string, fallback: boolean): boolean {
  switch (errorCode) {
    case "edge_proxy_kind_unsupported":
    case "edge_proxy_provider_unsupported":
      return false;
    case "proxy_provider_unavailable":
    case "edge_proxy_network_failed":
    case "edge_proxy_start_failed":
    case "edge_proxy_host_port_conflict":
      return true;
    default:
      return fallback;
  }
}

async function recordProxyBootstrapAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  logger: AppLogger;
  requestId: string;
  attemptId: string;
  serverId: string;
  edgeProxyProviderKey: string;
  status: "running" | "succeeded" | "failed";
  phase: string;
  step: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  errorCode?: string;
  retriable?: boolean;
}): Promise<void> {
  const result = await input.recorder.record(input.repositoryContext, {
    id: input.attemptId,
    kind: "proxy-bootstrap",
    status: input.status,
    operationKey: "servers.bootstrap-proxy",
    dedupeKey: `proxy-bootstrap:${input.serverId}:${input.attemptId}`,
    correlationId: input.requestId,
    requestId: input.requestId,
    phase: input.phase,
    step: input.step,
    serverId: input.serverId,
    startedAt: input.startedAt,
    updatedAt: input.updatedAt,
    ...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode, errorCategory: "async-processing" } : {}),
    ...(input.retriable === undefined ? {} : { retriable: input.retriable }),
    nextActions: input.status === "failed" ? ["diagnostic", "manual-review"] : ["no-action"],
    safeDetails: {
      proxyKind: input.edgeProxyProviderKey,
      providerKey: input.edgeProxyProviderKey,
      reason: "post-connect",
    },
  });

  if (result.isErr()) {
    input.logger.warn("server_edge_proxy_bootstrap.process_attempt_record_failed", {
      requestId: input.requestId,
      serverId: input.serverId,
      attemptId: input.attemptId,
      errorCode: result.error.code,
    });
  }
}

@EventHandler("deployment_target.registered")
@injectable()
export class BootstrapServerEdgeProxyOnTargetRegisteredHandler
  implements EventHandlerContract<DomainEvent>
{
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.serverEdgeProxyBootstrapper)
    private readonly bootstrapper: ServerEdgeProxyBootstrapper,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator = { next: (prefix) => `${prefix}_unknown` },
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
  ) {}

  async handle(context: ExecutionContext, event: DomainEvent): Promise<Result<void>> {
    const { bootstrapper, clock, idGenerator, logger, processAttemptRecorder, serverRepository } =
      this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const serverId = yield* DeploymentTargetId.create(event.aggregateId);
      const server = await serverRepository.findOne(
        repositoryContext,
        DeploymentTargetByIdSpec.create(serverId),
      );

      if (!server) {
        logger.warn("server_edge_proxy_bootstrap.skipped_missing_server", {
          requestId: context.requestId,
          serverId: event.aggregateId,
        });
        return ok(undefined);
      }

      const state = server.toState();
      const edgeProxy = state.edgeProxy;
      if (!edgeProxy || edgeProxy.kind.value === "none") {
        return ok(undefined);
      }

      const attemptId = idGenerator.next("pxy");
      const attemptedAt = yield* UpdatedAt.create(clock.now());
      yield* server.beginEdgeProxyBootstrap({ attemptedAt });
      await serverRepository.upsert(
        repositoryContext,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );
      await recordProxyBootstrapAttempt({
        recorder: processAttemptRecorder,
        repositoryContext,
        logger,
        requestId: context.requestId,
        attemptId,
        serverId: serverId.value,
        edgeProxyProviderKey: edgeProxy.kind.value,
        status: "running",
        phase: "proxy-bootstrap",
        step: "starting",
        startedAt: attemptedAt.value,
        updatedAt: attemptedAt.value,
      });

      const result = await bootstrapper.bootstrap(context, {
        server: server.toState(),
      });
      const completedAt = yield* UpdatedAt.create(clock.now());

      if (result.isErr()) {
        const retriable = isProxyFailureRetriable(result.error.code, result.error.retryable);
        yield* server.markEdgeProxyFailed({
          failedAt: completedAt,
          errorCode: ErrorCodeText.rehydrate(result.error.code),
          errorMessage: MessageText.rehydrate(result.error.message),
        });
        await recordProxyBootstrapAttempt({
          recorder: processAttemptRecorder,
          repositoryContext,
          logger,
          requestId: context.requestId,
          attemptId,
          serverId: serverId.value,
          edgeProxyProviderKey: edgeProxy.kind.value,
          status: "failed",
          phase: "proxy-bootstrap",
          step: "failed",
          startedAt: attemptedAt.value,
          updatedAt: completedAt.value,
          finishedAt: completedAt.value,
          errorCode: result.error.code,
          retriable,
        });
      } else if (result.value.status === "ready") {
        yield* server.markEdgeProxyReady({ completedAt });
        await recordProxyBootstrapAttempt({
          recorder: processAttemptRecorder,
          repositoryContext,
          logger,
          requestId: context.requestId,
          attemptId,
          serverId: serverId.value,
          edgeProxyProviderKey: edgeProxy.kind.value,
          status: "succeeded",
          phase: "server-ready",
          step: "ready",
          startedAt: attemptedAt.value,
          updatedAt: completedAt.value,
          finishedAt: completedAt.value,
        });
      } else {
        const errorCode = result.value.errorCode ?? "edge_proxy_bootstrap_failed";
        const retriable = isProxyFailureRetriable(errorCode, true);
        yield* server.markEdgeProxyFailed({
          failedAt: completedAt,
          errorCode: ErrorCodeText.rehydrate(errorCode),
          errorMessage: MessageText.rehydrate(result.value.message),
        });
        await recordProxyBootstrapAttempt({
          recorder: processAttemptRecorder,
          repositoryContext,
          logger,
          requestId: context.requestId,
          attemptId,
          serverId: serverId.value,
          edgeProxyProviderKey: edgeProxy.kind.value,
          status: "failed",
          phase: "proxy-bootstrap",
          step: "failed",
          startedAt: attemptedAt.value,
          updatedAt: completedAt.value,
          finishedAt: completedAt.value,
          errorCode,
          retriable,
        });
      }

      await serverRepository.upsert(
        repositoryContext,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );

      return ok(undefined);
    });
  }
}
