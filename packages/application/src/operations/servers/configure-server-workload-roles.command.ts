import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ConfigureServerWorkloadRolesCommandInput,
  type ConfigureServerWorkloadRolesCommandPayload,
  type ConfigureServerWorkloadRolesResult,
  configureServerWorkloadRolesCommandInputSchema,
} from "./configure-server-workload-roles.schema";

export {
  type ConfigureServerWorkloadRolesCommandInput,
  type ConfigureServerWorkloadRolesCommandPayload,
  type ConfigureServerWorkloadRolesResult,
  configureServerWorkloadRolesCommandInputSchema,
  configureServerWorkloadRolesResultSchema,
} from "./configure-server-workload-roles.schema";

export class ConfigureServerWorkloadRolesCommand extends Command<ConfigureServerWorkloadRolesResult> {
  constructor(
    public readonly serverId: string,
    public readonly workloadRoles: ConfigureServerWorkloadRolesCommandPayload["workloadRoles"],
  ) {
    super();
  }

  static create(
    input: ConfigureServerWorkloadRolesCommandInput,
  ): Result<ConfigureServerWorkloadRolesCommand> {
    return parseOperationInput(configureServerWorkloadRolesCommandInputSchema, input).map(
      (parsed) => new ConfigureServerWorkloadRolesCommand(parsed.serverId, parsed.workloadRoles),
    );
  }
}
