import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type EnvironmentDuplicateProfileApplyResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type DuplicateEnvironmentProfileCommandInput,
  type DuplicateEnvironmentProfileCommandPayload,
  duplicateEnvironmentProfileCommandInputSchema,
} from "./duplicate-environment-profile.schema";

export {
  type DuplicateEnvironmentProfileCommandInput,
  duplicateEnvironmentProfileCommandInputSchema,
} from "./duplicate-environment-profile.schema";

export class DuplicateEnvironmentProfileCommand extends Command<EnvironmentDuplicateProfileApplyResult> {
  constructor(
    public readonly environmentId: string,
    public readonly targetName: string,
    public readonly dependencyDecisions: DuplicateEnvironmentProfileCommandPayload["dependencyDecisions"],
    public readonly targetKind?: DuplicateEnvironmentProfileCommandPayload["targetKind"],
    public readonly resourceDecisions?: DuplicateEnvironmentProfileCommandPayload["resourceDecisions"],
    public readonly dependencyKindsToRequire?: DuplicateEnvironmentProfileCommandPayload["dependencyKindsToRequire"],
  ) {
    super();
  }

  static create(
    input: DuplicateEnvironmentProfileCommandInput,
  ): Result<DuplicateEnvironmentProfileCommand> {
    return parseOperationInput(duplicateEnvironmentProfileCommandInputSchema, input).map(
      (parsed) =>
        new DuplicateEnvironmentProfileCommand(
          parsed.environmentId,
          parsed.targetName,
          parsed.dependencyDecisions,
          parsed.targetKind,
          parsed.resourceDecisions,
          parsed.dependencyKindsToRequire,
        ),
    );
  }
}
