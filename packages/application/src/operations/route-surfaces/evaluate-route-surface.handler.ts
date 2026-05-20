import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  EvaluateRouteSurfaceCommand,
  type EvaluateRouteSurfaceResponse,
} from "./evaluate-route-surface.command";
import { type EvaluateRouteSurfaceUseCase } from "./evaluate-route-surface.use-case";

@CommandHandler(EvaluateRouteSurfaceCommand)
@injectable()
export class EvaluateRouteSurfaceCommandHandler
  implements CommandHandlerContract<EvaluateRouteSurfaceCommand, EvaluateRouteSurfaceResponse>
{
  constructor(
    @inject(tokens.evaluateRouteSurfaceUseCase)
    private readonly useCase: EvaluateRouteSurfaceUseCase,
  ) {}

  async handle(context: ExecutionContext, command: EvaluateRouteSurfaceCommand) {
    return this.useCase.execute(context, command);
  }
}
