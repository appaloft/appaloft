import { domainError, err, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type AgentWorkspaceProfileInstallationService } from "./agent-workspace-profile";
import {
  CompileAgentWorkspaceProfileQuery,
  ConfigureAgentWorkspaceProfileCredentialConnectionsCommand,
  DisableAgentWorkspaceProfileCommand,
  InstallAgentWorkspaceProfileCommand,
  ListAgentWorkspaceProfilesQuery,
  ShowAgentWorkspaceProfileQuery,
  UninstallAgentWorkspaceProfileCommand,
  ValidateAgentWorkspaceProfileQuery,
} from "./agent-workspace-profile-messages";
import {
  CommandHandler,
  type CommandHandlerContract,
  QueryHandler,
  type QueryHandlerContract,
} from "./cqrs";
import { type ExecutionContext } from "./execution-context";
import { tokens } from "./tokens";

type ProfileCommand =
  | InstallAgentWorkspaceProfileCommand
  | ConfigureAgentWorkspaceProfileCredentialConnectionsCommand
  | DisableAgentWorkspaceProfileCommand
  | UninstallAgentWorkspaceProfileCommand;
type ProfileQuery =
  | ValidateAgentWorkspaceProfileQuery
  | ListAgentWorkspaceProfilesQuery
  | ShowAgentWorkspaceProfileQuery
  | CompileAgentWorkspaceProfileQuery;

@injectable()
export class AgentWorkspaceProfileCommandHandler
  implements CommandHandlerContract<ProfileCommand, unknown>
{
  constructor(
    @inject(tokens.agentWorkspaceProfileInstallationService)
    private readonly service: AgentWorkspaceProfileInstallationService,
  ) {}

  handle(context: ExecutionContext, command: ProfileCommand): Promise<Result<unknown>> {
    if (command instanceof InstallAgentWorkspaceProfileCommand) {
      return this.service.install(context, command.input);
    }
    if (command instanceof DisableAgentWorkspaceProfileCommand) {
      return this.service.disable(context, command.input.installationId);
    }
    if (command instanceof ConfigureAgentWorkspaceProfileCredentialConnectionsCommand) {
      return this.service.configureCredentialConnections(context, command.input);
    }
    if (command instanceof UninstallAgentWorkspaceProfileCommand) {
      return this.service.uninstall(context, command.input.installationId);
    }
    return Promise.resolve(err(domainError.invariant("Unknown Agent Workspace Profile command")));
  }
}

@injectable()
export class AgentWorkspaceProfileQueryHandler
  implements QueryHandlerContract<ProfileQuery, unknown>
{
  constructor(
    @inject(tokens.agentWorkspaceProfileInstallationService)
    private readonly service: AgentWorkspaceProfileInstallationService,
  ) {}

  handle(context: ExecutionContext, query: ProfileQuery): Promise<Result<unknown>> {
    if (query instanceof ValidateAgentWorkspaceProfileQuery) {
      return Promise.resolve(this.service.validate(query.input));
    }
    if (query instanceof ListAgentWorkspaceProfilesQuery) {
      return this.service.list(context, query.input);
    }
    if (query instanceof ShowAgentWorkspaceProfileQuery) {
      return this.service.show(context, query.input.installationId);
    }
    if (query instanceof CompileAgentWorkspaceProfileQuery) {
      return this.service.compileForNewWorkspace(context, query.input.installationId);
    }
    return Promise.resolve(err(domainError.invariant("Unknown Agent Workspace Profile query")));
  }
}

CommandHandler(InstallAgentWorkspaceProfileCommand)(AgentWorkspaceProfileCommandHandler);
CommandHandler(ConfigureAgentWorkspaceProfileCredentialConnectionsCommand)(
  AgentWorkspaceProfileCommandHandler,
);
CommandHandler(DisableAgentWorkspaceProfileCommand)(AgentWorkspaceProfileCommandHandler);
CommandHandler(UninstallAgentWorkspaceProfileCommand)(AgentWorkspaceProfileCommandHandler);

QueryHandler(ValidateAgentWorkspaceProfileQuery)(AgentWorkspaceProfileQueryHandler);
QueryHandler(ListAgentWorkspaceProfilesQuery)(AgentWorkspaceProfileQueryHandler);
QueryHandler(ShowAgentWorkspaceProfileQuery)(AgentWorkspaceProfileQueryHandler);
QueryHandler(CompileAgentWorkspaceProfileQuery)(AgentWorkspaceProfileQueryHandler);
