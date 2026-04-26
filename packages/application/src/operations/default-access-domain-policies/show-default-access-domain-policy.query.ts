import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ShowDefaultAccessDomainPolicyResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowDefaultAccessDomainPolicyQueryInput,
  showDefaultAccessDomainPolicyQueryInputSchema,
} from "./show-default-access-domain-policy.schema";

export {
  type ShowDefaultAccessDomainPolicyQueryInput,
  showDefaultAccessDomainPolicyQueryInputSchema,
} from "./show-default-access-domain-policy.schema";

export class ShowDefaultAccessDomainPolicyQuery extends Query<ShowDefaultAccessDomainPolicyResult> {
  constructor(
    public readonly scopeKind: "system" | "deployment-target",
    public readonly serverId?: string,
  ) {
    super();
  }

  static create(
    input?: ShowDefaultAccessDomainPolicyQueryInput,
  ): Result<ShowDefaultAccessDomainPolicyQuery> {
    return parseOperationInput(showDefaultAccessDomainPolicyQueryInputSchema, input ?? {}).map(
      (parsed) => new ShowDefaultAccessDomainPolicyQuery(parsed.scopeKind, parsed.serverId),
    );
  }
}
