import {
  CreatedAt,
  DomainBindingByIdSpec,
  DomainBindingId,
  DomainDnsObservationStatusValue,
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
  type DomainOwnershipVerificationResult,
  type DomainOwnershipVerifier,
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
    @inject(tokens.domainOwnershipVerifier)
    private readonly domainOwnershipVerifier: DomainOwnershipVerifier,
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
    const { clock, domainBindingRepository, domainOwnershipVerifier, eventBus, logger } = this;
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

      const confirmationContext = yield* domainBinding.resolveOwnershipConfirmationContext({
        ...(verificationAttemptId ? { verificationAttemptId } : {}),
      });

      if (confirmationContext.kind === "already_confirmed") {
        return ok({
          id: domainBindingId.value,
          verificationAttemptId: confirmationContext.verificationAttemptId.value,
        });
      }

      if ((input.verificationMode ?? "dns") === "dns") {
        const checkedAt = yield* CreatedAt.create(clock.now());
        const expectedTargets = confirmationContext.expectedDnsTargets.map(
          (target) => target.value,
        );

        const verificationResult = await verifyDnsOwnership(
          context,
          domainOwnershipVerifier,
          confirmationContext.domainName.value,
          expectedTargets,
        );
        const observedTargets: MessageText[] = [];
        for (const target of verificationResult.observedTargets) {
          observedTargets.push(yield* MessageText.create(target));
        }
        const message = verificationResult.message
          ? yield* MessageText.create(verificationResult.message)
          : undefined;

        yield* domainBinding.recordDnsObservation({
          status: DomainDnsObservationStatusValue.rehydrate(verificationResult.status),
          observedTargets,
          checkedAt,
          ...(message ? { message } : {}),
        });

        await domainBindingRepository.upsert(
          repositoryContext,
          domainBinding,
          UpsertDomainBindingSpec.fromDomainBinding(domainBinding),
        );

        if (verificationResult.status !== "matched") {
          if (verificationResult.status === "lookup_failed") {
            return err(
              domainError.dnsLookupFailed(
                verificationResult.message ?? "DNS lookup failed during ownership verification",
                {
                  phase: "domain-verification",
                  domainBindingId: domainBindingId.value,
                  verificationAttemptId: confirmationContext.verificationAttemptId.value,
                  domainName: confirmationContext.domainName.value,
                  expectedTargets: expectedTargets.join(","),
                  observedTargets: verificationResult.observedTargets.join(","),
                  relatedState: verificationResult.status,
                },
              ),
            );
          }

          return err(
            domainError.domainOwnershipUnverified(
              verificationResult.message ??
                "Domain ownership could not be verified from public DNS",
              {
                phase: "domain-verification",
                domainBindingId: domainBindingId.value,
                verificationAttemptId: confirmationContext.verificationAttemptId.value,
                domainName: confirmationContext.domainName.value,
                expectedTargets: expectedTargets.join(","),
                observedTargets: verificationResult.observedTargets.join(","),
                relatedState: verificationResult.status,
              },
            ),
          );
        }
      }

      const confirmedAt = yield* CreatedAt.create(clock.now());
      const confirmation = yield* domainBinding.confirmOwnership({
        confirmedAt,
        verificationAttemptId: confirmationContext.verificationAttemptId,
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

async function verifyDnsOwnership(
  context: ExecutionContext,
  domainOwnershipVerifier: DomainOwnershipVerifier,
  domainName: string,
  expectedTargets: string[],
): Promise<DomainOwnershipVerificationResult> {
  try {
    return await domainOwnershipVerifier.verifyDns(context, {
      domainName,
      expectedTargets,
    });
  } catch (error: unknown) {
    return {
      status: "lookup_failed",
      observedTargets: [],
      message: error instanceof Error ? error.message : "DNS lookup failed",
    };
  }
}
