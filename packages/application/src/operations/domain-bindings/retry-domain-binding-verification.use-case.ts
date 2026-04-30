import {
  CreatedAt,
  DomainBindingByIdSpec,
  DomainBindingId,
  DomainVerificationAttemptId,
  domainError,
  err,
  MessageText,
  ok,
  type Result,
  safeTry,
  UpsertDomainBindingSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DomainBindingRepository,
  type EventBus,
  type IdGenerator,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type RetryDomainBindingVerificationCommandInput,
  type RetryDomainBindingVerificationCommandResult,
} from "./retry-domain-binding-verification.command";

function domainBindingNotFound(id: string) {
  const error = domainError.notFound("DomainBinding", id);
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      phase: "domain-verification",
      domainBindingId: id,
    },
  };
}

@injectable()
export class RetryDomainBindingVerificationUseCase {
  constructor(
    @inject(tokens.domainBindingRepository)
    private readonly domainBindingRepository: DomainBindingRepository,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RetryDomainBindingVerificationCommandInput,
  ): Promise<Result<RetryDomainBindingVerificationCommandResult>> {
    const { clock, domainBindingRepository, eventBus, idGenerator, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const domainBindingId = yield* DomainBindingId.create(input.domainBindingId);
      const domainBinding = await domainBindingRepository.findOne(
        repositoryContext,
        DomainBindingByIdSpec.create(domainBindingId),
      );

      if (!domainBinding) {
        return err(domainBindingNotFound(input.domainBindingId));
      }

      const state = domainBinding.toState();
      const verificationAttemptId = yield* DomainVerificationAttemptId.create(
        idGenerator.next("dva"),
      );
      const retryAt = yield* CreatedAt.create(clock.now());
      const verificationExpectedTarget = yield* MessageText.create(
        state.verificationAttempts.at(-1)?.expectedTarget.value ?? "Verify DNS ownership",
      );
      const retryResult = yield* domainBinding.retryVerification({
        verificationAttemptId,
        verificationExpectedTarget,
        ...(state.dnsObservation
          ? { dnsExpectedTargets: state.dnsObservation.expectedTargets }
          : {}),
        retryAt,
        correlationId: context.requestId,
      });

      await domainBindingRepository.upsert(
        repositoryContext,
        domainBinding,
        UpsertDomainBindingSpec.fromDomainBinding(domainBinding),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, domainBinding, undefined);

      return ok({
        id: domainBindingId.value,
        verificationAttemptId: retryResult.verificationAttemptId.value,
      });
    });
  }
}
