import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type EnvironmentProfileSyncResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type SyncEnvironmentProfileCommandInput,
  type SyncEnvironmentProfileCommandPayload,
  syncEnvironmentProfileCommandInputSchema,
} from "./sync-environment-profile.schema";

export {
  type SyncEnvironmentProfileCommandInput,
  syncEnvironmentProfileCommandInputSchema,
} from "./sync-environment-profile.schema";

export class SyncEnvironmentProfileCommand extends Command<EnvironmentProfileSyncResult> {
  constructor(
    public readonly environmentId: string,
    public readonly targetEnvironmentId: string,
    public readonly resourceIds: SyncEnvironmentProfileCommandPayload["resourceIds"],
  ) {
    super();
  }

  static create(input: SyncEnvironmentProfileCommandInput): Result<SyncEnvironmentProfileCommand> {
    return parseOperationInput(syncEnvironmentProfileCommandInputSchema, input).map(
      (parsed) =>
        new SyncEnvironmentProfileCommand(
          parsed.environmentId,
          parsed.targetEnvironmentId,
          parsed.resourceIds,
        ),
    );
  }
}
