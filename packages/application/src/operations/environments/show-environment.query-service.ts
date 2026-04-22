import {
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type EnvironmentReadModel, type EnvironmentSummary } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ShowEnvironmentQueryService {
  constructor(
    @inject(tokens.environmentReadModel) private readonly readModel: EnvironmentReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    environmentId: string,
  ): Promise<Result<EnvironmentSummary>> {
    const environment = await this.readModel.findOne(
      toRepositoryContext(context),
      EnvironmentByIdSpec.create(EnvironmentId.rehydrate(environmentId)),
    );
    return environment ? ok(environment) : err(domainError.notFound("environment", environmentId));
  }
}
