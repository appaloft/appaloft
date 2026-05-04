import {
  domainError,
  err,
  ok,
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DependencyResourceReadModel,
  type ShowDependencyResourceResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ShowDependencyResourceQuery } from "./show-dependency-resource.query";

@injectable()
export class ShowDependencyResourceQueryService {
  constructor(
    @inject(tokens.dependencyResourceReadModel)
    private readonly dependencyResourceReadModel: DependencyResourceReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowDependencyResourceQuery,
  ): Promise<Result<ShowDependencyResourceResult>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, dependencyResourceReadModel } = this;

    const dependencyResourceId = ResourceInstanceId.create(query.dependencyResourceId);
    if (dependencyResourceId.isErr()) {
      return err(dependencyResourceId.error);
    }

    const dependencyResource = await dependencyResourceReadModel.findOne(
      repositoryContext,
      ResourceInstanceByIdSpec.create(dependencyResourceId.value),
    );
    if (!dependencyResource) {
      return err(domainError.notFound("dependency_resource", dependencyResourceId.value.value));
    }

    return ok({
      schemaVersion: "dependency-resources.show/v1",
      dependencyResource,
      generatedAt: clock.now(),
    });
  }
}
