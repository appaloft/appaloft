import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type CertificateSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowCertificateQueryInput,
  showCertificateQueryInputSchema,
} from "./show-certificate.schema";

export {
  type ShowCertificateQueryInput,
  showCertificateQueryInputSchema,
} from "./show-certificate.schema";

export class ShowCertificateQuery extends Query<CertificateSummary> {
  constructor(public readonly certificateId: string) {
    super();
  }

  static create(input: ShowCertificateQueryInput): Result<ShowCertificateQuery> {
    return parseOperationInput(showCertificateQueryInputSchema, input).map(
      (parsed) => new ShowCertificateQuery(parsed.certificateId),
    );
  }
}
