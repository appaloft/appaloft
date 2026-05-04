import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DependencyResourceReadModel,
  type ListDependencyResourcesResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListDependencyResourcesQuery } from "./list-dependency-resources.query";

@injectable()
export class ListDependencyResourcesQueryService {
  constructor(
    @inject(tokens.dependencyResourceReadModel)
    private readonly dependencyResourceReadModel: DependencyResourceReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListDependencyResourcesQuery,
  ): Promise<Result<ListDependencyResourcesResult>> {
    const items = await this.dependencyResourceReadModel.list(toRepositoryContext(context), {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.environmentId ? { environmentId: query.environmentId } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
    });

    return ok({
      schemaVersion: "dependency-resources.list/v1",
      items,
      generatedAt: this.clock.now(),
    });
  }
}
