import {
  CreatedAt,
  DomainBindingByIdSpec,
  DomainBindingId,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
  UpsertDomainBindingSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type CertificateReadModel,
  type Clock,
  type DomainBindingRepository,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeleteDomainBindingCommandInput } from "./delete-domain-binding.command";
import { domainBindingDeleteSafety } from "./domain-binding-delete-safety";

function domainBindingNotFound(id: string) {
  const error = domainError.notFound("DomainBinding", id);
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      phase: "domain-binding-delete",
      domainBindingId: id,
    },
  };
}

@injectable()
export class DeleteDomainBindingUseCase {
  constructor(
    @inject(tokens.domainBindingRepository)
    private readonly domainBindingRepository: DomainBindingRepository,
    @inject(tokens.certificateReadModel)
    private readonly certificateReadModel: CertificateReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DeleteDomainBindingCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { certificateReadModel, clock, domainBindingRepository, eventBus, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const domainBindingId = yield* DomainBindingId.create(input.domainBindingId);
      const confirmationId = yield* DomainBindingId.create(input.confirmation.domainBindingId);

      if (!confirmationId.equals(domainBindingId)) {
        return err(
          domainError.validation("Domain binding id confirmation does not match", {
            phase: "domain-binding-delete",
            domainBindingId: domainBindingId.value,
            expectedDomainBindingId: domainBindingId.value,
            actualDomainBindingId: confirmationId.value,
          }),
        );
      }

      const domainBinding = await domainBindingRepository.findOne(
        repositoryContext,
        DomainBindingByIdSpec.create(domainBindingId),
      );

      if (!domainBinding) {
        return err(domainBindingNotFound(input.domainBindingId));
      }

      const certificates = await certificateReadModel.list(repositoryContext, {
        domainBindingId: domainBindingId.value,
      });
      const safety = domainBindingDeleteSafety({
        domainBindingId: domainBindingId.value,
        certificates,
      });

      if (!safety.safeToDelete) {
        return err(
          domainError.conflict("Domain binding deletion is blocked by retained lifecycle state", {
            phase: "domain-binding-delete",
            domainBindingId: domainBindingId.value,
            deletionBlockers: safety.blockers.map((blocker) => blocker.kind),
          }),
        );
      }

      const deletedAt = yield* CreatedAt.create(clock.now());
      const deleteResult = yield* domainBinding.delete({
        deletedAt,
        correlationId: context.requestId,
      });

      if (!deleteResult.changed) {
        return ok({ id: domainBindingId.value });
      }

      await domainBindingRepository.upsert(
        repositoryContext,
        domainBinding,
        UpsertDomainBindingSpec.fromDomainBinding(domainBinding),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, domainBinding, undefined);

      return ok({ id: domainBindingId.value });
    });
  }
}
