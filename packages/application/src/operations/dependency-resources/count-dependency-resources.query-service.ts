import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DependencyResourceReadModel } from "../../ports";
import { tokens } from "../../tokens";
import { type CountDependencyResourcesQuery } from "./count-dependency-resources.query";

@injectable()
export class CountDependencyResourcesQueryService {
  constructor(
    @inject(tokens.dependencyResourceReadModel)
    private readonly dependencyResourceReadModel: DependencyResourceReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    query: CountDependencyResourcesQuery,
  ): Promise<Result<{ count: number }>> {
    return ok({
      count: await this.dependencyResourceReadModel.count(toRepositoryContext(context), {
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.environmentId ? { environmentId: query.environmentId } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
      }),
    });
  }
}
