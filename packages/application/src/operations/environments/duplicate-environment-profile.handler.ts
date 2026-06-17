import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type EnvironmentDuplicateProfileApplyResult } from "../../ports";
import { tokens } from "../../tokens";
import { DuplicateEnvironmentProfileCommand } from "./duplicate-environment-profile.command";
import { type DuplicateEnvironmentProfileUseCase } from "./duplicate-environment-profile.use-case";

@CommandHandler(DuplicateEnvironmentProfileCommand)
@injectable()
export class DuplicateEnvironmentProfileCommandHandler
  implements
    CommandHandlerContract<
      DuplicateEnvironmentProfileCommand,
      EnvironmentDuplicateProfileApplyResult
    >
{
  constructor(
    @inject(tokens.duplicateEnvironmentProfileUseCase)
    private readonly useCase: DuplicateEnvironmentProfileUseCase,
  ) {}

  handle(context: ExecutionContext, command: DuplicateEnvironmentProfileCommand) {
    return this.useCase.execute(context, {
      environmentId: command.environmentId,
      targetName: command.targetName,
      dependencyDecisions: command.dependencyDecisions,
      ...(command.targetKind ? { targetKind: command.targetKind } : {}),
      ...(command.resourceDecisions ? { resourceDecisions: command.resourceDecisions } : {}),
      ...(command.dependencyKindsToRequire
        ? { dependencyKindsToRequire: command.dependencyKindsToRequire }
        : {}),
    });
  }
}
