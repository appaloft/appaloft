import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { AcceptDependencyResourceProvisioningPlanCommand } from "./accept-dependency-resource-provisioning-plan.command";
import { type AcceptDependencyResourceProvisioningPlanUseCase } from "./accept-dependency-resource-provisioning-plan.use-case";
import { type DependencyResourceProvisioningPlanResponse } from "./dependency-resource-provisioning.schema";

@CommandHandler(AcceptDependencyResourceProvisioningPlanCommand)
@injectable()
export class AcceptDependencyResourceProvisioningPlanCommandHandler
  implements
    CommandHandlerContract<
      AcceptDependencyResourceProvisioningPlanCommand,
      DependencyResourceProvisioningPlanResponse
    >
{
  constructor(
    @inject(tokens.acceptDependencyResourceProvisioningPlanUseCase)
    private readonly useCase: AcceptDependencyResourceProvisioningPlanUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: AcceptDependencyResourceProvisioningPlanCommand,
  ): Promise<Result<DependencyResourceProvisioningPlanResponse>> {
    return this.useCase.execute(context, {
      planId: command.planId,
      acknowledgeMutation: command.acknowledgeMutation,
    });
  }
}
