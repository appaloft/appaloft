import {
  CertificateByIdSpec,
  CertificateId,
  type DomainError,
  domainError,
  err,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type CertificateRepository } from "../../ports";
import { tokens } from "../../tokens";
import { type IssueOrRenewCertificateUseCase } from "./issue-or-renew-certificate.use-case";
import {
  type RetryCertificateCommandInput,
  type RetryCertificateCommandResult,
} from "./retry-certificate.command";

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
export class RetryCertificateUseCase {
  constructor(
    @inject(tokens.certificateRepository)
    private readonly certificateRepository: CertificateRepository,
    @inject(tokens.issueOrRenewCertificateUseCase)
    private readonly issueOrRenewCertificateUseCase: IssueOrRenewCertificateUseCase,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RetryCertificateCommandInput,
  ): Promise<Result<RetryCertificateCommandResult>> {
    const { certificateRepository, issueOrRenewCertificateUseCase } = this;
    const repositoryContext = toRepositoryContext(context);

    const certificateId = CertificateId.create(input.certificateId);
    if (certificateId.isErr()) {
      return err(certificateId.error);
    }

    const certificate = await certificateRepository.findOne(
      repositoryContext,
      CertificateByIdSpec.create(certificateId.value),
    );

    if (!certificate) {
      return err(certificateNotFound(certificateId.value.value));
    }

    const retryContext = certificate.resolveRetryContext();
    if (retryContext.isErr()) {
      return err(retryContext.error);
    }

    return issueOrRenewCertificateUseCase.execute(context, {
      domainBindingId: retryContext.value.domainBindingId.value,
      certificateId: retryContext.value.certificateId.value,
      reason: retryContext.value.reason.value,
      providerKey: retryContext.value.providerKey.value,
      challengeType: retryContext.value.challengeType.value,
      idempotencyKey:
        input.idempotencyKey ??
        `certificates.retry:${retryContext.value.certificateId.value}:${retryContext.value.attemptId.value}`,
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });
  }
}
