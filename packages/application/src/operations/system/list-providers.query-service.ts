import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import { type ProviderRegistry } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListProvidersQueryService {
  constructor(
    @inject(tokens.providerRegistry) private readonly providerRegistry: ProviderRegistry,
  ) {}

  async execute(
    context: ExecutionContext,
  ): Promise<{ items: ReturnType<ProviderRegistry["list"]> }> {
    void context;
    return { items: this.providerRegistry.list() };
  }
}
