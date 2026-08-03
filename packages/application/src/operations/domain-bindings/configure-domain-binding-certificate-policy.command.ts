import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ConfigureDomainBindingCertificatePolicyCommandInput,
  configureDomainBindingCertificatePolicyCommandInputSchema,
} from "./configure-domain-binding-certificate-policy.schema";

export {
  type ConfigureDomainBindingCertificatePolicyCommandInput,
  configureDomainBindingCertificatePolicyCommandInputSchema,
} from "./configure-domain-binding-certificate-policy.schema";

export interface ConfigureDomainBindingCertificatePolicyResult {
  id: string;
  certificatePolicy: "auto" | "manual";
  reconciliationStatus: "pending" | "unchanged";
}

export class ConfigureDomainBindingCertificatePolicyCommand extends Command<ConfigureDomainBindingCertificatePolicyResult> {
  constructor(
    public readonly domainBindingId: string,
    public readonly certificatePolicy: "auto" | "manual",
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: ConfigureDomainBindingCertificatePolicyCommandInput,
  ): Result<ConfigureDomainBindingCertificatePolicyCommand> {
    return parseOperationInput(configureDomainBindingCertificatePolicyCommandInputSchema, input, {
      validationPhase: "command-validation",
    }).map(
      (parsed) =>
        new ConfigureDomainBindingCertificatePolicyCommand(
          parsed.domainBindingId,
          parsed.certificatePolicy,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
