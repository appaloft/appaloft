import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import {
  type DiagnosticsPort,
  type DiagnosticsStatus,
  type MaintenanceWorkerStatus,
  type MaintenanceWorkerStatusReader,
  type PluginRegistry,
  type PluginSummary,
  type ProviderDescriptor,
  type ProviderRegistry,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class DoctorQueryService {
  constructor(
    @inject(tokens.diagnostics)
    private readonly diagnostics: DiagnosticsPort,
    @inject(tokens.providerRegistry)
    private readonly providerRegistry: ProviderRegistry,
    @inject(tokens.pluginRegistry)
    private readonly pluginRegistry: PluginRegistry,
    @inject(tokens.maintenanceWorkerStatusReader)
    private readonly maintenanceWorkerStatusReader: MaintenanceWorkerStatusReader,
  ) {}

  async execute(context: ExecutionContext): Promise<{
    readiness: DiagnosticsStatus;
    providers: ProviderDescriptor[];
    plugins: PluginSummary[];
    maintenanceWorkers: MaintenanceWorkerStatus[];
  }> {
    void context;
    return {
      readiness: await this.diagnostics.readiness(),
      providers: this.providerRegistry.list(),
      plugins: this.pluginRegistry.list(),
      maintenanceWorkers: await this.maintenanceWorkerStatusReader.list(),
    };
  }
}
