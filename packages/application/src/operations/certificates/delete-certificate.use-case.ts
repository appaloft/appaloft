import {
  CertificateByIdSpec,
  CertificateId,
  CreatedAt,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
  UpsertCertificateSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type CertificateRepository,
  type CertificateSecretStore,
  type Clock,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type DeleteCertificateCommandInput,
  type DeleteCertificateCommandResult,
} from "./delete-certificate.command";

function certificateNotFound(certificateId: string): DomainError {
  const error = domainError.notFound("Certificate", certificateId);
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      phase: "certificate-context-resolution",
      certificateId,
    },
  };
}

@injectable()
export class DeleteCertificateUseCase {
  constructor(
    @inject(tokens.certificateRepository)
    private readonly certificateRepository: CertificateRepository,
    @inject(tokens.certificateSecretStore)
    private readonly certificateSecretStore: CertificateSecretStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DeleteCertificateCommandInput,
  ): Promise<Result<DeleteCertificateCommandResult>> {
    const { certificateRepository, certificateSecretStore, clock, eventBus, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const certificateId = yield* CertificateId.create(input.certificateId);
      const confirmationId = yield* CertificateId.create(input.confirmation.certificateId);

      if (!confirmationId.equals(certificateId)) {
        return err(
          domainError.validation("Certificate id confirmation does not match", {
            phase: "certificate-delete",
            certificateId: certificateId.value,
            expectedCertificateId: certificateId.value,
            actualCertificateId: confirmationId.value,
          }),
        );
      }

      const certificate = await certificateRepository.findOne(
        repositoryContext,
        CertificateByIdSpec.create(certificateId),
      );

      if (!certificate) {
        return err(certificateNotFound(certificateId.value));
      }

      const state = certificate.toState();
      const deletedAt = yield* CreatedAt.create(clock.now());
      const deleteResult = yield* certificate.delete({
        deletedAt,
        correlationId: context.requestId,
        ...(input.causationId ? { causationId: input.causationId } : {}),
      });

      if (!deleteResult.changed) {
        return ok({ certificateId: state.id.value });
      }

      yield* await certificateSecretStore.deactivate(context, {
        certificateId: state.id.value,
        domainBindingId: state.domainBindingId.value,
        reason: "deleted",
        deactivatedAt: deletedAt.value,
      });

      await certificateRepository.upsert(
        repositoryContext,
        certificate,
        UpsertCertificateSpec.fromCertificate(certificate),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, certificate, undefined);

      return ok({ certificateId: state.id.value });
    });
  }
}
