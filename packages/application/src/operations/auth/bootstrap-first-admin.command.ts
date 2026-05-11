import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type BootstrapFirstAdminCommandInput,
  bootstrapFirstAdminCommandInputSchema,
} from "./bootstrap-first-admin.schema";
import {
  type BootstrapFirstAdminUseCaseInput,
  type BootstrapFirstAdminUseCaseResult,
} from "./bootstrap-first-admin.use-case";

export class BootstrapFirstAdminCommand extends Command<BootstrapFirstAdminUseCaseResult> {
  constructor(
    public readonly email: string,
    public readonly displayName: string,
    public readonly password?: string,
    public readonly organizationName?: string,
    public readonly organizationSlug?: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: BootstrapFirstAdminCommandInput): Result<BootstrapFirstAdminCommand> {
    return parseOperationInput(bootstrapFirstAdminCommandInputSchema, input).map(
      (parsed) =>
        new BootstrapFirstAdminCommand(
          parsed.email,
          parsed.displayName,
          trimToUndefined(parsed.password),
          trimToUndefined(parsed.organizationName),
          trimToUndefined(parsed.organizationSlug),
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}

export function toBootstrapFirstAdminUseCaseInput(
  command: BootstrapFirstAdminCommand,
): BootstrapFirstAdminUseCaseInput {
  return {
    email: command.email,
    displayName: command.displayName,
    ...(command.password ? { password: command.password } : {}),
    ...(command.organizationName ? { organizationName: command.organizationName } : {}),
    ...(command.organizationSlug ? { organizationSlug: command.organizationSlug } : {}),
  };
}

export {
  type BootstrapFirstAdminCommandInput,
  bootstrapFirstAdminCommandInputSchema,
} from "./bootstrap-first-admin.schema";
