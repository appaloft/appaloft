import {
  DomainBindingByIdSpec,
  DomainBindingId,
  type DomainEvent,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { EventHandler, type EventHandlerContract } from "../../cqrs";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type DomainBindingRepository } from "../../ports";
import { tokens } from "../../tokens";

function readPayloadText(event: DomainEvent, key: string): Result<string> {
  const value = event.payload[key];
  if (typeof value === "string" && value.trim()) {
    return ok(value.trim());
  }

  return err(
    domainError.validation(`certificate-issued payload ${key} is required`, {
      eventName: "certificate-issued",
      phase: "event-consumption",
      field: key,
    }),
  );
}

@EventHandler("certificate-issued")
@injectable()
export class MarkDomainReadyOnCertificateIssuedHandler
  implements EventHandlerContract<DomainEvent>
{
  constructor(
    @inject(tokens.domainBindingRepository)
    private readonly domainBindingRepository: DomainBindingRepository,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async handle(context: ExecutionContext, event: DomainEvent): Promise<Result<void>> {
    const { domainBindingRepository, logger } = this;
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
        logger.warn("certificate_domain_ready.skipped_missing_binding", {
          requestId: context.requestId,
          domainBindingId: domainBindingId.value,
          certificateId: event.aggregateId,
        });
        return ok(undefined);
      }

      if (domainBinding.isReady()) {
        return ok(undefined);
      }

      if (!domainBinding.canBecomeReadyAfterCertificateIssued()) {
        const state = domainBinding.toState();
        logger.debug("certificate_domain_ready.skipped_not_bound", {
          requestId: context.requestId,
          domainBindingId: domainBindingId.value,
          status: state.status.value,
          tlsMode: state.tlsMode.value,
          certificatePolicy: state.certificatePolicy.value,
        });
        return ok(undefined);
      }

      logger.debug("certificate_issued_reconciliation.pending", {
        requestId: context.requestId,
        domainBindingId: domainBindingId.value,
        certificateId: event.aggregateId,
      });

      return ok(undefined);
    });
  }
}
