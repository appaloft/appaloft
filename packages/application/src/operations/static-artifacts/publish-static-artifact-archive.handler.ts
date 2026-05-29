import { err, type Result, type StaticArtifactPublication } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type IdGenerator,
  type OperationGuardPort,
  type StaticArtifactPublisherPort,
} from "../../ports";
import { tokens } from "../../tokens";
import { PublishStaticArtifactArchiveCommand } from "./publish-static-artifact-archive.command";
import {
  createStaticArtifactPayloadReadResultFromZipArchive,
  estimateStaticArtifactZipArchiveStructure,
} from "./static-artifact-payload-builder";

const publishStaticArtifactArchiveOperation = findOperationCatalogEntryByKey(
  "static-artifacts.publish-archive",
);
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

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
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async handle(
    context: ExecutionContext,
    command: PublishStaticArtifactArchiveCommand,
  ): Promise<Result<StaticArtifactPublication>> {
    const artifactId = command.artifactId ?? this.idGenerator.next("static_artifact");
    const structureEstimate = estimateStaticArtifactZipArchiveStructure({
      archiveBase64: command.archiveBase64,
    });
    if (publishStaticArtifactArchiveOperation) {
      const checked = await checkOperationGuards({
        context,
        entry: publishStaticArtifactArchiveOperation,
        message: command,
        operationGuardPort: this.operationGuardPort ?? defaultOperationGuardPort,
        resourceRefs: {
          projectId: command.projectId,
          resourceId: command.resourceId,
        },
        contextAttributes: {
          estimatedExternalProviderCalls: 2,
          estimatedInputBytes: command.archiveBase64.length,
          estimatedItemCount: structureEstimate?.fileCount ?? 1,
          estimatedNestingDepth: structureEstimate?.pathNestingDepth ?? 1,
          estimatedWriteUnits: 2,
        },
      });
      if (checked.isErr()) return err(checked.error);
    }
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
