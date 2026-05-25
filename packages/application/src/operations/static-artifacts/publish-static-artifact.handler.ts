import { err, type Result, type StaticArtifactPublication } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import {
  type IdGenerator,
  type StaticArtifactPayloadReaderPort,
  type StaticArtifactPublisherPort,
} from "../../ports";
import { tokens } from "../../tokens";
import { PublishStaticArtifactCommand } from "./publish-static-artifact.command";

@CommandHandler(PublishStaticArtifactCommand)
@injectable()
export class PublishStaticArtifactCommandHandler
  implements CommandHandlerContract<PublishStaticArtifactCommand, StaticArtifactPublication>
{
  constructor(
    @inject(tokens.staticArtifactPayloadReaderPort)
    private readonly payloadReader: StaticArtifactPayloadReaderPort,
    @inject(tokens.staticArtifactPublisherPort)
    private readonly publisher: StaticArtifactPublisherPort,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async handle(
    context: ExecutionContext,
    command: PublishStaticArtifactCommand,
  ): Promise<Result<StaticArtifactPublication>> {
    const artifactId = command.artifactId ?? this.idGenerator.next("static_artifact");
    const payload = await this.payloadReader.read(context, {
      artifactId,
      sourcePath: command.sourcePath,
      ...(command.metadata ? { metadata: command.metadata } : {}),
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
