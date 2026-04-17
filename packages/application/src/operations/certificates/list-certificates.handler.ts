import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type CertificateSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListCertificatesQuery } from "./list-certificates.query";
import { type ListCertificatesQueryService } from "./list-certificates.query-service";

@QueryHandler(ListCertificatesQuery)
@injectable()
export class ListCertificatesQueryHandler
  implements QueryHandlerContract<ListCertificatesQuery, { items: CertificateSummary[] }>
{
  constructor(
    @inject(tokens.listCertificatesQueryService)
    private readonly queryService: ListCertificatesQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListCertificatesQuery,
  ): Promise<Result<{ items: CertificateSummary[] }>> {
    return ok(
      await this.queryService.execute(
        context,
        query.domainBindingId ? { domainBindingId: query.domainBindingId } : undefined,
      ),
    );
  }
}
