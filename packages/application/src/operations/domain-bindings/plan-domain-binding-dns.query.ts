import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ConnectorCapabilityPlanPreview } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type PlanDomainBindingDnsQueryInput,
  type PlanDomainBindingDnsQueryPayload,
  planDomainBindingDnsQueryInputSchema,
} from "./plan-domain-binding-dns.schema";

export {
  type PlanDomainBindingDnsQueryInput,
  type PlanDomainBindingDnsQueryPayload,
  planDomainBindingDnsQueryInputSchema,
} from "./plan-domain-binding-dns.schema";

export class PlanDomainBindingDnsQuery extends Query<ConnectorCapabilityPlanPreview> {
  constructor(readonly input: PlanDomainBindingDnsQueryPayload) {
    super();
  }

  static create(input: PlanDomainBindingDnsQueryInput): Result<PlanDomainBindingDnsQuery> {
    return parseOperationInput(planDomainBindingDnsQueryInputSchema, input).map(
      (parsed) => new PlanDomainBindingDnsQuery(parsed),
    );
  }
}
