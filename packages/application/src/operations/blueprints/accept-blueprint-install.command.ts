import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type AcceptBlueprintInstallCommandInput,
  type AcceptBlueprintInstallCommandResponse,
  acceptBlueprintInstallCommandInputSchema,
} from "./blueprint-catalog.schema";

export {
  type AcceptBlueprintInstallCommandInput,
  type AcceptBlueprintInstallCommandResponse,
  acceptBlueprintInstallCommandInputSchema,
};

export class AcceptBlueprintInstallCommand extends Command<AcceptBlueprintInstallCommandResponse> {
  constructor(
    public readonly slug: string,
    public readonly input: Omit<AcceptBlueprintInstallCommandInput, "slug">,
  ) {
    super();
  }

  static create(input: AcceptBlueprintInstallCommandInput): Result<AcceptBlueprintInstallCommand> {
    return parseOperationInput(acceptBlueprintInstallCommandInputSchema, input).map(
      (parsed) =>
        new AcceptBlueprintInstallCommand(parsed.slug, {
          ...(parsed.variant ? { variant: parsed.variant } : {}),
          ...(parsed.profile ? { profile: parsed.profile } : {}),
          ...(parsed.parameters ? { parameters: parsed.parameters } : {}),
          ...(parsed.dependencyProvisioning
            ? { dependencyProvisioning: parsed.dependencyProvisioning }
            : {}),
          ...(parsed.target ? { target: parsed.target } : {}),
          ...(parsed.applicationId ? { applicationId: parsed.applicationId } : {}),
          ...(parsed.acceptedBy ? { acceptedBy: parsed.acceptedBy } : {}),
          ...(parsed.idempotencyKey ? { idempotencyKey: parsed.idempotencyKey } : {}),
          ...(parsed.acknowledgements ? { acknowledgements: parsed.acknowledgements } : {}),
          ...(parsed.secretValues ? { secretValues: parsed.secretValues } : {}),
        }),
    );
  }
}
