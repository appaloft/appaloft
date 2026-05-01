import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type CertificateSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ShowCertificateQuery } from "./show-certificate.query";
import { type ShowCertificateQueryService } from "./show-certificate.query-service";

@QueryHandler(ShowCertificateQuery)
@injectable()
export class ShowCertificateQueryHandler
  implements QueryHandlerContract<ShowCertificateQuery, CertificateSummary>
{
  constructor(
    @inject(tokens.showCertificateQueryService)
    private readonly queryService: ShowCertificateQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: ShowCertificateQuery,
  ): Promise<Result<CertificateSummary>> {
    return this.queryService.execute(context, query);
  }
}
