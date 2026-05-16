import { type Result } from "@appaloft/core";
import { Query } from "../../cqrs";
import { type SourceLinkRecord } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListSourceLinksQueryInput,
  type ListSourceLinksQueryPayload,
  listSourceLinksQueryInputSchema,
} from "./list-source-links.schema";

export {
  type ListSourceLinksQueryInput,
  listSourceLinksQueryInputSchema,
} from "./list-source-links.schema";

export interface ListSourceLinksResult {
  schemaVersion: "source-links.list/v1";
  items: SourceLinkRecord[];
}

export class ListSourceLinksQuery extends Query<ListSourceLinksResult> {
  constructor(
    public readonly projectId: string | undefined,
    public readonly resourceId: string | undefined,
    public readonly serverId: string | undefined,
    public readonly limit: number,
  ) {
    super();
  }

  static create(input: ListSourceLinksQueryInput = {}): Result<ListSourceLinksQuery> {
    return parseOperationInput(listSourceLinksQueryInputSchema, input).map(
      (parsed: ListSourceLinksQueryPayload) =>
        new ListSourceLinksQuery(
          parsed.projectId,
          parsed.resourceId,
          parsed.serverId,
          parsed.limit,
        ),
    );
  }
}
