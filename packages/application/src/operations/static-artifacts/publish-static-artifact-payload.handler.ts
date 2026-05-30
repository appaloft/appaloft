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
import { PublishStaticArtifactPayloadCommand } from "./publish-static-artifact-payload.command";
import { createStaticArtifactPayloadReadResultFromInlineFiles } from "./static-artifact-payload-builder";

const publishStaticArtifactPayloadOperation = findOperationCatalogEntryByKey(
  "static-artifacts.publish-payload",
);
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

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
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async handle(
    context: ExecutionContext,
    command: PublishStaticArtifactPayloadCommand,
  ): Promise<Result<StaticArtifactPublication>> {
    const artifactId = command.artifactId ?? this.idGenerator.next("static_artifact");
    if (publishStaticArtifactPayloadOperation) {
      const checked = await checkOperationGuards({
        context,
        entry: publishStaticArtifactPayloadOperation,
        message: command,
        operationGuardPort: this.operationGuardPort ?? defaultOperationGuardPort,
        resourceRefs: {
          projectId: command.projectId,
          resourceId: command.resourceId,
        },
        contextAttributes: {
          estimatedExternalProviderCalls: 2,
          estimatedFieldCount: command.files.length * 3,
          estimatedInputBytes: estimatedInlineFileBytes(command.files),
          estimatedItemCount: command.files.length,
          estimatedNestingDepth: estimatedInlineFileNestingDepth(command.files),
          estimatedWriteUnits: command.files.length,
        },
      });
      if (checked.isErr()) return err(checked.error);
    }
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

function estimatedInlineFileBytes(files: readonly { readonly contentBase64: string }[]): number {
  return files.reduce((sum, file) => sum + file.contentBase64.length, 0);
}

function estimatedInlineFileNestingDepth(files: readonly { readonly path: string }[]): number {
  return files.reduce((depth, file) => Math.max(depth, file.path.split(/[\\/]+/).length), 1);
}
