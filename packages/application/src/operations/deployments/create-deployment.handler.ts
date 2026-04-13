import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateDeploymentCommand } from "./create-deployment.command";
import { type CreateDeploymentUseCase } from "./create-deployment.use-case";

@CommandHandler(CreateDeploymentCommand)
@injectable()
export class CreateDeploymentCommandHandler
  implements CommandHandlerContract<CreateDeploymentCommand, { id: string }>
{
  constructor(
    @inject(tokens.createDeploymentUseCase)
    private readonly useCase: CreateDeploymentUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateDeploymentCommand) {
    return this.useCase.execute(context, {
      ...(command.configFilePath ? { configFilePath: command.configFilePath } : {}),
      projectId: command.projectId,
      serverId: command.serverId,
      environmentId: command.environmentId,
      sourceLocator: command.sourceLocator,
      ...(command.deploymentMethod ? { deploymentMethod: command.deploymentMethod } : {}),
      ...(command.installCommand ? { installCommand: command.installCommand } : {}),
      ...(command.buildCommand ? { buildCommand: command.buildCommand } : {}),
      ...(command.startCommand ? { startCommand: command.startCommand } : {}),
      ...(command.port ? { port: command.port } : {}),
      ...(command.healthCheckPath ? { healthCheckPath: command.healthCheckPath } : {}),
      ...(command.proxyKind ? { proxyKind: command.proxyKind } : {}),
      ...(command.domains ? { domains: command.domains } : {}),
      ...(command.pathPrefix ? { pathPrefix: command.pathPrefix } : {}),
      ...(command.tlsMode ? { tlsMode: command.tlsMode } : {}),
    });
  }
}
