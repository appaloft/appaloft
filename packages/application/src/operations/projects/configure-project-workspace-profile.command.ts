import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureProjectWorkspaceProfileCommandInput,
  configureProjectWorkspaceProfileCommandInputSchema,
} from "./configure-project-workspace-profile.schema";

export {
  type ConfigureProjectWorkspaceProfileCommandInput,
  configureProjectWorkspaceProfileCommandInputSchema,
} from "./configure-project-workspace-profile.schema";

export class ConfigureProjectWorkspaceProfileCommand extends Command<{
  projectId: string;
  profileInstallationId: string;
}> {
  constructor(readonly input: ConfigureProjectWorkspaceProfileCommandInput) {
    super();
  }

  static create(input: unknown): Result<ConfigureProjectWorkspaceProfileCommand> {
    return parseOperationInput(configureProjectWorkspaceProfileCommandInputSchema, input).map(
      (parsed) => new this(parsed),
    );
  }
}
