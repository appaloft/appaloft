import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkReadModel,
  type SourceLinkRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListSourceLinksQuery, type ListSourceLinksResult } from "./list-source-links.query";
import { type ShowSourceLinkQuery, type ShowSourceLinkResult } from "./show-source-link.query";

function sourceLinkNotFound(sourceFingerprint: string) {
  return domainError.notFound("Source link", sourceFingerprint);
}

@injectable()
export class SourceLinkQueryService {
  constructor(
    @inject(tokens.sourceLinkReadModel)
    private readonly sourceLinkReadModel: SourceLinkReadModel,
    @inject(tokens.sourceLinkRepository)
    private readonly sourceLinkRepository: SourceLinkRepository,
  ) {}

  async list(
    context: ExecutionContext,
    query: ListSourceLinksQuery,
  ): Promise<Result<ListSourceLinksResult>> {
    const items = await this.sourceLinkReadModel.list(toRepositoryContext(context), {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.serverId ? { serverId: query.serverId } : {}),
      limit: query.limit,
    });

    return ok({
      schemaVersion: "source-links.list/v1",
      items,
    });
  }

  async show(query: ShowSourceLinkQuery): Promise<Result<ShowSourceLinkResult>> {
    const sourceLink = await this.sourceLinkRepository.findOne(
      SourceLinkBySourceFingerprintSpec.create(query.sourceFingerprint),
    );

    if (sourceLink.isErr()) {
      return err(sourceLink.error);
    }

    if (!sourceLink.value) {
      return err(sourceLinkNotFound(query.sourceFingerprint));
    }

    return ok({
      schemaVersion: "source-links.show/v1",
      sourceLink: sourceLink.value,
    });
  }
}
