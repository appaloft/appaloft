import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ServerConnectivityResult } from "../../ports";
import { tokens } from "../../tokens";
import { TestServerConnectivityCommand } from "./test-server-connectivity.command";
import { type TestServerConnectivityUseCase } from "./test-server-connectivity.use-case";

@CommandHandler(TestServerConnectivityCommand)
@injectable()
export class TestServerConnectivityCommandHandler
  implements CommandHandlerContract<TestServerConnectivityCommand, ServerConnectivityResult>
{
  constructor(
    @inject(tokens.testServerConnectivityUseCase)
    private readonly useCase: TestServerConnectivityUseCase,
  ) {}

  handle(context: ExecutionContext, command: TestServerConnectivityCommand) {
    return this.useCase.execute(context, {
      serverId: command.serverId,
    });
  }
}
