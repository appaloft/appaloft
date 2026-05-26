import { inject, injectable } from "tsyringe";
import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type GitHubAppConnectionStatus } from "./github-app-connection.schema";
import { UpsertGitHubAppInstallationCommand } from "./upsert-github-app-installation.command";
import { type UpsertGitHubAppInstallationUseCase } from "./upsert-github-app-installation.use-case";

@CommandHandler(UpsertGitHubAppInstallationCommand)
@injectable()
export class UpsertGitHubAppInstallationCommandHandler
  implements
    CommandHandlerContract<UpsertGitHubAppInstallationCommand, GitHubAppConnectionStatus>
{
  constructor(
    @inject(tokens.upsertGitHubAppInstallationUseCase)
    private readonly useCase: UpsertGitHubAppInstallationUseCase,
  ) {}

  handle(context: ExecutionContext, command: UpsertGitHubAppInstallationCommand) {
    return this.useCase.execute(context, {
      installationId: command.installationId,
      ...(command.setupAction ? { setupAction: command.setupAction } : {}),
    });
  }
}
