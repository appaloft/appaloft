import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ListDefaultAccessDomainPoliciesResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListDefaultAccessDomainPoliciesQueryInput,
  listDefaultAccessDomainPoliciesQueryInputSchema,
} from "./list-default-access-domain-policies.schema";

export {
  type ListDefaultAccessDomainPoliciesQueryInput,
  listDefaultAccessDomainPoliciesQueryInputSchema,
} from "./list-default-access-domain-policies.schema";

export class ListDefaultAccessDomainPoliciesQuery extends Query<ListDefaultAccessDomainPoliciesResult> {
  static create(
    input?: ListDefaultAccessDomainPoliciesQueryInput,
  ): Result<ListDefaultAccessDomainPoliciesQuery> {
    return parseOperationInput(listDefaultAccessDomainPoliciesQueryInputSchema, input ?? {}).map(
      () => new ListDefaultAccessDomainPoliciesQuery(),
    );
  }
}
