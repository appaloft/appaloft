import { domainError, err, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type AgentTaskRunService } from "./agent-task-run";
import * as messages from "./agent-task-run-messages";
import {
  CommandHandler,
  type CommandHandlerContract,
  QueryHandler,
  type QueryHandlerContract,
} from "./cqrs";
import { type ExecutionContext } from "./execution-context";
import { tokens } from "./tokens";

type AgentTaskCommand =
  | messages.CreateAgentTaskRunCommand
  | messages.ResumeAgentTaskRunCommand
  | messages.CancelAgentTaskRunCommand
  | messages.ApproveAgentTaskRunCommand
  | messages.DeliverAgentTaskRunCommand;
type AgentTaskQuery = messages.ShowAgentTaskRunQuery | messages.ListAgentTaskRunsQuery;

const text = (input: Record<string, unknown>, key: string) => input[key] as string;

@injectable()
export class AgentTaskRunCommandHandler
  implements CommandHandlerContract<AgentTaskCommand, unknown>
{
  constructor(
    @inject(tokens.agentTaskRunService)
    private readonly service: AgentTaskRunService,
  ) {}

  handle(context: ExecutionContext, command: AgentTaskCommand): Promise<Result<unknown>> {
    const input = command.input;
    if (command instanceof messages.CreateAgentTaskRunCommand) {
      return this.service.create(context, input as Parameters<AgentTaskRunService["create"]>[1]);
    }
    if (command instanceof messages.ResumeAgentTaskRunCommand) {
      return this.service.resume(context, text(input, "workspaceId"), text(input, "taskRunId"));
    }
    if (command instanceof messages.CancelAgentTaskRunCommand) {
      return this.service.cancel(context, text(input, "workspaceId"), text(input, "taskRunId"));
    }
    if (command instanceof messages.ApproveAgentTaskRunCommand) {
      return this.service.approve(context, text(input, "workspaceId"), text(input, "taskRunId"));
    }
    if (command instanceof messages.DeliverAgentTaskRunCommand) {
      return this.service.deliver(
        context,
        text(input, "workspaceId"),
        text(input, "taskRunId"),
        input as unknown as Parameters<AgentTaskRunService["deliver"]>[3],
      );
    }
    return Promise.resolve(err(domainError.invariant("Unknown Agent Task command")));
  }
}

@injectable()
export class AgentTaskRunQueryHandler implements QueryHandlerContract<AgentTaskQuery, unknown> {
  constructor(
    @inject(tokens.agentTaskRunService)
    private readonly service: AgentTaskRunService,
  ) {}

  handle(context: ExecutionContext, query: AgentTaskQuery): Promise<Result<unknown>> {
    const input = query.input;
    if (query instanceof messages.ShowAgentTaskRunQuery) {
      return this.service.show(context, text(input, "workspaceId"), text(input, "taskRunId"));
    }
    if (query instanceof messages.ListAgentTaskRunsQuery) {
      return this.service.list(context, {
        workspaceId: text(input, "workspaceId"),
        runtimeId: text(input, "runtimeId"),
      });
    }
    return Promise.resolve(err(domainError.invariant("Unknown Agent Task query")));
  }
}

for (const command of [
  messages.CreateAgentTaskRunCommand,
  messages.ResumeAgentTaskRunCommand,
  messages.CancelAgentTaskRunCommand,
  messages.ApproveAgentTaskRunCommand,
  messages.DeliverAgentTaskRunCommand,
]) {
  CommandHandler(command)(AgentTaskRunCommandHandler);
}

for (const query of [messages.ShowAgentTaskRunQuery, messages.ListAgentTaskRunsQuery]) {
  QueryHandler(query)(AgentTaskRunQueryHandler);
}
