import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CleanupPreviewCommandInput,
  cleanupPreviewCommandInputSchema,
} from "./cleanup-preview.schema";

export {
  type CleanupPreviewCommandInput,
  cleanupPreviewCommandInputSchema,
} from "./cleanup-preview.schema";

export class CleanupPreviewCommand extends Command<{
  sourceFingerprint: string;
  status: "cleaned" | "already-clean";
  cleanedRuntime: boolean;
  removedServerAppliedRoute: boolean;
  removedSourceLink: boolean;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  serverId?: string;
  destinationId?: string;
  deploymentId?: string;
}> {
  constructor(public readonly sourceFingerprint: string) {
    super();
  }

  static create(input: CleanupPreviewCommandInput): Result<CleanupPreviewCommand> {
    return parseOperationInput(cleanupPreviewCommandInputSchema, input).map(
      (parsed) => new CleanupPreviewCommand(parsed.sourceFingerprint),
    );
  }
}
