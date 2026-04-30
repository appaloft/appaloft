import {
  CreatedAt,
  DeploymentId,
  DomainBindingByIdSpec,
  DomainBindingId,
  type DomainEvent,
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

function optionalPayloadText(event: DomainEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

@EventHandler("deployment.finished")
@injectable()
export class MarkDomainReadyOnDeploymentFinishedHandler
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
      if (optionalPayloadText(event, "status") !== "succeeded") {
        return ok(undefined);
      }

      const deploymentId = yield* DeploymentId.create(event.aggregateId);
      const readyAt = yield* CreatedAt.create(event.occurredAt);
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
          logger.warn("domain_route_ready.skipped_missing_binding", {
            requestId: context.requestId,
            domainBindingId: domainBindingId.value,
            deploymentId: deploymentId.value,
          });
          continue;
        }

        if (domainBinding.isReady()) {
          continue;
        }

        if (!domainBinding.canBecomeReadyAfterRouteRealization()) {
          const state = domainBinding.toState();
          logger.debug("domain_route_ready.skipped_inactive_binding", {
            requestId: context.requestId,
            domainBindingId: domainBindingId.value,
            deploymentId: deploymentId.value,
            status: state.status.value,
            tlsMode: state.tlsMode.value,
            certificatePolicy: state.certificatePolicy.value,
          });
          continue;
        }

        yield* domainBinding.markReady({
          readyAt,
          correlationId: context.requestId,
          causationId: deploymentId.value,
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
