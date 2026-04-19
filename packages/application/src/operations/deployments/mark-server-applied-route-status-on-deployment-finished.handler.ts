import {
  DeploymentByIdSpec,
  DeploymentId,
  type DomainEvent,
  type EdgeProxyKind,
  edgeProxyKinds,
  ok,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { EventHandler, type EventHandlerContract } from "../../cqrs";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type DeploymentRepository,
  type ServerAppliedRouteStateStore,
} from "../../ports";
import { tokens } from "../../tokens";

const serverAppliedRouteSource = "server-applied-config-domain";
const serverAppliedRouteFailurePhases = [
  "proxy-route-realization",
  "proxy-reload",
  "public-route-verification",
] as const;

function optionalPayloadText(event: DomainEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalPayloadBoolean(event: DomainEvent, key: string): boolean | undefined {
  const value = event.payload[key];
  return typeof value === "boolean" ? value : undefined;
}

function isServerAppliedRouteFailurePhase(value: string | undefined): value is string {
  return serverAppliedRouteFailurePhases.some((phase) => phase === value);
}

function isEdgeProxyKind(value: string | undefined): value is EdgeProxyKind {
  return Boolean(value && edgeProxyKinds.some((kind) => kind === value));
}

@EventHandler("deployment.finished")
@injectable()
export class MarkServerAppliedRouteStatusOnDeploymentFinishedHandler
  implements EventHandlerContract<DomainEvent>
{
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.serverAppliedRouteDesiredStateReader)
    private readonly routeStateStore: ServerAppliedRouteStateStore,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async handle(context: ExecutionContext, event: DomainEvent): Promise<Result<void>> {
    const { deploymentRepository, logger, routeStateStore } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const deploymentId = yield* DeploymentId.create(event.aggregateId);
      const deployment = await deploymentRepository.findOne(
        repositoryContext,
        DeploymentByIdSpec.create(deploymentId),
      );

      if (!deployment) {
        logger.warn("server_applied_route_status.skipped_missing_deployment", {
          requestId: context.requestId,
          deploymentId: deploymentId.value,
        });
        return ok(undefined);
      }

      const state = deployment.toState();
      const metadata = state.runtimePlan.execution.metadata ?? {};
      if (metadata["access.routeSource"] !== serverAppliedRouteSource) {
        return ok(undefined);
      }

      const routeSetId = metadata["access.serverAppliedRouteSetId"];
      if (!routeSetId) {
        logger.warn("server_applied_route_status.skipped_missing_route_set", {
          requestId: context.requestId,
          deploymentId: deploymentId.value,
        });
        return ok(undefined);
      }

      const target = {
        projectId: state.projectId.value,
        environmentId: state.environmentId.value,
        resourceId: state.resourceId.value,
        serverId: state.serverId.value,
        destinationId: state.destinationId.value,
      };
      const route = state.runtimePlan.execution.accessRoutes.find(
        (candidate) => candidate.proxyKind !== "none",
      );
      const proxyKind = isEdgeProxyKind(route?.proxyKind) ? route.proxyKind : undefined;
      const providerKey = metadata["access.providerKey"];
      const status = optionalPayloadText(event, "status");

      if (status === "succeeded") {
        yield* await routeStateStore.markApplied({
          target,
          deploymentId: deploymentId.value,
          updatedAt: event.occurredAt,
          routeSetId,
          ...(providerKey ? { providerKey } : {}),
          ...(proxyKind ? { proxyKind } : {}),
        });
        return ok(undefined);
      }

      if (status !== "failed") {
        return ok(undefined);
      }

      const failurePhase = optionalPayloadText(event, "failurePhase");
      if (!isServerAppliedRouteFailurePhase(failurePhase)) {
        return ok(undefined);
      }

      const errorCode = optionalPayloadText(event, "errorCode") ?? "deployment_failed";
      const errorMessage = optionalPayloadText(event, "errorMessage");
      yield* await routeStateStore.markFailed({
        target,
        deploymentId: deploymentId.value,
        updatedAt: event.occurredAt,
        routeSetId,
        phase: failurePhase,
        errorCode,
        retryable: optionalPayloadBoolean(event, "retryable") ?? false,
        ...(errorMessage ? { message: errorMessage } : {}),
        ...(providerKey ? { providerKey } : {}),
        ...(proxyKind ? { proxyKind } : {}),
      });

      return ok(undefined);
    });
  }
}
