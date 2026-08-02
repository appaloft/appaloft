import {
  CertificatePolicyValue,
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
  type Clock,
  type DomainBindingRepository,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type ConfigureDomainBindingCertificatePolicyCommandInput,
  type ConfigureDomainBindingCertificatePolicyResult,
} from "./configure-domain-binding-certificate-policy.command";

@injectable()
export class ConfigureDomainBindingCertificatePolicyUseCase {
  constructor(
    @inject(tokens.domainBindingRepository)
    private readonly domainBindingRepository: DomainBindingRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureDomainBindingCertificatePolicyCommandInput,
  ): Promise<Result<ConfigureDomainBindingCertificatePolicyResult>> {
    const { clock, domainBindingRepository, eventBus, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const domainBindingId = yield* DomainBindingId.create(input.domainBindingId);
      const domainBinding = await domainBindingRepository.findOne(
        repositoryContext,
        DomainBindingByIdSpec.create(domainBindingId),
      );
      if (!domainBinding) {
        const missing = domainError.notFound("DomainBinding", input.domainBindingId);
        return err({
          ...missing,
          details: {
            ...(missing.details ?? {}),
            phase: "certificate-policy-configuration",
            domainBindingId: input.domainBindingId,
          },
        });
      }

      const certificatePolicy = yield* CertificatePolicyValue.create(input.certificatePolicy);
      const configuredAt = yield* CreatedAt.create(clock.now());
      const configured = yield* domainBinding.configureCertificatePolicy({
        certificatePolicy,
        configuredAt,
        correlationId: context.requestId,
      });
      if (!configured.changed) {
        return ok<ConfigureDomainBindingCertificatePolicyResult>({
          id: domainBindingId.value,
          certificatePolicy: input.certificatePolicy,
          reconciliationStatus:
            domainBinding.toState().status.value === "certificate_pending"
              ? "pending"
              : "unchanged",
        });
      }

      await domainBindingRepository.upsert(
        repositoryContext,
        domainBinding,
        UpsertDomainBindingSpec.fromDomainBinding(domainBinding),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, domainBinding, undefined);
      return ok<ConfigureDomainBindingCertificatePolicyResult>({
        id: domainBindingId.value,
        certificatePolicy: input.certificatePolicy,
        reconciliationStatus: "pending",
      });
    });
  }
}
