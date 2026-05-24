import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateDependencyResourceProvisioningPlanCommand } from "./create-dependency-resource-provisioning-plan.command";
import { type CreateDependencyResourceProvisioningPlanUseCase } from "./create-dependency-resource-provisioning-plan.use-case";
import { type DependencyResourceProvisioningPlanResponse } from "./dependency-resource-provisioning.schema";

@CommandHandler(CreateDependencyResourceProvisioningPlanCommand)
@injectable()
export class CreateDependencyResourceProvisioningPlanCommandHandler
  implements
    CommandHandlerContract<
      CreateDependencyResourceProvisioningPlanCommand,
      DependencyResourceProvisioningPlanResponse
    >
{
  constructor(
    @inject(tokens.createDependencyResourceProvisioningPlanUseCase)
    private readonly useCase: CreateDependencyResourceProvisioningPlanUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: CreateDependencyResourceProvisioningPlanCommand,
  ): Promise<Result<DependencyResourceProvisioningPlanResponse>> {
    return this.useCase.execute(context, command.input);
  }
}
