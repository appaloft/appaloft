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
  type IdGenerator,
  type ProcessAttemptRecorder,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
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

async function recordManagedCertificateRevocation(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  logger: AppLogger;
  requestId: string;
  attemptId: string;
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  providerKey: string;
  status: "running" | "succeeded" | "failed";
  phase: string;
  step: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  reason?: string;
  fingerprint?: string;
  errorCode?: string;
  retriable?: boolean;
}): Promise<void> {
  const result = await input.recorder.record(input.repositoryContext, {
    id: input.attemptId,
    kind: "certificate",
    status: input.status,
    operationKey: "certificates.revoke",
    dedupeKey: `certificate:${input.domainBindingId}:${input.attemptId}`,
    correlationId: input.requestId,
    requestId: input.requestId,
    phase: input.phase,
    step: input.step,
    domainBindingId: input.domainBindingId,
    certificateId: input.certificateId,
    startedAt: input.startedAt,
    updatedAt: input.updatedAt,
    ...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode, errorCategory: "async-processing" } : {}),
    ...(input.retriable === undefined ? {} : { retriable: input.retriable }),
    nextActions: input.status === "failed" ? ["diagnostic", "manual-review"] : ["no-action"],
    safeDetails: {
      providerKey: input.providerKey,
      domainName: input.domainName,
      certificateSource: "managed",
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
    },
  });

  if (result.isErr()) {
    input.logger.warn("certificate_revoke.process_attempt_record_failed", {
      requestId: input.requestId,
      certificateId: input.certificateId,
      attemptId: input.attemptId,
      errorCode: result.error.code,
    });
  }
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
    input: RevokeCertificateCommandInput,
  ): Promise<Result<RevokeCertificateCommandResult>> {
    const {
      certificateProvider,
      certificateRepository,
      certificateSecretStore,
      clock,
      eventBus,
      idGenerator,
      logger,
      processAttemptRecorder,
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
      const attemptId =
        state.source.value === "managed" && state.status.value === "active"
          ? idGenerator.next("cat")
          : undefined;

      if (attemptId) {
        await recordManagedCertificateRevocation({
          recorder: processAttemptRecorder,
          repositoryContext,
          logger,
          requestId: context.requestId,
          attemptId,
          certificateId: state.id.value,
          domainBindingId: state.domainBindingId.value,
          domainName: state.domainName.value,
          providerKey: state.providerKey.value,
          status: "running",
          phase: "provider-request",
          step: "revoking",
          startedAt: revokedAt.value,
          updatedAt: revokedAt.value,
          ...(reason ? { reason: reason.value } : {}),
          ...(state.fingerprint ? { fingerprint: state.fingerprint.value } : {}),
        });

        const providerResult = await certificateProvider.revoke(context, {
          certificateId: state.id.value,
          domainBindingId: state.domainBindingId.value,
          domainName: state.domainName.value,
          providerKey: state.providerKey.value,
          ...(state.fingerprint ? { fingerprint: state.fingerprint.value } : {}),
          ...(reason ? { reason: reason.value } : {}),
          revokedAt: revokedAt.value,
        });
        if (providerResult.isErr()) {
          const phase =
            typeof providerResult.error.details?.phase === "string"
              ? providerResult.error.details.phase
              : "provider-request";
          await recordManagedCertificateRevocation({
            recorder: processAttemptRecorder,
            repositoryContext,
            logger,
            requestId: context.requestId,
            attemptId,
            certificateId: state.id.value,
            domainBindingId: state.domainBindingId.value,
            domainName: state.domainName.value,
            providerKey: state.providerKey.value,
            status: "failed",
            phase,
            step: "failed",
            startedAt: revokedAt.value,
            updatedAt: revokedAt.value,
            finishedAt: revokedAt.value,
            ...(reason ? { reason: reason.value } : {}),
            ...(state.fingerprint ? { fingerprint: state.fingerprint.value } : {}),
            errorCode: providerResult.error.code,
            retriable: providerResult.error.retryable,
          });
          return err(providerResult.error);
        }
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
      if (attemptId) {
        await recordManagedCertificateRevocation({
          recorder: processAttemptRecorder,
          repositoryContext,
          logger,
          requestId: context.requestId,
          attemptId,
          certificateId: state.id.value,
          domainBindingId: state.domainBindingId.value,
          domainName: state.domainName.value,
          providerKey: state.providerKey.value,
          status: "succeeded",
          phase: "certificate-revoke",
          step: "revoked",
          startedAt: revokedAt.value,
          updatedAt: revokedAt.value,
          finishedAt: revokedAt.value,
          ...(reason ? { reason: reason.value } : {}),
          ...(state.fingerprint ? { fingerprint: state.fingerprint.value } : {}),
          retriable: false,
        });
      }
      await publishDomainEventsAndReturn(context, eventBus, logger, certificate, undefined);

      return ok({ certificateId: state.id.value });
    });
  }
}
