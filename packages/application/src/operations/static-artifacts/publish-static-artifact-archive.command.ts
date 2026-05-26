import { type Result, type StaticArtifactPublication } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { nonEmptyTrimmedString, parseOperationInput } from "../shared-schema";

export const publishStaticArtifactArchiveCommandInputSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id"),
    resourceId: nonEmptyTrimmedString("Resource id"),
    artifactId: nonEmptyTrimmedString("Static artifact id").optional(),
    promoteAlias: z.boolean().optional(),
    archiveBase64: z.string().min(1),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type PublishStaticArtifactArchiveCommandInput = z.input<
  typeof publishStaticArtifactArchiveCommandInputSchema
>;

export type PublishStaticArtifactArchiveCommandPayload = z.output<
  typeof publishStaticArtifactArchiveCommandInputSchema
>;

export class PublishStaticArtifactArchiveCommand extends Command<StaticArtifactPublication> {
  constructor(
    public readonly projectId: string,
    public readonly resourceId: string,
    public readonly archiveBase64: string,
    public readonly artifactId?: string,
    public readonly promoteAlias?: boolean,
    public readonly metadata?: Record<string, string>,
  ) {
    super();
  }

  static create(
    input: PublishStaticArtifactArchiveCommandInput,
  ): Result<PublishStaticArtifactArchiveCommand> {
    return parseOperationInput(publishStaticArtifactArchiveCommandInputSchema, input).map(
      (parsed: PublishStaticArtifactArchiveCommandPayload) =>
        new PublishStaticArtifactArchiveCommand(
          parsed.projectId,
          parsed.resourceId,
          parsed.archiveBase64,
          parsed.artifactId,
          parsed.promoteAlias,
          parsed.metadata,
        ),
    );
  }
}
