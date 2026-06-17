import { type AcceptedConnectionCapabilityPlanSnapshot } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { AcceptConnectorCapabilityPlanCommand } from "./accept-connector-capability-plan.command";
import { type AcceptConnectorCapabilityPlanUseCase } from "./accept-connector-capability-plan.use-case";

@CommandHandler(AcceptConnectorCapabilityPlanCommand)
@injectable()
export class AcceptConnectorCapabilityPlanCommandHandler
  implements
    CommandHandlerContract<
      AcceptConnectorCapabilityPlanCommand,
      AcceptedConnectionCapabilityPlanSnapshot
    >
{
  constructor(
    @inject(tokens.acceptConnectorCapabilityPlanUseCase)
    private readonly useCase: AcceptConnectorCapabilityPlanUseCase,
  ) {}

  handle(
    context: ExecutionContext,
    command: AcceptConnectorCapabilityPlanCommand,
  ): ReturnType<AcceptConnectorCapabilityPlanUseCase["execute"]> {
    return this.useCase.execute(context, command.input);
  }
}
