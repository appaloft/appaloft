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
  type ProcessAttemptRecorder,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
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

async function recordDomainVerificationRetryAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  logger: AppLogger;
  requestId: string;
  domainBindingId: string;
  verificationAttemptId: string;
  projectId: string;
  resourceId: string;
  serverId?: string;
  domainName: string;
  proxyKind: string;
  tlsMode: string;
  status: string;
  retriedAt: string;
  expectedTarget: string;
  dnsExpectedTargets?: string;
}): Promise<void> {
  const result = await input.recorder.record(input.repositoryContext, {
    id: input.verificationAttemptId,
    kind: "route-realization",
    status: "pending",
    operationKey: "domain-bindings.retry-verification",
    dedupeKey: `domain-binding-verification:${input.domainBindingId}:${input.verificationAttemptId}`,
    correlationId: input.requestId,
    requestId: input.requestId,
    phase: "domain-verification",
    step: "verification-retried",
    projectId: input.projectId,
    resourceId: input.resourceId,
    ...(input.serverId ? { serverId: input.serverId } : {}),
    domainBindingId: input.domainBindingId,
    startedAt: input.retriedAt,
    updatedAt: input.retriedAt,
    nextActions: ["no-action"],
    safeDetails: {
      domainName: input.domainName,
      proxyKind: input.proxyKind,
      tlsMode: input.tlsMode,
      bindingStatus: input.status,
      expectedTarget: input.expectedTarget,
      ...(input.dnsExpectedTargets ? { dnsExpectedTargets: input.dnsExpectedTargets } : {}),
    },
  });

  if (result.isErr()) {
    input.logger.warn("domain_binding_verification_retry.process_attempt_record_failed", {
      requestId: input.requestId,
      domainBindingId: input.domainBindingId,
      verificationAttemptId: input.verificationAttemptId,
      errorCode: result.error.code,
    });
  }
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
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
  ) {}

  async execute(
    context: ExecutionContext,
    input: RetryDomainBindingVerificationCommandInput,
  ): Promise<Result<RetryDomainBindingVerificationCommandResult>> {
    const {
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
      const retriedState = domainBinding.toState();
      await recordDomainVerificationRetryAttempt({
        recorder: processAttemptRecorder,
        repositoryContext,
        logger,
        requestId: context.requestId,
        domainBindingId: domainBindingId.value,
        verificationAttemptId: retryResult.verificationAttemptId.value,
        projectId: retriedState.projectId.value,
        resourceId: retriedState.resourceId.value,
        ...(retriedState.serverId ? { serverId: retriedState.serverId.value } : {}),
        domainName: retriedState.domainName.value,
        proxyKind: retriedState.proxyKind.value,
        tlsMode: retriedState.tlsMode.value,
        status: retriedState.status.value,
        retriedAt: retryAt.value,
        expectedTarget: verificationExpectedTarget.value,
        ...(retriedState.dnsObservation?.expectedTargets.length
          ? {
              dnsExpectedTargets: retriedState.dnsObservation.expectedTargets
                .map((target) => target.value)
                .join(","),
            }
          : {}),
      });
      await publishDomainEventsAndReturn(context, eventBus, logger, domainBinding, undefined);

      return ok({
        id: domainBindingId.value,
        verificationAttemptId: retryResult.verificationAttemptId.value,
      });
    });
  }
}
