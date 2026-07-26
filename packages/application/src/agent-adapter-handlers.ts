import { domainError, err, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type AgentAdapterInstallationService } from "./agent-adapter";
import {
  DisableAgentAdapterCommand,
  InstallAgentAdapterCommand,
  ListAgentAdaptersQuery,
  ShowAgentAdapterQuery,
  UninstallAgentAdapterCommand,
  ValidateAgentAdapterQuery,
} from "./agent-adapter-messages";
import {
  CommandHandler,
  type CommandHandlerContract,
  QueryHandler,
  type QueryHandlerContract,
} from "./cqrs";
import { type ExecutionContext } from "./execution-context";
import { tokens } from "./tokens";

type AgentAdapterCommand =
  | InstallAgentAdapterCommand
  | DisableAgentAdapterCommand
  | UninstallAgentAdapterCommand;
type AgentAdapterQuery = ValidateAgentAdapterQuery | ListAgentAdaptersQuery | ShowAgentAdapterQuery;

@injectable()
export class AgentAdapterCommandHandler
  implements CommandHandlerContract<AgentAdapterCommand, unknown>
{
  constructor(
    @inject(tokens.agentAdapterInstallationService)
    private readonly service: AgentAdapterInstallationService,
  ) {}

  handle(context: ExecutionContext, command: AgentAdapterCommand): Promise<Result<unknown>> {
    if (command instanceof InstallAgentAdapterCommand) {
      return this.service.install(context, command.input);
    }
    if (command instanceof DisableAgentAdapterCommand) {
      return this.service.disable(context, command.input.installationId);
    }
    if (command instanceof UninstallAgentAdapterCommand) {
      return this.service.uninstall(context, command.input.installationId);
    }
    return Promise.resolve(err(domainError.invariant("Unknown Agent Adapter command")));
  }
}

@injectable()
export class AgentAdapterQueryHandler implements QueryHandlerContract<AgentAdapterQuery, unknown> {
  constructor(
    @inject(tokens.agentAdapterInstallationService)
    private readonly service: AgentAdapterInstallationService,
  ) {}

  handle(context: ExecutionContext, query: AgentAdapterQuery): Promise<Result<unknown>> {
    if (query instanceof ValidateAgentAdapterQuery) {
      return Promise.resolve(this.service.validate(query.input));
    }
    if (query instanceof ListAgentAdaptersQuery) {
      return this.service.list(context, query.input);
    }
    if (query instanceof ShowAgentAdapterQuery) {
      return this.service.show(context, query.input.installationId);
    }
    return Promise.resolve(err(domainError.invariant("Unknown Agent Adapter query")));
  }
}

CommandHandler(InstallAgentAdapterCommand)(AgentAdapterCommandHandler);
CommandHandler(DisableAgentAdapterCommand)(AgentAdapterCommandHandler);
CommandHandler(UninstallAgentAdapterCommand)(AgentAdapterCommandHandler);

QueryHandler(ValidateAgentAdapterQuery)(AgentAdapterQueryHandler);
QueryHandler(ListAgentAdaptersQuery)(AgentAdapterQueryHandler);
QueryHandler(ShowAgentAdapterQuery)(AgentAdapterQueryHandler);
