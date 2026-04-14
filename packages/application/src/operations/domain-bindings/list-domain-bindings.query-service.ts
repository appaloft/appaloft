import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DomainBindingReadModel } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListDomainBindingsQueryService {
  constructor(
    @inject(tokens.domainBindingReadModel)
    private readonly readModel: DomainBindingReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      resourceId?: string;
    },
  ): Promise<{ items: Awaited<ReturnType<DomainBindingReadModel["list"]>> }> {
    return { items: await this.readModel.list(toRepositoryContext(context), input) };
  }
}
