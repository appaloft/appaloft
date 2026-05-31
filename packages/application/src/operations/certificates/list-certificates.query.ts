import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type CertificateSummary } from "../../ports";
import { boundedListLimit, parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListCertificatesQueryInput,
  listCertificatesQueryInputSchema,
} from "./list-certificates.schema";

export {
  type ListCertificatesQueryInput,
  listCertificatesQueryInputSchema,
} from "./list-certificates.schema";

export class ListCertificatesQuery extends Query<{ items: CertificateSummary[] }> {
  constructor(
    public readonly domainBindingId?: string,
    public readonly limit: number = boundedListLimit(),
  ) {
    super();
  }

  static create(input?: ListCertificatesQueryInput): Result<ListCertificatesQuery> {
    return parseOperationInput(listCertificatesQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new ListCertificatesQuery(
          trimToUndefined(parsed.domainBindingId),
          boundedListLimit(parsed.limit),
        ),
    );
  }
}
