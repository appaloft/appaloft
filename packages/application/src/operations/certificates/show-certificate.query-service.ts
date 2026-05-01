import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type CertificateReadModel, type CertificateSummary } from "../../ports";
import { tokens } from "../../tokens";
import { type ShowCertificateQueryInput } from "./show-certificate.query";

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
export class ShowCertificateQueryService {
  constructor(
    @inject(tokens.certificateReadModel)
    private readonly readModel: CertificateReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ShowCertificateQueryInput,
  ): Promise<Result<CertificateSummary>> {
    const item = await this.readModel.findOne(toRepositoryContext(context), {
      certificateId: input.certificateId,
    });

    if (!item) {
      return err(certificateNotFound(input.certificateId));
    }

    return ok(item);
  }
}
