import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowRetentionDefaultQueryInput,
  type ShowRetentionDefaultQueryPayload,
  showRetentionDefaultQueryInputSchema,
} from "./retention-defaults.schema";
import { type ShowRetentionDefaultResult } from "./retention-defaults.service";

export {
  type ShowRetentionDefaultQueryInput,
  type ShowRetentionDefaultQueryPayload,
  showRetentionDefaultQueryInputSchema,
} from "./retention-defaults.schema";

export class ShowRetentionDefaultQuery extends Query<ShowRetentionDefaultResult> {
  constructor(public readonly input: ShowRetentionDefaultQueryPayload) {
    super();
  }

  static create(input: ShowRetentionDefaultQueryInput): Result<ShowRetentionDefaultQuery> {
    return parseOperationInput(showRetentionDefaultQueryInputSchema, input).map(
      (parsed) => new ShowRetentionDefaultQuery(parsed),
    );
  }
}
