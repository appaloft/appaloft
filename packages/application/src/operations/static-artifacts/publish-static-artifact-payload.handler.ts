import { err, type Result, type StaticArtifactPublication } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type IdGenerator, type StaticArtifactPublisherPort } from "../../ports";
import { tokens } from "../../tokens";
import { PublishStaticArtifactPayloadCommand } from "./publish-static-artifact-payload.command";
import { createStaticArtifactPayloadReadResultFromInlineFiles } from "./static-artifact-payload-builder";

@CommandHandler(PublishStaticArtifactPayloadCommand)
@injectable()
export class PublishStaticArtifactPayloadCommandHandler
  implements CommandHandlerContract<PublishStaticArtifactPayloadCommand, StaticArtifactPublication>
{
  constructor(
    @inject(tokens.staticArtifactPublisherPort)
    private readonly publisher: StaticArtifactPublisherPort,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async handle(
    context: ExecutionContext,
    command: PublishStaticArtifactPayloadCommand,
  ): Promise<Result<StaticArtifactPublication>> {
    const artifactId = command.artifactId ?? this.idGenerator.next("static_artifact");
    const payload = createStaticArtifactPayloadReadResultFromInlineFiles(artifactId, command.files);
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
