import { type Result } from "@yundu/core";

import { Query } from "../../cqrs";
import { type DomainBindingSummary } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListDomainBindingsQueryInput,
  listDomainBindingsQueryInputSchema,
} from "./list-domain-bindings.schema";

export {
  type ListDomainBindingsQueryInput,
  listDomainBindingsQueryInputSchema,
} from "./list-domain-bindings.schema";

export class ListDomainBindingsQuery extends Query<{ items: DomainBindingSummary[] }> {
  constructor(
    public readonly projectId?: string,
    public readonly environmentId?: string,
    public readonly resourceId?: string,
  ) {
    super();
  }

  static create(input?: ListDomainBindingsQueryInput): Result<ListDomainBindingsQuery> {
    return parseOperationInput(listDomainBindingsQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new ListDomainBindingsQuery(
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.environmentId),
          trimToUndefined(parsed.resourceId),
        ),
    );
  }
}
