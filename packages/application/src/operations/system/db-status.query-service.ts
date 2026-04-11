import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import { type DiagnosticsPort } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class DbStatusQueryService {
  constructor(@inject(tokens.diagnostics) private readonly diagnostics: DiagnosticsPort) {}

  async execute(
    context: ExecutionContext,
  ): Promise<Awaited<ReturnType<DiagnosticsPort["migrationStatus"]>>> {
    void context;
    return this.diagnostics.migrationStatus();
  }
}
