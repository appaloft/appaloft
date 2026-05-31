import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DomainBindingSummary } from "../../ports";
import { boundedListLimit, parseOperationInput, trimToUndefined } from "../shared-schema";
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
    public readonly limit: number = boundedListLimit(),
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
          boundedListLimit(parsed.limit),
        ),
    );
  }
}
