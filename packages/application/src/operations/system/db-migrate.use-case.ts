import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import { type DiagnosticsPort } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class DbMigrateUseCase {
  constructor(@inject(tokens.diagnostics) private readonly diagnostics: DiagnosticsPort) {}

  async execute(
    context: ExecutionContext,
  ): Promise<Awaited<ReturnType<DiagnosticsPort["migrate"]>>> {
    void context;
    return this.diagnostics.migrate();
  }
}
