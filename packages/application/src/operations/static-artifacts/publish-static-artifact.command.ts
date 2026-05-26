import { type Result, type StaticArtifactPublication } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { nonEmptyTrimmedString, parseOperationInput } from "../shared-schema";

export const publishStaticArtifactCommandInputSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id"),
    resourceId: nonEmptyTrimmedString("Resource id"),
    sourcePath: nonEmptyTrimmedString("Static artifact source path"),
    artifactId: nonEmptyTrimmedString("Static artifact id").optional(),
    promoteAlias: z.boolean().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type PublishStaticArtifactCommandInput = z.input<
  typeof publishStaticArtifactCommandInputSchema
>;

export type PublishStaticArtifactCommandPayload = z.output<
  typeof publishStaticArtifactCommandInputSchema
>;

export class PublishStaticArtifactCommand extends Command<StaticArtifactPublication> {
  constructor(
    public readonly projectId: string,
    public readonly resourceId: string,
    public readonly sourcePath: string,
    public readonly artifactId?: string,
    public readonly promoteAlias?: boolean,
    public readonly metadata?: Record<string, string>,
  ) {
    super();
  }

  static create(input: PublishStaticArtifactCommandInput): Result<PublishStaticArtifactCommand> {
    return parseOperationInput(publishStaticArtifactCommandInputSchema, input).map(
      (parsed: PublishStaticArtifactCommandPayload) =>
        new PublishStaticArtifactCommand(
          parsed.projectId,
          parsed.resourceId,
          parsed.sourcePath,
          parsed.artifactId,
          parsed.promoteAlias,
          parsed.metadata,
        ),
    );
  }
}
