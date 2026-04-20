import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ResourceDetail } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import { type ShowResourceQueryInput, showResourceQueryInputSchema } from "./show-resource.schema";

export {
  type ShowResourceQueryInput,
  showResourceQueryInputSchema,
} from "./show-resource.schema";

export class ShowResourceQuery extends Query<ResourceDetail> {
  constructor(
    public readonly resourceId: string,
    public readonly includeLatestDeployment: boolean,
    public readonly includeAccessSummary: boolean,
    public readonly includeProfileDiagnostics: boolean,
  ) {
    super();
  }

  static create(input: ShowResourceQueryInput): Result<ShowResourceQuery> {
    return parseOperationInput(showResourceQueryInputSchema, input).map(
      (parsed) =>
        new ShowResourceQuery(
          parsed.resourceId,
          parsed.includeLatestDeployment,
          parsed.includeAccessSummary,
          parsed.includeProfileDiagnostics,
        ),
    );
  }
}
