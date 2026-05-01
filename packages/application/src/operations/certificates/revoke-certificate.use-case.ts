import {
  CertificateByIdSpec,
  CertificateId,
  CertificateLifecycleReasonValue,
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
  type CertificateProviderPort,
  type CertificateRepository,
  type CertificateSecretStore,
  type Clock,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type RevokeCertificateCommandInput,
  type RevokeCertificateCommandResult,
} from "./revoke-certificate.command";

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
export class RevokeCertificateUseCase {
  constructor(
    @inject(tokens.certificateRepository)
    private readonly certificateRepository: CertificateRepository,
    @inject(tokens.certificateProvider)
    private readonly certificateProvider: CertificateProviderPort,
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
    input: RevokeCertificateCommandInput,
  ): Promise<Result<RevokeCertificateCommandResult>> {
    const {
      certificateProvider,
      certificateRepository,
      certificateSecretStore,
      clock,
      eventBus,
      logger,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const certificateId = yield* CertificateId.create(input.certificateId);
      const certificate = await certificateRepository.findOne(
        repositoryContext,
        CertificateByIdSpec.create(certificateId),
      );

      if (!certificate) {
        return err(certificateNotFound(certificateId.value));
      }

      const state = certificate.toState();
      const revokedAt = yield* CreatedAt.create(clock.now());
      const reason = yield* CertificateLifecycleReasonValue.fromOptional(input.reason);
      const externalRevocation =
        state.source.value === "managed" ? ("provider" as const) : ("appaloft-local" as const);

      if (state.source.value === "managed" && state.status.value === "active") {
        yield* await certificateProvider.revoke(context, {
          certificateId: state.id.value,
          domainBindingId: state.domainBindingId.value,
          domainName: state.domainName.value,
          providerKey: state.providerKey.value,
          ...(state.fingerprint ? { fingerprint: state.fingerprint.value } : {}),
          ...(reason ? { reason: reason.value } : {}),
          revokedAt: revokedAt.value,
        });
      }

      const revokeResult = yield* certificate.revoke({
        revokedAt,
        externalRevocation,
        ...(reason ? { reason } : {}),
        correlationId: context.requestId,
        ...(input.causationId ? { causationId: input.causationId } : {}),
      });

      if (!revokeResult.changed) {
        return ok({ certificateId: state.id.value });
      }

      yield* await certificateSecretStore.deactivate(context, {
        certificateId: state.id.value,
        domainBindingId: state.domainBindingId.value,
        reason: "revoked",
        deactivatedAt: revokedAt.value,
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
