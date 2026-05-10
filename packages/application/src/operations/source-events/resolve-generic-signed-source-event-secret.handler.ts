import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ResolveGenericSignedSourceEventSecretQuery } from "./resolve-generic-signed-source-event-secret.query";
import { type ResolveGenericSignedSourceEventSecretQueryService } from "./resolve-generic-signed-source-event-secret.query-service";
import { type ResolveGenericSignedSourceEventSecretResponse } from "./resolve-generic-signed-source-event-secret.schema";

@QueryHandler(ResolveGenericSignedSourceEventSecretQuery)
@injectable()
export class ResolveGenericSignedSourceEventSecretQueryHandler
  implements
    QueryHandlerContract<
      ResolveGenericSignedSourceEventSecretQuery,
      ResolveGenericSignedSourceEventSecretResponse
    >
{
  constructor(
    @inject(tokens.resolveGenericSignedSourceEventSecretQueryService)
    private readonly queryService: ResolveGenericSignedSourceEventSecretQueryService,
  ) {}

  handle(context: ExecutionContext, query: ResolveGenericSignedSourceEventSecretQuery) {
    return this.queryService.execute(context, query);
  }
}
