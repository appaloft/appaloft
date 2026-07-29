import { domainError, err, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import {
  CommandHandler,
  type CommandHandlerContract,
  QueryHandler,
  type QueryHandlerContract,
} from "./cqrs";
import { type ExecutionContext } from "./execution-context";
import { type GitHubAgentConfigurationService } from "./github-agent-configuration";
import {
  BindRepositoryCommand,
  CreateAgentProfileCommand,
  CreateAutomationRuleCommand,
  DisableAgentProfileCommand,
  DisableAutomationRuleCommand,
  ListAgentProfilesQuery,
  ListAutomationRulesQuery,
  ListRepositoryBindingsQuery,
} from "./github-agent-configuration-messages";
import { tokens } from "./tokens";

type ConfigurationCommand =
  | BindRepositoryCommand
  | CreateAutomationRuleCommand
  | DisableAutomationRuleCommand
  | CreateAgentProfileCommand
  | DisableAgentProfileCommand;
type ConfigurationQuery =
  | ListRepositoryBindingsQuery
  | ListAutomationRulesQuery
  | ListAgentProfilesQuery;

@injectable()
export class GitHubAgentConfigurationCommandHandler
  implements CommandHandlerContract<ConfigurationCommand, unknown>
{
  constructor(
    @inject(tokens.githubAgentConfigurationService)
    private readonly service: GitHubAgentConfigurationService,
  ) {}

  handle(context: ExecutionContext, command: ConfigurationCommand): Promise<Result<unknown>> {
    if (command instanceof BindRepositoryCommand) {
      return this.service.bindRepository(context, {
        projectId: command.input.projectId,
        installationConnectionId: command.input.installationConnectionId,
        providerRepositoryId: command.input.providerRepositoryId,
        repositoryFullNameSnapshot: command.input.repositoryFullNameSnapshot,
        ...(command.input.defaultBranchSnapshot
          ? { defaultBranchSnapshot: command.input.defaultBranchSnapshot }
          : {}),
        ...(typeof command.input.privateSnapshot === "boolean"
          ? { privateSnapshot: command.input.privateSnapshot }
          : {}),
      });
    }
    if (command instanceof CreateAutomationRuleCommand) {
      return this.service.createAutomationRule(context, {
        projectId: command.input.projectId,
        repositoryBindingId: command.input.repositoryBindingId,
        name: command.input.name,
        trigger: {
          event: command.input.trigger.event,
          action: command.input.trigger.action,
          ...(command.input.trigger.label ? { label: command.input.trigger.label } : {}),
        },
        taskAction: command.input.taskAction,
        actorPolicy: command.input.actorPolicy,
        ...(command.input.automationIdentityRef
          ? { automationIdentityRef: command.input.automationIdentityRef }
          : {}),
        agentProfileId: command.input.agentProfileId,
        workspaceProfileInstallationId: command.input.workspaceProfileInstallationId,
        sandboxTemplateId: command.input.sandboxTemplateId,
        serverPoolId: command.input.serverPoolId,
        mode: command.input.mode,
        maximumRuntimeSeconds: command.input.maximumRuntimeSeconds,
        maximumRetries: command.input.maximumRetries,
        previewPolicy: command.input.previewPolicy,
        pullRequestDeliveryPolicy: command.input.pullRequestDeliveryPolicy,
        rerunReviewOnSynchronize: command.input.rerunReviewOnSynchronize,
      });
    }
    if (command instanceof DisableAutomationRuleCommand) {
      return this.service.disableAutomationRule(context, command.input.ruleId);
    }
    if (command instanceof CreateAgentProfileCommand) {
      return this.service.createAgentProfile(context, command.input);
    }
    if (command instanceof DisableAgentProfileCommand) {
      return this.service.disableAgentProfile(context, command.input.profileId);
    }
    return Promise.resolve(
      err(domainError.invariant("Unknown GitHub Agent configuration command")),
    );
  }
}

@injectable()
export class GitHubAgentConfigurationQueryHandler
  implements QueryHandlerContract<ConfigurationQuery, unknown>
{
  constructor(
    @inject(tokens.githubAgentConfigurationService)
    private readonly service: GitHubAgentConfigurationService,
  ) {}

  handle(context: ExecutionContext, query: ConfigurationQuery): Promise<Result<unknown>> {
    if (query instanceof ListRepositoryBindingsQuery) {
      return this.service.listRepositoryBindings(context, query.input.projectId);
    }
    if (query instanceof ListAutomationRulesQuery) {
      return this.service.listAutomationRules(context, query.input.projectId);
    }
    if (query instanceof ListAgentProfilesQuery) {
      return this.service.listAgentProfiles(context);
    }
    return Promise.resolve(err(domainError.invariant("Unknown GitHub Agent configuration query")));
  }
}

CommandHandler(BindRepositoryCommand)(GitHubAgentConfigurationCommandHandler);
CommandHandler(CreateAutomationRuleCommand)(GitHubAgentConfigurationCommandHandler);
CommandHandler(DisableAutomationRuleCommand)(GitHubAgentConfigurationCommandHandler);
CommandHandler(CreateAgentProfileCommand)(GitHubAgentConfigurationCommandHandler);
CommandHandler(DisableAgentProfileCommand)(GitHubAgentConfigurationCommandHandler);
QueryHandler(ListRepositoryBindingsQuery)(GitHubAgentConfigurationQueryHandler);
QueryHandler(ListAutomationRulesQuery)(GitHubAgentConfigurationQueryHandler);
QueryHandler(ListAgentProfilesQuery)(GitHubAgentConfigurationQueryHandler);
