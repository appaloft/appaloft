import {
  createDomainEvent,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DomainEvent,
  domainError,
  ErrorCodeText,
  err,
  MessageText,
  ok,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertDeploymentTargetSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type IdGenerator,
  type ProcessAttemptRecorder,
  type ServerEdgeProxyBootstrapper,
  type ServerEdgeProxyBootstrapResult,
  type ServerRepository,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import {
  type BootstrapServerProxyResult,
  type ParsedBootstrapServerProxyCommandInput,
} from "./bootstrap-server-proxy.command";

type ProxyInstallFailurePhase =
  | "proxy-network"
  | "proxy-container"
  | "provider-unsupported"
  | "runtime-error";

function mapFailurePhase(errorCode: string): ProxyInstallFailurePhase {
  switch (errorCode) {
    case "edge_proxy_network_failed":
      return "proxy-network";
    case "edge_proxy_start_failed":
    case "edge_proxy_host_port_conflict":
      return "proxy-container";
    case "edge_proxy_kind_unsupported":
    case "edge_proxy_provider_unsupported":
      return "provider-unsupported";
    default:
      return "runtime-error";
  }
}

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

async function recordProxyAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  logger: AppLogger;
  requestId: string;
  attemptId: string;
  serverId: string;
  edgeProxyProviderKey: string;
  reason: ParsedBootstrapServerProxyCommandInput["reason"];
  status: "running" | "succeeded" | "failed";
  phase: string;
  step: string;
  updatedAt: string;
  startedAt?: string;
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
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    updatedAt: input.updatedAt,
    ...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode, errorCategory: "async-processing" } : {}),
    ...(input.retriable === undefined ? {} : { retriable: input.retriable }),
    nextActions: input.status === "failed" ? ["diagnostic", "manual-review"] : ["no-action"],
    safeDetails: {
      proxyKind: input.edgeProxyProviderKey,
      providerKey: input.edgeProxyProviderKey,
      reason: input.reason,
    },
  });

  if (result.isErr()) {
    input.logger.warn("server_proxy_bootstrap.process_attempt_record_failed", {
      requestId: input.requestId,
      serverId: input.serverId,
      attemptId: input.attemptId,
      errorCode: result.error.code,
    });
  }
}

function createProxyBootstrapRequestedEvent(input: {
  serverId: string;
  edgeProxyProviderKey: string;
  attemptId: string;
  requestedAt: string;
  host: string;
  port: number;
  reason: ParsedBootstrapServerProxyCommandInput["reason"];
  correlationId: string;
}): DomainEvent {
  return createDomainEvent("proxy-bootstrap-requested", input.serverId, input.requestedAt, {
    serverId: input.serverId,
    edgeProxyProviderKey: input.edgeProxyProviderKey,
    attemptId: input.attemptId,
    requestedAt: input.requestedAt,
    providerKey: input.edgeProxyProviderKey,
    host: input.host,
    port: input.port,
    reason: input.reason,
    correlationId: input.correlationId,
  });
}

function createProxyInstalledEvent(input: {
  serverId: string;
  edgeProxyProviderKey: string;
  attemptId: string;
  installedAt: string;
  result: ServerEdgeProxyBootstrapResult;
  correlationId: string;
}): DomainEvent {
  return createDomainEvent("proxy-installed", input.serverId, input.installedAt, {
    serverId: input.serverId,
    edgeProxyProviderKey: input.edgeProxyProviderKey,
    attemptId: input.attemptId,
    installedAt: input.installedAt,
    providerKey: input.edgeProxyProviderKey,
    ...(input.result.metadata ? { runtimeMetadata: input.result.metadata } : {}),
    correlationId: input.correlationId,
  });
}

function createProxyInstallFailedEvent(input: {
  serverId: string;
  edgeProxyProviderKey: string;
  attemptId: string;
  failedAt: string;
  errorCode: string;
  errorMessage?: string;
  retryable: boolean;
  correlationId: string;
}): DomainEvent {
  return createDomainEvent("proxy-install-failed", input.serverId, input.failedAt, {
    serverId: input.serverId,
    edgeProxyProviderKey: input.edgeProxyProviderKey,
    attemptId: input.attemptId,
    failedAt: input.failedAt,
    errorCode: input.errorCode,
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    retriable: input.retryable,
    providerKey: input.edgeProxyProviderKey,
    failurePhase: mapFailurePhase(input.errorCode),
    correlationId: input.correlationId,
  });
}

@injectable()
export class BootstrapServerProxyUseCase {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.serverEdgeProxyBootstrapper)
    private readonly bootstrapper: ServerEdgeProxyBootstrapper,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
  ) {}

  async execute(
    context: ExecutionContext,
    input: ParsedBootstrapServerProxyCommandInput,
  ): Promise<Result<BootstrapServerProxyResult>> {
    const {
      bootstrapper,
      clock,
      eventBus,
      idGenerator,
      logger,
      processAttemptRecorder,
      serverRepository,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      if (input.attemptId && context.entrypoint !== "system") {
        return err(
          domainError.validation("Public proxy repair requests cannot provide an attempt id", {
            phase: "proxy-bootstrap",
            commandName: "servers.bootstrap-proxy",
          }),
        );
      }

      const serverId = yield* DeploymentTargetId.create(input.serverId);
      const server = await serverRepository.findOne(
        repositoryContext,
        DeploymentTargetByIdSpec.create(serverId),
      );

      if (!server) {
        return err(domainError.notFound("server", input.serverId));
      }

      const state = server.toState();
      const edgeProxy = state.edgeProxy;

      if (!edgeProxy || edgeProxy.kind.value === "none" || edgeProxy.status.value === "disabled") {
        return err(
          domainError.invariant("Server edge proxy is disabled", {
            serverId: input.serverId,
            phase: "proxy-bootstrap",
          }),
        );
      }

      const edgeProxyProviderKey = edgeProxy.kind.value;

      if (input.edgeProxyProviderKey && input.edgeProxyProviderKey !== edgeProxyProviderKey) {
        return err(
          domainError.validation(
            "Requested edge proxy provider does not match server proxy intent",
            {
              serverId: input.serverId,
              phase: "proxy-bootstrap",
              requestedProviderKey: input.edgeProxyProviderKey,
              edgeProxyProviderKey,
            },
          ),
        );
      }

      const attemptId = input.attemptId ?? idGenerator.next("pxy");
      const attemptedAt = yield* UpdatedAt.create(clock.now());

      yield* server.beginEdgeProxyBootstrap({ attemptedAt });
      await serverRepository.upsert(
        repositoryContext,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );
      await recordProxyAttempt({
        recorder: processAttemptRecorder,
        repositoryContext,
        logger,
        requestId: context.requestId,
        attemptId,
        serverId: serverId.value,
        edgeProxyProviderKey,
        reason: input.reason,
        status: "running",
        phase: "proxy-bootstrap",
        step: "starting",
        startedAt: attemptedAt.value,
        updatedAt: attemptedAt.value,
      });

      await eventBus.publish(context, [
        createProxyBootstrapRequestedEvent({
          serverId: serverId.value,
          edgeProxyProviderKey,
          attemptId,
          requestedAt: attemptedAt.value,
          host: state.host.value,
          port: state.port.value,
          reason: input.reason,
          correlationId: context.requestId,
        }),
        ...server.pullDomainEvents(),
      ]);

      const result = await bootstrapper.bootstrap(context, {
        server: server.toState(),
      });
      const completedAt = yield* UpdatedAt.create(clock.now());
      let terminalEvent: DomainEvent;

      if (result.isErr()) {
        const error = result.error;
        const retriable = isProxyFailureRetriable(error.code, error.retryable);
        yield* server.markEdgeProxyFailed({
          failedAt: completedAt,
          errorCode: ErrorCodeText.rehydrate(error.code),
          errorMessage: MessageText.rehydrate(error.message),
        });
        terminalEvent = createProxyInstallFailedEvent({
          serverId: serverId.value,
          edgeProxyProviderKey,
          attemptId,
          failedAt: completedAt.value,
          errorCode: error.code,
          errorMessage: error.message,
          retryable: retriable,
          correlationId: context.requestId,
        });
        await recordProxyAttempt({
          recorder: processAttemptRecorder,
          repositoryContext,
          logger,
          requestId: context.requestId,
          attemptId,
          serverId: serverId.value,
          edgeProxyProviderKey,
          reason: input.reason,
          status: "failed",
          phase: mapFailurePhase(error.code),
          step: "failed",
          startedAt: attemptedAt.value,
          updatedAt: completedAt.value,
          finishedAt: completedAt.value,
          errorCode: error.code,
          retriable,
        });
      } else if (result.value.status === "ready") {
        yield* server.markEdgeProxyReady({ completedAt });
        terminalEvent = createProxyInstalledEvent({
          serverId: serverId.value,
          edgeProxyProviderKey,
          attemptId,
          installedAt: completedAt.value,
          result: result.value,
          correlationId: context.requestId,
        });
        await recordProxyAttempt({
          recorder: processAttemptRecorder,
          repositoryContext,
          logger,
          requestId: context.requestId,
          attemptId,
          serverId: serverId.value,
          edgeProxyProviderKey,
          reason: input.reason,
          status: "succeeded",
          phase: "server-ready",
          step: "ready",
          startedAt: attemptedAt.value,
          updatedAt: completedAt.value,
          finishedAt: completedAt.value,
        });
      } else {
        const errorCode = result.value.errorCode ?? "edge_proxy_bootstrap_failed";
        const errorMessage = result.value.message;
        const retriable = isProxyFailureRetriable(errorCode, true);
        yield* server.markEdgeProxyFailed({
          failedAt: completedAt,
          errorCode: ErrorCodeText.rehydrate(errorCode),
          errorMessage: MessageText.rehydrate(errorMessage),
        });
        terminalEvent = createProxyInstallFailedEvent({
          serverId: serverId.value,
          edgeProxyProviderKey,
          attemptId,
          failedAt: completedAt.value,
          errorCode,
          errorMessage,
          retryable: retriable,
          correlationId: context.requestId,
        });
        await recordProxyAttempt({
          recorder: processAttemptRecorder,
          repositoryContext,
          logger,
          requestId: context.requestId,
          attemptId,
          serverId: serverId.value,
          edgeProxyProviderKey,
          reason: input.reason,
          status: "failed",
          phase: mapFailurePhase(errorCode),
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
      await eventBus.publish(context, [...server.pullDomainEvents(), terminalEvent]);

      logger.info("server_proxy_bootstrap.completed", {
        requestId: context.requestId,
        serverId: serverId.value,
        attemptId,
        edgeProxyProviderKey,
      });

      return ok({ serverId: serverId.value, attemptId });
    });
  }
}
