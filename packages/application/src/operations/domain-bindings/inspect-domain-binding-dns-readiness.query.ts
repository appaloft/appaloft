import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DomainBindingDnsReadiness } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type InspectDomainBindingDnsReadinessQueryInput,
  type InspectDomainBindingDnsReadinessQueryPayload,
  inspectDomainBindingDnsReadinessQueryInputSchema,
} from "./inspect-domain-binding-dns-readiness.schema";

export {
  type InspectDomainBindingDnsReadinessQueryInput,
  type InspectDomainBindingDnsReadinessQueryPayload,
  inspectDomainBindingDnsReadinessQueryInputSchema,
} from "./inspect-domain-binding-dns-readiness.schema";

export class InspectDomainBindingDnsReadinessQuery extends Query<DomainBindingDnsReadiness> {
  constructor(readonly input: InspectDomainBindingDnsReadinessQueryPayload) {
    super();
  }

  static create(
    input: InspectDomainBindingDnsReadinessQueryInput,
  ): Result<InspectDomainBindingDnsReadinessQuery> {
    return parseOperationInput(inspectDomainBindingDnsReadinessQueryInputSchema, input).map(
      (parsed) => new InspectDomainBindingDnsReadinessQuery(parsed),
    );
  }
}
