import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DiagnosticsStatus, type PluginSummary, type ProviderDescriptor } from "../../ports";
import { tokens } from "../../tokens";
import { DoctorQuery } from "./doctor.query";
import { type DoctorQueryService } from "./doctor.query-service";

@QueryHandler(DoctorQuery)
@injectable()
export class DoctorQueryHandler
  implements
    QueryHandlerContract<
      DoctorQuery,
      {
        readiness: DiagnosticsStatus;
        providers: ProviderDescriptor[];
        plugins: PluginSummary[];
      }
    >
{
  constructor(
    @inject(tokens.doctorQueryService)
    private readonly queryService: DoctorQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: DoctorQuery,
  ): Promise<
    Result<{
      readiness: DiagnosticsStatus;
      providers: ProviderDescriptor[];
      plugins: PluginSummary[];
    }>
  > {
    void query;
    return ok(await this.queryService.execute(context));
  }
}
