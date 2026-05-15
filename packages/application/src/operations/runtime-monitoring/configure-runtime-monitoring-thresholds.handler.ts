import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ConfigureRuntimeMonitoringThresholdsCommand,
  type ConfigureRuntimeMonitoringThresholdsResult,
} from "./configure-runtime-monitoring-thresholds.command";
import { type ConfigureRuntimeMonitoringThresholdsUseCase } from "./runtime-monitoring-thresholds.service";

@CommandHandler(ConfigureRuntimeMonitoringThresholdsCommand)
@injectable()
export class ConfigureRuntimeMonitoringThresholdsCommandHandler
  implements
    CommandHandlerContract<
      ConfigureRuntimeMonitoringThresholdsCommand,
      ConfigureRuntimeMonitoringThresholdsResult
    >
{
  constructor(
    @inject(tokens.configureRuntimeMonitoringThresholdsUseCase)
    private readonly useCase: ConfigureRuntimeMonitoringThresholdsUseCase,
  ) {}

  handle(context: ExecutionContext, command: ConfigureRuntimeMonitoringThresholdsCommand) {
    return this.useCase.execute(context, command.input);
  }
}
