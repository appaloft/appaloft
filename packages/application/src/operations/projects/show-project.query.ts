import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ProjectSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import { type ShowProjectQueryInput, showProjectQueryInputSchema } from "./show-project.schema";

export {
  type ShowProjectQueryInput,
  showProjectQueryInputSchema,
} from "./show-project.schema";

export class ShowProjectQuery extends Query<ProjectSummary> {
  constructor(public readonly projectId: string) {
    super();
  }

  static create(input: ShowProjectQueryInput): Result<ShowProjectQuery> {
    return parseOperationInput(showProjectQueryInputSchema, input).map(
      (parsed) => new ShowProjectQuery(parsed.projectId),
    );
  }
}
