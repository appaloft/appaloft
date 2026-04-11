import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import { type PluginRegistry } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListPluginsQueryService {
  constructor(@inject(tokens.pluginRegistry) private readonly pluginRegistry: PluginRegistry) {}

  async execute(context: ExecutionContext): Promise<{ items: ReturnType<PluginRegistry["list"]> }> {
    void context;
    return { items: this.pluginRegistry.list() };
  }
}
