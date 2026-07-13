import { inject, injectable } from "tsyringe";
import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ReconcileStaleDeploymentCommand,
  type ReconcileStaleDeploymentResult,
} from "./reconcile-stale-deployment.command";
import { type ReconcileStaleDeploymentUseCase } from "./reconcile-stale-deployment.use-case";

@CommandHandler(ReconcileStaleDeploymentCommand)
@injectable()
export class ReconcileStaleDeploymentCommandHandler
  implements CommandHandlerContract<ReconcileStaleDeploymentCommand, ReconcileStaleDeploymentResult>
{
  constructor(
    @inject(tokens.reconcileStaleDeploymentUseCase)
    private readonly useCase: ReconcileStaleDeploymentUseCase,
  ) {}

  handle(context: ExecutionContext, command: ReconcileStaleDeploymentCommand) {
    return this.useCase.execute(context, {
      deploymentId: command.deploymentId,
      confirm: command.confirm,
      stateVersion: command.stateVersion,
      ...(command.resourceId ? { resourceId: command.resourceId } : {}),
      staleAfterSeconds: command.staleAfterSeconds,
    });
  }
}
