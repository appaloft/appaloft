import { err, type Result, type StaticArtifactPublication } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type IdGenerator, type StaticArtifactPublisherPort } from "../../ports";
import { tokens } from "../../tokens";
import { PublishStaticArtifactArchiveCommand } from "./publish-static-artifact-archive.command";
import { createStaticArtifactPayloadReadResultFromZipArchive } from "./static-artifact-payload-builder";

@CommandHandler(PublishStaticArtifactArchiveCommand)
@injectable()
export class PublishStaticArtifactArchiveCommandHandler
  implements CommandHandlerContract<PublishStaticArtifactArchiveCommand, StaticArtifactPublication>
{
  constructor(
    @inject(tokens.staticArtifactPublisherPort)
    private readonly publisher: StaticArtifactPublisherPort,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async handle(
    context: ExecutionContext,
    command: PublishStaticArtifactArchiveCommand,
  ): Promise<Result<StaticArtifactPublication>> {
    const artifactId = command.artifactId ?? this.idGenerator.next("static_artifact");
    const payload = createStaticArtifactPayloadReadResultFromZipArchive(artifactId, {
      archiveBase64: command.archiveBase64,
    });
    if (payload.isErr()) return err(payload.error);

    return this.publisher.publish(context, {
      projectId: command.projectId,
      resourceId: command.resourceId,
      manifest: payload.value.manifest,
      files: payload.value.files,
      ...(command.promoteAlias === undefined ? {} : { promoteAlias: command.promoteAlias }),
      ...(command.metadata ? { metadata: command.metadata } : {}),
    });
  }
}
