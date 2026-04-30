import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ConfigureDomainBindingRouteCommandInput,
  configureDomainBindingRouteCommandInputSchema,
} from "./configure-domain-binding-route.schema";

export {
  type ConfigureDomainBindingRouteCommandInput,
  configureDomainBindingRouteCommandInputSchema,
} from "./configure-domain-binding-route.schema";

export class ConfigureDomainBindingRouteCommand extends Command<{ id: string }> {
  constructor(
    public readonly domainBindingId: string,
    public readonly redirectTo?: string,
    public readonly redirectStatus?: 301 | 302 | 307 | 308,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: ConfigureDomainBindingRouteCommandInput,
  ): Result<ConfigureDomainBindingRouteCommand> {
    return parseOperationInput(configureDomainBindingRouteCommandInputSchema, input).map(
      (parsed) =>
        new ConfigureDomainBindingRouteCommand(
          parsed.domainBindingId,
          trimToUndefined(parsed.redirectTo),
          parsed.redirectStatus,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
