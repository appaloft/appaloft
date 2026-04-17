import {
  CreatedAt,
  DeploymentId,
  DomainBindingByIdSpec,
  DomainBindingId,
  type DomainEvent,
  type DomainRouteFailurePhase,
  DomainRouteFailurePhaseValue,
  domainRouteFailurePhases,
  ErrorCodeText,
  MessageText,
  ok,
  type Result,
  safeTry,
  UpsertDomainBindingSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { EventHandler, type EventHandlerContract } from "../../cqrs";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type DomainBindingRepository,
  type DomainRouteFailureCandidateReader,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";

function isDomainRouteFailurePhase(value: unknown): value is DomainRouteFailurePhase {
  return typeof value === "string" && domainRouteFailurePhases.some((phase) => phase === value);
}

function optionalPayloadText(event: DomainEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalPayloadBoolean(event: DomainEvent, key: string): boolean | undefined {
  const value = event.payload[key];
  return typeof value === "boolean" ? value : undefined;
}

function failurePhaseFromEvent(
  event: DomainEvent,
  errorCode: string,
): DomainRouteFailurePhase | null {
  const failurePhase = event.payload.failurePhase;
  if (isDomainRouteFailurePhase(failurePhase)) {
    return failurePhase;
  }

  if (errorCode === "proxy_reload_failed") {
    return "proxy-reload";
  }

  if (
    errorCode.startsWith("ssh_public_route_") ||
    errorCode.includes("public_route") ||
    errorCode.includes("public-route")
  ) {
    return "public-route-verification";
  }

  if (errorCode.startsWith("proxy_") || errorCode.includes("proxy")) {
    return "proxy-route-realization";
  }

  return null;
}

@EventHandler("deployment.finished")
@injectable()
export class MarkDomainRouteFailedOnDeploymentFinishedHandler
  implements EventHandlerContract<DomainEvent>
{
  constructor(
    @inject(tokens.domainBindingRepository)
    private readonly domainBindingRepository: DomainBindingRepository,
    @inject(tokens.domainRouteFailureCandidateReader)
    private readonly candidateReader: DomainRouteFailureCandidateReader,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async handle(context: ExecutionContext, event: DomainEvent): Promise<Result<void>> {
    const { candidateReader, domainBindingRepository, eventBus, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      if (optionalPayloadText(event, "status") !== "failed") {
        return ok(undefined);
      }

      const errorCodeText = optionalPayloadText(event, "errorCode");
      if (!errorCodeText) {
        return ok(undefined);
      }

      const failurePhaseText = failurePhaseFromEvent(event, errorCodeText);
      if (!failurePhaseText) {
        return ok(undefined);
      }

      const deploymentId = yield* DeploymentId.create(event.aggregateId);
      const failedAt = yield* CreatedAt.create(event.occurredAt);
      const errorCode = yield* ErrorCodeText.create(errorCodeText);
      const failurePhase = yield* DomainRouteFailurePhaseValue.create(failurePhaseText);
      const errorMessageText = optionalPayloadText(event, "errorMessage");
      const errorMessage = errorMessageText ? MessageText.rehydrate(errorMessageText) : undefined;
      const retriable = optionalPayloadBoolean(event, "retryable") ?? false;

      const candidates = await candidateReader.listAffectedBindings(repositoryContext, {
        deploymentId: deploymentId.value,
      });

      for (const candidate of candidates) {
        const domainBindingId = yield* DomainBindingId.create(candidate.domainBindingId);
        const domainBinding = await domainBindingRepository.findOne(
          repositoryContext,
          DomainBindingByIdSpec.create(domainBindingId),
        );

        if (!domainBinding) {
          logger.warn("domain_route_failure.skipped_missing_binding", {
            requestId: context.requestId,
            domainBindingId: domainBindingId.value,
            deploymentId: deploymentId.value,
          });
          continue;
        }

        yield* domainBinding.markRouteRealizationFailed({
          deploymentId,
          failedAt,
          errorCode,
          failurePhase,
          retriable,
          ...(errorMessage ? { errorMessage } : {}),
          correlationId: context.requestId,
          causationId: event.aggregateId,
        });

        await domainBindingRepository.upsert(
          repositoryContext,
          domainBinding,
          UpsertDomainBindingSpec.fromDomainBinding(domainBinding),
        );
        await publishDomainEventsAndReturn(context, eventBus, logger, domainBinding, undefined);
      }

      return ok(undefined);
    });
  }
}
