import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type CertificateReadModel } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListCertificatesQueryService {
  constructor(
    @inject(tokens.certificateReadModel)
    private readonly readModel: CertificateReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input?: {
      domainBindingId?: string;
    },
  ): Promise<{ items: Awaited<ReturnType<CertificateReadModel["list"]>> }> {
    return { items: await this.readModel.list(toRepositoryContext(context), input) };
  }
}
