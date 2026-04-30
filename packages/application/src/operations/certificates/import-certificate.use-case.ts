import {
  Certificate,
  CertificateAttemptId,
  CertificateAttemptIdempotencyKeyValue,
  CertificateByAttemptIdempotencyKeySpec,
  CertificateByDomainBindingIdSpec,
  CertificateChallengeTypeValue,
  CertificateExpiresAtValue,
  CertificateFingerprintValue,
  CertificateId,
  CertificateIssueReasonValue,
  CertificateIssuerValue,
  CertificateKeyAlgorithmValue,
  CertificateMaterialFingerprintValue,
  CertificateNotBeforeValue,
  CertificateSecretRefValue,
  CreatedAt,
  DomainBindingByIdSpec,
  DomainBindingId,
  type DomainError,
  domainError,
  err,
  ok,
  ProviderKey,
  PublicDomainName,
  type Result,
  safeTry,
  UpsertCertificateSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type CertificateMaterialValidator,
  type CertificateRepository,
  type CertificateSecretStore,
  type Clock,
  type DomainBindingRepository,
  type EventBus,
  type IdGenerator,
  type ProcessAttemptRecorder,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type ImportCertificateCommandInput,
  type ImportCertificateCommandResult,
} from "./import-certificate.command";

const manualImportProviderKey = "manual-import";
const manualImportChallengeType = "manual-import";

function notFoundInCertificateContext(entity: string, id: string): DomainError {
  const error = domainError.notFound(entity, id);
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      phase: "certificate-context-resolution",
    },
  };
}

function conflictingIdempotencyKey(details: {
  domainBindingId: string;
  existingDomainBindingId: string;
  certificateId: string;
  attemptId: string;
}): DomainError {
  return domainError.conflict("Certificate import idempotency key conflicts with another import", {
    phase: "certificate-admission",
    domainBindingId: details.domainBindingId,
    existingDomainBindingId: details.existingDomainBindingId,
    certificateId: details.certificateId,
    attemptId: details.attemptId,
  });
}

async function recordImportedCertificateAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  logger: AppLogger;
  requestId: string;
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  attemptId: string;
  reason: string;
  importedAt: string;
  expiresAt: string;
  projectId: string;
  resourceId: string;
  serverId: string;
}): Promise<void> {
  const result = await input.recorder.record(input.repositoryContext, {
    id: input.attemptId,
    kind: "certificate",
    status: "succeeded",
    operationKey: "certificates.import",
    dedupeKey: `certificate:${input.domainBindingId}:${input.attemptId}`,
    correlationId: input.requestId,
    requestId: input.requestId,
    phase: "certificate-import",
    step: "issued",
    projectId: input.projectId,
    resourceId: input.resourceId,
    serverId: input.serverId,
    domainBindingId: input.domainBindingId,
    certificateId: input.certificateId,
    startedAt: input.importedAt,
    updatedAt: input.importedAt,
    finishedAt: input.importedAt,
    retriable: false,
    nextActions: ["no-action"],
    safeDetails: {
      providerKey: manualImportProviderKey,
      challengeType: manualImportChallengeType,
      reason: input.reason,
      domainName: input.domainName,
      certificateSource: "imported",
      expiresAt: input.expiresAt,
    },
  });

  if (result.isErr()) {
    input.logger.warn("certificate_import.process_attempt_record_failed", {
      requestId: input.requestId,
      certificateId: input.certificateId,
      attemptId: input.attemptId,
      errorCode: result.error.code,
    });
  }
}

@injectable()
export class ImportCertificateUseCase {
  constructor(
    @inject(tokens.domainBindingRepository)
    private readonly domainBindingRepository: DomainBindingRepository,
    @inject(tokens.certificateRepository)
    private readonly certificateRepository: CertificateRepository,
    @inject(tokens.certificateMaterialValidator)
    private readonly certificateMaterialValidator: CertificateMaterialValidator,
    @inject(tokens.certificateSecretStore)
    private readonly certificateSecretStore: CertificateSecretStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
  ) {}

  async execute(
    context: ExecutionContext,
    input: ImportCertificateCommandInput,
  ): Promise<Result<ImportCertificateCommandResult>> {
    const {
      certificateMaterialValidator,
      certificateRepository,
      certificateSecretStore,
      clock,
      domainBindingRepository,
      eventBus,
      idGenerator,
      logger,
      processAttemptRecorder,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const domainBindingId = yield* DomainBindingId.create(input.domainBindingId);
      const importedAt = yield* CreatedAt.create(clock.now());
      const idempotencyKey = yield* CertificateAttemptIdempotencyKeyValue.fromOptional(
        input.idempotencyKey,
      );

      const domainBinding = await domainBindingRepository.findOne(
        repositoryContext,
        DomainBindingByIdSpec.create(domainBindingId),
      );
      if (!domainBinding) {
        return err(notFoundInCertificateContext("Domain binding", domainBindingId.value));
      }

      const certificateContext = yield* domainBinding.resolveCertificateImportContext({
        phase: "certificate-admission",
      });
      const domainBindingState = domainBinding.toState();

      const validation = yield* await certificateMaterialValidator.validateImported(context, {
        domainName: certificateContext.domainName.value,
        certificateChain: input.certificateChain,
        privateKey: input.privateKey,
        ...(input.passphrase ? { passphrase: input.passphrase } : {}),
        importedAt: importedAt.value,
      });
      const materialFingerprint = yield* CertificateMaterialFingerprintValue.create(
        validation.normalizedMaterialFingerprint,
      );

      if (idempotencyKey) {
        const existingByIdempotencyKey = await certificateRepository.findOne(
          repositoryContext,
          CertificateByAttemptIdempotencyKeySpec.create(idempotencyKey.value),
        );
        const attempt = existingByIdempotencyKey?.findAttemptByIdempotencyKey(idempotencyKey);

        if (existingByIdempotencyKey && attempt) {
          const existingState = existingByIdempotencyKey.toState();
          const existingFingerprint = attempt.materialFingerprint?.value;

          if (
            existingState.domainBindingId.equals(domainBindingId) &&
            existingFingerprint === materialFingerprint.value
          ) {
            return ok({
              certificateId: existingState.id.value,
              attemptId: attempt.id.value,
            });
          }

          return err(
            conflictingIdempotencyKey({
              domainBindingId: domainBindingId.value,
              existingDomainBindingId: existingState.domainBindingId.value,
              certificateId: existingState.id.value,
              attemptId: attempt.id.value,
            }),
          );
        }
      }

      const existingCertificate = await certificateRepository.findOne(
        repositoryContext,
        CertificateByDomainBindingIdSpec.create(domainBindingId),
      );

      const certificateId =
        existingCertificate?.toState().id ?? (yield* CertificateId.create(idGenerator.next("crt")));
      const attemptId = yield* CertificateAttemptId.create(idGenerator.next("cat"));
      const reason = yield* CertificateIssueReasonValue.create(
        existingCertificate ? "replace" : "issue",
      );
      const providerKey = yield* ProviderKey.create(manualImportProviderKey);
      const challengeType = yield* CertificateChallengeTypeValue.create(manualImportChallengeType);
      const notBefore = yield* CertificateNotBeforeValue.create(validation.notBefore);
      const expiresAt = yield* CertificateExpiresAtValue.create(validation.expiresAt);
      const keyAlgorithm = yield* CertificateKeyAlgorithmValue.create(validation.keyAlgorithm);
      const fingerprint = yield* CertificateFingerprintValue.fromOptional(validation.fingerprint);
      const issuer = yield* CertificateIssuerValue.fromOptional(validation.issuer);
      const subjectAlternativeNames: PublicDomainName[] = [];
      for (const domainName of validation.subjectAlternativeNames) {
        subjectAlternativeNames.push(yield* PublicDomainName.create(domainName));
      }

      const secretRefs = yield* await certificateSecretStore.storeImported(context, {
        certificateId: certificateId.value,
        domainBindingId: domainBindingId.value,
        domainName: domainBindingState.domainName.value,
        attemptId: attemptId.value,
        certificateChain: validation.normalizedCertificateChain,
        privateKey: validation.normalizedPrivateKey,
        ...(validation.normalizedPassphrase ? { passphrase: validation.normalizedPassphrase } : {}),
      });
      const certificateChainRef = yield* CertificateSecretRefValue.create(
        secretRefs.certificateChainRef,
      );
      const privateKeyRef = yield* CertificateSecretRefValue.create(secretRefs.privateKeyRef);
      const passphraseRef = secretRefs.passphraseRef
        ? yield* CertificateSecretRefValue.create(secretRefs.passphraseRef)
        : undefined;

      const certificate = existingCertificate
        ? yield* (() => {
            const result = existingCertificate.markImported({
              attemptId,
              reason,
              providerKey,
              challengeType,
              importedAt,
              notBefore,
              expiresAt,
              subjectAlternativeNames,
              keyAlgorithm,
              certificateChainRef,
              privateKeyRef,
              ...(fingerprint ? { fingerprint } : {}),
              ...(issuer ? { issuer } : {}),
              ...(passphraseRef ? { passphraseRef } : {}),
              ...(idempotencyKey ? { idempotencyKey } : {}),
              materialFingerprint,
              correlationId: context.requestId,
              ...(input.causationId ? { causationId: input.causationId } : {}),
            });

            return result.map(() => existingCertificate);
          })()
        : yield* Certificate.importCertificate({
            id: certificateId,
            domainBindingId,
            domainName: domainBindingState.domainName,
            attemptId,
            reason,
            providerKey,
            challengeType,
            importedAt,
            notBefore,
            expiresAt,
            subjectAlternativeNames,
            keyAlgorithm,
            certificateChainRef,
            privateKeyRef,
            ...(fingerprint ? { fingerprint } : {}),
            ...(issuer ? { issuer } : {}),
            ...(passphraseRef ? { passphraseRef } : {}),
            ...(idempotencyKey ? { idempotencyKey } : {}),
            materialFingerprint,
            correlationId: context.requestId,
            ...(input.causationId ? { causationId: input.causationId } : {}),
          });

      await certificateRepository.upsert(
        repositoryContext,
        certificate,
        UpsertCertificateSpec.fromCertificate(certificate),
      );
      await recordImportedCertificateAttempt({
        recorder: processAttemptRecorder,
        repositoryContext,
        logger,
        requestId: context.requestId,
        certificateId: certificate.toState().id.value,
        domainBindingId: domainBindingState.id.value,
        domainName: domainBindingState.domainName.value,
        attemptId: attemptId.value,
        reason: reason.value,
        importedAt: importedAt.value,
        expiresAt: expiresAt.value,
        projectId: domainBindingState.projectId.value,
        resourceId: domainBindingState.resourceId.value,
        serverId: domainBindingState.serverId.value,
      });
      await publishDomainEventsAndReturn(context, eventBus, logger, certificate, undefined);

      return ok({
        certificateId: certificate.toState().id.value,
        attemptId: attemptId.value,
      });
    });
  }
}
