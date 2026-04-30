import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DomainBindingDeleteSafety } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CheckDomainBindingDeleteSafetyQueryInput,
  checkDomainBindingDeleteSafetyQueryInputSchema,
} from "./check-domain-binding-delete-safety.schema";

export {
  type CheckDomainBindingDeleteSafetyQueryInput,
  checkDomainBindingDeleteSafetyQueryInputSchema,
} from "./check-domain-binding-delete-safety.schema";

export class CheckDomainBindingDeleteSafetyQuery extends Query<DomainBindingDeleteSafety> {
  constructor(public readonly domainBindingId: string) {
    super();
  }

  static create(
    input: CheckDomainBindingDeleteSafetyQueryInput,
  ): Result<CheckDomainBindingDeleteSafetyQuery> {
    return parseOperationInput(checkDomainBindingDeleteSafetyQueryInputSchema, input).map(
      (parsed) => new CheckDomainBindingDeleteSafetyQuery(parsed.domainBindingId),
    );
  }
}
