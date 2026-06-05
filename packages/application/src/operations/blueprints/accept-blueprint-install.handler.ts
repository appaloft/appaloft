import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  AcceptBlueprintInstallCommand,
  type AcceptBlueprintInstallCommandResponse,
} from "./accept-blueprint-install.command";
import { type BlueprintInstallCommandService } from "./blueprint-install-command-service";

@CommandHandler(AcceptBlueprintInstallCommand)
@injectable()
export class AcceptBlueprintInstallCommandHandler
  implements
    CommandHandlerContract<AcceptBlueprintInstallCommand, AcceptBlueprintInstallCommandResponse>
{
  constructor(
    @inject(tokens.blueprintInstallCommandService)
    private readonly service: BlueprintInstallCommandService,
  ) {}

  handle(
    context: ExecutionContext,
    command: AcceptBlueprintInstallCommand,
  ): Promise<Result<AcceptBlueprintInstallCommandResponse>> {
    return this.service.accept(context, command);
  }
}
