import { type Result } from "@appaloft/core";
import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type GitHubAppConnectionStatus,
  type UpsertGitHubAppInstallationCommandInput,
  upsertGitHubAppInstallationCommandInputSchema,
} from "./github-app-connection.schema";

export {
  type UpsertGitHubAppInstallationCommandInput,
  upsertGitHubAppInstallationCommandInputSchema,
} from "./github-app-connection.schema";

export class UpsertGitHubAppInstallationCommand extends Command<GitHubAppConnectionStatus> {
  constructor(
    public readonly installationId: string,
    public readonly setupAction?: "install" | "update",
  ) {
    super();
  }

  static create(
    input: UpsertGitHubAppInstallationCommandInput,
  ): Result<UpsertGitHubAppInstallationCommand> {
    return parseOperationInput(upsertGitHubAppInstallationCommandInputSchema, input).map(
      (parsed) => new UpsertGitHubAppInstallationCommand(parsed.installationId, parsed.setupAction),
    );
  }
}
