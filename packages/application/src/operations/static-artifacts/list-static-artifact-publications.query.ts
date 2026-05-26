import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type StaticArtifactPublicationSummary } from "../../ports";
import { boundedListLimit, nonEmptyTrimmedString, parseOperationInput } from "../shared-schema";

export const listStaticArtifactPublicationsQueryInputSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id").optional(),
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
  })
  .strict();

export type ListStaticArtifactPublicationsQueryInput = z.input<
  typeof listStaticArtifactPublicationsQueryInputSchema
>;

export class ListStaticArtifactPublicationsQuery extends Query<{
  items: StaticArtifactPublicationSummary[];
}> {
  constructor(
    public readonly projectId?: string,
    public readonly resourceId?: string,
    public readonly limit: number = boundedListLimit(undefined),
  ) {
    super();
  }

  static create(
    input?: ListStaticArtifactPublicationsQueryInput,
  ): Result<ListStaticArtifactPublicationsQuery> {
    return parseOperationInput(listStaticArtifactPublicationsQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new ListStaticArtifactPublicationsQuery(
          parsed.projectId,
          parsed.resourceId,
          boundedListLimit(parsed.limit),
        ),
    );
  }
}
