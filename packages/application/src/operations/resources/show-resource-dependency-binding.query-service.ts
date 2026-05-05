import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ResourceDependencyBindingReadModel,
  type ShowResourceDependencyBindingResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ShowResourceDependencyBindingQueryInput } from "./show-resource-dependency-binding.query";

@injectable()
export class ShowResourceDependencyBindingQueryService {
  constructor(
    @inject(tokens.resourceDependencyBindingReadModel)
    private readonly readModel: ResourceDependencyBindingReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ShowResourceDependencyBindingQueryInput,
  ): Promise<Result<ShowResourceDependencyBindingResult>> {
    const binding = await this.readModel.findOne(toRepositoryContext(context), {
      resourceId: input.resourceId,
      bindingId: input.bindingId,
    });
    if (binding.isErr()) {
      return err(binding.error);
    }
    if (!binding.value) {
      return err(domainError.notFound("resource_dependency_binding", input.bindingId));
    }
    return ok({
      schemaVersion: "resources.dependency-bindings.show/v1",
      binding: binding.value,
      generatedAt: this.clock.now(),
    });
  }
}
