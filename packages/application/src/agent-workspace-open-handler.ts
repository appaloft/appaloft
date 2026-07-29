import { inject, injectable } from "tsyringe";
import { type AgentWorkspaceOpenService, type WorkspaceOpenResult } from "./agent-workspace-open";
import { OpenAgentWorkspaceCommand } from "./agent-workspace-open-messages";
import { CommandHandler, type CommandHandlerContract } from "./cqrs";
import { type ExecutionContext } from "./execution-context";
import { tokens } from "./tokens";

@CommandHandler(OpenAgentWorkspaceCommand)
@injectable()
export class AgentWorkspaceOpenCommandHandler
  implements CommandHandlerContract<OpenAgentWorkspaceCommand, WorkspaceOpenResult>
{
  constructor(
    @inject(tokens.agentWorkspaceOpenService)
    private readonly service: AgentWorkspaceOpenService,
  ) {}

  handle(context: ExecutionContext, command: OpenAgentWorkspaceCommand) {
    return this.service.open(context, command.input);
  }
}
