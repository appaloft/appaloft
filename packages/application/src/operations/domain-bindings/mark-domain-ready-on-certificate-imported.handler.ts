import {
  CreatedAt,
  DomainBindingByIdSpec,
  DomainBindingId,
  type DomainEvent,
  domainError,
  err,
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
  type Clock,
  type DomainBindingRepository,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";

function readPayloadText(event: DomainEvent, key: string): Result<string> {
  const value = event.payload[key];
  if (typeof value === "string" && value.trim()) {
    return ok(value.trim());
  }

  return err(
    domainError.validation(`certificate-imported payload ${key} is required`, {
      eventName: "certificate-imported",
      phase: "event-consumption",
      field: key,
    }),
  );
}

function optionalPayloadText(event: DomainEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

@EventHandler("certificate-imported")
@injectable()
export class MarkDomainReadyOnCertificateImportedHandler
  implements EventHandlerContract<DomainEvent>
{
  constructor(
    @inject(tokens.domainBindingRepository)
    private readonly domainBindingRepository: DomainBindingRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async handle(context: ExecutionContext, event: DomainEvent): Promise<Result<void>> {
    const { clock, domainBindingRepository, eventBus, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const domainBindingId = yield* DomainBindingId.create(
        yield* readPayloadText(event, "domainBindingId"),
      );
      const domainBinding = await domainBindingRepository.findOne(
        repositoryContext,
        DomainBindingByIdSpec.create(domainBindingId),
      );

      if (!domainBinding) {
        logger.warn("certificate_imported_domain_ready.skipped_missing_binding", {
          requestId: context.requestId,
          domainBindingId: domainBindingId.value,
          certificateId: event.aggregateId,
        });
        return ok(undefined);
      }

      const state = domainBinding.toState();
      if (state.status.value === "ready") {
        return ok(undefined);
      }

      if (state.certificatePolicy.value !== "manual") {
        logger.debug("certificate_imported_domain_ready.skipped_non_manual_policy", {
          requestId: context.requestId,
          domainBindingId: domainBindingId.value,
          certificatePolicy: state.certificatePolicy.value,
        });
        return ok(undefined);
      }

      if (state.status.value !== "bound" && state.status.value !== "certificate_pending") {
        logger.debug("certificate_imported_domain_ready.skipped_not_bound", {
          requestId: context.requestId,
          domainBindingId: domainBindingId.value,
          status: state.status.value,
        });
        return ok(undefined);
      }

      if (state.tlsMode.value === "disabled") {
        logger.debug("certificate_imported_domain_ready.skipped_certificate_not_required", {
          requestId: context.requestId,
          domainBindingId: domainBindingId.value,
          tlsMode: state.tlsMode.value,
        });
        return ok(undefined);
      }

      const readyAt = yield* CreatedAt.create(clock.now());
      yield* domainBinding.markReady({
        readyAt,
        correlationId: context.requestId,
        causationId: optionalPayloadText(event, "causationId") ?? event.aggregateId,
      });

      await domainBindingRepository.upsert(
        repositoryContext,
        domainBinding,
        UpsertDomainBindingSpec.fromDomainBinding(domainBinding),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, domainBinding, undefined);

      return ok(undefined);
    });
  }
}
