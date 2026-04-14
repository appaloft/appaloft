import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateDomainBindingCommand } from "./create-domain-binding.command";
import { type CreateDomainBindingUseCase } from "./create-domain-binding.use-case";

@CommandHandler(CreateDomainBindingCommand)
@injectable()
export class CreateDomainBindingCommandHandler
  implements CommandHandlerContract<CreateDomainBindingCommand, { id: string }>
{
  constructor(
    @inject(tokens.createDomainBindingUseCase)
    private readonly useCase: CreateDomainBindingUseCase,
  ) {}

  handle(context: ExecutionContext, command: CreateDomainBindingCommand) {
    return this.useCase.execute(context, {
      projectId: command.projectId,
      environmentId: command.environmentId,
      resourceId: command.resourceId,
      serverId: command.serverId,
      destinationId: command.destinationId,
      domainName: command.domainName,
      pathPrefix: command.pathPrefix,
      proxyKind: command.proxyKind,
      tlsMode: command.tlsMode,
      ...(command.certificatePolicy ? { certificatePolicy: command.certificatePolicy } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
