import {
  Certificate,
  CertificateAttemptId,
  CertificateAttemptIdempotencyKeyValue,
  CertificateByAttemptIdempotencyKeySpec,
  CertificateByDomainBindingIdSpec,
  CertificateByIdSpec,
  CertificateChallengeTypeValue,
  CertificateId,
  CertificateIssueReasonValue,
  CreatedAt,
  DomainBindingByIdSpec,
  DomainBindingId,
  type DomainError,
  domainError,
  err,
  ok,
  ProviderKey,
  type Result,
  safeTry,
  UpsertCertificateSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type CertificateProviderSelectionPolicy,
  type CertificateRepository,
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
  type IssueOrRenewCertificateCommandInput,
  type IssueOrRenewCertificateCommandResult,
} from "./issue-or-renew-certificate.command";

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

async function recordCertificateAttemptAccepted(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  logger: AppLogger;
  requestId: string;
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  attemptId: string;
  reason: string;
  providerKey: string;
  challengeType: string;
  requestedAt: string;
  projectId: string;
  resourceId: string;
  serverId: string;
}): Promise<void> {
  const result = await input.recorder.record(input.repositoryContext, {
    id: input.attemptId,
    kind: "certificate",
    status: "pending",
    operationKey: "certificates.issue-or-renew",
    dedupeKey: `certificate:${input.domainBindingId}:${input.attemptId}`,
    correlationId: input.requestId,
    requestId: input.requestId,
    phase: "certificate-request",
    step: "requested",
    projectId: input.projectId,
    resourceId: input.resourceId,
    serverId: input.serverId,
    domainBindingId: input.domainBindingId,
    certificateId: input.certificateId,
    startedAt: input.requestedAt,
    updatedAt: input.requestedAt,
    nextActions: ["no-action"],
    safeDetails: {
      providerKey: input.providerKey,
      challengeType: input.challengeType,
      reason: input.reason,
      domainName: input.domainName,
      certificateSource: "managed",
    },
  });

  if (result.isErr()) {
    input.logger.warn("certificate_issue.process_attempt_record_failed", {
      requestId: input.requestId,
      certificateId: input.certificateId,
      attemptId: input.attemptId,
      errorCode: result.error.code,
    });
  }
}

@injectable()
export class IssueOrRenewCertificateUseCase {
  constructor(
    @inject(tokens.domainBindingRepository)
    private readonly domainBindingRepository: DomainBindingRepository,
    @inject(tokens.certificateRepository)
    private readonly certificateRepository: CertificateRepository,
    @inject(tokens.certificateProviderSelectionPolicy)
    private readonly certificateProviderSelectionPolicy: CertificateProviderSelectionPolicy,
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
    input: IssueOrRenewCertificateCommandInput,
  ): Promise<Result<IssueOrRenewCertificateCommandResult>> {
    const {
      certificateProviderSelectionPolicy,
      certificateRepository,
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
      const reason = yield* CertificateIssueReasonValue.create(input.reason ?? "issue");
      const requestedCertificateId = input.certificateId
        ? yield* CertificateId.create(input.certificateId)
        : undefined;
      const idempotencyKey = yield* CertificateAttemptIdempotencyKeyValue.fromOptional(
        input.idempotencyKey,
      );

      if (idempotencyKey) {
        const existingByIdempotencyKey = await certificateRepository.findOne(
          repositoryContext,
          CertificateByAttemptIdempotencyKeySpec.create(idempotencyKey.value),
        );
        const attempt = existingByIdempotencyKey?.findAttemptByIdempotencyKey(idempotencyKey);

        if (existingByIdempotencyKey && attempt) {
          return ok({
            certificateId: existingByIdempotencyKey.toState().id.value,
            attemptId: attempt.id.value,
          });
        }
      }

      const domainBinding = await domainBindingRepository.findOne(
        repositoryContext,
        DomainBindingByIdSpec.create(domainBindingId),
      );
      if (!domainBinding) {
        return err(notFoundInCertificateContext("Domain binding", domainBindingId.value));
      }

      const certificateContext = yield* domainBinding.resolveCertificateIssueContext({
        phase: "certificate-admission",
      });
      const domainBindingState = domainBinding.toState();

      const providerSelectionResult = await certificateProviderSelectionPolicy.select(context, {
        domainBindingId: certificateContext.domainBindingId.value,
        domainName: certificateContext.domainName.value,
        tlsMode: certificateContext.tlsMode.value,
        certificatePolicy: certificateContext.certificatePolicy.value,
        ...(input.providerKey ? { providerKey: input.providerKey } : {}),
        ...(input.challengeType ? { challengeType: input.challengeType } : {}),
      });
      const providerSelection = yield* providerSelectionResult;
      const providerKey = yield* ProviderKey.create(providerSelection.providerKey);
      const challengeType = yield* CertificateChallengeTypeValue.create(
        providerSelection.challengeType,
      );

      const existingCertificate = requestedCertificateId
        ? await certificateRepository.findOne(
            repositoryContext,
            CertificateByIdSpec.create(requestedCertificateId),
          )
        : await certificateRepository.findOne(
            repositoryContext,
            CertificateByDomainBindingIdSpec.create(domainBindingId),
          );

      if (requestedCertificateId && !existingCertificate) {
        return err(notFoundInCertificateContext("Certificate", requestedCertificateId.value));
      }

      const requestedAt = yield* CreatedAt.create(clock.now());
      let certificateId = existingCertificate?.toState().id;
      if (!certificateId) {
        certificateId = yield* CertificateId.create(idGenerator.next("crt"));
      }
      const attemptId = yield* CertificateAttemptId.create(idGenerator.next("cat"));

      const certificate = existingCertificate
        ? yield* (() => {
            const result = existingCertificate.requestAttempt({
              attemptId,
              reason,
              providerKey,
              challengeType,
              requestedAt,
              ...(idempotencyKey ? { idempotencyKey } : {}),
              correlationId: context.requestId,
              ...(input.causationId ? { causationId: input.causationId } : {}),
            });

            return result.map(() => existingCertificate);
          })()
        : yield* Certificate.request({
            id: certificateId,
            domainBindingId,
            domainName: certificateContext.domainName,
            attemptId,
            reason,
            providerKey,
            challengeType,
            requestedAt,
            ...(idempotencyKey ? { idempotencyKey } : {}),
            correlationId: context.requestId,
            ...(input.causationId ? { causationId: input.causationId } : {}),
          });

      await certificateRepository.upsert(
        repositoryContext,
        certificate,
        UpsertCertificateSpec.fromCertificate(certificate),
      );
      await recordCertificateAttemptAccepted({
        recorder: processAttemptRecorder,
        repositoryContext,
        logger,
        requestId: context.requestId,
        certificateId: certificate.toState().id.value,
        domainBindingId: domainBindingState.id.value,
        domainName: domainBindingState.domainName.value,
        attemptId: attemptId.value,
        reason: reason.value,
        providerKey: providerKey.value,
        challengeType: challengeType.value,
        requestedAt: requestedAt.value,
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
