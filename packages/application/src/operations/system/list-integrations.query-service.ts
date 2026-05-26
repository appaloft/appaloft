import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import { type IntegrationRegistry } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListIntegrationsQueryService {
  constructor(
    @inject(tokens.integrationRegistry)
    private readonly integrationRegistry: IntegrationRegistry,
  ) {}

  async execute(
    context: ExecutionContext,
  ): Promise<{ items: ReturnType<IntegrationRegistry["list"]> }> {
    void context;
    return { items: this.integrationRegistry.list() };
  }
}
