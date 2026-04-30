import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DomainBindingDetail } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowDomainBindingQueryInput,
  showDomainBindingQueryInputSchema,
} from "./show-domain-binding.schema";

export {
  type ShowDomainBindingQueryInput,
  showDomainBindingQueryInputSchema,
} from "./show-domain-binding.schema";

export class ShowDomainBindingQuery extends Query<DomainBindingDetail> {
  constructor(public readonly domainBindingId: string) {
    super();
  }

  static create(input: ShowDomainBindingQueryInput): Result<ShowDomainBindingQuery> {
    return parseOperationInput(showDomainBindingQueryInputSchema, input).map(
      (parsed) => new ShowDomainBindingQuery(parsed.domainBindingId),
    );
  }
}
