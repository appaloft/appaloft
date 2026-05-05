import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RestoreDependencyResourceBackupCommandInput,
  restoreDependencyResourceBackupCommandInputSchema,
} from "./restore-dependency-resource-backup.schema";

export {
  type RestoreDependencyResourceBackupCommandInput,
  restoreDependencyResourceBackupCommandInputSchema,
};

export class RestoreDependencyResourceBackupCommand extends Command<{ id: string }> {
  constructor(
    public readonly backupId: string,
    public readonly acknowledgeDataOverwrite: true,
    public readonly acknowledgeRuntimeNotRestarted: true,
    public readonly restoreLabel?: string,
  ) {
    super();
  }

  static create(
    input: RestoreDependencyResourceBackupCommandInput,
  ): Result<RestoreDependencyResourceBackupCommand> {
    return parseOperationInput(restoreDependencyResourceBackupCommandInputSchema, input).map(
      (parsed) =>
        new RestoreDependencyResourceBackupCommand(
          parsed.backupId,
          parsed.acknowledgeDataOverwrite,
          parsed.acknowledgeRuntimeNotRestarted,
          parsed.restoreLabel,
        ),
    );
  }
}
