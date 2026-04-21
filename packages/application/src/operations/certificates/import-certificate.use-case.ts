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
} from "../../ports";
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

      const domainBindingState = domainBinding.toState();
      const allowedBindingStates = ["bound", "ready", "not_ready"];
      if (
        domainBindingState.tlsMode.value === "disabled" ||
        domainBindingState.certificatePolicy.value !== "manual" ||
        !allowedBindingStates.includes(domainBindingState.status.value)
      ) {
        return err(
          domainError.certificateImportNotAllowed(
            "Domain binding does not allow manual certificate import",
            {
              phase: "certificate-admission",
              domainBindingId: domainBindingId.value,
              tlsMode: domainBindingState.tlsMode.value,
              certificatePolicy: domainBindingState.certificatePolicy.value,
              relatedState: domainBindingState.status.value,
            },
          ),
        );
      }

      const validation = yield* await certificateMaterialValidator.validateImported(context, {
        domainName: domainBindingState.domainName.value,
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
      await publishDomainEventsAndReturn(context, eventBus, logger, certificate, undefined);

      return ok({
        certificateId: certificate.toState().id.value,
        attemptId: attemptId.value,
      });
    });
  }
}
