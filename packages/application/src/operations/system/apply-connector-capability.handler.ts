import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ConnectorCapabilityApplyResult } from "../../ports";
import { tokens } from "../../tokens";
import { ApplyConnectorCapabilityCommand } from "./apply-connector-capability.command";
import { type ApplyConnectorCapabilityUseCase } from "./apply-connector-capability.use-case";

@CommandHandler(ApplyConnectorCapabilityCommand)
@injectable()
export class ApplyConnectorCapabilityCommandHandler
  implements CommandHandlerContract<ApplyConnectorCapabilityCommand, ConnectorCapabilityApplyResult>
{
  constructor(
    @inject(tokens.connectorCapabilityApplyUseCase)
    private readonly useCase: ApplyConnectorCapabilityUseCase,
  ) {}

  handle(context: ExecutionContext, command: ApplyConnectorCapabilityCommand) {
    return this.useCase.execute(context, command.input);
  }
}
