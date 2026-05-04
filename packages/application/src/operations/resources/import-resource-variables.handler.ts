import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ImportResourceVariablesCommand,
  type ImportResourceVariablesResponse,
} from "./import-resource-variables.command";
import { type ImportResourceVariablesUseCase } from "./import-resource-variables.use-case";

@CommandHandler(ImportResourceVariablesCommand)
@injectable()
export class ImportResourceVariablesCommandHandler
  implements CommandHandlerContract<ImportResourceVariablesCommand, ImportResourceVariablesResponse>
{
  constructor(
    @inject(tokens.importResourceVariablesUseCase)
    private readonly useCase: ImportResourceVariablesUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: ImportResourceVariablesCommand,
  ): Promise<Result<ImportResourceVariablesResponse>> {
    return this.useCase.execute(context, {
      resourceId: command.resourceId,
      content: command.content,
      exposure: command.exposure,
      secretKeys: command.secretKeys,
      plainKeys: command.plainKeys,
    });
  }
}
