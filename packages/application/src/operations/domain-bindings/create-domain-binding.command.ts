import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateDomainBindingCommandInput,
  createDomainBindingCommandInputSchema,
} from "./create-domain-binding.schema";

export {
  type CreateDomainBindingCommandInput,
  createDomainBindingCommandInputSchema,
} from "./create-domain-binding.schema";

export class CreateDomainBindingCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly resourceId: string,
    public readonly serverId: string,
    public readonly destinationId: string,
    public readonly domainName: string,
    public readonly pathPrefix: string,
    public readonly proxyKind: CreateDomainBindingCommandInput["proxyKind"],
    public readonly tlsMode: NonNullable<CreateDomainBindingCommandInput["tlsMode"]> = "auto",
    public readonly certificatePolicy?: CreateDomainBindingCommandInput["certificatePolicy"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: CreateDomainBindingCommandInput): Result<CreateDomainBindingCommand> {
    return parseOperationInput(createDomainBindingCommandInputSchema, input).map(
      (parsed) =>
        new CreateDomainBindingCommand(
          parsed.projectId,
          parsed.environmentId,
          parsed.resourceId,
          parsed.serverId,
          parsed.destinationId,
          parsed.domainName,
          parsed.pathPrefix,
          parsed.proxyKind,
          parsed.tlsMode,
          parsed.certificatePolicy,
          parsed.idempotencyKey,
        ),
    );
  }
}
