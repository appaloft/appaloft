import {
  CreatedAt,
  DomainBindingByIdSpec,
  DomainBindingId,
  DomainVerificationAttemptId,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
  UpsertDomainBindingSpec,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DomainBindingRepository,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ConfirmDomainBindingOwnershipCommandInput } from "./confirm-domain-binding-ownership.command";

@injectable()
export class ConfirmDomainBindingOwnershipUseCase {
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

  async execute(
    context: ExecutionContext,
    input: ConfirmDomainBindingOwnershipCommandInput,
  ): Promise<Result<{ id: string; verificationAttemptId: string }>> {
    const { clock, domainBindingRepository, eventBus, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const domainBindingId = yield* DomainBindingId.create(input.domainBindingId);
      const verificationAttemptId = input.verificationAttemptId
        ? yield* DomainVerificationAttemptId.create(input.verificationAttemptId)
        : undefined;

      const domainBinding = await domainBindingRepository.findOne(
        repositoryContext,
        DomainBindingByIdSpec.create(domainBindingId),
      );

      if (!domainBinding) {
        const notFound = domainError.notFound("DomainBinding", domainBindingId.value);
        return err({
          ...notFound,
          details: {
            ...notFound.details,
            phase: "domain-verification",
            domainBindingId: domainBindingId.value,
          },
        });
      }

      const confirmedAt = yield* CreatedAt.create(clock.now());
      const confirmation = yield* domainBinding.confirmOwnership({
        confirmedAt,
        ...(verificationAttemptId ? { verificationAttemptId } : {}),
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
        verificationAttemptId: confirmation.verificationAttemptId.value,
      });
    });
  }
}
