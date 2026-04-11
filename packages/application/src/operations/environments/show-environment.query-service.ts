import { domainError, err, ok, type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type EnvironmentReadModel } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ShowEnvironmentQueryService {
  constructor(
    @inject(tokens.environmentReadModel) private readonly readModel: EnvironmentReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    environmentId: string,
  ): Promise<Result<NonNullable<Awaited<ReturnType<EnvironmentReadModel["findById"]>>>>> {
    const environment = await this.readModel.findById(toRepositoryContext(context), environmentId);
    return environment ? ok(environment) : err(domainError.notFound("environment", environmentId));
  }
}
