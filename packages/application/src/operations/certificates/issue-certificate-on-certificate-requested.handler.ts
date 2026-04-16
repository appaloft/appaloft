import {
  CertificateAttemptId,
  CertificateByIdSpec,
  CertificateExpiresAtValue,
  CertificateFailedAtValue,
  CertificateFailureCodeValue,
  CertificateFailureMessageValue,
  type CertificateFailurePhase,
  CertificateFailurePhaseValue,
  CertificateFingerprintValue,
  CertificateId,
  CertificateIssuedAtValue,
  CertificateSecretRefValue,
  certificateFailurePhases,
  type DomainError,
  type DomainEvent,
  domainError,
  err,
  ok,
  ProviderKey,
  type Result,
  safeTry,
  UpsertCertificateSpec,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { EventHandler, type EventHandlerContract } from "../../cqrs";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type CertificateProviderIssueInput,
  type CertificateProviderPort,
  type CertificateRepository,
  type CertificateSecretStore,
  type Clock,
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
    domainError.validation(`certificate-requested payload ${key} is required`, {
      eventName: "certificate-requested",
      phase: "event-consumption",
      field: key,
    }),
  );
}

function optionalPayloadText(event: DomainEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isCertificateFailurePhase(value: string): value is CertificateFailurePhase {
  return certificateFailurePhases.includes(value as CertificateFailurePhase);
}

function failurePhaseFromError(error: DomainError, fallback: CertificateFailurePhase) {
  const phase = error.details?.phase;
  if (typeof phase === "string" && isCertificateFailurePhase(phase)) {
    return CertificateFailurePhaseValue.rehydrate(phase);
  }

  return CertificateFailurePhaseValue.rehydrate(fallback);
}

function safeFailureMessage(error: DomainError): Result<CertificateFailureMessageValue> {
  return CertificateFailureMessageValue.create(error.message || error.code);
}

@EventHandler("certificate-requested")
@injectable()
export class IssueCertificateOnCertificateRequestedHandler
  implements EventHandlerContract<DomainEvent>
{
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

  async handle(context: ExecutionContext, event: DomainEvent): Promise<Result<void>> {
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
      const certificateIdText = yield* readPayloadText(event, "certificateId");
      const attemptIdText = yield* readPayloadText(event, "attemptId");
      const certificateId = yield* CertificateId.create(certificateIdText);
      const attemptId = yield* CertificateAttemptId.create(attemptIdText);

      const certificate = await certificateRepository.findOne(
        repositoryContext,
        CertificateByIdSpec.create(certificateId),
      );
      if (!certificate) {
        logger.warn("certificate_request.skipped_missing_certificate", {
          requestId: context.requestId,
          certificateId: certificateId.value,
          attemptId: attemptId.value,
        });
        return ok(undefined);
      }

      const state = certificate.toState();
      const attempt = state.attempts.find((candidate) => candidate.id.equals(attemptId));
      if (!attempt) {
        logger.warn("certificate_request.skipped_missing_attempt", {
          requestId: context.requestId,
          certificateId: certificateId.value,
          attemptId: attemptId.value,
        });
        return ok(undefined);
      }

      if (
        attempt.status.value === "issued" ||
        attempt.status.value === "failed" ||
        attempt.status.value === "retry_scheduled"
      ) {
        return ok(undefined);
      }

      const issuingResult = yield* certificate.markAttemptIssuing({ attemptId });
      if (issuingResult.terminal) {
        return ok(undefined);
      }

      await certificateRepository.upsert(
        repositoryContext,
        certificate,
        UpsertCertificateSpec.fromCertificate(certificate),
      );

      const issueInput: CertificateProviderIssueInput = {
        certificateId: state.id.value,
        domainBindingId: state.domainBindingId.value,
        domainName: state.domainName.value,
        attemptId: attempt.id.value,
        reason: attempt.reason.value,
        providerKey: attempt.providerKey.value,
        challengeType: attempt.challengeType.value,
        requestedAt: attempt.requestedAt.value,
      };

      const issuedResult = await certificateProvider.issue(context, issueInput);
      if (issuedResult.isErr()) {
        const error = issuedResult.error;
        const causationId = optionalPayloadText(event, "causationId");
        const failedAt = yield* CertificateFailedAtValue.create(clock.now());
        const failureCode = yield* CertificateFailureCodeValue.create(error.code);
        const failureMessage = yield* safeFailureMessage(error);
        const failurePhase = failurePhaseFromError(error, "provider-request");
        const providerKey = yield* ProviderKey.create(issueInput.providerKey);
        yield* certificate.markIssuanceFailed({
          attemptId,
          failedAt,
          failureCode,
          failurePhase,
          failureMessage,
          retriable: error.retryable,
          providerKey,
          correlationId: context.requestId,
          ...(causationId ? { causationId } : {}),
        });
        await certificateRepository.upsert(
          repositoryContext,
          certificate,
          UpsertCertificateSpec.fromCertificate(certificate),
        );
        await publishDomainEventsAndReturn(context, eventBus, logger, certificate, undefined);
        return ok(undefined);
      }

      const issued = {
        ...issuedResult.value,
        certificateId: issueInput.certificateId,
        domainBindingId: issueInput.domainBindingId,
        domainName: issueInput.domainName,
        attemptId: issueInput.attemptId,
        providerKey: issueInput.providerKey,
      };
      const storedResult = await certificateSecretStore.store(context, issued);
      if (storedResult.isErr()) {
        const error = storedResult.error;
        const causationId = optionalPayloadText(event, "causationId");
        const failedAt = yield* CertificateFailedAtValue.create(clock.now());
        const failureCode = yield* CertificateFailureCodeValue.create(
          error.code === "certificate_storage_failed" ? error.code : "certificate_storage_failed",
        );
        const failureMessage = yield* safeFailureMessage(error);
        const failurePhase = CertificateFailurePhaseValue.rehydrate("certificate-storage");
        const providerKey = yield* ProviderKey.create(issueInput.providerKey);
        yield* certificate.markIssuanceFailed({
          attemptId,
          failedAt,
          failureCode,
          failurePhase,
          failureMessage,
          retriable: error.retryable,
          providerKey,
          correlationId: context.requestId,
          ...(causationId ? { causationId } : {}),
        });
        await certificateRepository.upsert(
          repositoryContext,
          certificate,
          UpsertCertificateSpec.fromCertificate(certificate),
        );
        await publishDomainEventsAndReturn(context, eventBus, logger, certificate, undefined);
        return ok(undefined);
      }

      const issuedAt = yield* CertificateIssuedAtValue.create(issued.issuedAt);
      const expiresAt = yield* CertificateExpiresAtValue.create(issued.expiresAt);
      const secretRef = yield* CertificateSecretRefValue.create(storedResult.value.secretRef);
      const fingerprint = yield* CertificateFingerprintValue.fromOptional(issued.fingerprint);
      const causationId = optionalPayloadText(event, "causationId");
      yield* certificate.markIssued({
        attemptId,
        issuedAt,
        expiresAt,
        secretRef,
        ...(fingerprint ? { fingerprint } : {}),
        correlationId: context.requestId,
        ...(causationId ? { causationId } : {}),
      });
      await certificateRepository.upsert(
        repositoryContext,
        certificate,
        UpsertCertificateSpec.fromCertificate(certificate),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, certificate, undefined);

      return ok(undefined);
    });
  }
}
