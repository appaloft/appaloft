import { type Result } from "@appaloft/core";
import { Query } from "../../cqrs";
import { type SourceLinkRecord } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowSourceLinkQueryInput,
  type ShowSourceLinkQueryPayload,
  showSourceLinkQueryInputSchema,
} from "./show-source-link.schema";

export {
  type ShowSourceLinkQueryInput,
  showSourceLinkQueryInputSchema,
} from "./show-source-link.schema";

export interface ShowSourceLinkResult {
  schemaVersion: "source-links.show/v1";
  sourceLink: SourceLinkRecord;
}

export class ShowSourceLinkQuery extends Query<ShowSourceLinkResult> {
  constructor(public readonly sourceFingerprint: string) {
    super();
  }

  static create(input: ShowSourceLinkQueryInput): Result<ShowSourceLinkQuery> {
    return parseOperationInput(showSourceLinkQueryInputSchema, input).map(
      (parsed: ShowSourceLinkQueryPayload) => new ShowSourceLinkQuery(parsed.sourceFingerprint),
    );
  }
}
