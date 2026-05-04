import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ListResourceDependencyBindingsResult,
  type ResourceDependencyBindingReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListResourceDependencyBindingsQueryInput } from "./list-resource-dependency-bindings.query";

@injectable()
export class ListResourceDependencyBindingsQueryService {
  constructor(
    @inject(tokens.resourceDependencyBindingReadModel)
    private readonly readModel: ResourceDependencyBindingReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ListResourceDependencyBindingsQueryInput,
  ): Promise<Result<ListResourceDependencyBindingsResult>> {
    const items = await this.readModel.list(toRepositoryContext(context), {
      resourceId: input.resourceId,
    });
    if (items.isErr()) {
      return err(items.error);
    }
    return ok({
      schemaVersion: "resources.dependency-bindings.list/v1",
      items: items.value,
      generatedAt: this.clock.now(),
    });
  }
}
