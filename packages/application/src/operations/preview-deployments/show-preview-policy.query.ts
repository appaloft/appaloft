import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type PreviewPolicyScope, type ShowPreviewPolicyResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowPreviewPolicyQueryInput,
  showPreviewPolicyQueryInputSchema,
} from "./show-preview-policy.schema";

export {
  type ShowPreviewPolicyQueryInput,
  showPreviewPolicyQueryInputSchema,
} from "./show-preview-policy.schema";

export class ShowPreviewPolicyQuery extends Query<ShowPreviewPolicyResult> {
  constructor(public readonly scope: PreviewPolicyScope) {
    super();
  }

  static create(input: ShowPreviewPolicyQueryInput): Result<ShowPreviewPolicyQuery> {
    return parseOperationInput(showPreviewPolicyQueryInputSchema, input).map(
      (parsed) => new ShowPreviewPolicyQuery(parsed.scope),
    );
  }
}
