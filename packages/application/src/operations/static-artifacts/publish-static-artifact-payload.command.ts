import { type Result, type StaticArtifactPublication } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { nonEmptyTrimmedString, parseOperationInput } from "../shared-schema";

export const publishStaticArtifactPayloadCommandInputSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id"),
    resourceId: nonEmptyTrimmedString("Resource id"),
    artifactId: nonEmptyTrimmedString("Static artifact id").optional(),
    promoteAlias: z.boolean().optional(),
    files: z
      .array(
        z
          .object({
            path: nonEmptyTrimmedString("Static artifact file path"),
            mimeType: nonEmptyTrimmedString("Static artifact file MIME type"),
            contentBase64: z.string(),
          })
          .strict(),
      )
      .min(1),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type PublishStaticArtifactPayloadCommandInput = z.input<
  typeof publishStaticArtifactPayloadCommandInputSchema
>;

export type PublishStaticArtifactPayloadCommandPayload = z.output<
  typeof publishStaticArtifactPayloadCommandInputSchema
>;

export class PublishStaticArtifactPayloadCommand extends Command<StaticArtifactPublication> {
  constructor(
    public readonly projectId: string,
    public readonly resourceId: string,
    public readonly files: PublishStaticArtifactPayloadCommandPayload["files"],
    public readonly artifactId?: string,
    public readonly promoteAlias?: boolean,
    public readonly metadata?: Record<string, string>,
  ) {
    super();
  }

  static create(
    input: PublishStaticArtifactPayloadCommandInput,
  ): Result<PublishStaticArtifactPayloadCommand> {
    return parseOperationInput(publishStaticArtifactPayloadCommandInputSchema, input).map(
      (parsed: PublishStaticArtifactPayloadCommandPayload) =>
        new PublishStaticArtifactPayloadCommand(
          parsed.projectId,
          parsed.resourceId,
          parsed.files,
          parsed.artifactId,
          parsed.promoteAlias,
          parsed.metadata,
        ),
    );
  }
}
