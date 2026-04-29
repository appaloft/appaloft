import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type OperatorWorkDetail } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowOperatorWorkQueryInput,
  showOperatorWorkQueryInputSchema,
} from "./show-operator-work.schema";

export {
  type ShowOperatorWorkQueryInput,
  showOperatorWorkQueryInputSchema,
} from "./show-operator-work.schema";

export class ShowOperatorWorkQuery extends Query<OperatorWorkDetail> {
  constructor(public readonly workId: string) {
    super();
  }

  static create(input: ShowOperatorWorkQueryInput): Result<ShowOperatorWorkQuery> {
    return parseOperationInput(showOperatorWorkQueryInputSchema, input).map(
      (parsed) => new ShowOperatorWorkQuery(parsed.workId),
    );
  }
}
